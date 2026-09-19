import { test } from "node:test";
import assert from "node:assert/strict";

import { protocolScheduleCard } from "./protocol-schedule.ts";
import type { ProtocolSession } from "./protocols-types.ts";

// A minimal Session stub — the view-model only reads these three fields.
function session(
  overrides: Partial<
    Pick<ProtocolSession, "session_id" | "performed" | "logged_session_id">
  > = {},
): Pick<ProtocolSession, "session_id" | "performed" | "logged_session_id"> {
  return {
    session_id: 42,
    performed: false,
    logged_session_id: null,
    ...overrides,
  };
}

test("the Next Session in the Current Protocol can be Started and viewed", () => {
  // Arrange
  const next = session({ session_id: 7, performed: false });

  // Act
  const card = protocolScheduleCard(next, {
    isNext: true,
    isCurrentProtocol: true,
  });

  // Assert — Start deep-links into the Live route; the header views the plan detail
  assert.equal(card.state, "next");
  assert.equal(card.state === "next" && card.startHref, "/sessions/7/live");
  assert.equal(card.state === "next" && card.detailHref, "/sessions/7");
});

test("the Next Session of a non-current (set-aside) protocol cannot be Started", () => {
  // Arrange — same Next Session, but this protocol is not the Current one (superseded)
  const next = session({ session_id: 7 });

  // Act
  const card = protocolScheduleCard(next, {
    isNext: true,
    isCurrentProtocol: false,
  });

  // Assert — no Start (honors the supersede one-way door); detail still viewable
  assert.equal(card.state, "next");
  assert.equal(card.state === "next" && card.startHref, null);
  assert.equal(card.state === "next" && card.detailHref, "/sessions/7");
});

test("a performed Session links to its record, never the plan", () => {
  // Arrange — performed, carrying the advancing Logged Session id
  const done = session({ session_id: 7, performed: true, logged_session_id: 99 });

  // Act
  const card = protocolScheduleCard(done, {
    isNext: false,
    isCurrentProtocol: true,
  });

  // Assert — opens the record (History), not the plan detail (which would offer Start/Log)
  assert.equal(card.state, "performed");
  assert.equal(card.state === "performed" && card.recordHref, "/history/99");
});

test("a performed Session with no record id is not a link", () => {
  // Arrange — defensive: performed but the advancing log id is missing
  const done = session({ performed: true, logged_session_id: null });

  // Act
  const card = protocolScheduleCard(done, {
    isNext: false,
    isCurrentProtocol: true,
  });

  // Assert — no dangling link rather than a broken /history/null
  assert.equal(card.state, "performed");
  assert.equal(card.state === "performed" && card.recordHref, null);
});

test("a future un-performed Session is informational, not interactive", () => {
  // Arrange — neither next nor performed
  const future = session({ performed: false });

  // Act
  const card = protocolScheduleCard(future, {
    isNext: false,
    isCurrentProtocol: true,
  });

  // Assert — no card-level link and no Start (its exercises still link out in the UI)
  assert.equal(card.state, "future");
});

test("Next takes precedence: the Next Session is never treated as a plain future row", () => {
  // Arrange — the next session, un-performed, in the current protocol
  const next = session({ session_id: 3 });

  // Act
  const card = protocolScheduleCard(next, {
    isNext: true,
    isCurrentProtocol: true,
  });

  // Assert
  assert.equal(card.state, "next");
});
