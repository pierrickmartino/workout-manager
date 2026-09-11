"""Repository for user-owned WorkoutSessions and their Exercise Prescriptions.

Writes take a ``SessionDraft`` (the training parameters plus an ordered list of
``PrescriptionDraft``, each referencing a catalog Exercise by id). Reads return a
``SessionView`` — the session joined to its ordered prescriptions and each
prescription's catalog Exercise — so consumers never touch the ORM. Reads are
scoped to the owning user: a Session belongs to one user and is never served to
another. SQLModel-backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import func
from sqlmodel import Session, select

from app.db.models import (
    Exercise,
    ExercisePrescription,
    SessionFavorite,
    WorkoutSession,
)
from app.domain.session_library import matches_session_search
from app.domain.share_redeem import SharedSessionSource, redeem_copy
from app.domain.superset import MIN_SUPERSET_MEMBERS
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.favorite_repository import (
    FavoriteRepository,
    InMemoryFavoriteRepository,
    SqlFavoriteRepository,
)
from app.repositories.prescription_mapping import (
    PrescriptionDraft,
    PrescriptionView,
    draft_from_row,
    evolve_prescription_row,
    row_from_draft,
    view_from_row,
)
from app.repositories.profile_repository import (
    ProfileRepository,
    SqlProfileRepository,
)


@dataclass(frozen=True)
class SessionDraft:
    """A standalone Session to persist: parameters plus ordered prescriptions."""

    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)
    # Session Provenance (ADR-0040): how this plan came to exist — ``ai_generated``
    # (the generation pipeline) or ``user_authored`` (a Hand-Authored Session, built by
    # hand with no AI). Defaults to ``ai_generated`` so every existing generation path is
    # unchanged; the Hand-Authored create path stamps ``user_authored``. See
    # ``app.domain.session_provenance.SessionProvenance``.
    provenance: str = "ai_generated"
    # Operational AI-usage lineage (ADR-0039, #274): the trace id of the Generation
    # Call that produced this standalone Session, stamped at creation. ``None`` when no
    # monitoring backend was configured.
    trace_id: str | None = None


@dataclass(frozen=True)
class SessionView:
    """A standalone Session with its ordered, exercise-joined prescriptions."""

    id: int
    clerk_user_id: str
    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionView]
    has_been_regenerated: bool = False
    # The user-given Session Name (issue #394), or ``None`` for a born-unnamed Session.
    # Read paths resolve a never-blank display label from it through
    # ``app.domain.session_naming.session_label`` (name → fallback ``training_type · date``).
    name: str | None = None
    # When the Session was created — the date component of the derived fallback label.
    # Defaulted (tz-aware, matching ``models._utcnow``) so pre-existing SessionView
    # constructions (e.g. Live-serialization tests) stay valid; every repository read
    # populates it from the stored row.
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    # Session Provenance (ADR-0040): ``ai_generated`` | ``user_authored``. Defaults to
    # ``ai_generated`` — every path that builds a Session today is AI. See
    # ``app.domain.session_provenance.SessionProvenance``.
    provenance: str = "ai_generated"
    # Author (CONTEXT: Author, #395): a reference (the creator's ``clerk_user_id``) to the
    # human who first created this plan — distinct from the Owner and from Provenance, and
    # immutable origin (preserved through Duplicate). ``author_display_name`` is that
    # creator's raw Profile display name joined at read time, ``None`` when they have no
    # profile or no name; the web ``sessionAuthorView`` mapper resolves the never-blank
    # generic fallback. Both default so pre-existing SessionView constructions (e.g.
    # Live-serialization tests) stay valid.
    author_clerk_user_id: str | None = None
    author_display_name: str | None = None
    # Whether this Session belongs to a Protocol (it carries a ``protocol_id``) rather
    # than standing alone. The Session view uses it to withhold the Duplicate control on a
    # Protocol member — lifting one workout out of a plan the user is working through has
    # no value there (Q2); Duplicate stays on standalone Sessions and the endpoint is
    # unchanged. A read-time fact off the linkage, never a stored flag.
    is_protocol_member: bool = False
    # The viewing owner's Favorite marker on this Session (CONTEXT: Favorite, issue #396) —
    # a **stored, per-user, per-copy** preference resolved through the ``FavoriteRepository``
    # seam for the owner of this read (every ``_view`` is built for the owner). ``False`` for
    # an un-favorited Session, and for the many reads whose repository carries no favorite
    # store. A born-absent marker: a duplicated/redeemed copy has no row and reads ``False``.
    # Defaulted so pre-existing SessionView constructions (e.g. Live-serialization tests) stay
    # valid; the route withholds it on a Protocol member (Favorite is standalone-only).
    is_favorite: bool = False


@dataclass(frozen=True)
class SessionSummaryView:
    """A standalone Session as one row in the **My Sessions** library (issue #397).

    A deliberately thin projection — just what the list renders and searches over —
    so listing the user's library never joins every Session's prescriptions. Carries
    the raw ``name`` (``None`` when unnamed) and ``created_at`` so the route resolves
    the never-blank display label through ``session_label`` exactly as the detail read
    does; ``training_type`` and ``author_display_name`` feed the row's Training Type and
    Author, and ``is_favorite`` is the owner's Favorite marker (the favorites-only
    filter, CONTEXT: My Sessions / Favorite). ``prescription_count`` is the number of
    Exercise Prescriptions in the plan — the row's *plan-side* "N exercises" fact, counted
    without joining the prescriptions themselves (CONTEXT: Exercise Prescription)."""

    id: int
    training_type: str
    name: str | None
    created_at: datetime
    author_display_name: str | None
    is_favorite: bool
    prescription_count: int


@dataclass(frozen=True)
class SessionListPage:
    """One page of My Sessions results plus the full match count (issue #397).

    ``items`` is the search/favorite-filtered, newest-first, limit/offset-sliced slice
    the route returns; ``total`` is how many of the caller's standalone Sessions matched
    in all, so the route can report pagination ``meta`` — the same shape as
    ``ExerciseSearchPage``."""

    items: list[SessionSummaryView]
    total: int


def _session_list_page(
    summaries: list[SessionSummaryView],
    *,
    query: str,
    favorites_only: bool,
    limit: int,
    offset: int,
) -> SessionListPage:
    """Filter, sort, and paginate the caller's standalone-Session summaries (issue #397).

    The favorites-only flag and the search query **combine** (AND): a Session survives
    only when it is favorited (if the flag is set) *and* matches the search (via the
    shared ``matches_session_search`` predicate, so an empty query keeps everything).
    Survivors are ordered newest-first — by ``created_at`` then ``id`` for a stable order
    across equal timestamps — before the limit/offset slice, and ``total`` counts every
    survivor across all pages. Owner-scoping and standalone-only exclusion are applied by
    the caller before building ``summaries``."""

    matched = [
        summary
        for summary in summaries
        if (not favorites_only or summary.is_favorite)
        and matches_session_search(
            summary.name, summary.training_type, summary.created_at, query
        )
    ]
    ordered = sorted(matched, key=lambda s: (s.created_at, s.id), reverse=True)
    return SessionListPage(items=ordered[offset : offset + limit], total=len(ordered))


class SessionRepository(Protocol):
    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        """Persist ``draft`` as a Session owned by ``clerk_user_id`` and return
        the stored Session joined to its prescriptions and exercises."""
        ...

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        """Return the owner's Session by id, or ``None`` if it is missing or
        owned by another user."""
        ...

    def list_standalone(
        self,
        clerk_user_id: str,
        *,
        query: str = "",
        favorites_only: bool = False,
        limit: int,
        offset: int,
    ) -> SessionListPage:
        """List the caller's **standalone** Sessions for My Sessions (issue #397).

        Scoped to ``clerk_user_id`` and to standalone Sessions only — a Protocol-member
        Session (one carrying a ``protocol_id``) and every other user's Session are
        excluded, so the library is never another user's plans nor a plan the user is
        working through inside a Protocol. ``query`` searches Session Name, the derived
        fallback label, and Training Type case-insensitively (blank matches all);
        ``favorites_only`` narrows to the owner's Favorites; the two **combine**. Results
        come back newest-first and limit/offset-paginated as a ``SessionListPage`` whose
        ``total`` counts every match across pages. A read: listing never creates."""
        ...

    def list_standalone_full(self, clerk_user_id: str) -> list[SessionView]:
        """Return the caller's **standalone** Sessions in full, for Export (issue #418).

        The un-paginated, prescription-joined twin of :meth:`list_standalone`: scoped to
        ``clerk_user_id`` and to standalone Sessions only (``protocol_id IS NULL``), so a
        Protocol-member Session — which rides inside its Protocol — and every other user's
        Session are excluded. Each element is a full ``SessionView`` (ordered prescriptions
        joined to their catalog Exercises), so a faithful copy of the plan can be
        serialized. Results come back newest-first; empty when the user owns no standalone
        Session. A read: listing never creates."""
        ...

    def duplicate(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        """Deep-copy the owner's Session into a new **standalone** Session (Duplicate,
        ADR-0043).

        Carries the source's training parameters, Session Provenance, ``trace_id``
        lineage, the Session ``name`` and Protocol ``title`` verbatim, plus every
        Exercise Prescription with
        its sets/reps/rest/tempo/Load, Superset grouping and Progression Scheme selection
        (a plan property, carried like the rest — ADR-0064) — but **no Logged Sessions**
        and **no Protocol position** (``protocol_id``/week/day/position are dropped), so
        the copy stands alone. The copy is a distinct Session with a **fresh regeneration
        budget** (``has_been_regenerated`` starts ``False``). The source is read, never
        mutated. Returns the new Session, or ``None`` if the source is missing or owned
        by another user — Duplicate only ever copies the owner's own plan."""
        ...

    def delete(self, session_id: int, clerk_user_id: str) -> bool:
        """Permanently delete the owner's standalone Session (Delete, ADR-0063).

        Removes the ``WorkoutSession`` row together with the plan-side rows it owns — its
        Exercise Prescriptions and the owner's Favorite marker — children-first so a
        foreign-key-enforcing database accepts the parent delete. Returns ``True`` when a
        Session was deleted, ``False`` when it is missing or owned by another user, so a
        non-owner can never delete another user's plan. The no-Logged-Session guard and the
        standalone-only guard live in the Delete service, and its other plan-side
        dependents (Generation Feedback, Share Links) are cleaned up through their own
        repositories there — this seam owns only the Session aggregate."""
        ...

    def get_shared(self, session_id: int) -> SessionView | None:
        """Read a Session **without** owner-scoping — the deliberate cross-user seam (ADR-0057).

        Every other read is scoped to one ``clerk_user_id``; this one is not, because a
        recipient previewing a **Share Link** is not the Session's Owner. It is used only by
        the sharing path (preview, and as the source of a Redeem copy) and returns just the
        plan (name, Training Type, Author, prescriptions) — never another user's records or
        Favorite state. ``None`` when no Session has that id."""
        ...

    def redeem(
        self, source_session_id: int, redeemer_clerk_user_id: str
    ) -> SessionView | None:
        """Deep-copy a **shared** Session into a new standalone Session owned by the redeemer
        (Redeem, ADR-0057) — the cross-user cousin of :meth:`duplicate`.

        Reads ``source_session_id`` **without** owner-scoping (the redeemer is not the Owner)
        and writes an independent copy owned by ``redeemer_clerk_user_id``, applying the pure
        redeem-copy rule (``app.domain.share_redeem``): the new **Owner** is the redeemer, the
        **Author** is preserved as the original creator, and the **Session Name**, **Session
        Provenance** and ``trace_id`` **lineage** carry forward unchanged. Every Exercise
        Prescription (sets/reps/rest/tempo/Load/Superset/Pin/Progression Scheme) is copied
        faithfully from the source's **redeem-time** state — the scheme is a plan property that
        travels with the copy, not a per-owner marker like Favorite (ADR-0064). The copy carries
        **no Logged Sessions**, **no Protocol position**, a **fresh regeneration budget**, and
        **no Favorite** (a new id with no
        marker). The source is read, never mutated; the two copies are thereafter independent.
        Returns the new Session, or ``None`` if the source no longer exists."""
        ...

    def set_name(
        self, session_id: int, clerk_user_id: str, name: str | None
    ) -> SessionView | None:
        """Set, edit, or clear the owner's Session Name (rename, issue #394).

        Writes the user-given **Session Name** onto the owner's own standalone Session;
        ``None`` clears it back to born-unnamed, so the read falls back to the derived
        ``training_type · date`` label. Touches the plan only — no Logged Session is
        rewritten or reordered — and nothing else on the Session (prescriptions,
        Provenance, regeneration guard) is changed. Returns the updated Session, or
        ``None`` if it is missing or owned by another user, so a non-owner can never
        rename another user's plan. Caller normalizes the incoming name (trim /
        empty→``None``); the standalone-only guard lives in the route."""
        ...

    def set_favorite(
        self, session_id: int, clerk_user_id: str, favorite: bool
    ) -> SessionView | None:
        """Mark or unmark the owner's standalone Session as a Favorite (CONTEXT: Favorite,
        issue #396).

        Writes the user's **stored, per-user, per-copy** Favorite marker on their own Session —
        ``favorite=True`` marks it, ``favorite=False`` unmarks it, both idempotent. The marker
        is a *preference*, never a derived projection (ADR-0018 governs derived facts): it
        touches nothing on the Session itself (prescriptions, Provenance, Author, regeneration
        guard) and no Logged Session. Returns the updated Session — its ``is_favorite`` now
        reflecting the write — or ``None`` if it is missing or owned by another user, so a
        non-owner can never favorite another user's plan (their view is unaffected). The
        marker is per (user, session): a duplicated/redeemed copy has no row and stays
        un-favorited. The standalone-only guard lives in the route."""
        ...

    def trace_id(self, session_id: int, clerk_user_id: str) -> str | None:
        """Return the owner's Session's AI-usage trace-id lineage (ADR-0039, #274).

        Operator-only, deliberately kept off ``SessionView`` so it never reaches the
        PWA; the seam a later Generation-Feedback push reads. ``None`` when the Session
        is missing/unowned or carries no trace id."""
        ...

    def regenerate(
        self,
        session_id: int,
        clerk_user_id: str,
        *,
        keep_positions: Sequence[int],
        replacements: list[PrescriptionDraft],
        trace_id: str | None = None,
    ) -> SessionView | None:
        """Replace the owner's Session prescriptions, keeping those at
        ``keep_positions`` (in their original order) and appending ``replacements``
        after them, then re-number positions and mark the Session regenerated.

        ``trace_id`` re-stamps the Session with the regeneration call's lineage
        (ADR-0039, #274), so post-regeneration feedback maps to the regeneration rather
        than the superseded call. Returns the updated Session, or ``None`` if it is
        missing or owned by another user — regeneration only ever mutates the owner's
        own copy.
        """
        ...

    def substitute_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        new_exercise_id: int,
    ) -> SessionView | None:
        """Swap the Exercise referenced by the prescription at ``position`` for
        ``new_exercise_id``, leaving the sets/reps/rest/tempo/load and every other
        prescription untouched.

        This is the Substitution write: it is unlimited and never sets the
        regeneration guard (distinct from Regeneration). Returns the updated
        Session, or ``None`` if the Session is missing/unowned or has no
        prescription at ``position`` — it only ever mutates the owner's own copy.
        """
        ...

    def set_scheme(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        scheme: str | None,
    ) -> SessionView | None:
        """Set (or clear, with ``None``) the Progression Scheme on the prescription at
        ``position`` (ADR-0064).

        Writes the user-chosen scheme selection onto the owner's own copy — a plan
        property the read-time overlay resolves and dispatches on (a ``None`` selection
        resolves to the default, Double Progression). Nothing else on the prescription or
        the Session is touched: sets, reps, Load, Superset grouping, Session Provenance and
        the regeneration guard are all left exactly as they were, and no Logged Session is
        rewritten. Returns the updated Session, or ``None`` if it is missing/unowned or has
        no prescription at ``position``. The standalone-only and compatibility guards live
        in the scheme-selection service.
        """
        ...

    def append_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        prescription: PrescriptionDraft,
    ) -> SessionView | None:
        """Append one Exercise Prescription at the end of the owner's Session (Insert,
        ADR-0051).

        The prescription lands after every existing one, at the next position; nothing
        else is touched — existing prescriptions keep their order, and the Session's
        Provenance and regeneration guard are left exactly as they were (a hand-added
        movement is an edit, not a re-origination). Returns the updated Session, or
        ``None`` if it is missing or owned by another user — Insert only ever edits the
        owner's own copy. The standalone-only and validation guards live in the service.
        """
        ...

    def remove_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
    ) -> SessionView | None:
        """Withdraw the Exercise Prescription at ``position`` from the owner's Session
        (Remove, ADR-0052).

        The surviving prescriptions are re-numbered into a contiguous ``0..n-1`` run, and
        any Superset group left with a single survivor is dissolved to a valid solo
        prescription (its ``superset_group``/``round_rest_seconds`` cleared) — a lone
        tagged member is not a Superset (ADR-0023). The Session's Provenance and
        regeneration guard are left exactly as they were (removing a movement is an edit,
        not a re-origination). Returns the updated Session, or ``None`` if the Session is
        missing/unowned or has no prescription at ``position`` — Remove only ever edits
        the owner's own copy. The standalone-only and empty-guard live in the service.
        """
        ...


