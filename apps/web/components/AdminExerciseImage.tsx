"use client";

import { useRef, useState, useTransition } from "react";

import { removeImageAction, uploadImageAction } from "@/app/admin/exercises/actions";
import { resolveExerciseImageSrc, validateImageUpload } from "@/lib/exercise-image";
import type { ExerciseDetail } from "@/lib/sessions-types";
import { Alert } from "@/components/pulse/alert";
import { Field } from "@/components/pulse/field";
import { useFieldControl } from "@/components/pulse/field-control";
import { Illustration } from "@/components/pulse/illustration";
import { SectionHeader } from "@/components/pulse/section-header";
import { Button } from "@/components/ui/button";

// The curator Exercise Image control on the admin editor (issue #504, ADR-0041): upload (or
// replace), preview, and remove the one illustration a curator sets for a movement — the picture
// the Enrichment AI is forbidden to fabricate. A thin Client Component; the image-source
// resolution and the type/size pre-check live in the pure `lib/exercise-image` (unit-tested).
// The backend is the real gate (`require_admin`, and 415/413 validation); this only forwards the
// file, shows what is set, and re-points the preview after each act.
export function AdminExerciseImage({
  exercise,
}: {
  exercise: ExerciseDetail;
}): React.JSX.Element {
  // What detail would show once no uploaded image exists: the legacy curated URL, or nothing.
  const legacyFallback = resolveExerciseImageSrc({
    id: exercise.id,
    has_image: false,
    image: exercise.image,
  });

  const [currentSrc, setCurrentSrc] = useState<string | null>(() =>
    resolveExerciseImageSrc(exercise),
  );
  const [hasUploaded, setHasUploaded] = useState(exercise.has_image);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function clearSelection(): void {
    setSelectedFile(null);
    setPendingPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onSelect(event: React.ChangeEvent<HTMLInputElement>): void {
    setError(null);
    setNotice(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      clearSelection();
      return;
    }
    const message = validateImageUpload(file);
    if (message) {
      // Client-side pre-check (the backend re-validates): flag a bad file, keep none selected.
      setError(message);
      clearSelection();
      return;
    }
    setSelectedFile(file);
    // Preview via a data URL (not a blob: URL) so it renders under the app's `img-src` CSP.
    const reader = new FileReader();
    reader.onload = () =>
      setPendingPreview(
        typeof reader.result === "string" ? reader.result : null,
      );
    reader.readAsDataURL(file);
  }

  function upload(): void {
    if (!selectedFile) return;
    setError(null);
    setNotice(null);
    const file = selectedFile;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const result = await uploadImageAction(exercise.id, formData);
        if (result.error || !result.imageUrl) {
          setError(result.error ?? "Could not upload the image.");
          return;
        }
        // Cache-bust so the browser re-fetches the replaced image at the same served URL.
        setCurrentSrc(`${result.imageUrl}?v=${Date.now()}`);
        setHasUploaded(true);
        clearSelection();
        setNotice("Image uploaded.");
      } catch {
        setError("Could not upload the image. Try again.");
      }
    });
  }

  function remove(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await removeImageAction(exercise.id);
        if (result.error) {
          setError(result.error);
          return;
        }
        // Fall back to the legacy URL (or nothing) now that the uploaded image is gone.
        setCurrentSrc(legacyFallback);
        setHasUploaded(false);
        setNotice("Image removed.");
      } catch {
        setError("Could not remove the image. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>Image</SectionHeader>
      <p className="font-mono text-[13px] leading-relaxed text-text-muted">
        A curator-only illustration for this movement — never AI-generated. JPEG, PNG, or WebP,
        up to 2&nbsp;MB. The uploaded image is shown on the Exercise page in place of any legacy
        URL.
      </p>

      {pendingPreview ? (
        <ImagePreview src={pendingPreview} name={exercise.name} label="Selected — not yet saved" />
      ) : currentSrc ? (
        <ImagePreview src={currentSrc} name={exercise.name} label="Current image" />
      ) : (
        <p className="font-mono text-[13px] text-text-muted">No image set.</p>
      )}

      <Field
        label="Choose image"
        htmlFor="exercise-image"
        hint="JPEG, PNG, or WebP — 2 MB max."
      >
        <ImageFilePicker inputRef={inputRef} onSelect={onSelect} />
      </Field>

      {error ? <Alert announce tone="error">{error}</Alert> : null}
      {notice ? <Alert announce tone="success">{notice}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={!selectedFile || isBusy}
          onClick={upload}
          className="self-start"
        >
          {isBusy ? "Working…" : "Upload image"}
        </Button>
        {selectedFile ? (
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={clearSelection}
            className="self-start"
          >
            Cancel
          </Button>
        ) : null}
        {hasUploaded ? (
          <Button
            type="button"
            variant="destructive"
            disabled={isBusy}
            onClick={remove}
            className="self-start"
          >
            Remove image
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// The one control in this app that sits in a `Field` without being one of the three form
// primitives: a file picker has no value to autofill and no keypad to choose, so ADR-0093
// leaves it to the platform. It therefore claims the field’s id and hint itself (ADR-0107),
// which is also why it is its own component — the hook reads the field, so it has to be
// called below the provider rather than beside the `<Field>`.
function ImageFilePicker({
  inputRef,
  onSelect,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
}): React.JSX.Element {
  const field = useFieldControl();
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      onChange={onSelect}
      className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-sm file:border-0 file:bg-surface file:px-4 file:py-2 file:font-mono file:text-xs file:uppercase file:tracking-wider file:text-text-primary hover:file:bg-elevated"
      {...field}
    />
  );
}

function ImagePreview({
  src,
  name,
  label,
}: {
  src: string;
  name: string;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-mono text-[10px] tracking-wider text-text-muted">
        {label}
      </span>
      {/* The same framed box the Exercise page renders (ADR-0095), so the preview shows the
          curator what a reader will actually see — letterboxing included. */}
      <Illustration src={src} alt={`Illustration of ${name}`} />
    </div>
  );
}
