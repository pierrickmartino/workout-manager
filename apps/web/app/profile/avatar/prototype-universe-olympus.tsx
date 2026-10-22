// PROTOTYPE — throwaway. Universe C, "Olympus": the same eight catalog slots recast as
// figures of the ancient games and myth, painted in Mediterranean sun, marble and bronze.
// Same ids and unlock levels as the catalog. Not for main.

import { Braid, Hair, Locks, Metal, Shaded, Soft, type Ids, type Portrait } from "./prototype-portrait-rig";

const SKY: Portrait["bg"] = ["#f2dcae", "#6a4a2a"];

// Sun shafts and a fluted marble column, softly out of focus.
function Temple({ ids }: { ids: Ids }): React.JSX.Element {
  return (
    <g>
      <Soft ids={ids} amount={4}>
        <g stroke="#fff6dc" strokeWidth="6" opacity="0.3">
          <path d="M30 20L-10 -20M30 20L30 -30M30 20L80 -20M30 20L110 10" />
        </g>
      </Soft>
      <Soft ids={ids} amount={1}>
        <rect x="84" y="0" width="13" height="100" fill="#ece2cc" opacity="0.6" />
        <path d="M87 0V100M90.5 0V100M94 0V100" stroke="#b5a484" strokeWidth="0.8" opacity="0.6" />
      </Soft>
    </g>
  );
}

function Laurel({ ids }: { ids: Ids }): React.JSX.Element {
  const leaves = [0, 1, 2, 3, 4, 5];
  return (
    <g>
      {leaves.map((i) => {
        const lx = 33 + i * 2.4;
        const ly = 34 - i * 2.6;
        const rx = 67 - i * 2.4;
        return (
          <g key={i}>
            <Metal ids={ids} tone="gold" d={`M${lx - 3} ${ly}C${lx - 1} ${ly - 2} ${lx + 2} ${ly - 1.6} ${lx + 3} ${ly}C${lx + 1} ${ly + 1.6} ${lx - 2} ${ly + 1.6} ${lx - 3} ${ly}Z`} />
            <Metal ids={ids} tone="gold" d={`M${rx + 3} ${ly}C${rx + 1} ${ly - 2} ${rx - 2} ${ly - 1.6} ${rx - 3} ${ly}C${rx - 1} ${ly + 1.6} ${rx + 2} ${ly + 1.6} ${rx + 3} ${ly}Z`} />
          </g>
        );
      })}
    </g>
  );
}

// Tight classical curls: a cap of hair beaded with ringlets along the hairline.
function Curls({ color, ids, y = 22 }: { color: string; ids: Ids; y?: number }): React.JSX.Element {
  // Two staggered rows of ringlets: a back row on the crown, a front row along the hairline,
  // each its own lit curl with a dark swirl, so they read as curls rather than a band.
  const back = [38, 44, 50, 56, 62].map((x) => [x, y + 1 + Math.abs(50 - x) / 5] as const);
  const front = [32.6, 37, 41.6, 46.2, 50.8, 55.4, 60, 64.6, 68].map(
    (x, i) => [x, y + 8 + Math.abs(50 - x) / 2.8 + (i % 2) * 1.6] as const,
  );
  const cap = `M31.6 40C30 ${y + 6} 38 ${y - 3} 50 ${y - 3}C62 ${y - 3} 70 ${y + 6} 68.4 40C66 35 60 ${y + 9} 50 ${y + 9}C40 ${y + 9} 34 35 31.6 40Z`;
  const curl = ([x, cy]: readonly [number, number], r: number, i: number) => (
    <g key={`${x}-${cy}`}>
      <Hair ids={ids} fill={color} sheen={false} d={`M${x - r} ${cy}a${r} ${r * 0.92} 0 1 0 ${2 * r} 0a${r} ${r * 0.92} 0 1 0 ${-2 * r} 0Z`} />
      <path
        d={`M${x + r * 0.4} ${cy - r * 0.3}a${r * 0.45} ${r * 0.45} 0 1 ${i % 2} ${-r * 0.7} ${r * 0.5}`}
        stroke="#000"
        strokeOpacity="0.45"
        strokeWidth="0.5"
        fill="none"
      />
      <circle cx={x - r * 0.35} cy={cy - r * 0.4} r={r * 0.3} fill="#fff" opacity="0.14" />
    </g>
  );
  return (
    <g>
      <Hair ids={ids} fill={color} d={cap} />
      {back.map((pt, i) => curl(pt, 3, i))}
      {front.map((pt, i) => curl(pt, 2.6, i))}
    </g>
  );
}

