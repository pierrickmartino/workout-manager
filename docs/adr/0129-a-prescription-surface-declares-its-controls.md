# A Prescription surface declares its controls

The shared Prescription field stack (ADR-0067) used to work out which controls to render from
which optional handlers its caller passed: no `onChangeNote` meant no Note control, and no
`onChangeTargetEffort` meant no Target Effort control. Two per-surface booleans, `showRest` and
`suppressWarmUpSummaryChip`, tuned the rest. So a surface opted out by *leaving a prop out*, and
a forgotten handler silently dropped a control (audit C-2,
`docs/research/audit/vercel/composition-patterns-2026-10-10.md`).

Each authoring surface now names a preset in `lib/prescription-controls.ts`
(`PRESCRIPTION_SURFACES`: Insert, Hand-Authored, Builder). `prescriptionControlSet(surface,
{ grouped })` turns the preset into the set of controls the row renders. A grouped Superset
member loses only its own Rest (ADR-0023). The stack renders exactly the controls in the set,
and only those earn summary chips. It reports every edit through one
`onChange(edit)`; the surface maps the edit to its own state (`authoredRowPatch` for the ad-hoc
rows, `builderPrescriptionEvent` for the Builder's draft events). `prescription-controls.test.ts`
holds each preset to the keys its request actually sends. A control the request can't carry,
or a request field no control authors, fails the test, and so does a new payload key nobody
has mapped.

## Considered options

- **Compound components** (`<PrescriptionFields.Rest/>` and the rest as children, with the
  draft provided through context). This was rejected for now. The Prescription Summary chips
  are built from the fields present, so the root would still need a declared list of its
  children, which is the same declaration with more machinery. It would also re-shape all three
  render trees. The preset keeps today's markup byte for byte.

## Consequences

- A new prescription field means a new `PrescriptionControl`, a cell in each preset that authors
  it, and a `REQUEST_KEY_CONTROL` entry in the test. The test fails until all three agree.
- The Progression Scheme stays the Builder's `advanced` slot, not a control. It is the only
  surface-specific field.
