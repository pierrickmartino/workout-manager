import { taxonomy, exercises } from "./fixtures";

const router = { push: (url: string) => { window.location.href = url; }, refresh: () => {} };
export const useRouter = () => router;
export const usePathname = () => "/train";
export const useSearchParams = () => new URLSearchParams();
export const unstable_rethrow = () => {};
export const useAuth = () => ({ userId: "audit-synthetic-account", isLoaded: true });

export function actionResult(name: string, args: unknown[]) {
  if (name === "fetchCatalogTaxonomyForFilters") return { taxonomy, error: null };
  if (name === "searchExerciseLibrary") return { exercises, error: null };
  if (name === "fetchCatalogEntryDetail") {
    const exercise = exercises.find(item => item.id === args[0]) ?? exercises[0];
    return { exercise: { ...exercise, description: "Synthetic coaching text.", instructions: ["Keep movements controlled and comfortable."], alternatives: [] }, records: null, error: null };
  }
  // Never claim a write succeeded: submitting keeps the draft and shows an error.
  return { error: "Audit fixture: writes are disabled." };
}