def _regenerated_drafts(
    current: list[ExercisePrescription],
    keep_positions: Sequence[int],
    replacements: list[PrescriptionDraft],
) -> list[PrescriptionDraft]:
    """Kept prescriptions (original order) followed by the replacements."""

    keep = set(keep_positions)
    kept = [
        draft_from_row(p)
        for p in sorted(current, key=lambda p: p.position)
        if p.position in keep
    ]
    return kept + list(replacements)


def _removed_drafts(
    current: list[ExercisePrescription], position: int
) -> list[PrescriptionDraft]:
    """Surviving prescriptions after removing the one at ``position`` (Remove, ADR-0052),
    ordered by position with any Superset group left with a single survivor dissolved to
    a solo prescription. ``_add_prescriptions`` re-numbers the result to a contiguous
    ``0..n-1`` run on write, so a removed middle position leaves no gap."""

    survivors = [
        p for p in sorted(current, key=lambda p: p.position) if p.position != position
    ]
    group_counts: dict[str, int] = {}
    for prescription in survivors:
        if prescription.superset_group is not None:
            group_counts[prescription.superset_group] = (
                group_counts.get(prescription.superset_group, 0) + 1
            )

    drafts: list[PrescriptionDraft] = []
    for prescription in survivors:
        draft = draft_from_row(prescription)
        # A group left with a single survivor is no longer a Superset (ADR-0023): dissolve
        # it to a valid solo prescription rather than persist a lone tagged member (Q5).
        if (
            prescription.superset_group is not None
            and group_counts[prescription.superset_group] < MIN_SUPERSET_MEMBERS
        ):
            draft = replace(draft, superset_group=None, round_rest_seconds=None)
        drafts.append(draft)
    return drafts


