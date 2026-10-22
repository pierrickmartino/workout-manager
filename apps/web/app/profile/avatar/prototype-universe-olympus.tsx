// PROTOTYPE — throwaway. Universe C, "Olympus": the same eight catalog slots recast as
// figures of the ancient games and myth, sun-lit marble and bronze. Same ids and unlock
// levels as the catalog. Not for main.

import { Shaded, type Portrait } from "./prototype-portrait-rig";

const SKY: Portrait["bg"] = ["#f0d9a8", "#6a4a2a"];

// Sun rays and a fluted column behind every figure.
function Temple(): React.JSX.Element {
  return (
    <g>
      <g stroke="#fff6dc" strokeWidth="5" opacity="0.18">
        <path d="M30 20L-10 -20M30 20L30 -30M30 20L80 -20M30 20L110 10" />
      </g>
      <rect x="84" y="0" width="12" height="100" fill="#e8dcc4" opacity="0.5" />
      <path d="M87 0V100M90 0V100M93 0V100" stroke="#b9a988" strokeWidth="0.5" opacity="0.6" />
    </g>
  );
}

function Laurel({ ids }: { ids: { gold: string } }): React.JSX.Element {
  const leaves = [0, 1, 2, 3, 4];
  return (
    <g fill={`url(#${ids.gold})`}>
      {leaves.map((i) => (
        <g key={i}>
          <ellipse cx={34 + i * 2.6} cy={33 - i * 2.6} rx="3" ry="1.3" transform={`rotate(${-40 - i * 8} ${34 + i * 2.6} ${33 - i * 2.6})`} />
          <ellipse cx={66 - i * 2.6} cy={33 - i * 2.6} rx="3" ry="1.3" transform={`rotate(${40 + i * 8} ${66 - i * 2.6} ${33 - i * 2.6})`} />
        </g>
      ))}
    </g>
  );
}

function Curls({ color, y = 22 }: { color: string; y?: number }): React.JSX.Element {
  return (
    <g fill={color}>
      <path d={`M31 42C29 ${y + 6} 38 ${y - 3} 50 ${y - 3}C62 ${y - 3} 71 ${y + 6} 69 42C66 34 60 30 50 30C40 30 34 34 31 42Z`} />
      {[34, 40, 46, 52, 58, 64].map((x) => (
        <circle key={x} cx={x} cy={y + 6 + Math.abs(49 - x) / 3} r="3.4" />
      ))}
    </g>
  );
}

