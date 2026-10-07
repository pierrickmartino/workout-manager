// The one place the app names `lucide-react` (ADR-0092).
//
// Icons are design-system surface, exactly like the components beside them in `pulse/`, but
// they were reached straight from the package at 66 call sites — so the icon set was the one
// part of the design system a component could pick up without going through it. Wrapping,
// restyling, or replacing the set meant touching all 66 files; here it is one.
//
// What this is NOT: a general barrel over `pulse/`. It re-exports *icons*, one package, by
// name — a flat list a bundler can tree-shake and a reviewer can read. The entries are the
// icons the app actually renders; adding one is a line here plus the import at the call
// site. `lib/icon-import-policy.ts` holds the rule, and fails closed, so a new direct
// import of `lucide-react` is caught rather than noticed.
//
// On weight: Next.js rewrites a named `lucide-react` import into the per-icon module
// (`optimizePackageImports`, on by default for this package), and these are pure
// re-exports, so a call site still pays only for the icons it names. Measured across a
// production build when this landed: no change to any route's client chunk weight.

export {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Cable,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Dumbbell,
  Flag,
  Grip,
  GripVertical,
  History,
  Info,
  LayoutGrid,
  LibraryBig,
  LineChart,
  Link2,
  ListChecks,
  Loader2,
  Lock,
  LogOut,
  Minus,
  MoreHorizontal,
  PenLine,
  Pencil,
  PencilLine,
  PencilRuler,
  PersonStanding,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Repeat2,
  RotateCcw,
  Save,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  SkipForward,
  Star,
  StickyNote,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Unlink,
  User,
  Weight,
  WifiOff,
  X,
  Zap,
} from "lucide-react";

// The shape a component takes when it accepts an icon as a prop (`nav-row`, `tab-bar`,
// `sidebar`, `quick-actions`, `equipment-symbol`). Type-only, so it is erased before the
// bundler sees it.
export type { LucideIcon } from "lucide-react";
