// PROTOTYPE — throwaway. Stub data + view-helpers for the "visible workout
// composition" prototype (creative-directions idea 5, screen 05). NOT production:
// no reducer, no repository, no server. It exists only to let us look at three
// layouts of the composition strip in the browser and pick one. Delete with the
// prototype route once a variant wins.
//
// Roles (warm-up / main / accessories / cooldown) are NEW data the real model does
// not carry yet (the effort note says "start with ordered exercises only"). They are
// hard-coded here purely so the strip has something to bracket — the real feature
// would derive or store them as product logic.

export type Role = "warmup" | "main" | "accessory" | "cooldown";

// One exercise in the stub session. Mirrors the shape of the real `DraftPrescription`
// (name, sets, target, load, rest, note, superset group + denormalized round-rest)
// plus the prototype-only `role`.
export interface PrototypePrescription {
  id: number;
  name: string;
  role: Role;
  sets: number;
  target: string;
  load: string;
  restSeconds: number | null;
  note: string | null;
  // Members of one superset share a tag; `roundRestSeconds` is the group-owned round
  // rest denormalized onto each member (exactly as the real model does, ADR-0023).
  supersetGroup: string | null;
  roundRestSeconds: number | null;
}

export interface RoleMeta {
  key: Role;
  label: string;
  // Literal Tailwind classes — Tailwind can't see `bg-${x}`, so every role names its
  // own strings. All resolve to real PULSE tokens (globals.css).
  text: string;
  bg: string;
  border: string;
  ring: string;
  dot: string;
}

// Warm-up amber, main cyan (the primary accent), accessories violet, cooldown green —
// four distinct role colours drawn from the existing token palette.
export const ROLE_META: Record<Role, RoleMeta> = {
  warmup: {
    key: "warmup",
    label: "WARM-UP",
    text: "text-amber",
    bg: "bg-amber-dim",
    border: "border-amber/40",
    ring: "ring-amber/40",
    dot: "bg-amber",
  },
  main: {
    key: "main",
    label: "MAIN WORK",
    text: "text-cyan",
    bg: "bg-cyan-dim",
    border: "border-cyan/40",
    ring: "ring-cyan/40",
    dot: "bg-cyan",
  },
  accessory: {
    key: "accessory",
    label: "ACCESSORIES",
    text: "text-violet",
    bg: "bg-violet-dim",
    border: "border-violet/40",
    ring: "ring-violet/40",
    dot: "bg-violet",
  },
  cooldown: {
    key: "cooldown",
    label: "COOLDOWN",
    text: "text-green",
    bg: "bg-green-dim",
    border: "border-green/40",
    ring: "ring-green/40",
    dot: "bg-green",
  },
};

export const ROLE_ORDER: Role[] = ["warmup", "main", "accessory", "cooldown"];

// A realistic full-body session: every role represented, plus one superset pair in
// the accessories (Dumbbell Bench + Chest-Supported Row, 90s round rest) so the
// bracket + shared round instruction has something to render.
export const SAMPLE_SESSION: PrototypePrescription[] = [
  {
    id: 1,
    name: "Jumping Jacks",
    role: "warmup",
    sets: 2,
    target: "30s",
    load: "bodyweight",
    restSeconds: 30,
    note: "Ease in — get the heart rate up.",
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 2,
    name: "World's Greatest Stretch",
    role: "warmup",
    sets: 1,
    target: "5 / side",
    load: "bodyweight",
    restSeconds: null,
    note: null,
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 3,
    name: "Back Squat",
    role: "main",
    sets: 4,
    target: "5",
    load: "100 kg",
    restSeconds: 180,
    note: "Brace hard, sit between the hips.",
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 4,
    name: "Bench Press",
    role: "main",
    sets: 4,
    target: "5",
    load: "80 kg",
    restSeconds: 180,
    note: null,
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 5,
    name: "Romanian Deadlift",
    role: "main",
    sets: 3,
    target: "8",
    load: "90 kg",
    restSeconds: 150,
    note: "Long hamstrings, neutral spine.",
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 6,
    name: "Dumbbell Bench Press",
    role: "accessory",
    sets: 3,
    target: "10",
    load: "24 kg",
    restSeconds: null,
    note: null,
    supersetGroup: "g1",
    roundRestSeconds: 90,
  },
  {
    id: 7,
    name: "Chest-Supported Row",
    role: "accessory",
    sets: 3,
    target: "10",
    load: "20 kg",
    restSeconds: null,
    note: "Squeeze at the top for a beat.",
    supersetGroup: "g1",
    roundRestSeconds: 90,
  },
  {
    id: 8,
    name: "Face Pull",
    role: "accessory",
    sets: 3,
    target: "15",
    load: "15 kg",
    restSeconds: 60,
    note: null,
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 9,
    name: "Plank",
    role: "cooldown",
    sets: 3,
    target: "45s",
    load: "bodyweight",
    restSeconds: 45,
    note: null,
    supersetGroup: null,
    roundRestSeconds: null,
  },
  {
    id: 10,
    name: "Pigeon Stretch",
    role: "cooldown",
    sets: 1,
    target: "60s / side",
    load: "bodyweight",
    restSeconds: null,
    note: "Breathe into the hip.",
    supersetGroup: null,
    roundRestSeconds: null,
  },
];

