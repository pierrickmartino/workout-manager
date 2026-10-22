// PROTOTYPE — throwaway. Universe B, "Orbit": the same eight catalog slots recast as the
// crew of a deep-space station, painted under cold hangar light. Same ids and unlock levels
// as the catalog. Not for main.

import { Braid, Hair, Locks, Metal, Shaded, Soft, type Ids, type Portrait } from "./prototype-portrait-rig";

const HANGAR: Portrait["bg"] = ["#21425c", "#03070c"];

// Out-of-focus station lights and a faint HUD arc behind every crew portrait.
function Station({ color, ids }: { color: string; ids: Ids }): React.JSX.Element {
  return (
    <g>
      <Soft ids={ids} amount={2}>
        <path d="M0 18H100M0 30H100" stroke={color} strokeWidth="1.4" opacity="0.18" />
        <rect x="6" y="40" width="10" height="3" fill={color} opacity="0.35" />
        <rect x="84" y="56" width="12" height="3" fill={color} opacity="0.3" />
      </Soft>
      <path d="M12 50A38 38 0 0 1 50 12" stroke={color} strokeWidth="0.6" strokeDasharray="3 2" fill="none" opacity="0.45" />
    </g>
  );
}

// A light that glows: a blurred bloom under a crisp core.
function Glow({ d, color, ids, width }: { d: string; color: string; ids: Ids; width?: number }): React.JSX.Element {
  const stroke = width !== undefined;
  return (
    <g>
      <Soft ids={ids} amount={2}>
        <path d={d} fill={stroke ? "none" : color} stroke={stroke ? color : undefined} strokeWidth={stroke ? width * 3 : undefined} opacity="0.7" />
      </Soft>
      <path d={d} fill={stroke ? "none" : color} stroke={stroke ? "#f2fffe" : undefined} strokeWidth={stroke ? width * 0.6 : undefined} opacity="0.95" />
    </g>
  );
}

