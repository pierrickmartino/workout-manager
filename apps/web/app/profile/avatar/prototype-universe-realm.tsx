// PROTOTYPE — throwaway. Universe A, "The Realm": today's fantasy roster repainted as lit,
// painterly portraits. Same eight catalog ids, in catalog order. Not for main.

import { Braid, Hair, Locks, Mail, Metal, Shaded, Soft, type Portrait } from "./prototype-portrait-rig";

const TORCH: Portrait["bg"] = ["#6a4426", "#120a06"];

export const REALM: readonly Portrait[] = [
  {
    id: "novice",
    name: "Novice",
    blurb: "A hooded acolyte on the first step of the road.",
    skin: ["#f5d6bc", "#dba785", "#9a6650"],
    iris: "#5b7a3a",
    brow: "#4a2e1c",
    bg: TORCH,
    rim: "#ffb36b",
    back: (ids) => (
      <Shaded ids={ids} fill="#6b5a46" d="M50 8C28 8 18 28 19 49C20 64 27 74 35 79L65 79C73 74 80 64 81 49C82 28 72 8 50 8Z" />
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#5a4936" d="M0 100C2 84 16 74 34 70C40 74 45 78 50 80C55 78 60 74 66 70C84 74 98 84 100 100Z" />
        <Soft ids={ids} amount={1}>
          <path d="M22 84C26 90 28 96 28 100M78 84C74 90 72 96 72 100M40 82C42 90 42 96 41 100" stroke="#2a2018" strokeWidth="1.6" opacity="0.6" fill="none" />
        </Soft>
        <path d="M37 71C42 78 46 82 50 84C54 82 58 78 63 71" fill="none" stroke="#c9a46a" strokeWidth="0.9" />
        <Metal ids={ids} tone="bronze" d="M46.5 82.5C46.5 80.5 48 79.5 50 79.5C52 79.5 53.5 80.5 53.5 82.5C53.5 85 52 86.5 50 86.5C48 86.5 46.5 85 46.5 82.5Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#4a2e1c" d="M34 36C36 27 43 23 50 24C57 23 64 27 66 36C63 32 59 30.5 56 31.5C54 29.5 51 29.8 49 31C46 29.8 42 30.4 40 32C38 32 36 33.6 34 36Z" />
        <Shaded ids={ids} fill="#6b5a46" fillRule="evenodd" d="M50 11C32 11 24 27 25 45C26 57 29 64 34 69L36.5 61C33 55 32 47 33 39C34.5 27 41 21 50 21C59 21 65.5 27 67 39C68 47 67 55 63.5 61L66 69C71 64 74 57 75 45C76 27 68 11 50 11Z" />
        <Soft ids={ids} amount={2}>
          <path d="M33 30C38 23 62 23 67 30L66.5 38C60 31 40 31 33.5 38Z" fill="#000" opacity="0.5" />
        </Soft>
      </g>
    ),
  },
  {
    id: "dwarf-lifter",
    name: "Dwarf Lifter",
    blurb: "Iron helm, braided beard, a bar across the yoke.",
    skin: ["#efc2a0", "#cb8660", "#85503a"],
    iris: "#4a6a8a",
    brow: "#7a3416",
    bg: ["#4e3a28", "#100a06"],
    rim: "#ff9a4a",
    jaw: "square",
    scene: (ids) => (
      <g>
        <Metal ids={ids} d="M-2 64.5H102V69H-2Z" />
        <path d="M-2 66.7H102" stroke="#2a2d32" strokeWidth="0.4" strokeDasharray="0.6 0.6" />
        <Shaded ids={ids} fill="#26262a" d="M0 50C0 48 2 47 4 47H9C11 47 12 48 12 50V84C12 86 11 87 9 87H4C2 87 0 86 0 84Z" />
        <Shaded ids={ids} fill="#26262a" d="M88 50C88 48 89 47 91 47H96C98 47 100 48 100 50V84C100 86 98 87 96 87H91C89 87 88 86 88 84Z" />
        <Metal ids={ids} d="M12 59H16V75H12ZM84 59H88V75H84Z" />
      </g>
    ),
    body: (ids) => (
      <g>
        <Mail ids={ids} d="M0 100C2 82 16 72 34 69L50 73L66 69C84 72 98 82 100 100Z" />
        <Shaded ids={ids} fill="#5a3820" d="M14 84C30 80 70 80 86 84L88 90C70 86 30 86 12 90Z" />
        <Metal ids={ids} tone="bronze" d="M46 82H54V89H46Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        {/* Beard, moustache and two ringed plaits */}
        <Hair ids={ids} fill="#a4441e" d="M31 46C30 56 32 64 36 70C39 76 43 82 45 90L50 86L55 90C57 82 61 76 64 70C68 64 70 56 69 46C67 52 64 55 60 56.5C57 55 54 54.4 50 55C46 54.4 43 55 40 56.5C36 55 33 52 31 46Z" />
        <Locks ids={ids} fill="#b24c22" width={1.8} strokes={["M36 58C37 66 40 72 43 78", "M64 58C63 66 60 72 57 78", "M42 62C43 70 45 76 47 82", "M58 62C57 70 55 76 53 82", "M50 62V84"]} />
        <Braid ids={ids} fill="#a4441e" x={44} y0={84} y1={98} w={4} />
        <Braid ids={ids} fill="#a4441e" x={56} y0={84} y1={98} w={4} />
        <Metal ids={ids} tone="gold" d="M41.6 88H46.4V90.6H41.6ZM53.6 88H58.4V90.6H53.6Z" />
        <Hair ids={ids} fill="#b65024" d="M40 57C43 54 47.5 54 50 55.6C52.5 54 57 54 60 57C62.5 59 63.5 62 62.5 64.5C59.5 60.5 55.5 59.4 50 59.6C44.5 59.4 40.5 60.5 37.5 64.5C36.5 62 37.5 59 40 57Z" />
        {/* Horns, ridged and yellowed */}
        <Shaded ids={ids} fill="#e6d7bc" d="M30 33C21 32 15 24 17 9C20 19 25 24 33 26Z" />
        <Shaded ids={ids} fill="#cdbd9e" d="M70 33C79 32 85 24 83 9C80 19 75 24 67 26Z" />
        <path d="M20 21L25 19M22 25L27 23M80 21L75 19M78 25L73 23" stroke="#8a7a5e" strokeWidth="0.5" />
        {/* Helm: dome, riveted brow band and nasal */}
        <Metal ids={ids} d="M29 40C28 25 38 15 50 15C62 15 72 25 71 40Z" />
        <Metal ids={ids} d="M47.6 15.5H52.4V39H47.6Z" />
        <Metal ids={ids} d="M27.5 37.5H72.5V42.5H27.5Z" />
        <Metal ids={ids} d="M48 41H52L51.3 51.5Q50 52.5 48.7 51.5Z" />
        {[31, 37, 43, 57, 63, 69].map((x) => (
          <circle key={x} cx={x} cy="40" r="0.8" fill="#e8ecf0" />
        ))}
      </g>
    ),
  },
  {
    id: "elf-ranger",
    name: "Elf Ranger",
    blurb: "Silver hair, a green cloak and a longbow at the shoulder.",
    skin: ["#f8e6d4", "#dfbb9e", "#a47c64"],
    iris: "#3f9a6a",
    brow: "#9a958a",
    bg: ["#2a4a32", "#06100a"],
    rim: "#c4f2a8",
    scene: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6a4422" d="M72 2C94 30 95 72 78 102L75 101C91 72 90 32 70 4Z" />
        <path d="M71 3L76.5 101" stroke="#efe9d8" strokeWidth="0.35" />
      </g>
    ),
    back: (ids) => <Hair ids={ids} fill="#d6d1c4" d="M30 34C25 52 24 76 29 96L71 96C76 76 75 52 70 34C66 26 34 26 30 34Z" />,
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#2e5a36" d="M0 100C2 82 16 72 34 68C40 74 45 78 50 79C55 78 60 74 66 68C84 72 98 82 100 100Z" />
        <Soft ids={ids} amount={1}>
          <path d="M16 86C20 92 21 97 20 100M84 86C80 92 79 97 80 100M30 76C34 86 35 94 34 100" stroke="#122a16" strokeWidth="1.6" opacity="0.6" fill="none" />
        </Soft>
        <Shaded ids={ids} fill="#6a4a2c" d="M41 76L59 76L57.5 100L42.5 100Z" />
        <Shaded ids={ids} fill="#4a301a" d="M28 72L64 100L58 100L24 76Z" />
        <Metal ids={ids} tone="gold" d="M50 74C56 76 57.5 82 50 89C42.5 82 44 76 50 74Z" />
        <path d="M50 76V87" stroke="#7a4e10" strokeWidth="0.4" />
      </g>
    ),
    front: (ids) => (
      <g>
        {/* Long pointed ears through the hair */}
        <path d="M33 44C27 41 19 34 14 26C18 36 24 46 31 54C33 52 33.5 48 33 44Z" fill={`url(#${ids.skin})`} />
        <path d="M31 46C26 42 21 37 18 32" stroke="#a47c64" strokeWidth="0.7" fill="none" />
        <path d="M67 44C73 41 81 34 86 26C82 36 76 46 69 54C67 52 66.5 48 67 44Z" fill="#a47c64" />
        <Hair ids={ids} fill="#dcd7ca" d="M50 17C38 17 29.5 25 29.5 40C29.5 50 30.5 58 31.5 66C32.5 56 34 47 37 40C40.5 34 45.5 29.5 50 25.5C54.5 29.5 59.5 34 63 40C66 47 67.5 56 68.5 66C69.5 58 70.5 50 70.5 40C70.5 25 62 17 50 17Z" />
        <Locks ids={ids} fill="#e4dfd2" width={1.4} strokes={["M47 24C42 30 38 38 35 50", "M53 24C58 30 62 38 65 50", "M44 22C39 26 34 34 33 44"]} />
      </g>
    ),
  },
  {
    id: "monk",
    name: "Monk",
    blurb: "Shaved head, saffron robe, eyes closed in focus.",
    skin: ["#cf9b75", "#a76f4a", "#6a3e26"],
    iris: "#3a2a1a",
    brow: "#2a1a10",
    eyes: "closed",
    bg: ["#6a4420", "#140a04"],
    rim: "#ffcf7a",
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#b65a18" d="M0 100C2 88 10 80 22 76L46 100Z" />
        <Shaded ids={ids} fill="#de8a2e" d="M28 73C40 75 54 87 66 100L100 100C98 86 84 78 66 73.5Z" />
        <Soft ids={ids} amount={1}>
          <path d="M40 78C48 84 54 92 58 100M52 76C60 82 66 90 70 100M68 76C74 84 80 92 82 100" stroke="#7a3a0a" strokeWidth="1.4" opacity="0.55" fill="none" />
        </Soft>
        {Array.from({ length: 13 }, (_, i) => {
          const t = i / 12;
          const x = 36 + t * 28;
          const y = 70 + Math.sin(t * Math.PI) * 9;
          return <Shaded key={i} ids={ids} fill="#5a2e14" d={`M${x - 1.4} ${y}a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0Z`} />;
        })}
      </g>
    ),
    front: (ids) => (
      <g>
        {/* Shaved scalp: a faint shadow of stubble and the shine of the crown */}
        <path d="M31.4 37C32 26 40 19.5 50 19.5C60 19.5 68 26 68.6 37C64 31 57 29 50 29C43 29 36 31 31.4 37Z" fill="#1a110a" opacity="0.18" filter={`url(#${ids.grain})`} />
        <Soft ids={ids} amount={2}>
          <ellipse cx="44" cy="25" rx="7" ry="3" fill="#fff" opacity="0.4" />
        </Soft>
        <Soft ids={ids} amount={1}>
          <ellipse cx="50" cy="33.5" rx="1.1" ry="1.6" fill="#d9682b" opacity="0.9" />
        </Soft>
      </g>
    ),
  },
  {
    id: "barbarian",
    name: "Barbarian",
    blurb: "A wild mane, war paint and a fur mantle.",
    skin: ["#e6b48e", "#b77b55", "#73442c"],
    iris: "#6a4a2a",
    brow: "#1e130c",
    bg: ["#521c18", "#100404"],
    rim: "#ff6a4a",
    jaw: "square",
    stubble: true,
    scene: (ids) => (
      <g>
        <Shaded ids={ids} fill="#4a2c16" d="M82 30H86V102H82Z" />
        <Metal ids={ids} d="M84 24C97 24 101 42 96 58C94 50 90 46 84 46Z" />
        <path d="M95.6 26C99.6 34 100 46 96 57" stroke="#fff" strokeWidth="0.6" opacity="0.7" fill="none" />
      </g>
    ),
    back: (ids) => (
      <Hair ids={ids} fill="#22150d" d="M50 9C30 9 20 22 21 38C18 48 22 58 18 70L28 66C27 74 30 80 34 84L38 68H62L66 84C70 80 73 74 72 66L82 70C78 58 82 48 79 38C80 22 70 9 50 9Z" />
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#5a3e2a" d="M0 100C2 86 14 78 30 74L40 80H60L70 74C86 78 98 86 100 100Z" />
        <Hair ids={ids} fill="#8a6644" d="M8 88C12 74 30 66 50 70C70 66 88 74 92 88L88 84L86 90L82 84L78 90L74 82L70 88L66 80L62 86L58 80L54 86L50 80L46 86L42 80L38 86L34 80L30 88L26 82L22 90L18 84L14 90L12 84Z" />
        <Shaded ids={ids} fill="#3a2414" d="M58 76L76 100H70L54 80Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Locks
          ids={ids}
          fill="#22150d"
          width={3.2}
          strokes={["M34 30C30 38 29 46 30 56", "M66 30C70 38 71 46 70 56", "M40 22C36 26 34 32 33 38", "M60 22C64 26 66 32 67 38", "M46 20C44 24 42 28 40 31", "M54 20C56 24 58 28 60 31"]}
        />
        <Hair ids={ids} fill="#22150d" d="M31 38C30 26 38 17 50 17C62 17 70 26 69 38C66 31 60 27 54 28C51 26.5 48 26.5 45 28C40 27 34 31 31 38Z" />
        {/* Smeared woad across the eyes, a scar and a short beard */}
        <Soft ids={ids} amount={1}>
          <path d="M34 47.5C38 46.5 43 47 46 48.5L45 52C42 50.8 38 50.6 34.5 51.4Z" fill="#2848a0" opacity="0.8" />
          <path d="M66 47.5C62 46.5 57 47 54 48.5L55 52C58 50.8 62 50.6 65.5 51.4Z" fill="#2848a0" opacity="0.7" />
        </Soft>
        <path d="M60.5 32.5L64 41.5" stroke="#8a4234" strokeWidth="0.9" strokeLinecap="round" />
        <path d="M60.5 32.5L64 41.5" stroke="#f0b4a0" strokeWidth="0.3" strokeLinecap="round" transform="translate(-0.4 0)" />
        <Hair ids={ids} fill="#2a1a10" sheen={false} d="M38 60C42 63.5 46 62.5 50 63C54 62.5 58 63.5 62 60C61 66 56 70 50 70.5C44 70 39 66 38 60Z" />
        <Hair ids={ids} fill="#2a1a10" sheen={false} d="M42 57C45 55 48 55.6 50 56.6C52 55.6 55 55 58 57C56 57.6 53 57.6 50 58C47 57.6 44 57.6 42 57Z" />
      </g>
    ),
  },
  {
    id: "valkyrie",
    name: "Valkyrie",
    blurb: "Winged helm, braided gold, a spear held high.",
    skin: ["#f8e0cc", "#e4b69a", "#a67862"],
    iris: "#4a7ab0",
    brow: "#b08a3a",
    bg: ["#2e4064", "#060a16"],
    rim: "#9ac8ff",
    lips: "#b46a62",
    scene: (ids) => (
      <g>
        <Shaded ids={ids} fill="#6a4a2a" d="M8.5 22H12V102H8.5Z" />
        <Metal ids={ids} d="M10.3 2L15.5 22H5Z" />
      </g>
    ),
    back: (ids) => (
      <g>
        <Hair ids={ids} fill="#d8ac48" d="M31 38C27 46 27 56 29 62L37 60C35 52 35 46 36 40Z" />
        <Hair ids={ids} fill="#d8ac48" d="M69 38C73 46 73 56 71 62L63 60C65 52 65 46 64 40Z" />
        <Braid ids={ids} fill="#d8ac48" x={32} y0={60} y1={92} w={5} />
        <Braid ids={ids} fill="#c99c3c" x={68} y0={60} y1={92} w={5} />
      </g>
    ),
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#2e3c5c" d="M0 100C2 84 16 74 34 70L50 74L66 70C84 74 98 84 100 100Z" />
        <Metal ids={ids} d="M33 73C40 71 60 71 67 73L64 100H36Z" />
        <path d="M50 74V100M38 84Q50 80 62 84" stroke="#2a2f36" strokeWidth="0.6" fill="none" />
        <Metal ids={ids} d="M14 80C20 72 30 70 37 72L35 82C28 80 20 82 12 88Z" />
        <Metal ids={ids} d="M10 90C18 82 28 80 35 82L34 91C26 89 18 91 8 98Z" />
        <Metal ids={ids} d="M86 80C80 72 70 70 63 72L65 82C72 80 80 82 88 88Z" />
        <Metal ids={ids} d="M90 90C82 82 72 80 65 82L66 91C74 89 82 91 92 98Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#dcb04c" d="M33.5 40C34 33 39 29 45 30C42 33 39 36 37 41Z" />
        <Hair ids={ids} fill="#dcb04c" d="M66.5 40C66 33 61 29 55 30C58 33 61 36 63 41Z" />
        {/* Wings: layered feathers sweeping back from the helm */}
        {[0, 1, 2, 3].map((i) => (
          <Shaded key={`l${i}`} ids={ids} fill={i % 2 ? "#e8eaee" : "#f6f6f4"} d={`M32 ${34 - i}C${24 - i * 3} ${33 - i * 3} ${16 - i * 2} ${26 - i * 4} ${12 - i} ${14 - i * 3}C${18 - i} ${22 - i * 3} ${25 - i} ${26 - i * 2} 34 ${29 - i}Z`} />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <Shaded key={`r${i}`} ids={ids} fill={i % 2 ? "#c8ccd4" : "#d8dce2"} d={`M68 ${34 - i}C${76 + i * 3} ${33 - i * 3} ${84 + i * 2} ${26 - i * 4} ${88 + i} ${14 - i * 3}C${82 + i} ${22 - i * 3} ${75 + i} ${26 - i * 2} 66 ${29 - i}Z`} />
        ))}
        <Metal ids={ids} d="M30 40C30 26 39 17 50 17C61 17 70 26 70 40L66 38.5C64 31 58 27 50 27C42 27 36 31 34 38.5Z" />
        <Metal ids={ids} tone="gold" d="M30.5 37.5C36 33.5 64 33.5 69.5 37.5L69 40C63 36.5 37 36.5 31 40Z" />
        <Metal ids={ids} d="M48.4 27H51.6V46.5L50 48.5L48.4 46.5Z" />
      </g>
    ),
  },
  {
    id: "paladin",
    name: "Paladin",
    blurb: "Visor raised, white tabard, a gilded shield.",
    skin: ["#a9724c", "#7c4a2c", "#462814"],
    iris: "#3a2414",
    brow: "#160d08",
    bg: ["#5e4c2c", "#120e08"],
    rim: "#ffd88a",
    jaw: "square",
    stubble: true,
    body: (ids) => (
      <g>
        <Mail ids={ids} d="M34 64C40 70 60 70 66 64L68 76H32Z" />
        <Metal ids={ids} d="M0 100C2 82 14 72 30 70C34 74 38 76 40 76L36 100Z" />
        <Metal ids={ids} d="M100 100C98 82 86 72 70 70C66 74 62 76 60 76L64 100Z" />
        <Shaded ids={ids} fill="#efe9dc" d="M32 75H68L66 100H34Z" />
        <Metal ids={ids} tone="gold" d="M47 78H53V100H47ZM38 84H62V90H38Z" />
      </g>
    ),
    front: (ids) => (
      <g>
        <Hair ids={ids} fill="#140c08" sheen={false} d="M38 59.6C42 63.5 46 62.6 50 63.2C54 62.6 58 63.5 62 59.6C61 65.6 56 69 50 69.4C44 69 39 65.6 38 59.6Z" />
        <Hair ids={ids} fill="#140c08" sheen={false} d="M42.4 57C45 55.4 48 55.8 50 56.8C52 55.8 55 55.4 57.6 57C55 57.8 52.6 57.8 50 58.2C47.4 57.8 45 57.8 42.4 57Z" />
        {/* Mail coif under the helm, the helm itself and its raised visor */}
        <Mail ids={ids} d="M28 44C28 54 30 62 34 68L37 62C34 56 33 50 33 44ZM72 44C72 54 70 62 66 68L63 62C66 56 67 50 67 44Z" />
        <Metal ids={ids} d="M28 46C27 27 37 15 50 15C63 15 73 27 72 46L67.5 46C67.5 32 60 25.5 50 25.5C40 25.5 32.5 32 32.5 46Z" />
        <Metal ids={ids} tone="gold" d="M29.5 26C36 16 64 16 70.5 26L69 30C62 22 38 22 31 30Z" />
        <Metal ids={ids} d="M31 24C38 13 62 13 69 24C62 18 38 18 31 24Z" />
        <Shaded ids={ids} fill="#b02c2c" d="M46 4C48 3 52 3 54 4L52.5 16H47.5Z" />
      </g>
    ),
  },
  {
    id: "titan",
    name: "Titan",
    blurb: "A giant of hewn stone with fire in its eyes.",
    skin: ["#cdc8be", "#8e8a82", "#4a4743"],
    iris: "#5af0ff",
    brow: "#3a3834",
    eyes: "glow",
    bg: ["#2c3e48", "#04070a"],
    rim: "#5af0ff",
    jaw: "square",
    lips: "#5a5650",
    body: (ids) => (
      <g>
        <Shaded ids={ids} fill="#8a867e" d="M-4 100C-2 74 20 62 40 62H60C80 62 102 74 104 100Z" />
        <path d="M-4 100C-2 74 20 62 40 62H60C80 62 102 74 104 100Z" fill="#000" filter={`url(#${ids.grain})`} />
        <Soft ids={ids} amount={2}>
          <path d="M20 76L30 84L26 96M76 72L70 86L80 96M44 74L50 84L56 74" fill="none" stroke="#5af0ff" strokeWidth="2.6" opacity="0.6" />
        </Soft>
        <path d="M20 76L30 84L26 96M76 72L70 86L80 96M44 74L50 84L56 74" fill="none" stroke="#d8fdff" strokeWidth="0.6" />
      </g>
    ),
    front: (ids) => (
      <g>
        <path d="M31 40C34 38 38 39 40 37M60 37C62 39 66 38 69 40M36 58L42 54M62 52L67 58" stroke="#2a2826" strokeWidth="0.6" fill="none" />
        <Soft ids={ids} amount={1}>
          <path d="M36 58L42 54M62 52L67 58" stroke="#5af0ff" strokeWidth="1.4" opacity="0.7" />
        </Soft>
        <Shaded ids={ids} fill="#6a665f" d="M29 30L33 9L41 22L50 4L59 22L67 9L71 30C62 25 38 25 29 30Z" />
        <path d="M29 30L33 9L41 22L50 4L59 22L67 9L71 30C62 25 38 25 29 30Z" fill="#000" filter={`url(#${ids.grain})`} />
      </g>
    ),
  },
];
