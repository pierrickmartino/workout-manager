import { AvatarPicker } from "@/components/AvatarPicker";
import { Alert } from "@/components/pulse/alert";
import { BackLink } from "@/components/pulse/back-link";
import { PageHeader } from "@/components/pulse/page-header";
import { PrototypeSwitcher } from "@/components/pulse/prototype-switcher";
import { resolveAppearance } from "@/lib/appearance";
import { fetchAvatars } from "@/lib/avatars";
import type { AvatarCatalog } from "@/lib/avatar/avatar-picker";

import {
  PrototypeAvatarUniverse,
  UNIVERSES,
  type UniverseKey,
} from "./prototype-avatar-universes";

// PROTOTYPE — throwaway: realistic Avatars in three universes, switchable via `?variant=`
// (current | A | B | C). Not for main.
const PROTOTYPE_VARIANTS = [
  { key: "current", name: "Shipped flat art" },
  ...Object.entries(UNIVERSES).map(([key, universe]) => ({ key, name: universe.name })),
];

// PROTOTYPE — a stand-in catalog so the universes still render when the API is down.
const PROTOTYPE_STUB_CATALOG: AvatarCatalog = {
  operator_level: 6,
  avatars: [
    { id: "novice", name: "Novice", unlock_level: 1, unlocked: true, current_level: 6 },
    { id: "dwarf-lifter", name: "Dwarf Lifter", unlock_level: 1, unlocked: true, current_level: 6 },
    { id: "elf-ranger", name: "Elf Ranger", unlock_level: 1, unlocked: true, current_level: 6 },
    { id: "monk", name: "Monk", unlock_level: 3, unlocked: true, current_level: 6 },
    { id: "barbarian", name: "Barbarian", unlock_level: 5, unlocked: true, current_level: 6 },
    { id: "valkyrie", name: "Valkyrie", unlock_level: 8, unlocked: false, current_level: 6 },
    { id: "paladin", name: "Paladin", unlock_level: 12, unlocked: false, current_level: 6 },
    { id: "titan", name: "Titan", unlock_level: 20, unlocked: false, current_level: 6 },
  ],
};

// The Avatar picker page (ADR-0136), reached from Profile: the whole catalog as a radio
// group with the user's current Avatar selected. The catalog read and the Interface
// Preference read run in parallel; `resolveAppearance` shares this request's cache with the
// root layout, so the current Avatar costs no extra round-trip.
export default async function AvatarPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const [envelope, appearance, { variant: rawVariant }] = await Promise.all([
    fetchAvatars(),
    resolveAppearance(),
    searchParams,
  ]);
  const variant = PROTOTYPE_VARIANTS.some((entry) => entry.key === rawVariant)
    ? (rawVariant as string)
    : "A";
  const catalog = envelope.success && envelope.data ? envelope.data : null;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="PULSE // OPERATOR" title="Choose your Avatar" />
      {variant === "current" ? (
        catalog ? (
          <AvatarPicker catalog={catalog} currentAvatarId={appearance.avatar} />
        ) : (
          <Alert tone="error">
            Could not load the Avatars: {envelope.error ?? "unknown error"}
          </Alert>
        )
      ) : (
        <PrototypeAvatarUniverse
          key={variant}
          universe={variant as UniverseKey}
          catalog={catalog ?? PROTOTYPE_STUB_CATALOG}
          currentAvatarId={appearance.avatar}
        />
      )}
      <BackLink href="/profile">Back to profile</BackLink>
      <PrototypeSwitcher
        variants={PROTOTYPE_VARIANTS}
        current={variant}
        stateLine={`LVL ${(catalog ?? PROTOTYPE_STUB_CATALOG).operator_level}${catalog ? "" : " · stub catalog"}`}
      />
    </section>
  );
}
