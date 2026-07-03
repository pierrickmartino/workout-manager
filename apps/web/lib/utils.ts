import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui class-name helper: merge conditional classes (clsx) and
// resolve conflicting Tailwind utilities (tailwind-merge) so later classes win.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
