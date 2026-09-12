// PROTOTYPE — Field Guide exercise discovery. Throwaway; see README.md.
//
// The variant registry, in a PLAIN (non-"use client") module so both the server page and
// the client components can import the real value. A value exported from a "use client"
// module becomes a client-reference proxy on the server, so the server page must read the
// list from here, not from the client container.

export interface VariantSpec {
  key: string;
  name: string;
}

export const FIELD_GUIDE_VARIANTS: VariantSpec[] = [
  { key: "A", name: "Field Guide Index" },
  { key: "B", name: "Specimen Plates" },
  { key: "C", name: "Taxonomy" },
];

export const FIELD_GUIDE_KEYS = new Set(
  FIELD_GUIDE_VARIANTS.map((variant) => variant.key),
);