def _author_display_name(
    profiles: ProfileRepository | None, author_clerk_user_id: str | None
) -> str | None:
    """The Author's raw Profile display name for the read, or ``None`` (CONTEXT: Author, #395).

    ``None`` when the Session has no Author reference (a defensive pre-backfill case), no
    profile source is wired (an Author-agnostic in-memory test), or the author has no display
    name on file. The web mapper applies the never-blank generic fallback. A read-only lookup
    through the one ``ProfileRepository.display_name`` seam — shared by both repository
    implementations, never a profile write."""

    if author_clerk_user_id is None or profiles is None:
        return None
    return profiles.display_name(author_clerk_user_id)


class SqlSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session
        # Author display resolves through the same ProfileRepository seam the in-memory repo
        # uses (CONTEXT: Author, #395), built over this DB session so the read stays one query.
        self._profiles = SqlProfileRepository(session)
        # The Favorite marker resolves through the FavoriteRepository seam (CONTEXT: Favorite,
        # #396), built over this same DB session — the owner's ``is_favorite`` for the read and
        # the write target of ``set_favorite``.
        self._favorites: FavoriteRepository = SqlFavoriteRepository(session)

    def _view(self, workout: WorkoutSession) -> SessionView:
        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == workout.id)
            .order_by(ExercisePrescription.position)
        ).all()
        views = [
            view_from_row(p, self._session.get(Exercise, p.exercise_id))
            for p in prescriptions
        ]
        return SessionView(
            id=workout.id,
            clerk_user_id=workout.clerk_user_id,
            training_type=workout.training_type,
            duration_minutes=workout.duration_minutes,
            prescriptions=views,
            has_been_regenerated=workout.has_been_regenerated,
            provenance=workout.provenance,
            is_protocol_member=workout.protocol_id is not None,
            name=workout.name,
            created_at=workout.created_at,
            author_clerk_user_id=workout.author_clerk_user_id,
            author_display_name=_author_display_name(
                self._profiles, workout.author_clerk_user_id
            ),
            # The owner's Favorite marker (CONTEXT: Favorite, #396). Every ``_view`` is built
            # for the owner, so the viewer is ``workout.clerk_user_id``.
            is_favorite=self._favorites.is_favorite(
                workout.clerk_user_id, workout.id
            ),
        )

    def _add_prescriptions(
        self, session_id: int, prescriptions: list[PrescriptionDraft]
    ) -> None:
        for position, prescription in enumerate(prescriptions):
            self._session.add(
                row_from_draft(prescription, session_id=session_id, position=position)
            )

    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        workout = WorkoutSession(
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            duration_minutes=draft.duration_minutes,
            provenance=draft.provenance,
            trace_id=draft.trace_id,
            # Author is stamped with the creating user at creation (CONTEXT: Author, #395):
            # a self-authored/generated Session attributes to whoever created it.
            author_clerk_user_id=clerk_user_id,
        )
        self._session.add(workout)
        self._session.commit()
        self._session.refresh(workout)

        self._add_prescriptions(workout.id, draft.prescriptions)
        self._session.commit()
        return self._view(workout)

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return self._view(workout)

    def delete(self, session_id: int, clerk_user_id: str) -> bool:
        # The **terminal** step of the Session-Delete cascade (ADR-0063): it issues the single
        # ``commit`` that finalizes the whole cascade. Any Share Link / Generation Feedback the
        # Delete service flushed earlier rides this one transaction (all repositories in a
        # request share one session), so the delete lands atomically or, on any failure before
        # this commit, rolls back whole — never a half-deleted Session.
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return False

        # Children first so the FK-enforcing database accepts the parent delete: the Session's
        # Prescriptions and its Favorite marker rows (favoriting requires ownership, so the
        # owner holds the only possible row). Deleted directly rather than through the Favorite
        # seam's ``set_favorite`` so no intermediate commit breaks the one-transaction cascade.
        prescriptions = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        for prescription in prescriptions:
            self._session.delete(prescription)
        favorites = self._session.exec(
            select(SessionFavorite).where(SessionFavorite.session_id == session_id)
        ).all()
        for favorite in favorites:
            self._session.delete(favorite)
        self._session.flush()
        self._session.delete(workout)
        self._session.commit()
        return True

    def _summary(
        self, workout: WorkoutSession, prescription_count: int
    ) -> SessionSummaryView:
        """The thin My Sessions row for one owned Session (issue #397): Author and the
        Favorite marker resolve through the same seams ``_view`` uses, but no prescriptions
        are joined — the ``prescription_count`` is a plain count passed in by the caller (one
        grouped query for the whole page), never a per-row prescription fetch."""

        return SessionSummaryView(
            id=workout.id,
            training_type=workout.training_type,
            name=workout.name,
            created_at=workout.created_at,
            author_display_name=_author_display_name(
                self._profiles, workout.author_clerk_user_id
            ),
            is_favorite=self._favorites.is_favorite(
                workout.clerk_user_id, workout.id
            ),
            prescription_count=prescription_count,
        )

    def _prescription_counts(self, session_ids: list[int]) -> dict[int, int]:
        """The Exercise Prescription count per Session for the given ids, in one grouped
        query (issue #397). A Session with no prescriptions is absent from the map and reads
        as zero — the same shape as the Logged-Count map, so the "N exercises" fact never
        fans out into a per-Session count."""

        if not session_ids:
            return {}
        rows = self._session.exec(
            select(
                ExercisePrescription.session_id,
                func.count(ExercisePrescription.id),
            )
            .where(ExercisePrescription.session_id.in_(session_ids))
            .group_by(ExercisePrescription.session_id)
        ).all()
        return {session_id: count for session_id, count in rows}

    def list_standalone(
        self,
        clerk_user_id: str,
        *,
        query: str = "",
        favorites_only: bool = False,
        limit: int,
        offset: int,
    ) -> SessionListPage:
        # Owner-scoped and standalone-only (``protocol_id IS NULL``) in SQL, so a
        # Protocol-member or another user's Session never enters the candidate set; the
        # search/favorite filter, newest-first sort, and pagination are the shared rule.
        workouts = self._session.exec(
            select(WorkoutSession).where(
                WorkoutSession.clerk_user_id == clerk_user_id,
                WorkoutSession.protocol_id.is_(None),
            )
        ).all()
        # One grouped count for the whole candidate set, so badging "N exercises" on every
        # row never fans out into a per-Session query (mirrors the Logged-Count read).
        counts = self._prescription_counts([workout.id for workout in workouts])
        summaries = [
            self._summary(workout, counts.get(workout.id, 0)) for workout in workouts
        ]
        return _session_list_page(
            summaries,
            query=query,
            favorites_only=favorites_only,
            limit=limit,
            offset=offset,
        )

    def list_standalone_full(self, clerk_user_id: str) -> list[SessionView]:
        # Owner-scoped and standalone-only (``protocol_id IS NULL``) in SQL, newest-first;
        # each row is built into a full view (prescriptions joined) for Export (issue #418).
        workouts = self._session.exec(
            select(WorkoutSession)
            .where(
                WorkoutSession.clerk_user_id == clerk_user_id,
                WorkoutSession.protocol_id.is_(None),
            )
            .order_by(WorkoutSession.created_at.desc(), WorkoutSession.id.desc())
        ).all()
        return [self._view(workout) for workout in workouts]

    def duplicate(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        source = self._session.get(WorkoutSession, session_id)
        if source is None or source.clerk_user_id != clerk_user_id:
            return None

        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == session_id)
            .order_by(ExercisePrescription.position)
        ).all()

        # A standalone copy: Provenance, lineage, name and Author carried verbatim; Protocol
        # linkage and the regeneration guard deliberately not copied (ADR-0043). Author is
        # preserved from the source, NOT re-attributed to the duplicating user (CONTEXT:
        # Author immutable origin, #395) — the same non-re-attribution as Provenance/lineage.
        copy = WorkoutSession(
            clerk_user_id=clerk_user_id,
            training_type=source.training_type,
            duration_minutes=source.duration_minutes,
            provenance=source.provenance,
            trace_id=source.trace_id,
            title=source.title,
            name=source.name,
            author_clerk_user_id=source.author_clerk_user_id,
        )
        self._session.add(copy)
        self._session.commit()
        self._session.refresh(copy)

        self._add_prescriptions(copy.id, [draft_from_row(p) for p in prescriptions])
        self._session.commit()
        return self._view(copy)

    def get_shared(self, session_id: int) -> SessionView | None:
        # The one read that is NOT owner-scoped (ADR-0057): a recipient previewing a Share
        # Link is not the Owner. Returns the plan only; records/Favorite are never surfaced.
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None:
            return None
        return self._view(workout)

    def redeem(
        self, source_session_id: int, redeemer_clerk_user_id: str
    ) -> SessionView | None:
        # Cross-user read: the redeemer is not the Owner, so no owner filter here (ADR-0057).
        source = self._session.get(WorkoutSession, source_session_id)
        if source is None:
            return None

        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == source_session_id)
            .order_by(ExercisePrescription.position)
        ).all()

        # The redeem-copy rule (pure): new Owner = redeemer; Author, Name, Provenance and
        # trace_id lineage carried forward. Protocol linkage and the regeneration guard are
        # deliberately dropped so the copy stands alone with a fresh budget; Logged Sessions
        # and the Favorite marker are per-owner and simply never copied.
        attrs = redeem_copy(
            SharedSessionSource(
                training_type=source.training_type,
                duration_minutes=source.duration_minutes,
                provenance=source.provenance,
                name=source.name,
                author_clerk_user_id=source.author_clerk_user_id,
                trace_id=source.trace_id,
            ),
            redeemer_clerk_user_id,
        )
        copy = WorkoutSession(
            clerk_user_id=attrs.clerk_user_id,
            training_type=attrs.training_type,
            duration_minutes=attrs.duration_minutes,
            provenance=attrs.provenance,
            trace_id=attrs.trace_id,
            name=attrs.name,
            author_clerk_user_id=attrs.author_clerk_user_id,
        )
        self._session.add(copy)
        self._session.commit()
        self._session.refresh(copy)

        self._add_prescriptions(copy.id, [draft_from_row(p) for p in prescriptions])
        self._session.commit()
        return self._view(copy)

    def set_name(
        self, session_id: int, clerk_user_id: str, name: str | None
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        workout.name = name
        self._session.add(workout)
        self._session.commit()
        self._session.refresh(workout)
        return self._view(workout)

    def set_favorite(
        self, session_id: int, clerk_user_id: str, favorite: bool
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        # The Favorite marker lives in its own store keyed by (user, session), not on the
        # Session row — so nothing on the Session itself is touched.
        self._favorites.set_favorite(clerk_user_id, session_id, favorite)
        return self._view(workout)

    def trace_id(self, session_id: int, clerk_user_id: str) -> str | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return workout.trace_id

    def regenerate(
        self,
        session_id: int,
        clerk_user_id: str,
        *,
        keep_positions: Sequence[int],
        replacements: list[PrescriptionDraft],
        trace_id: str | None = None,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        new_drafts = _regenerated_drafts(list(current), keep_positions, replacements)

        for prescription in current:
            self._session.delete(prescription)
        self._session.commit()

        self._add_prescriptions(session_id, new_drafts)
        workout.has_been_regenerated = True
        # Re-stamp the Session's lineage with the regeneration call (#274).
        workout.trace_id = trace_id
        self._session.add(workout)
        self._session.commit()
        self._session.refresh(workout)
        return self._view(workout)

    def substitute_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        new_exercise_id: int,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        prescription = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id,
                ExercisePrescription.position == position,
            )
        ).first()
        if prescription is None:
            return None

        prescription.exercise_id = new_exercise_id
        self._session.add(prescription)
        self._session.commit()
        return self._view(workout)


    def set_scheme(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        scheme: str | None,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        prescription = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id,
                ExercisePrescription.position == position,
            )
        ).first()
        if prescription is None:
            return None

        prescription.scheme = scheme
        self._session.add(prescription)
        self._session.commit()
        return self._view(workout)

    def append_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        prescription: PrescriptionDraft,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        next_position = max((p.position for p in current), default=-1) + 1
        self._session.add(
            row_from_draft(prescription, session_id=session_id, position=next_position)
        )
        self._session.commit()
        return self._view(workout)

    def remove_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        if not any(p.position == position for p in current):
            return None

        # Compute the survivors (dissolving any lone Superset member) before touching the
        # rows, then rewrite the list — the same delete-all/re-add shape ``regenerate``
        # uses, so ``_add_prescriptions`` re-numbers the survivors to a contiguous run.
        survivors = _removed_drafts(list(current), position)
        for prescription in current:
            self._session.delete(prescription)
        self._session.commit()

        self._add_prescriptions(session_id, survivors)
        self._session.commit()
        return self._view(workout)


