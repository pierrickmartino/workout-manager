import ts from "typescript";

// ADR-0095: an image reserves its box before its bytes arrive, and says whether it is worth
// fetching yet. Both of the app's raw <img> elements did neither — `max-h-* w-full
// object-contain` collapses to zero height until the image decodes, so the exercise
// description, the muscle map and the whole SPECS lens below it jumped when it did.
//
// The remedy is `components/pulse/illustration.tsx`, which declares the box once. This guard
// watches the other path — a component that hand-rolls an <img> and so reserves nothing.
//
// It proves the attributes are *declared*, not that the numbers are right: `width={1}
// height={1}` on a 4:3 illustration would pass. That the hint and the reserved box agree is
// held by `illustration-box.test.ts`, which compares the two declarations directly.

export type ImageAttribute = "width" | "height" | "loading";

export interface ImageViolation {
  readonly file: string;
  readonly line: number;
  readonly attribute: ImageAttribute;
}

export interface ImageExemption {
  readonly file: string;
  readonly attribute: ImageAttribute;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that one image is better off reserving nothing,
// which needs a reason a reviewer can weigh — so the reason is a required field, not a comment.
export const IMAGE_EXEMPTIONS: readonly ImageExemption[] = [];

// `width` and `height` are the ratio hint a browser lays out from before the stylesheet or the
// image arrives; `loading` is the decision about whether this image is worth the request now.
// `decoding` is deliberately not here — it changes when a loaded image paints, never the space
// it occupies.
const REQUIRED: readonly ImageAttribute[] = ["width", "height", "loading"];

function declaredAttributes(element: ts.JsxOpeningLikeElement): ReadonlySet<string> {
  const declared = new Set<string>();
  for (const attribute of element.attributes.properties) {
    // A spread may or may not carry the attribute, so it declares nothing.
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
    declared.add(attribute.name.text);
  }
  return declared;
}

export function findUnreservedImages(
  source: string,
  file: string,
): readonly ImageViolation[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: ImageViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      // Only the lowercase element is the raw image; `<Illustration>` is the design system's.
      if (node.tagName.getText(tree) === "img") {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        const declared = declaredAttributes(node);
        for (const attribute of REQUIRED) {
          if (!declared.has(attribute)) violations.push({ file, line, attribute });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(tree, visit);
  return violations.filter((violation) => !IMAGE_EXEMPTIONS.some((exemption) =>
    exemption.file === violation.file && exemption.attribute === violation.attribute));
}

export function formatImageViolations(
  violations: readonly ImageViolation[],
): string {
  return violations.map(({ file, line, attribute }) => {
    const remedy = attribute === "loading"
      ? "state loading, or render it through components/pulse/illustration.tsx"
      : `state ${attribute} as the ratio hint, or render it through components/pulse/illustration.tsx`;
    return `${file}:${line} — <img> declares no ${attribute}; ${remedy}`;
  }).join("\n");
}