// A render item is either a solo exercise or the contiguous run of one superset's
// members — the same bracketing the real builder does (`buildRenderItems`). Superset
// members are always an unbroken run in a well-ordered session.
export type RenderItem =
  | { kind: "solo"; prescription: PrototypePrescription }
  | {
      kind: "group";
      group: string;
      members: PrototypePrescription[];
      roundRestSeconds: number | null;
    };

// Bracket a flat, ordered list into render items, collapsing each contiguous run of a
// superset's members into one group item. Solo exercises pass through untouched.
export function toRenderItems(
  prescriptions: PrototypePrescription[],
): RenderItem[] {
  const items: RenderItem[] = [];
  let index = 0;
  while (index < prescriptions.length) {
    const current = prescriptions[index];
    if (current.supersetGroup === null) {
      items.push({ kind: "solo", prescription: current });
      index += 1;
      continue;
    }
    const group = current.supersetGroup;
    const members: PrototypePrescription[] = [];
    while (
      index < prescriptions.length &&
      prescriptions[index].supersetGroup === group
    ) {
      members.push(prescriptions[index]);
      index += 1;
    }
    items.push({
      kind: "group",
      group,
      members,
      roundRestSeconds: members[0]?.roundRestSeconds ?? null,
    });
  }
  return items;
}

// One role band: a role and the render items that belong to it. Roles are contiguous
// in a well-ordered session, so we start a new band whenever the role changes — the
// same walk as `toRenderItems`, one level up.
export interface RoleBand {
  role: Role;
  items: RenderItem[];
}

export function toRoleBands(prescriptions: PrototypePrescription[]): RoleBand[] {
  const bands: RoleBand[] = [];
  for (const item of toRenderItems(prescriptions)) {
    const role =
      item.kind === "solo" ? item.prescription.role : item.members[0].role;
    const last = bands[bands.length - 1];
    if (last && last.role === role) {
      last.items.push(item);
    } else {
      bands.push({ role, items: [item] });
    }
  }
  return bands;
}

// The superset member letter (A / B / C…) for a member's position within its group.
export function memberLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

// The user-facing superset letter (first superset in the session = A), so the round
// instruction names the group the way the member badges do.
export function supersetLetter(
  prescriptions: PrototypePrescription[],
  group: string,
): string {
  const groups: string[] = [];
  for (const p of prescriptions) {
    if (p.supersetGroup && !groups.includes(p.supersetGroup)) {
      groups.push(p.supersetGroup);
    }
  }
  const idx = groups.indexOf(group);
  return idx >= 0 ? String.fromCharCode(65 + idx) : "?";
}

// A one-line summary of an exercise's prescription — the collapsed form shown on a
// tile before the user opens the full editor (the expandable-card reveal, idea 1).
export function prescriptionSummary(p: PrototypePrescription): string {
  const scheme = `${p.sets} × ${p.target}`;
  const load = p.load === "bodyweight" ? "BW" : p.load;
  return `${scheme} · ${load}`;
}