export const OLYMPUS: readonly Portrait[] = [
  {
    id: "novice",
    name: "Initiate",
    blurb: "A youth in a plain chiton, first day at the palaestra.",
    skin: ["#f4cfae", "#d29e78", "#8e624a"],
    iris: "#5a3a1e",
    brow: "#3a2414",
    bg: SKY,
    rim: "#fff2c0",
    scene: (ids) => <Temple ids={ids} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#efe8da" d="M22 100C24 86 30 78 40 74L50 80L60 74C76 78 92 86 96 100Z" />
        <Soft ids={ids} amount={1}>
          <path d="M40 76C48 84 54 92 58 100M56 77C60 84 64 92 66 100M72 80C76 88 78 94 80 100" stroke="#9c9080" strokeWidth="1.2" opacity="0.6" fill="none" />
        </Soft>
        <Metal ids={ids} tone="bronze" d="M60 76a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0Z" />
      </g>
    ),
    front: (ids) => <Curls color="#3a2414" ids={ids} />,
  },
  {
    id: "dwarf-lifter",
    name: "Forgehand",
    blurb: "Smith of the gods: leather apron, soot and a hammer.",
    skin: ["#dca47e", "#ad714c", "#643a24"],
    iris: "#3a2410",
    brow: "#1a120c",
    bg: ["#c46c2a", "#200a02"],
    rim: "#ffb46a",
    jaw: "square",
    scene: (ids) => (
      <g>
        <Soft ids={ids} amount={2}>
          {[[14, 70], [22, 58], [10, 44], [86, 52]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="#ffd27a" />
          ))}
        </Soft>
        <Shaded ids={ids} fill="#5a3a1c" d="M78 30H82V102H78Z" />
        <Metal ids={ids} d="M69 22C69 20.5 70 20 71.5 20H88.5C90 20 91 20.5 91 22V31C91 32.5 90 33 88.5 33H71.5C70 33 69 32.5 69 31Z" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6a4426" d="M28 78H72L76 100H24Z" />
        <Shaded ids={ids} fill="#4a2c16" d="M33 79L26 66L29 65L36 78ZM67 79L74 66L71 65L64 78Z" />
        <Soft ids={ids} amount={2}>
          <ellipse cx="22" cy="86" rx="9" ry="5" fill="#1a1008" opacity="0.4" />
          <ellipse cx="60" cy="90" rx="6" ry="3" fill="#1a1008" opacity="0.3" />
        </Soft>
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#2a1c12" d="M32 47C31 66 40 80 50 82C60 80 69 66 68 47C63 54 57 56 55 54.6C53 56 47 56 45 54.6C43 56 37 54 32 47Z" />
        <Locks ids={ids} fill="#32221a" width={1.6} strokes={["M38 58C40 68 44 74 47 79", "M62 58C60 68 56 74 53 79", "M50 62V80"]} />
        <Hair ids={ids} fill="#3a2a1a" d="M41 56.4C44 54 48 54.4 50 55.6C52 54.4 56 54 59 56.4C56.5 57.6 53 57.4 50 58C47 57.4 43.5 57.6 41 56.4Z" />
        <Curls color="#2a1c12" ids={ids} y={20} />
        <Soft ids={ids} amount={1}>
          <ellipse cx="40" cy="38" rx="4" ry="1.4" fill="#000" opacity="0.3" />
          <ellipse cx="62" cy="50" rx="2.4" ry="1.4" fill="#000" opacity="0.25" />
        </Soft>
      </g>
    ),
  },
  {
    id: "elf-ranger",
    name: "Huntress",
    blurb: "Crescent diadem, a quiver of arrows and a hound’s patience.",
    skin: ["#f6dcc6", "#dcae8e", "#9a6e52"],
    iris: "#4a6a3a",
    brow: "#5a3a1c",
    bg: ["#cddcb4", "#26341a"],
    rim: "#f6ffd8",
    lips: "#b0645a",
    scene: (ids) => (
      <g>
        <Temple ids={ids} />
        <Shaded ids={ids} fill="#5a3a1c" d="M14 100L26 58L32 60L20 100Z" />
        <Shaded ids={ids} fill="#efe8da" d="M26 56L29 48L32 57ZM30 58L34 50L35.4 59Z" />
      </g>
    ),
    back: (ids) => <Hair ids={ids} fill="#6a4020" d="M38 20C40 8 60 8 62 20C58 16 42 16 38 20Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#efe8da" d="M28 100C30 86 36 78 44 74L50 80L58 74C74 78 88 86 92 100Z" />
        <Soft ids={ids} amount={1}>
          <path d="M44 78C48 86 50 94 50 100M64 80C68 88 70 94 70 100" stroke="#9c9080" strokeWidth="1.2" opacity="0.6" fill="none" />
        </Soft>
        <Shaded ids={ids} fill="#5a3a1c" d="M28 69L31 67L68 98L64 100Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#6a4020" d="M31 45C28 28 37 16 50 16C63 16 72 28 69 45C66 35 60 29 50 28.5C40 29 34 35 31 45Z" />
        <Locks ids={ids} fill="#74462a" width={1.6} strokes={["M68 40C72 48 72 56 70 64", "M45 21C41 25 37 31 35 38", "M55 21C59 25 63 31 65 38"]} />
        <Metal ids={ids} tone="gold" d="M41 23Q50 27.5 59 23Q56.5 16 50 12.5Q43.5 16 41 23Z" />
        <Metal ids={ids} d="M44.2 18Q50 22.6 55.8 18Q53 13.2 50 11.4Q47 13.2 44.2 18Z" />
      </g>
    ),
  },
  {
    id: "monk",
    name: "Sage",
    blurb: "A philosopher-wrestler: white beard, himation, an unhurried gaze.",
    skin: ["#e8bb98", "#c08a68", "#76482e"],
    iris: "#4a5a6a",
    brow: "#e2ddd4",
    bg: ["#e8dec8", "#584838"],
    rim: "#fffaf0",
    aged: true,
    scene: (ids) => <Temple ids={ids} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#5e507e" d="M0 100C2 84 16 74 34 70L50 76L66 70C84 74 98 84 100 100Z" />
        <Shaded ids={ids} fill="#efe8da" d="M28 72C42 80 56 90 66 100H40C36 90 30 82 20 78Z" />
        <Soft ids={ids} amount={1}>
          <path d="M28 78C36 86 40 94 42 100M74 80C78 88 80 94 80 100" stroke="#2a2040" strokeWidth="1.4" opacity="0.5" fill="none" />
        </Soft>
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#e4dfd6" d="M32 47C32 66 40 80 50 85C60 80 68 66 68 47C63 54 57 56 55 54.6C53 56 47 56 45 54.6C43 56 37 54 32 47Z" />
        <Locks ids={ids} fill="#ece8e0" width={1.5} strokes={["M38 58C40 68 44 76 48 82", "M62 58C60 68 56 76 52 82", "M50 62V84", "M44 60C45 70 47 76 49 80"]} />
        <Hair ids={ids} fill="#d8d2c6" d="M41 56.4C44 54 48 54.4 50 55.6C52 54.4 56 54 59 56.4C56.5 57.6 53 57.4 50 58C47 57.4 43.5 57.6 41 56.4Z" />
        <Hair ids={ids} fill="#e4dfd6" d="M31 44C29.5 35 31 29 35 26C34 32 34 38 34.6 44ZM69 44C70.5 35 69 29 65 26C66 32 66 38 65.4 44Z" />
        <Soft ids={ids} amount={2}>
          <ellipse cx="45" cy="24.5" rx="8" ry="3" fill="#fff" opacity="0.35" />
        </Soft>
      </g>
    ),
  },
  {
    id: "barbarian",
    name: "Lion-Bearer",
    blurb: "Wears the pelt of the lion he wrestled, club on the shoulder.",
    skin: ["#dea880", "#b07450", "#663a22"],
    iris: "#4a3018",
    brow: "#1a100a",
    bg: ["#dcac5c", "#341c06"],
    rim: "#ffe0a0",
    jaw: "square",
    stubble: true,
    scene: (ids) => (
      <g>
        <Temple ids={ids} />
        <Shaded ids={ids} fill="#6a4426" d="M78 102L89 34C91 27 98.5 29 97 38L86 102Z" />
      </g>
    ),
    back: (ids) => <Hair ids={ids} fill="#b88238" d="M20 78C13 52 21 18 50 11C79 18 87 52 80 78L66 71L34 71Z" />,
    body: (ids) => (
      <g>
        <Hair ids={ids} fill="#b88238" d="M0 100C0 86 10 76 24 72L40 80H60L76 72C90 76 100 86 100 100Z" />
        <Shaded ids={ids} fill="#efe6d4" d="M40 80L36.5 95L44 89ZM60 80L63.5 95L56 89Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#1a100a" sheen={false} d="M38 60C42 63.6 46 62.6 50 63.2C54 62.6 58 63.6 62 60C61 66.2 56 70.4 50 70.8C44 70.4 39 66.2 38 60Z" />
        <Hair ids={ids} fill="#1a100a" sheen={false} d="M42 57C45 55 48 55.6 50 56.6C52 55.6 55 55 58 57C55.6 57.8 52.6 57.8 50 58.2C47.4 57.8 44.4 57.8 42 57Z" />
        <Curls color="#1a100a" ids={ids} y={25} />
        {/* The lion's head worn as a hood: muzzle, brow, ears and eyes */}
        <Hair ids={ids} fill="#c48e40" d="M27 39C25 20 35 7 50 7C65 7 75 20 73 39L66.5 34.6C62.5 27 56.5 24.6 50 24.6C43.5 24.6 37.5 27 33.5 34.6Z" />
        <Locks ids={ids} fill="#a06a28" width={3} strokes={["M28 14C30 18 31 20 33 22", "M72 14C70 18 69 20 67 22"]} />
        <Soft ids={ids} amount={1}>
          <path d="M35 20L42 23.4M65 20L58 23.4" stroke="#5a3410" strokeWidth="1.6" />
        </Soft>
        <circle cx="40" cy="17" r="1.4" fill="#1a0e04" />
        <circle cx="60" cy="17" r="1.4" fill="#1a0e04" />
        <circle cx="39.6" cy="16.6" r="0.4" fill="#fff" opacity="0.7" />
        <circle cx="59.6" cy="16.6" r="0.4" fill="#fff" opacity="0.7" />
        <Shaded ids={ids} fill="#efe6d4" d="M45.5 26L47.5 31L49 26ZM51 26L52.5 31L54.5 26Z" />
      </g>
    ),
  },
  {
    id: "valkyrie",
    name: "Amazon",
    blurb: "Bronze cuirass, a crescent shield, braid wound tight.",
    skin: ["#cc9874", "#a06c4a", "#5e3a24"],
    iris: "#3a2410",
    brow: "#1a100a",
    bg: ["#dabb8c", "#46280f"],
    rim: "#ffe6b0",
    lips: "#8a4a3e",
    scene: (ids) => (
      <g>
        <Temple ids={ids} />
        <Metal ids={ids} tone="bronze" d="M0 62C10 56 24 56 33 62L28 102H2Z" />
        <path d="M4 63C11 71 22 71 29 63" fill="#4a2810" />
      </g>
    ),
    back: (ids) => <Braid ids={ids} fill="#1a100a" x={66} y0={44} y1={94} w={5} />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#8a2a26" d="M0 100C2 84 16 74 34 70L50 74L66 70C84 74 98 84 100 100Z" />
        <Metal ids={ids} tone="bronze" d="M32 72C40 70 60 70 68 72L66 100H34Z" />
        <path d="M36 84C40 79 46 79 49.4 82M50.6 82C54 79 60 79 64 84M50 76V100M42 92Q46 94 49 92M51 92Q54 94 58 92" stroke="#4a2810" strokeWidth="0.7" fill="none" opacity="0.75" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#1a100a" d="M31 42C28 26 38 16.5 50 16.5C62 16.5 72 26 69 42C66 32 60 28 50 28C40 28 34 32 31 42Z" />
        <Locks ids={ids} fill="#24160e" width={1.4} strokes={["M45 20C41 24 37 30 35 37", "M55 20C59 24 63 30 65 37"]} />
        <Metal ids={ids} tone="gold" d="M33.6 26C39 20 61 20 66.4 26L65.6 28C60 22.6 40 22.6 34.4 28Z" />
        <Metal ids={ids} tone="gold" d="M48.2 21.5a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0Z" />
      </g>
    ),
  },
  {
    id: "paladin",
    name: "Hoplite",
    blurb: "Corinthian helm, horsehair crest and the round aspis.",
    skin: ["#e2b08a", "#b87e58", "#6c4228"],
    iris: "#3a2a1a",
    brow: "#1a100a",
    bg: ["#d4b47e", "#36200a"],
    rim: "#ffe6b0",
    jaw: "square",
    stubble: true,
    scene: (ids) => (
      <g>
        <Temple ids={ids} />
        <Metal ids={ids} tone="bronze" d="M60 86a26 26 0 1 0 52 0a26 26 0 1 0 -52 0Z" />
        <Shaded ids={ids} fill="#8a2422" d="M66 86a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z" />
        <path d="M78 98L86 74L94 98" stroke="#efe6d4" strokeWidth="3" fill="none" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#8a2422" d="M0 100C2 84 16 74 34 70L50 74L64 70C70 72 74 74 76 76L70 100Z" />
        <Metal ids={ids} tone="bronze" d="M32 72C40 70 60 70 66 72L64 100H34Z" />
        <path d="M36 84C40 79 46 79 49.4 82M50.6 82C54 79 60 79 64 84M50 76V100M42 92Q46 94 49 92M51 92Q54 94 58 92" stroke="#4a2810" strokeWidth="0.7" fill="none" opacity="0.75" />
      </g>
    ),
    front: (ids) => (
      <g>
        {/* Horsehair crest */}
        <Hair ids={ids} fill="#a8241e" d="M22 14C26 -4 74 -4 78 14C74 10 70 8 66 9C60 4 40 4 34 9C30 8 26 10 22 14Z" />
        <Metal ids={ids} tone="bronze" d="M46 12H54V17H46Z" />
        {/* Corinthian helm: eye openings and the gap down the face */}
        <Metal
          ids={ids}
          tone="bronze"
          fillRule="evenodd"
          d="M50 4.5C35 4.5 26 16 26.5 33C27 46 28.6 58 32.4 68.6L44.6 70.4H55.4L67.6 68.6C71.4 58 73 46 73.5 33C74 16 65 4.5 50 4.5ZM34.5 41Q42 37.6 47.6 40.6L50 43L52.4 40.6Q58 37.6 65.5 41L65 48.4H55.4V68H44.6V48.4H35Z"
        />
        <Metal ids={ids} tone="bronze" d="M48.2 41.6H51.8V55.6Q50 56.6 48.2 55.6Z" />
      </g>
    ),
  },
  {
    id: "titan",
    name: "Atlas",
    blurb: "The titan who holds up the heavens on his shoulders.",
    skin: ["#dca482", "#ad7350", "#5e3620"],
    iris: "#3a2a1a",
    brow: "#dad6cc",
    bg: ["#2c3c6c", "#03050c"],
    rim: "#ffe6b0",
    jaw: "square",
    aged: true,
    scene: (ids) => (
      <g>
        <circle cx="50" cy="-6" r="40" fill="#1a2a5a" />
        <Soft ids={ids} amount={4}>
          <circle cx="40" cy="-14" r="22" fill="#4a6ab0" opacity="0.6" />
        </Soft>
        <Metal ids={ids} tone="gold" fillRule="evenodd" d="M10 -6a40 40 0 1 0 80 0a40 40 0 1 0 -80 0ZM12 -6a38 38 0 1 0 76 0a38 38 0 1 0 -76 0Z" />
        <path d="M12 -6H88M50 -44V32" stroke="#d9a034" strokeWidth="0.9" />
        <ellipse cx="50" cy="-6" rx="38" ry="13" fill="none" stroke="#d9a034" strokeWidth="0.9" transform="rotate(-20 50 -6)" />
        {[[30, 10], [62, 20], [74, 4], [40, 24], [56, 8], [22, 0]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="#fff6dc" />
        ))}
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#ad7350" d="M-4 100C-2 76 18 64 38 64H62C82 64 102 76 104 100Z" />
        <Soft ids={ids} amount={2}>
          <path d="M18 82C28 78 40 80 48 86M82 82C72 78 60 80 52 86M30 92C36 96 42 98 46 100" stroke="#5e3620" strokeWidth="1.6" fill="none" opacity="0.6" />
          <ellipse cx="26" cy="74" rx="8" ry="3" fill="#f4cba8" opacity="0.4" />
        </Soft>
        <Shaded ids={ids} fill="#efe8da" d="M20 100C40 86 62 82 84 70L96 76L90 100Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#dcd8ce" d="M31 47C31 68 40 82 50 87C60 82 69 68 69 47C64 54 57 56 55 54.6C53 56 47 56 45 54.6C43 56 36 54 31 47Z" />
        <Locks ids={ids} fill="#e8e4dc" width={1.6} strokes={["M37 58C39 68 43 78 47 84", "M63 58C61 68 57 78 53 84", "M50 62V86"]} />
        <Hair ids={ids} fill="#cfcac0" d="M41 56.4C44 54 48 54.4 50 55.6C52 54.4 56 54 59 56.4C56.5 57.6 53 57.4 50 58C47 57.4 43.5 57.6 41 56.4Z" />
        <Curls color="#dcd8ce" ids={ids} y={24} />
      </g>
    ),
  },
];
