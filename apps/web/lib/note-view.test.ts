import { test } from "node:test";
import assert from "node:assert/strict";

import { exerciseNoteText, noteText, setNoteText } from "./note-view.ts";

test("an absent note renders as nothing", () => {
  // null / undefined / blank all mean "no note" — the signal to render nothing.
  assert.equal(noteText(null), null);
  assert.equal(noteText(undefined), null);
  assert.equal(noteText(""), null);
  assert.equal(noteText("   \n\t "), null);
});

test("a plain note is shown verbatim (trimmed)", () => {
  assert.equal(noteText("left knee twinge"), "left knee twinge");
  assert.equal(noteText("  pause on the chest  "), "pause on the chest");
});

test("a stored escaped note is decoded to the text the user typed", () => {
  // The backend stores html.escape(quote=True); the view decodes it so the reader sees the
  // original characters rather than raw entities.
  assert.equal(noteText("a &amp; b"), "a & b");
  assert.equal(noteText("don&#x27;t lock out"), "don't lock out");
  assert.equal(
    noteText("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"),
    '<script>alert("x")</script>',
  );
});

test("ampersand is decoded last so an escaped entity is not double-decoded", () => {
  // "&amp;lt;" is the escape of a literal "&lt;" the user typed; it must decode back to "&lt;",
  // not collapse to "<".
  assert.equal(noteText("&amp;lt;"), "&lt;");
});

test("exerciseNoteText reads the plan-side note off a prescription", () => {
  assert.equal(exerciseNoteText({ note: "brace hard" }), "brace hard");
  assert.equal(exerciseNoteText({ note: null }), null);
});

test("setNoteText reads the record-side note off a logged set", () => {
  assert.equal(setNoteText({ note: "felt easy" }), "felt easy");
  assert.equal(setNoteText({ note: undefined }), null);
});
