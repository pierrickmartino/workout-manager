// PROTOTYPE — throwaway. Universe B, "Orbit": the same eight catalog slots recast as the
// crew of a deep-space station. Same ids and unlock levels as the catalog. Not for main.

import { Shaded, type Portrait } from "./prototype-portrait-rig";

const HANGAR: Portrait["bg"] = ["#1c3a52", "#04080e"];

// A faint HUD grid and arc behind every crew portrait.
function Hud({ color }: { color: string }): React.JSX.Element {
  return (
    <g stroke={color} fill="none" opacity="0.35">
      <path d="M0 20H100M0 40H100M0 60H100M20 0V100M80 0V100" strokeWidth="0.3" />
      <path d="M12 50A38 38 0 0 1 50 12" strokeWidth="1" strokeDasharray="3 2" />
      <path d="M88 50A38 38 0 0 1 50 88" strokeWidth="1" strokeDasharray="3 2" />
    </g>
  );
}

export const ORBIT: readonly Portrait[] = [
  {
    id: "novice",
    name: "Cadet",
    blurb: "Fresh off the academy shuttle, headset on.",
    skin: ["#eac3a4", "#c9926e", "#8a5a42"],
    iris: "#6a4a2a",
    brow: "#2a1c14",
    bg: HANGAR,
    rim: "#5ad8ff",
    scene: () => <Hud color="#5ad8ff" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#3a4a5e" d="M2 100C4 84 18 74 36 70L50 74L64 70C82 74 96 84 98 100Z" />
        <path d="M40 70L50 80L60 70L58 66H42Z" fill="#1e2632" />
        <path d="M50 80V100" stroke="#1e2632" strokeWidth="1.2" />
        <rect x="22" y="82" width="12" height="8" rx="1" fill="#5ad8ff" opacity="0.8" />
        <path d="M66 84H80" stroke="#ffb454" strokeWidth="2" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M32 38C31 26 39 20 50 20C61 20 69 26 68 38C64 31 58 28 50 28C42 28 36 31 32 38Z" fill="#2a1c14" />
        <path d="M28 40C28 24 38 16 50 16C62 16 72 24 72 40" fill="none" stroke="#1e2632" strokeWidth="2.2" />
        <rect x="25" y="38" width="7" height="12" rx="3" fill="#1e2632" />
        <path d="M28 50Q30 60 42 60" fill="none" stroke="#1e2632" strokeWidth="1.2" />
        <circle cx="42.5" cy="60" r="1.4" fill="#5ad8ff" />
      </g>
    ),
  },
  {
    id: "dwarf-lifter",
    name: "Rig Hauler",
    blurb: "Hydraulic exo-frame, welding goggles, a beard full of grease.",
    skin: ["#d9a582", "#b07650", "#6f4430"],
    iris: "#5a3a1a",
    brow: "#3a2414",
    bg: ["#3a2a1a", "#0a0604"],
    rim: "#ffb454",
    jaw: "square",
    scene: () => <Hud color="#ffb454" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#e08a1e" d="M0 100C2 82 16 72 34 70L50 74L66 70C84 72 98 82 100 100Z" />
        <path d="M14 86L30 80M70 80L86 86" stroke="#d9dde2" strokeWidth="2.4" />
        <rect x="4" y="66" width="18" height="16" rx="3" fill={`url(#${ids.metal})`} />
        <rect x="78" y="66" width="18" height="16" rx="3" fill={`url(#${ids.metal})`} />
        <rect x="9" y="58" width="4" height="10" fill="#4d545d" />
        <rect x="87" y="58" width="4" height="10" fill="#4d545d" />
        <path d="M30 92H70" stroke="#d9dde2" strokeWidth="2" strokeDasharray="4 3" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#3a2414" d="M33 50C33 64 40 74 50 76C60 74 67 64 67 50C62 56 56 58 54 56C52 58 48 58 46 56C44 58 38 56 33 50Z" />
        <path d="M43 57Q50 54 57 57Q50 60 43 57Z" fill="#4a3020" />
        <path d="M31 36C31 24 39 18 50 18C61 18 69 24 69 36C64 31 58 29 50 29C42 29 36 31 31 36Z" fill="#3a2414" />
        <rect x="31" y="27" width="38" height="5" rx="2" fill="#2a2a2e" />
        <circle cx="41" cy="29.5" r="5" fill={`url(#${ids.metal})`} />
        <circle cx="59" cy="29.5" r="5" fill={`url(#${ids.metal})`} />
        <circle cx="41" cy="29.5" r="3.4" fill="#1a3a2a" />
        <circle cx="59" cy="29.5" r="3.4" fill="#1a3a2a" />
        <circle cx="40" cy="28.5" r="1" fill="#fff" opacity="0.6" />
        <circle cx="58" cy="28.5" r="1" fill="#fff" opacity="0.6" />
      </g>
    ),
  },
  {
    id: "elf-ranger",
    name: "Pathfinder",
    blurb: "A scout with a HUD visor and an undercut.",
    skin: ["#f2d6be", "#d6ab8c", "#9a7058"],
    iris: "#3ad89a",
    brow: "#1a2a24",
    bg: ["#163a2e", "#030a08"],
    rim: "#3ad89a",
    scene: () => (
      <g>
        <Hud color="#3ad89a" />
        <path d="M76 6V40" stroke="#9aa3ad" strokeWidth="1.4" />
        <circle cx="76" cy="6" r="1.8" fill="#3ad89a" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#3a4a3a" d="M2 100C4 82 18 72 36 68L50 76L64 68C82 72 96 82 98 100Z" />
        <path d="M10 90L24 78L36 84L30 96ZM70 80L84 86L80 98L66 92Z" fill="#2a3a2a" />
        <path d="M30 70L44 100M70 70L56 100" stroke="#1e2620" strokeWidth="2.5" />
        <rect x="68" y="76" width="10" height="6" rx="1" fill="#3ad89a" opacity="0.7" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M31 42C29 26 38 17 50 17C62 17 70 24 70 34L56 28C48 26 40 30 36 34C34 37 32 40 31 42Z" fill="#1a2a24" />
        <path d="M60 22C68 24 72 32 70 40" stroke="#1a2a24" strokeWidth="0.5" strokeDasharray="0.6 0.8" fill="none" />
        <path d="M33 41H67Q68 47 63 49H37Q32 47 33 41Z" fill="#3ad89a" opacity="0.45" />
        <path d="M33 41H67" stroke="#c8ffe8" strokeWidth="0.8" />
        <path d="M36 45H44M56 45H62" stroke="#c8ffe8" strokeWidth="0.4" />
        <rect x="66" y="40" width="5" height="7" rx="1" fill="#2a3a34" />
      </g>
    ),
  },
  {
    id: "monk",
    name: "Zero-G Adept",
    blurb: "Floats in stillness; circuitry glows along the skull.",
    skin: ["#b7825d", "#8e5c3c", "#553220"],
    iris: "#b08bff",
    brow: "#1a100a",
    eyes: "closed",
    bg: ["#2a1a4a", "#06040e"],
    rim: "#b08bff",
    scene: () => <Hud color="#b08bff" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#e4e0ea" d="M2 100C4 84 18 74 36 70L50 74L64 70C82 74 96 84 98 100Z" />
        <Shaded ids={ids} fill="#d0cad8" d="M36 58C38 66 40 72 42 76H58C60 72 62 66 64 58L66 76L34 76Z" />
        <path d="M50 76V100M38 86H62" stroke="#b08bff" strokeWidth="0.8" />
        <circle cx="50" cy="86" r="2.4" fill="#b08bff" />
      </g>
    ),
    front: () => (
      <g fill="none" stroke="#c9b0ff" strokeWidth="0.7" opacity="0.9">
        <path d="M50 21V30H44V34M50 30H57L60 33" />
        <circle cx="44" cy="35" r="0.9" fill="#c9b0ff" />
        <circle cx="60" cy="33.5" r="0.9" fill="#c9b0ff" />
        <ellipse cx="44" cy="26" rx="8" ry="2.6" fill="#fff" stroke="none" opacity="0.18" />
      </g>
    ),
  },
  {
    id: "barbarian",
    name: "Void Raider",
    blurb: "Mohawk, cyber-eye, a spiked pauldron off a dead ship.",
    skin: ["#e0ae8c", "#b47a56", "#6e4430"],
    iris: "#ff3a5a",
    brow: "#1a0a0e",
    bg: ["#4a0e24", "#0e0206"],
    rim: "#ff67ac",
    jaw: "square",
    scene: () => <Hud color="#ff67ac" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#2a2228" d="M2 100C4 84 16 76 32 72L42 78H58L68 72C84 76 96 84 98 100Z" />
        <path d="M62 70C76 64 92 72 96 86L66 84Z" fill={`url(#${ids.metal})`} />
        <path d="M70 70L74 58L78 70ZM80 72L88 62L88 76Z" fill="#c6ccd3" />
        <path d="M28 82L40 100M20 90L28 100" stroke="#ff67ac" strokeWidth="0.8" opacity="0.7" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M44 34C44 20 46 10 50 4C54 10 56 20 56 34C53 30 47 30 44 34Z" fill="#ff3a7a" />
        <path d="M33 38C32 30 36 26 42 25M67 38C68 30 64 26 58 25" stroke="#3a2a24" strokeWidth="0.5" strokeDasharray="0.5 0.7" fill="none" />
        <path d="M53 39H64Q65 49 58 50H54Z" fill={`url(#${ids.metal})`} />
        <circle cx="58.5" cy="44.5" r="2.4" fill="#ff3a5a" />
        <circle cx="58.5" cy="44.5" r="1" fill="#fff" />
        <path d="M38 36L44 50M36 50L41 54" stroke="#8a4a3a" strokeWidth="0.8" />
      </g>
    ),
  },
  {
    id: "valkyrie",
    name: "Drop Trooper",
    blurb: "First boots on the ground; helmet up, braid down.",
    skin: ["#f2d0b8", "#d8a588", "#9a6a52"],
    iris: "#4c8dff",
    brow: "#8a5a2a",
    bg: ["#16284a", "#03060e"],
    rim: "#4c8dff",
    scene: () => <Hud color="#4c8dff" />,
    back: (ids) => <Shaded ids={ids} fill="#b0763a" d="M62 46C70 60 72 76 68 92L62 92C66 78 64 62 58 50Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#2a3442" d="M2 100C4 84 18 74 36 70L50 74L64 70C82 74 96 84 98 100Z" />
        <path d="M34 72H66L64 100H36Z" fill={`url(#${ids.metal})`} />
        <path d="M6 82C14 72 28 70 36 72L34 88C24 86 14 88 4 94Z" fill={`url(#${ids.metal})`} />
        <path d="M94 82C86 72 72 70 64 72L66 88C76 86 86 88 96 94Z" fill={`url(#${ids.metal})`} />
        <text x="12" y="84" fontSize="6" fontFamily="monospace" fontWeight="700" fill="#1a2230">07</text>
        <path d="M40 82H60" stroke="#4c8dff" strokeWidth="1.4" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M36 34C40 30 60 30 64 34L62 30C56 26 44 26 38 30Z" fill="#b0763a" />
        <path d="M27 44C26 24 37 13 50 13C63 13 74 24 73 44L67 44C67 30 60 22 50 22C40 22 33 30 33 44Z" fill={`url(#${ids.metal})`} />
        <path d="M30 18C38 6 62 6 70 18L67 22C60 14 40 14 33 22Z" fill="#4c8dff" opacity="0.55" />
        <path d="M26 44H34L36 62L30 62ZM74 44H66L64 62L70 62Z" fill={`url(#${ids.metal})`} />
        <rect x="70" y="30" width="6" height="4" rx="1" fill="#4c8dff" />
      </g>
    ),
  },
  {
    id: "paladin",
    name: "Sentinel",
    blurb: "A sealed white helm and a light-shield emitter.",
    skin: ["#a46c48", "#7a4a2c", "#462816"],
    iris: "#ffcf5a",
    brow: "#1a100a",
    bg: ["#3a3220", "#0a0804"],
    rim: "#ffcf5a",
    scene: () => (
      <g>
        <Hud color="#ffcf5a" />
        <path d="M62 66H98V82C98 92 88 100 80 102C72 100 62 92 62 82Z" fill="#ffcf5a" opacity="0.22" stroke="#ffcf5a" strokeWidth="0.8" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#ecebe6" d="M0 100C2 82 16 72 34 70L50 72L66 70C84 72 98 82 100 100Z" />
        <path d="M38 76H62L60 92H40Z" fill={`url(#${ids.gold})`} />
        <circle cx="50" cy="84" r="3.4" fill="#fff6d0" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#ecebe6" d="M50 14C35 14 28 26 28 42C28 56 34 66 50 68C66 66 72 56 72 42C72 26 65 14 50 14Z" />
        <path d="M33 40H67L64 48H36Z" fill="#14100a" />
        <path d="M35 43H65" stroke="#ffcf5a" strokeWidth="1.6" />
        <path d="M35 43H65" stroke="#fff" strokeWidth="0.5" />
        <path d="M50 14V36" stroke={`url(#${ids.gold})`} strokeWidth="2.4" />
        <path d="M40 56H60M42 60H58" stroke="#b9b6ac" strokeWidth="0.8" />
      </g>
    ),
  },
  {
    id: "titan",
    name: "Colossus",
    blurb: "Half chrome, half human, a reactor where the heart was.",
    skin: ["#e6c0a2", "#c08a68", "#7a4e38"],
    iris: "#29e7e0",
    brow: "#2a1c14",
    eyes: "glow",
    bg: ["#0e3a3e", "#020808"],
    rim: "#29e7e0",
    jaw: "square",
    scene: () => <Hud color="#29e7e0" />,
    body: (ids) => (
      <g>
        <path d="M-4 100C-2 74 20 64 40 64H60C80 64 102 74 104 100Z" fill={`url(#${ids.metal})`} />
        <path d="M20 80H40M60 80H80M24 90H44M56 90H76" stroke="#2a3038" strokeWidth="0.8" />
        <circle cx="50" cy="84" r="8" fill="#0a1a1c" />
        <circle cx="50" cy="84" r="8" fill={`url(#${ids.glow})`} />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M50 20C62 20 69 29 69 41C69 52 67 58 62 62L56 65.5C54 66 52 66.3 50 66.3Z" fill={`url(#${ids.metal})`} />
        <path d="M50 20V66M50 34H60M50 52H64M58 26V34" stroke="#2a3038" strokeWidth="0.6" fill="none" />
        <circle cx="62" cy="34" r="0.8" fill="#29e7e0" />
        <path d="M32 34C32 24 40 19 50 19V28C42 28 36 30 32 34Z" fill="#2a1c14" />
      </g>
    ),
  },
];
