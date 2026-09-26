import { taxonomy, exercises } from "./fixtures";
import * as auditOutbox from "@/lib/finish-outbox-store";
import * as auditSync from "@/lib/finish-outbox-sync";

const router = { push: (url: string) => { window.location.href = url; }, refresh: () => {} };
export const useRouter = () => router;
export const usePathname = () => "/train";
export const useSearchParams = () => new URLSearchParams();
export const unstable_rethrow = () => {};
export const useAuth = () => ({ userId: "audit-synthetic-account", isLoaded: true });

type AuditRequest = { id: number; name: string; args: unknown[] };
const requests: AuditRequest[] = [];
const waiting = new Map<number, (value: unknown) => void>();
let controlled = false;
// Explicit opt-in controls, confined to the separate audit server. Production
// imports never resolve to this module. Defaults preserve the layout audit.
export const auditActions = {
  requests,
  control() { controlled = true; },
  resolve(id: number, value: unknown) {
    const complete = waiting.get(id);
    if (!complete) throw new Error(`No pending audit request ${id}`);
    waiting.delete(id);
    complete(value);
  },
};
Object.assign(window, { auditActions, auditOutbox, auditSync });

export function actionResult(name: string, args: unknown[]) {
  if (controlled) {
    const id = requests.length;
    requests.push({ id, name, args });
    return new Promise(resolve => waiting.set(id, resolve));
  }
  if (name === "fetchCatalogTaxonomyForFilters") return { taxonomy, error: null };
  if (name === "searchExerciseLibrary") return { exercises, error: null };
  if (name === "fetchCatalogEntryDetail") {
    const exercise = exercises.find(item => item.id === args[0]) ?? exercises[0];
    return { exercise: { ...exercise, description: "Synthetic coaching text.", instructions: ["Keep movements controlled and comfortable."], alternatives: [] }, records: null, error: null };
  }
  // Never claim a write succeeded: submitting keeps the draft and shows an error.
  return { error: "Audit fixture: writes are disabled." };
}
