import { describe, expect, it } from "vitest";

import {
  canvasAuthStateForPersistence,
  usesCanvasServerPersistence,
} from "@/lib/canvas/persistence-mode";

describe("canvas persistence mode", () => {
  it("uses local server persistence without claiming Supabase authentication", () => {
    const state = canvasAuthStateForPersistence("local");
    expect(state).toBe("local");
    expect(usesCanvasServerPersistence(state)).toBe(true);
    expect(state).not.toBe("authenticated");
  });

  it("keeps confirmed Supabase persistence authenticated", () => {
    const state = canvasAuthStateForPersistence("supabase");
    expect(state).toBe("authenticated");
    expect(usesCanvasServerPersistence(state)).toBe(true);
  });

  it("keeps checking and anonymous canvases on temporary operations", () => {
    expect(usesCanvasServerPersistence("checking")).toBe(false);
    expect(usesCanvasServerPersistence("anonymous")).toBe(false);
  });

  it("rejects missing or ambiguous successful-response modes instead of claiming persistence", () => {
    for (const value of [undefined, null, true, "", "postgres", "authenticated", {}, { persistence: "local" }]) {
      expect(() => canvasAuthStateForPersistence(value)).toThrow("not confirmed");
    }
  });
});