class InMemorySessionRepository:
    def __init__(
        self,
        exercises: ExerciseRepository,
        profiles: ProfileRepository | None = None,
        favorites: FavoriteRepository | None = None,
    ) -> None:
        self._exercises = exercises
        # Optional Profile source used only to resolve the Author's display name for the
        # read (CONTEXT: Author, #395). Left ``None`` in the many tests that don't exercise
        # Author, where the display resolves to ``None`` and the serializer's generic
        # fallback stands in; production and the endpoint tests wire the shared profile repo.
        self._profiles = profiles
        # The Favorite store (CONTEXT: Favorite, #396). Defaults to a private in-memory one so
        # ``set_favorite`` and the ``is_favorite`` read always work; endpoint tests can pass a
        # shared instance to assert per-user isolation across two callers.
        self._favorites: FavoriteRepository = favorites or InMemoryFavoriteRepository()
        self._sessions: dict[int, WorkoutSession] = {}
        self._prescriptions: dict[int, list[ExercisePrescription]] = {}
        self._next_id = 1

    def _view(self, workout: WorkoutSession) -> SessionView:
        prescriptions = self._prescriptions.get(workout.id, [])
        views = [
            view_from_row(p, self._exercises.get(p.exercise_id))
            for p in sorted(prescriptions, key=lambda p: p.position)
        ]
        return SessionView(
            id=workout.id,
            clerk_user_id=workout.clerk_user_id,
            training_type=workout.training_type,
            duration_minutes=workout.duration_minutes,
            prescriptions=views,
            has_been_regenerated=workout.has_been_regenerated,
            provenance=workout.provenance,
            is_protocol_member=workout.protocol_id is not None,
            name=workout.name,
            created_at=workout.created_at,
            author_clerk_user_id=workout.author_clerk_user_id,
            author_display_name=_author_display_name(
                self._profiles, workout.author_clerk_user_id
            ),
            # The owner's Favorite marker (CONTEXT: Favorite, #396) — the viewer is the owner.
            is_favorite=self._favorites.is_favorite(
                workout.clerk_user_id, workout.id
            ),
        )

    def _materialize(
        self, session_id: int, prescriptions: list[PrescriptionDraft]
    ) -> list[ExercisePrescription]:
        rows: list[ExercisePrescription] = []
        for position, prescription in enumerate(prescriptions):
            row = row_from_draft(
                prescription, session_id=session_id, position=position
            )
            # The in-memory store assigns row ids the SQL adapter leaves to the DB;
            # a contiguous 1-based id per position mirrors the SQL insert order.
            row.id = position + 1
            rows.append(row)
        return rows

    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        workout = WorkoutSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            duration_minutes=draft.duration_minutes,
            provenance=draft.provenance,
            trace_id=draft.trace_id,
            # Author stamped with the creating user at creation (CONTEXT: Author, #395).
            author_clerk_user_id=clerk_user_id,
        )
        self._next_id += 1
        self._sessions[workout.id] = workout
        self._prescriptions[workout.id] = self._materialize(
            workout.id, draft.prescriptions
        )
        return self._view(workout)

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return self._view(workout)

    def delete(self, session_id: int, clerk_user_id: str) -> bool:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return False

        del self._sessions[session_id]
        self._prescriptions.pop(session_id, None)
        # Clear the owner's Favorite marker (the only possible row — favoriting requires
        # ownership), mirroring the SQL repo's cascade of the plan-side rows it owns.
        self._favorites.set_favorite(clerk_user_id, session_id, False)
        return True

    def _summary(self, workout: WorkoutSession) -> SessionSummaryView:
        """The thin My Sessions row for one owned Session (issue #397) — Author and the
        Favorite marker resolve through the same seams ``_view`` uses, no prescriptions
        joined; ``prescription_count`` is the length of the stored prescription list."""

        return SessionSummaryView(
            id=workout.id,
            training_type=workout.training_type,
            name=workout.name,
            created_at=workout.created_at,
            author_display_name=_author_display_name(
                self._profiles, workout.author_clerk_user_id
            ),
            is_favorite=self._favorites.is_favorite(
                workout.clerk_user_id, workout.id
            ),
            prescription_count=len(self._prescriptions.get(workout.id, [])),
        )

    def list_standalone(
        self,
        clerk_user_id: str,
        *,
        query: str = "",
        favorites_only: bool = False,
        limit: int,
        offset: int,
    ) -> SessionListPage:
        # Owner-scoped and standalone-only (no ``protocol_id``): a Protocol-member or
        # another user's Session never enters the candidate set. The shared paginator
        # applies the combined search/favorite filter, newest-first sort, and slice.
        workouts = [
            workout
            for workout in self._sessions.values()
            if workout.clerk_user_id == clerk_user_id
            and workout.protocol_id is None
        ]
        summaries = [self._summary(workout) for workout in workouts]
        return _session_list_page(
            summaries,
            query=query,
            favorites_only=favorites_only,
            limit=limit,
            offset=offset,
        )

    def list_standalone_full(self, clerk_user_id: str) -> list[SessionView]:
        # Owner-scoped and standalone-only (no ``protocol_id``), newest-first — the full,
        # prescription-joined view of each so Export can serialize the plan (issue #418).
        workouts = [
            workout
            for workout in self._sessions.values()
            if workout.clerk_user_id == clerk_user_id and workout.protocol_id is None
        ]
        workouts.sort(key=lambda w: (w.created_at, w.id), reverse=True)
        return [self._view(workout) for workout in workouts]

    def duplicate(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        source = self._sessions.get(session_id)
        if source is None or source.clerk_user_id != clerk_user_id:
            return None

        prescriptions = sorted(
            self._prescriptions.get(session_id, []), key=lambda p: p.position
        )
        # A standalone copy: Provenance, lineage, name and Author carried verbatim; Protocol
        # linkage and the regeneration guard deliberately not copied (ADR-0043). Author is
        # preserved from the source, NOT re-attributed to the duplicating user (CONTEXT:
        # Author immutable origin, #395).
        copy = WorkoutSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            training_type=source.training_type,
            duration_minutes=source.duration_minutes,
            provenance=source.provenance,
            trace_id=source.trace_id,
            title=source.title,
            name=source.name,
            author_clerk_user_id=source.author_clerk_user_id,
        )
        self._next_id += 1
        self._sessions[copy.id] = copy
        self._prescriptions[copy.id] = self._materialize(
            copy.id, [draft_from_row(p) for p in prescriptions]
        )
        return self._view(copy)

    def get_shared(self, session_id: int) -> SessionView | None:
        # Not owner-scoped (ADR-0057): the previewing recipient is not the Owner.
        workout = self._sessions.get(session_id)
        if workout is None:
            return None
        return self._view(workout)

    def redeem(
        self, source_session_id: int, redeemer_clerk_user_id: str
    ) -> SessionView | None:
        # Cross-user read: no owner filter — the redeemer is not the Owner (ADR-0057).
        source = self._sessions.get(source_session_id)
        if source is None:
            return None

        prescriptions = sorted(
            self._prescriptions.get(source_session_id, []), key=lambda p: p.position
        )
        # The redeem-copy rule (pure): new Owner = redeemer; Author, Name, Provenance and
        # trace_id lineage carried forward; Protocol linkage and the regeneration guard dropped
        # so the copy stands alone; records and the Favorite marker are per-owner, never copied.
        attrs = redeem_copy(
            SharedSessionSource(
                training_type=source.training_type,
                duration_minutes=source.duration_minutes,
                provenance=source.provenance,
                name=source.name,
                author_clerk_user_id=source.author_clerk_user_id,
                trace_id=source.trace_id,
            ),
            redeemer_clerk_user_id,
        )
        copy = WorkoutSession(
            id=self._next_id,
            clerk_user_id=attrs.clerk_user_id,
            training_type=attrs.training_type,
            duration_minutes=attrs.duration_minutes,
            provenance=attrs.provenance,
            trace_id=attrs.trace_id,
            name=attrs.name,
            author_clerk_user_id=attrs.author_clerk_user_id,
        )
        self._next_id += 1
        self._sessions[copy.id] = copy
        self._prescriptions[copy.id] = self._materialize(
            copy.id, [draft_from_row(p) for p in prescriptions]
        )
        return self._view(copy)

    def set_name(
        self, session_id: int, clerk_user_id: str, name: str | None
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        workout.name = name
        return self._view(workout)

    def set_favorite(
        self, session_id: int, clerk_user_id: str, favorite: bool
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        self._favorites.set_favorite(clerk_user_id, session_id, favorite)
        return self._view(workout)

    def trace_id(self, session_id: int, clerk_user_id: str) -> str | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return workout.trace_id

    def regenerate(
        self,
        session_id: int,
        clerk_user_id: str,
        *,
        keep_positions: Sequence[int],
        replacements: list[PrescriptionDraft],
        trace_id: str | None = None,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        new_drafts = _regenerated_drafts(current, keep_positions, replacements)
        self._prescriptions[session_id] = self._materialize(session_id, new_drafts)
        workout.has_been_regenerated = True
        # Re-stamp the Session's lineage with the regeneration call (#274).
        workout.trace_id = trace_id
        return self._view(workout)

    def substitute_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        new_exercise_id: int,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        if not any(p.position == position for p in current):
            return None

        # Swap only the targeted prescription's Exercise; every other spine field (and
        # the regeneration guard) is preserved. ``evolve_prescription_row`` routes through
        # the one field manifest (ADR-0069), so a newly added field can never be dropped
        # here the way a hand-listed rebuild once flattened a Superset.
        self._prescriptions[session_id] = [
            evolve_prescription_row(p, exercise_id=new_exercise_id)
            if p.position == position
            else p
            for p in current
        ]
        return self._view(workout)

    def set_scheme(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        scheme: str | None,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        if not any(p.position == position for p in current):
            return None

        # Change only the targeted prescription's scheme; every other spine field is
        # preserved immutably through the one field manifest (ADR-0069).
        self._prescriptions[session_id] = [
            evolve_prescription_row(p, scheme=scheme)
            if p.position == position
            else p
            for p in current
        ]
        return self._view(workout)

    def append_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        prescription: PrescriptionDraft,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        next_position = max((p.position for p in current), default=-1) + 1
        appended = row_from_draft(
            prescription, session_id=session_id, position=next_position
        )
        appended.id = len(current) + 1
        self._prescriptions[session_id] = [*current, appended]
        return self._view(workout)

    def remove_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        if not any(p.position == position for p in current):
            return None

        # Rebuild the list from the survivors (with any lone Superset member dissolved);
        # ``_materialize`` re-numbers them to a contiguous ``0..n-1`` run.
        survivors = _removed_drafts(current, position)
        self._prescriptions[session_id] = self._materialize(session_id, survivors)
        return self._view(workout)


__all__ = [
    "PrescriptionDraft",
    "SessionDraft",
    "PrescriptionView",
    "SessionView",
    "SessionSummaryView",
    "SessionListPage",
    "SessionRepository",
    "SqlSessionRepository",
    "InMemorySessionRepository",
]
