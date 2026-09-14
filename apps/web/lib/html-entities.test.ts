import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeHtmlEntities } from "./html-entities.ts";

test("decodeHtmlEntities reverses the backend's html.escape(quote=True)", () => {
  assert.equal(
    decodeHtmlEntities("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;"),
    "<script>alert('x')</script>",
  );
  assert.equal(decodeHtmlEntities("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(decodeHtmlEntities("say &quot;hi&quot;"), 'say "hi"');
});

test("decodeHtmlEntities applies &amp; last so a doubly-escaped entity survives one decode", () => {
  // The stored value of a literal `&lt;` (escaped once as `&amp;lt;`) decodes back to `&lt;`,
  // not collapsing to `<`.
  assert.equal(decodeHtmlEntities("&amp;lt;"), "&lt;");
});

test("decodeHtmlEntities leaves entity-free text untouched", () => {
  assert.equal(decodeHtmlEntities("Keep a neutral spine"), "Keep a neutral spine");
});