export const ORBIT: readonly Portrait[] = [
  {
    id: "novice",
    name: "Cadet",
    blurb: "Fresh off the academy shuttle, headset on.",
    skin: ["#eec8aa", "#c9926e", "#865640"],
    iris: "#6a4a2a",
    brow: "#2a1c14",
    bg: HANGAR,
    rim: "#5ad8ff",
    scene: (ids) => <Station color="#5ad8ff" ids={ids} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#34445a" d="M0 100C2 84 16 74 34 70L50 74L66 70C84 74 98 84 100 100Z" />
        <Shaded ids={ids} fill="#1c2430" d="M38 68C42 72 46 74 50 75C54 74 58 72 62 68L64 74L50 82L36 74Z" />
        <Metal ids={ids} d="M49.2 82H50.8V100H49.2Z" />
        <Shaded ids={ids} fill="#2a3648" d="M18 82H34V92H18Z" />
        <Glow ids={ids} color="#5ad8ff" d="M20 85H32V86.4H20Z" />
        <Shaded ids={ids} fill="#c8862a" d="M66 84H82V87H66Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#2a1c14" d="M31.5 38C30.5 26 38 18.5 50 18.5C62 18.5 69.5 26 68.5 38C66 32 61 29 56 29.5C53 28 47 28 44 29.5C39 29 34 32 31.5 38Z" />
        <Metal ids={ids} d="M27 40C27 23 37 14.5 50 14.5C63 14.5 73 23 73 40L70.5 40C70.5 25 61.5 17.5 50 17.5C38.5 17.5 29.5 25 29.5 40Z" />
        <Shaded ids={ids} fill="#1c2430" d="M24 37C24 35 25.5 34 27.5 34H30.5V52H27.5C25.5 52 24 51 24 49Z" />
        <Metal ids={ids} d="M27.5 50C28 57 33 61 41 61.2L41 62.6C32 62.4 26.4 57.6 26 50Z" />
        <Glow ids={ids} color="#5ad8ff" d="M41.6 61.8a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0Z" />
      </g>
    ),
  },
  {
    id: "dwarf-lifter",
    name: "Rig Hauler",
    blurb: "Hydraulic exo-frame, welding goggles, a beard full of grease.",
    skin: ["#dfab88", "#b07650", "#6a402c"],
    iris: "#5a3a1a",
    brow: "#3a2414",
    bg: ["#3e2c1c", "#080503"],
    rim: "#ffb454",
    jaw: "square",
    scene: (ids) => <Station color="#ffb454" ids={ids} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#d8821c" d="M0 100C2 82 16 72 34 70L50 74L66 70C84 72 98 82 100 100Z" />
        <Shaded ids={ids} fill="#d9dde2" d="M8 90L92 90L92 93L8 93Z" />
        <Metal ids={ids} d="M2 70C2 66 4 64 8 64H18C22 64 24 66 24 70V80C24 84 22 86 18 86H8C4 86 2 84 2 80Z" />
        <Metal ids={ids} d="M76 70C76 66 78 64 82 64H92C96 64 98 66 98 70V80C98 84 96 86 92 86H82C78 86 76 84 76 80Z" />
        <Metal ids={ids} d="M10.5 52H15.5V65H10.5ZM84.5 52H89.5V65H84.5Z" />
        <Shaded ids={ids} fill="#2a2a2e" d="M22 78L36 72L37 76L24 82ZM78 78L64 72L63 76L76 82Z" />
        <Glow ids={ids} color="#ffb454" d="M8 74H18V75.4H8ZM82 74H92V75.4H82Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#3a2414" d="M32 48C31 62 38 74 50 77C62 74 69 62 68 48C64 55 58 56.5 55 55C53 56.4 47 56.4 45 55C42 56.5 36 55 32 48Z" />
        <Locks ids={ids} fill="#44301e" width={1.5} strokes={["M38 58C40 66 43 71 46 74", "M62 58C60 66 57 71 54 74", "M50 60V75"]} />
        <Hair ids={ids} fill="#4a3020" d="M41 56.5C44 54.2 48 54.6 50 55.8C52 54.6 56 54.2 59 56.5C56.5 57.6 53 57.4 50 58C47 57.4 43.5 57.6 41 56.5Z" />
        <Soft ids={ids} amount={1}>
          <ellipse cx="38" cy="52" rx="2.4" ry="1.2" fill="#1a1410" opacity="0.4" />
        </Soft>
        <Hair ids={ids} fill="#3a2414" d="M31 36C31 25 39 18.5 50 18.5C61 18.5 69 25 69 36C64 31 58 29 50 29C42 29 36 31 31 36Z" />
        {/* Welding goggles pushed up on the brow */}
        <Shaded ids={ids} fill="#1e1e22" d="M30 26.5C40 24.5 60 24.5 70 26.5V32C60 30 40 30 30 32Z" />
        <Metal ids={ids} d="M34.5 29.2a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z" />
        <Metal ids={ids} d="M53.5 29.2a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z" />
        <path d="M36.4 29.2a4.1 4.1 0 1 0 8.2 0a4.1 4.1 0 1 0 -8.2 0ZM55.4 29.2a4.1 4.1 0 1 0 8.2 0a4.1 4.1 0 1 0 -8.2 0Z" fill="#163a2a" />
        <path d="M37.6 27.6a2.2 1.2 -30 1 0 3 -0.6ZM56.6 27.6a2.2 1.2 -30 1 0 3 -0.6Z" fill="#fff" opacity="0.55" />
      </g>
    ),
  },
  {
    id: "elf-ranger",
    name: "Pathfinder",
    blurb: "A scout with a HUD visor and an undercut.",
    skin: ["#f4dac4", "#d6ab8c", "#946a52"],
    iris: "#3ad89a",
    brow: "#1a2a24",
    bg: ["#183e30", "#020806"],
    rim: "#3ad89a",
    scene: (ids) => (
      <g>
        <Station color="#3ad89a" ids={ids} />
        <Metal ids={ids} d="M75 6H77V40H75Z" />
        <Glow ids={ids} color="#3ad89a" d="M74 5.5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#3a4838" d="M0 100C2 82 16 72 34 68L50 76L66 68C84 72 98 82 100 100Z" />
        <Shaded ids={ids} fill="#2a3628" d="M8 90L22 78L36 84L30 98ZM70 80L84 86L80 100L66 92Z" />
        <Shaded ids={ids} fill="#1e2620" d="M29 69L33 69L46 100H42ZM71 69L67 69L54 100H58Z" />
        <Shaded ids={ids} fill="#2a3a34" d="M66 76H80V84H66Z" />
        <Glow ids={ids} color="#3ad89a" d="M68 78.4H78V79.8H68Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        {/* Undercut: shaved sides, a long top swept across */}
        <path d="M31.4 44C31 32 34 26 38 24L38 40ZM68.6 44C69 32 66 26 62 24L62 40Z" fill="#1a2a24" opacity="0.35" filter={`url(#${ids.grain})`} />
        <Hair ids={ids} fill="#1c2c26" d="M34 34C33 22 41 15 52 15.5C63 16 70 23 69 32C66 29 60 27.5 54 28.5C48 29 41 31 36 37Z" />
        <Locks ids={ids} fill="#22342c" width={1.8} strokes={["M44 20C40 24 37 30 36 36", "M54 18C50 22 46 26 42 30"]} />
        {/* Visor: a tinted band with a HUD readout */}
        <Metal ids={ids} d="M31 40.5H69V42H31Z" />
        <path d="M32 41.5H68Q69 47.5 64 49.5H36Q31 47.5 32 41.5Z" fill="#3ad89a" opacity="0.42" />
        <Soft ids={ids} amount={1}>
          <path d="M32 41.5H68Q69 47.5 64 49.5H36Q31 47.5 32 41.5Z" fill="#3ad89a" opacity="0.25" />
        </Soft>
        <path d="M35 44.6H42M57 44.6H63M58 46.4H61" stroke="#c8ffe8" strokeWidth="0.35" />
        <path d="M34 42.4Q50 41.6 66 42.4" stroke="#fff" strokeWidth="0.5" opacity="0.6" fill="none" />
        <Metal ids={ids} d="M66.5 39.5H72V48H66.5Z" />
      </g>
    ),
  },
  {
    id: "monk",
    name: "Zero-G Adept",
    blurb: "Floats in stillness; circuitry glows along the skull.",
    skin: ["#bf8a64", "#8e5c3c", "#4e2e1c"],
    iris: "#b08bff",
    brow: "#1a100a",
    eyes: "closed",
    bg: ["#2e1c50", "#05030c"],
    rim: "#b08bff",
    scene: (ids) => <Station color="#b08bff" ids={ids} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#e2dee8" d="M0 100C2 84 16 74 34 70L50 74L66 70C84 74 98 84 100 100Z" />
        <Shaded ids={ids} fill="#cdc6d6" d="M34 56C36 64 39 71 42 76H58C61 71 64 64 66 56L68 77L32 77Z" />
        <Soft ids={ids} amount={1}>
          <path d="M20 84C24 90 26 96 26 100M80 84C76 90 74 96 74 100" stroke="#8a80a0" strokeWidth="1.4" opacity="0.5" fill="none" />
        </Soft>
        <Glow ids={ids} color="#b08bff" width={0.8} d="M50 77V100M38 87H62" />
        <Glow ids={ids} color="#b08bff" d="M47.6 87a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Soft ids={ids} amount={2}>
          <ellipse cx="44" cy="25" rx="7" ry="3" fill="#fff" opacity="0.35" />
        </Soft>
        <Glow ids={ids} color="#c9b0ff" width={0.5} d="M50 21V30H44V34M50 30H57L60 33" />
        <Glow ids={ids} color="#c9b0ff" d="M43.1 35a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0ZM59.1 33.4a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0Z" />
      </g>
    ),
  },
  {
    id: "barbarian",
    name: "Void Raider",
    blurb: "Mohawk, cyber-eye, a spiked pauldron off a dead ship.",
    skin: ["#e4b292", "#b47a56", "#6a402c"],
    iris: "#ff3a5a",
    brow: "#1a0a0e",
    bg: ["#4e1028", "#0c0205"],
    rim: "#ff67ac",
    jaw: "square",
    stubble: true,
    scene: (ids) => <Station color="#ff67ac" ids={ids} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#262026" d="M0 100C2 84 16 76 32 72L42 78H58L68 72C84 76 98 84 100 100Z" />
        <Shaded ids={ids} fill="#1a161a" d="M36 76L44 100H38L30 80ZM64 76L56 100H62L70 80Z" />
        <Metal ids={ids} d="M60 70C76 62 94 70 98 88L64 86Z" />
        <Metal ids={ids} d="M70 69L74 54L78 69ZM80 70L89 59L88 74ZM89 76L99 70L95 82Z" />
        <Glow ids={ids} color="#ff67ac" width={0.6} d="M24 84L34 100M16 90L22 100" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M31.4 42C31 30 35 24 42 22L42 38ZM68.6 42C69 30 65 24 58 22L58 38Z" fill="#1a1012" opacity="0.4" filter={`url(#${ids.grain})`} />
        <Hair ids={ids} fill="#e0306e" d="M43 32C42 22 45 10 50 3C55 10 58 22 57 32C54 29 46 29 43 32Z" />
        <Locks ids={ids} fill="#ff4a86" width={1.2} strokes={["M47 28C47 18 48 10 50 5", "M53 28C53 18 52 10 50 5"]} />
        {/* Cyber-eye plate over the right eye */}
        <Metal ids={ids} d="M52.6 38.6H65C66 43 65 48.6 60 50.6H53.6Z" />
        <circle cx="58.6" cy="44.4" r="2.6" fill="#1a0006" />
        <Glow ids={ids} color="#ff3a5a" d="M56.6 44.4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z" />
        <path d="M54 40.6H57M63 40.6H64" stroke="#2a2f36" strokeWidth="0.4" />
        <path d="M37.4 35.6L43.6 50.4" stroke="#8a3e30" strokeWidth="0.9" strokeLinecap="round" />
        <path d="M37.4 35.6L43.6 50.4" stroke="#f2b8a4" strokeWidth="0.3" strokeLinecap="round" transform="translate(-0.4 0)" />
      </g>
    ),
  },
  {
    id: "valkyrie",
    name: "Drop Trooper",
    blurb: "First boots on the ground; helmet up, braid down.",
    skin: ["#f4d4bc", "#d8a588", "#94664e"],
    iris: "#4c8dff",
    brow: "#7a4e24",
    bg: ["#182c50", "#02050c"],
    rim: "#4c8dff",
    lips: "#b0685e",
    scene: (ids) => <Station color="#4c8dff" ids={ids} />,
    back: (ids) => <Braid ids={ids} fill="#a86e34" x={66} y0={50} y1={94} w={5} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#262f3c" d="M0 100C2 84 16 74 34 70L50 74L66 70C84 74 98 84 100 100Z" />
        <Metal ids={ids} d="M34 72C40 70 60 70 66 72L64 100H36Z" />
        <Metal ids={ids} d="M4 82C12 72 26 69 35 71L33 88C24 86 14 88 2 94Z" />
        <Metal ids={ids} d="M96 82C88 72 74 69 65 71L67 88C76 86 86 88 98 94Z" />
        <text x="12" y="84.5" fontSize="6" fontFamily="monospace" fontWeight="700" fill="#1a2230">07</text>
        <Glow ids={ids} color="#4c8dff" d="M40 82H60V83.4H40Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#a86e34" d="M34 37C36 31 43 28 50 28.5C57 28 64 31 66 37C61 33.6 56 33 52 34.2C49 32.8 42 33.4 34 37Z" />
        <Metal ids={ids} d="M26.5 44C25.5 24 36.5 12.5 50 12.5C63.5 12.5 74.5 24 73.5 44L67.5 44C67.5 30 60 22 50 22C40 22 32.5 30 32.5 44Z" />
        <path d="M30.5 18C38 6 62 6 69.5 18L67 22C60 14 40 14 33 22Z" fill="#4c8dff" opacity="0.5" />
        <Soft ids={ids} amount={1}>
          <path d="M30.5 18C38 6 62 6 69.5 18" stroke="#4c8dff" strokeWidth="1.6" fill="none" opacity="0.5" />
        </Soft>
        <Metal ids={ids} d="M26 44H33L35.5 63L30 63ZM74 44H67L64.5 63L70 63Z" />
        <Glow ids={ids} color="#4c8dff" d="M70 30H76V33.6H70Z" />
      </g>
    ),
  },
  {
    id: "paladin",
    name: "Sentinel",
    blurb: "A sealed white helm and a light-shield emitter.",
    skin: ["#a87050", "#7a4a2c", "#422614"],
    iris: "#ffcf5a",
    brow: "#1a100a",
    bg: ["#403620", "#080603"],
    rim: "#ffcf5a",
    scene: (ids) => (
      <g>
        <Station color="#ffcf5a" ids={ids} />
        <Soft ids={ids} amount={2}>
          <path d="M60 64H100V82C100 94 88 102 80 104C72 102 60 94 60 82Z" fill="#ffcf5a" opacity="0.3" />
        </Soft>
        <path d="M62 66H98V82C98 92 88 100 80 102C72 100 62 92 62 82Z" fill="#ffcf5a" opacity="0.12" stroke="#fff2c0" strokeWidth="0.5" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Metal ids={ids} d="M0 100C2 82 16 72 34 70L50 72L66 70C84 72 98 82 100 100Z" />
        <Metal ids={ids} tone="gold" d="M38 76H62L60 92H40Z" />
        <Glow ids={ids} color="#fff2b0" d="M46.4 84a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#eceae4" d="M50 13C34.5 13 27.5 25.5 27.5 42C27.5 56 34 66.5 50 68.5C66 66.5 72.5 56 72.5 42C72.5 25.5 65.5 13 50 13Z" />
        <path d="M33 40H67L64 48.4H36Z" fill="#100c08" />
        <Glow ids={ids} color="#ffcf5a" d="M35 43.4H65V44.8H35Z" />
        <Metal ids={ids} tone="gold" d="M48.8 13.2H51.2V36H48.8Z" />
        <path d="M40 56H60M42 59.6H58M44 63H56" stroke="#a9a69c" strokeWidth="0.7" />
      </g>
    ),
  },
  {
    id: "titan",
    name: "Colossus",
    blurb: "Half chrome, half human, a reactor where the heart was.",
    skin: ["#e8c4a6", "#c08a68", "#744a34"],
    iris: "#29e7e0",
    brow: "#2a1c14",
    eyes: "glow",
    bg: ["#0e3c40", "#010606"],
    rim: "#29e7e0",
    jaw: "square",
    scene: (ids) => <Station color="#29e7e0" ids={ids} />,
    body: (ids) => (
      <g>
        <Metal ids={ids} d="M-4 100C-2 74 20 64 40 64H60C80 64 102 74 104 100Z" />
        <path d="M18 80H38M62 80H82M22 90H42M58 90H78" stroke="#2a3038" strokeWidth="0.7" />
        <circle cx="50" cy="84" r="8.4" fill="#061416" />
        <Soft ids={ids} amount={4}>
          <circle cx="50" cy="84" r="9" fill="#29e7e0" opacity="0.8" />
        </Soft>
        <Glow ids={ids} color="#bffcfa" d="M45 84a5 5 0 1 0 10 0a5 5 0 1 0 -10 0Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Metal ids={ids} d="M50 19.5C61 19.5 68.5 27 68.8 39C69 46 68.4 52 66.6 56.5C65 60 62 63 58 65.4C55 67 52.5 67.4 50 67.4Z" />
        <path d="M50 19.5V67M50 34H60M50 52H64M58 26V34" stroke="#2a3038" strokeWidth="0.5" fill="none" />
        <Glow ids={ids} color="#29e7e0" d="M61.2 34a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0Z" />
        <Hair ids={ids} fill="#2a1c14" d="M32 35C32 25 40 19 50 19V28C42 28 36 30 32 35Z" />
      </g>
    ),
  },
];
