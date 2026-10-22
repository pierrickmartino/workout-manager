// PROTOTYPE — throwaway. Universe A, "The Realm": today's fantasy roster redrawn as lit,
// shaded portraits. Same eight catalog ids, in catalog order. Not for main.

import { Shaded, type Portrait } from "./prototype-portrait-rig";

const TORCH: Portrait["bg"] = ["#5a3b22", "#160d08"];

export const REALM: readonly Portrait[] = [
  {
    id: "novice",
    name: "Novice",
    blurb: "A hooded acolyte on the first step of the road.",
    skin: ["#f3d2b6", "#d9a483", "#9c6750"],
    iris: "#5b7a3a",
    brow: "#5a3a24",
    bg: TORCH,
    rim: "#ffb36b",
    back: (ids) => (
      <Shaded ids={ids} fill="#6b5844" d="M50 9C29 9 19 28 20 48C21 63 28 73 36 78L64 78C72 73 79 63 80 48C81 28 71 9 50 9Z" />
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#5d4b39" d="M2 100C4 84 18 74 36 70L50 78L64 70C82 74 96 84 98 100Z" />
        <path d="M36 70L50 86L64 70" fill="none" stroke="#3d3026" strokeWidth="1.4" />
        <path d="M44 82H56V88H44Z" fill="#b5753d" />
        <circle cx="50" cy="85" r="2" fill="#f6c995" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M37 28C42 23 58 23 63 28C58 26 54 29 50 27C46 29 42 26 37 28Z" fill="#5a3a24" />
        <Shaded ids={ids} fill="#6b5844" d="M50 12C33 12 25 27 26 45C27 56 30 63 35 68L37 61C33 55 32 47 33 39C35 27 41 21 50 21C59 21 65 27 67 39C68 47 67 55 63 61L65 68C70 63 73 56 74 45C75 27 67 12 50 12Z" />
        <path d="M33 30C38 25 62 25 67 30L66 36C60 30 40 30 34 36Z" fill="#000" opacity="0.28" />
      </g>
    ),
  },
  {
    id: "dwarf-lifter",
    name: "Dwarf Lifter",
    blurb: "Iron helm, braided beard, a bar across the yoke.",
    skin: ["#ecbe9c", "#c9845e", "#87503a"],
    iris: "#4a6a8a",
    brow: "#8a3c1c",
    bg: ["#4a3a2a", "#120c08"],
    rim: "#ff9a4a",
    jaw: "square",
    scene: (ids) => (
      <g>
        <rect x="0" y="66" width="100" height="5" fill={`url(#${ids.metal})`} />
        <rect x="2" y="54" width="9" height="30" rx="2" fill="#2a2a2e" />
        <rect x="89" y="54" width="9" height="30" rx="2" fill="#2a2a2e" />
        <rect x="11" y="58" width="5" height="22" rx="1.5" fill="#3a3a40" />
        <rect x="84" y="58" width="5" height="22" rx="1.5" fill="#3a3a40" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6f7680" d="M0 100C2 82 16 72 34 70L50 74L66 70C84 72 98 82 100 100Z" />
        <path d="M6 88H94M4 94H96M10 82H90" stroke="#3b4048" strokeWidth="0.8" strokeDasharray="1.5 1" />
        <Shaded ids={ids} fill="#5b3a22" d="M20 78L80 78L82 84L18 84Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Shaded ids={ids} fill="#a8431e" d="M32 49C32 64 38 78 44 90L50 96L56 90C62 78 68 64 68 49C64 55 58 57 56 55C54 57 46 57 44 55C42 57 36 55 32 49Z" />
        <path d="M44 62C45 72 47 82 50 92M56 62C55 72 53 82 50 92M50 58V90" stroke="#6e2a12" strokeWidth="0.7" fill="none" />
        <path d="M42 56Q50 52 58 56Q50 60 42 56Z" fill="#c45a2a" />
        <circle cx="45" cy="86" r="1.6" fill={`url(#${ids.gold})`} />
        <circle cx="55" cy="86" r="1.6" fill={`url(#${ids.gold})`} />
        <path d="M28 40C28 24 38 15 50 15C62 15 72 24 72 40Z" fill={`url(#${ids.metal})`} />
        <path d="M27 38H73V43H27Z" fill="#4d545d" />
        <path d="M48 15H52V43H48Z" fill="#5b626a" />
        <path d="M29 33C20 31 15 22 18 9C21 18 26 23 33 26Z" fill="#e9dcc4" />
        <path d="M71 33C80 31 85 22 82 9C79 18 74 23 67 26Z" fill="#b9ab92" />
      </g>
    ),
  },
  {
    id: "elf-ranger",
    name: "Elf Ranger",
    blurb: "Silver hair, a green cloak and a longbow at the shoulder.",
    skin: ["#f6e2cf", "#dcb79a", "#a67e66"],
    iris: "#3f9a6a",
    brow: "#c7c2b4",
    bg: ["#24402c", "#08130c"],
    rim: "#bff0a0",
    scene: () => (
      <g>
        <path d="M74 4C96 30 96 72 78 100" fill="none" stroke="#5a3a1c" strokeWidth="3" strokeLinecap="round" />
        <path d="M74 4L78 100" stroke="#e8e2d0" strokeWidth="0.4" />
      </g>
    ),
    back: (ids) => <Shaded ids={ids} fill="#d9d4c6" d="M30 36C26 56 28 76 34 90L66 90C72 76 74 56 70 36Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#2f5a36" d="M2 100C4 82 18 72 36 68L50 80L64 68C82 72 96 82 98 100Z" />
        <Shaded ids={ids} fill="#6a4a2c" d="M40 74L60 74L58 100L42 100Z" />
        <path d="M50 76C55 78 56 83 50 88C44 83 45 78 50 76Z" fill={`url(#${ids.gold})`} />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M33 45L18 29L31 54Z" fill="#dcb79a" />
        <path d="M67 45L82 29L69 54Z" fill="#a67e66" />
        <Shaded ids={ids} fill="#d9d4c6" d="M31 46C28 28 37 18 50 18C63 18 72 28 69 46C66 36 60 30 50 29C42 30 36 34 31 46Z" />
        <path d="M40 22C44 26 46 30 47 30M56 21C58 25 60 28 63 31" stroke="#a9a496" strokeWidth="0.6" fill="none" />
      </g>
    ),
  },
  {
    id: "monk",
    name: "Monk",
    blurb: "Shaved head, saffron robe, eyes closed in focus.",
    skin: ["#c99671", "#a9724d", "#6f4229"],
    iris: "#3a2a1a",
    brow: "#2a1a10",
    eyes: "closed",
    bg: ["#5a3a1a", "#140a04"],
    rim: "#ffcf7a",
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#d9822b" d="M30 74C40 76 54 88 66 100L96 100C94 86 82 78 66 74Z" />
        <Shaded ids={ids} fill="#b65c1a" d="M2 100C4 88 12 80 24 76L44 100Z" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <circle key={i} cx={38 + i * 3.4} cy={72 + Math.sin(i / 2.3) * 4} r="1.6" fill="#5a2e14" />
        ))}
      </g>
    ),
    front: () => (
      <g>
        <ellipse cx="44" cy="26" rx="9" ry="3" fill="#fff" opacity="0.18" />
        <circle cx="50" cy="33" r="1.4" fill="#d9822b" />
      </g>
    ),
  },
  {
    id: "barbarian",
    name: "Barbarian",
    blurb: "A wild mane, war paint and a fur mantle.",
    skin: ["#e3b08a", "#b77b55", "#7a4a30"],
    iris: "#6a4a2a",
    brow: "#241610",
    bg: ["#4a1a1a", "#120606"],
    rim: "#ff6a4a",
    jaw: "square",
    scene: (ids) => (
      <g>
        <rect x="82" y="30" width="4" height="70" fill="#4a2e18" />
        <Shaded ids={ids} fill="#9aa3ad" d="M84 26C98 28 100 48 94 60L84 52Z" />
      </g>
    ),
    back: (ids) => <Shaded ids={ids} fill="#241610" d="M24 50C14 30 28 10 50 10C72 10 86 30 76 50L80 74L66 66L34 66L20 74Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#4a3424" d="M2 100C4 86 14 78 30 74L40 80H60L70 74C86 78 96 86 98 100Z" />
        <Shaded ids={ids} fill="#8a6a4a" d="M14 82C20 70 36 66 50 70C64 66 80 70 86 82C78 78 70 80 64 76C58 82 42 82 36 76C30 80 22 78 14 82Z" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M30 42C26 28 34 18 50 18C66 18 74 28 70 42C66 32 58 26 50 28C42 26 34 32 30 42Z" fill="#241610" />
        <path d="M35 49L45 51V54L35 52ZM65 49L55 51V54L65 52Z" fill="#2a4a8a" opacity="0.85" />
        <path d="M60 30L64 40" stroke="#8a4a3a" strokeWidth="0.8" />
        <path d="M40 60Q50 66 60 60L58 66Q50 70 42 66Z" fill="#241610" />
      </g>
    ),
  },
  {
    id: "valkyrie",
    name: "Valkyrie",
    blurb: "Winged helm, braided gold, a spear held high.",
    skin: ["#f6dcc8", "#e2b498", "#a87a64"],
    iris: "#4a7ab0",
    brow: "#c9a24a",
    bg: ["#2a3a5a", "#080c18"],
    rim: "#9ac8ff",
    scene: (ids) => (
      <g>
        <rect x="9" y="22" width="3" height="78" fill="#6a4a2a" />
        <path d="M10.5 4L15 22H6Z" fill={`url(#${ids.metal})`} />
      </g>
    ),
    back: (ids) => (
      <g>
        <Shaded ids={ids} fill="#e0b94e" d="M30 42C27 60 29 76 33 88L40 88C36 74 36 58 36 44Z" />
        <Shaded ids={ids} fill="#e0b94e" d="M70 42C73 60 71 76 67 88L60 88C64 74 64 58 64 44Z" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#3a4a6a" d="M2 100C4 84 18 74 36 70L50 74L64 70C82 74 96 84 98 100Z" />
        <path d="M34 74H66L62 100H38Z" fill={`url(#${ids.metal})`} />
        <path d="M20 76C26 72 32 72 36 74L34 84C28 82 22 82 16 86Z" fill={`url(#${ids.metal})`} />
        <path d="M80 76C74 72 68 72 64 74L66 84C72 82 78 82 84 86Z" fill={`url(#${ids.metal})`} />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M30 40C30 26 39 17 50 17C61 17 70 26 70 40L66 38C64 30 58 26 50 26C42 26 36 30 34 38Z" fill={`url(#${ids.metal})`} />
        <path d="M48 26H52V46L50 49L48 46Z" fill={`url(#${ids.metal})`} />
        <path d="M31 32C22 30 13 22 10 9C19 15 25 19 34 23Z" fill="#f2f2f2" />
        <path d="M31 32C24 30 18 25 15 18" stroke="#b9c2cc" strokeWidth="0.6" fill="none" />
        <path d="M69 32C78 30 87 22 90 9C81 15 75 19 66 23Z" fill="#c9d0d8" />
      </g>
    ),
  },
  {
    id: "paladin",
    name: "Paladin",
    blurb: "Visor raised, white tabard, a gilded shield.",
    skin: ["#a8704a", "#7e4c2e", "#4a2a18"],
    iris: "#3a2414",
    brow: "#1a100a",
    bg: ["#5a4a2a", "#14100a"],
    rim: "#ffd88a",
    jaw: "square",
    body: (ids) => (
      <g>
        <path d="M0 100C2 82 16 72 34 70L50 72L66 70C84 72 98 82 100 100Z" fill={`url(#${ids.metal})`} />
        <Shaded ids={ids} fill="#ece6d8" d="M32 76H68L66 100H34Z" />
        <path d="M47 78H53V100H47ZM38 84H62V90H38Z" fill={`url(#${ids.gold})`} />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M44 59Q50 66 56 59L56 63Q50 68 44 63Z" fill="#1a100a" />
        <path d="M28 46C27 26 37 15 50 15C63 15 73 26 72 46L68 46C68 32 60 25 50 25C40 25 32 32 32 46Z" fill={`url(#${ids.metal})`} />
        <path d="M30 22C36 12 64 12 70 22L68 27C62 20 38 20 32 27Z" fill={`url(#${ids.gold})`} />
        <path d="M46 6H54L52 16H48Z" fill="#c03a3a" />
        <path d="M27 46L32 46L33 64L28 60Z M73 46L68 46L67 64L72 60Z" fill={`url(#${ids.metal})`} />
      </g>
    ),
  },
  {
    id: "titan",
    name: "Titan",
    blurb: "A giant of hewn stone with fire in its eyes.",
    skin: ["#c9c4ba", "#8e8a83", "#4d4a46"],
    iris: "#5af0ff",
    brow: "#3a3834",
    eyes: "glow",
    bg: ["#2a3a44", "#06090c"],
    rim: "#5af0ff",
    jaw: "square",
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#8e8a83" d="M-4 100C-2 74 20 62 40 62H60C80 62 102 74 104 100Z" />
        <path d="M20 76L30 84L26 96M76 72L70 86L80 96M44 74L50 84L56 74" fill="none" stroke="#5af0ff" strokeWidth="1.2" opacity="0.85" />
        <path d="M44 72H56L50 84Z" fill="#5af0ff" opacity="0.5" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M34 28L50 30L66 28" stroke="#4d4a46" strokeWidth="1" fill="none" />
        <path d="M36 54L42 50M62 52L66 58" stroke="#5af0ff" strokeWidth="0.8" opacity="0.8" />
        <Shaded ids={ids} fill="#6e6a64" d="M30 28L34 10L42 22L50 6L58 22L66 10L70 28C62 24 38 24 30 28Z" />
      </g>
    ),
  },
];
