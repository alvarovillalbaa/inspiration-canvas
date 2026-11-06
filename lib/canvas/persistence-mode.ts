export type CanvasAuthState = "checking" | "anonymous" | "authenticated" | "local";

/** A successful canvas response must state which server owns its persistence. */
export function canvasAuthStateForPersistence(value: unknown): "authenticated" | "local" {
  if (value === "supabase") return "authenticated";
  if (value === "local") return "local";
  throw new Error("The canvas persistence mode was not confirmed. Your temporary files are unchanged.");
}

export function usesCanvasServerPersistence(state: CanvasAuthState): boolean {
  return state === "authenticated" || state === "local";
}