export const OLYMPUS: readonly Portrait[] = [
  {
    id: "novice",
    name: "Initiate",
    blurb: "A youth in a plain chiton, first day at the palaestra.",
    skin: ["#f0caa8", "#d29e78", "#956a4e"],
    iris: "#5a3a1e",
    brow: "#3a2414",
    bg: SKY,
    rim: "#fff2c0",
    scene: () => <Temple />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#efe8da" d="M24 100C26 86 32 78 40 74L50 80L60 74C76 78 92 86 96 100Z" />
        <path d="M40 74C48 84 54 92 58 100M56 76C60 84 64 92 66 100" stroke="#c9bfae" strokeWidth="0.8" fill="none" />
        <circle cx="62" cy="76" r="2" fill={`url(#${ids.bronze})`} />
      </g>
    ),
    front: () => <Curls color="#3a2414" />,
  },
  {
    id: "dwarf-lifter",
    name: "Forgehand",
    blurb: "Smith of the gods: leather apron, soot and a hammer.",
    skin: ["#d8a07a", "#ad714c", "#6a4028"],
    iris: "#3a2410",
    brow: "#1a120c",
    bg: ["#c06a2a", "#2a0e04"],
    rim: "#ffb46a",
    jaw: "square",
    scene: (ids) => (
      <g>
        <rect x="78" y="30" width="4" height="70" fill="#5a3a1c" />
        <rect x="70" y="22" width="20" height="11" rx="2" fill={`url(#${ids.metal})`} />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6a4426" d="M28 78H72L76 100H24Z" />
        <path d="M34 78L28 68M66 78L72 68" stroke="#4a2c16" strokeWidth="2.4" />
        <ellipse cx="22" cy="86" rx="10" ry="6" fill="#2a1a10" opacity="0.25" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#2a1c12" d="M32 48C31 66 40 80 50 82C60 80 69 66 68 48C63 55 57 57 55 55C53 57 47 57 45 55C43 57 37 55 32 48Z" />
        <path d="M43 56Q50 53 57 56Q50 59 43 56Z" fill="#3a2a1a" />
        <path d="M44 60C45 68 47 74 50 80M56 60C55 68 53 74 50 80" stroke="#140c08" strokeWidth="0.6" fill="none" />
        <Curls color="#2a1c12" y={20} />
        <ellipse cx="40" cy="38" rx="4" ry="1.4" fill="#000" opacity="0.2" />
      </g>
    ),
  },
  {
    id: "elf-ranger",
    name: "Huntress",
    blurb: "Crescent diadem, a quiver of arrows and a hound’s patience.",
    skin: ["#f4d8c0", "#dcae8e", "#a07458"],
    iris: "#4a6a3a",
    brow: "#5a3a1c",
    bg: ["#c8d8b0", "#2a3a1a"],
    rim: "#f6ffd8",
    scene: (ids) => (
      <g>
        <Temple />
        <path d="M18 100L30 60" stroke="#5a3a1c" strokeWidth="5" />
        <path d="M27 56L30 50L33 58ZM31 58L35 52L36 60Z" fill="#efe8da" />
        <path d="M14 98L24 62" stroke={`url(#${ids.bronze})`} strokeWidth="1" />
      </g>
    ),
    back: (ids) => <Shaded ids={ids} fill="#6a4020" d="M36 18C42 6 58 6 64 18C60 14 40 14 36 18Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#efe8da" d="M30 100C32 86 36 78 44 74L50 80L58 74C74 78 88 86 92 100Z" />
        <path d="M30 70L66 100" stroke="#5a3a1c" strokeWidth="2.6" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6a4020" d="M31 44C28 28 37 16 50 16C63 16 72 28 69 44C66 34 60 28 50 28C40 28 34 34 31 44Z" />
        <path d="M68 40C72 48 72 56 70 62" stroke="#6a4020" strokeWidth="2" fill="none" />
        <path d="M42 22Q50 26 58 22Q56 16 50 13Q44 16 42 22Z" fill={`url(#${ids.gold})`} />
        <path d="M44 17Q50 22 56 17Q53 12 50 10Q47 12 44 17Z" fill="#fff6dc" opacity="0.7" />
      </g>
    ),
  },
  {
    id: "monk",
    name: "Sage",
    blurb: "A philosopher-wrestler: white beard, himation, an unhurried gaze.",
    skin: ["#e6b896", "#c08a68", "#7e5038"],
    iris: "#4a5a6a",
    brow: "#e8e4dc",
    bg: ["#e6dcc8", "#5a4a3a"],
    rim: "#fffaf0",
    scene: () => <Temple />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6a5a8a" d="M2 100C4 84 18 74 36 70L50 76L64 70C82 74 96 84 98 100Z" />
        <Shaded ids={ids} fill="#efe8da" d="M30 72C44 80 58 90 66 100H40C36 90 32 82 22 78Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#e8e4dc" d="M32 48C32 66 40 80 50 84C60 80 68 66 68 48C63 55 57 57 55 55C53 57 47 57 45 55C43 57 37 55 32 48Z" />
        <path d="M42 57Q50 53 58 57Q50 60 42 57Z" fill="#d8d2c6" />
        <path d="M31 40C30 30 34 26 38 25M69 40C70 30 66 26 62 25" stroke="#e8e4dc" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M38 32H46M54 32H62" stroke="#7e5038" strokeWidth="0.5" opacity="0.6" />
        <ellipse cx="45" cy="25" rx="8" ry="2.6" fill="#fff" opacity="0.2" />
      </g>
    ),
  },
  {
    id: "barbarian",
    name: "Lion-Bearer",
    blurb: "Wears the pelt of the lion he wrestled, club on the shoulder.",
    skin: ["#dca47c", "#b07450", "#6c4028"],
    iris: "#4a3018",
    brow: "#1a100a",
    bg: ["#d8a85a", "#3a2008"],
    rim: "#ffe0a0",
    jaw: "square",
    scene: () => (
      <g>
        <Temple />
        <path d="M78 100L90 34C92 28 98 30 96 38L86 100Z" fill="#6a4426" />
        <circle cx="92" cy="44" r="1.4" fill="#3a2414" />
        <circle cx="89" cy="60" r="1.4" fill="#3a2414" />
      </g>
    ),
    back: (ids) => <Shaded ids={ids} fill="#c08a3a" d="M20 76C14 50 22 18 50 12C78 18 86 50 80 76L66 70L34 70Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#c08a3a" d="M2 100C2 86 12 76 26 72L40 80H60L74 72C88 76 98 86 98 100Z" />
        <path d="M40 80L36 96L44 90ZM60 80L64 96L56 90Z" fill="#efe8da" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M38 60Q50 68 62 60L60 66Q50 72 40 66Z" fill="#1a100a" />
        <Curls color="#1a100a" y={24} />
        <Shaded ids={ids} fill="#c08a3a" d="M28 38C26 20 36 8 50 8C64 8 74 20 72 38L66 34C62 26 56 24 50 24C44 24 38 26 34 34Z" />
        <path d="M36 22L42 26M64 22L58 26" stroke="#6a4020" strokeWidth="1.2" />
        <circle cx="40" cy="18" r="1.4" fill="#2a1a08" />
        <circle cx="60" cy="18" r="1.4" fill="#2a1a08" />
        <path d="M46 30L50 34L54 30" fill="#efe8da" />
        <path d="M30 14L34 20M70 14L66 20" stroke="#8a5a20" strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
  },
  {
    id: "valkyrie",
    name: "Amazon",
    blurb: "Bronze cuirass, a crescent shield, braid wound tight.",
    skin: ["#c99470", "#a06c4a", "#64402a"],
    iris: "#3a2410",
    brow: "#1a100a",
    bg: ["#d8b88a", "#4a2a14"],
    rim: "#ffe6b0",
    scene: (ids) => (
      <g>
        <Temple />
        <path d="M2 64C10 58 24 58 32 64L28 100H4Z" fill={`url(#${ids.bronze})`} />
        <path d="M6 64C12 72 22 72 28 64" fill="#5f3519" />
      </g>
    ),
    back: (ids) => <Shaded ids={ids} fill="#1a100a" d="M64 40C72 54 72 72 66 90L60 88C64 74 64 58 58 46Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#8a2a2a" d="M2 100C4 84 18 74 36 70L50 74L64 70C82 74 96 84 98 100Z" />
        <path d="M32 72C40 70 60 70 68 72L66 100H34Z" fill={`url(#${ids.bronze})`} />
        <path d="M40 80Q44 86 48 80M52 80Q56 86 60 80" stroke="#5f3519" strokeWidth="0.8" fill="none" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M31 42C28 26 38 17 50 17C62 17 72 26 69 42C66 32 60 28 50 28C40 28 34 32 31 42Z" fill="#1a100a" />
        <path d="M34 26Q50 18 66 26" stroke={`url(#${ids.gold})`} strokeWidth="2" fill="none" />
        <circle cx="50" cy="21.5" r="1.8" fill="#8a2a2a" />
      </g>
    ),
  },
  {
    id: "paladin",
    name: "Hoplite",
    blurb: "Corinthian helm, horsehair crest and the round aspis.",
    skin: ["#e0ae88", "#b87e58", "#744a30"],
    iris: "#3a2a1a",
    brow: "#1a100a",
    bg: ["#d0b07a", "#3a240c"],
    rim: "#ffe6b0",
    jaw: "square",
    scene: (ids) => (
      <g>
        <Temple />
        <circle cx="86" cy="86" r="26" fill={`url(#${ids.bronze})`} />
        <circle cx="86" cy="86" r="20" fill="#8a2a2a" />
        <path d="M78 98L86 74L94 98" stroke="#efe8da" strokeWidth="3" fill="none" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#8a2a2a" d="M2 100C4 84 18 74 36 70L50 74L64 70C70 72 74 74 76 76L70 100Z" />
        <path d="M32 72C40 70 60 70 66 72L64 100H34Z" fill={`url(#${ids.bronze})`} />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M30 10C40 -2 60 -2 70 10C66 4 56 6 50 2C44 6 34 4 30 10ZM28 10C38 18 62 18 72 10L70 16C60 22 40 22 30 16Z" fill="#a8241e" />
        <path
          fillRule="evenodd"
          d="M28 12C34 4 66 4 72 12C76 30 74 52 68 68L32 68C26 52 24 30 28 12ZM34 40Q42 37 48 40L50 42L52 40Q58 37 66 40V48H55V68H45V48H34Z"
          fill={`url(#${ids.bronze})`}
        />
        <path d="M48 40H52V55H48Z" fill={`url(#${ids.bronze})`} />
        <path d="M34 40Q42 37 48 40M52 40Q58 37 66 40" stroke="#5f3519" strokeWidth="0.8" fill="none" />
        <path d="M30 22Q50 16 70 22" stroke="#fff2c8" strokeWidth="0.6" opacity="0.6" fill="none" />
      </g>
    ),
  },
  {
    id: "titan",
    name: "Atlas",
    blurb: "The titan who holds up the heavens on his shoulders.",
    skin: ["#d8a07c", "#ad7350", "#683e26"],
    iris: "#3a2a1a",
    brow: "#e0dcd2",
    bg: ["#2a3a6a", "#04060e"],
    rim: "#ffe6b0",
    jaw: "square",
    scene: (ids) => (
      <g>
        <circle cx="50" cy="-6" r="40" fill="#1a2a5a" />
        <circle cx="50" cy="-6" r="40" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="1.6" />
        <path d="M10 -6H90M50 -46V34" stroke={`url(#${ids.gold})`} strokeWidth="1" />
        <ellipse cx="50" cy="-6" rx="40" ry="14" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="1" transform="rotate(-20 50 -6)" />
        {[[30, 10], [62, 20], [74, 4], [40, 24], [56, 8]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="#fff6dc" />
        ))}
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#ad7350" d="M-4 100C-2 76 18 64 38 64H62C82 64 102 76 104 100Z" />
        <path d="M20 82C28 78 40 80 48 86M80 82C72 78 60 80 52 86" stroke="#683e26" strokeWidth="1.2" fill="none" opacity="0.7" />
        <Shaded ids={ids} fill="#efe8da" d="M20 100C40 86 62 82 84 70L96 76L90 100Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#e0dcd2" d="M31 48C31 68 40 82 50 86C60 82 69 68 69 48C64 55 57 57 55 55C53 57 47 57 45 55C43 57 36 55 31 48Z" />
        <path d="M42 57Q50 53 58 57Q50 60 42 57Z" fill="#d0ccc2" />
        <Curls color="#e0dcd2" y={24} />
        <path d="M38 36L46 38M62 36L54 38" stroke="#683e26" strokeWidth="0.6" opacity="0.6" />
      </g>
    ),
  },
];
