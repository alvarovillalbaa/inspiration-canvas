import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyTempCanvasState, markTempCanvasTransferred, saveTempCanvasState,
  wasTempCanvasTransferred,
} from "@/lib/canvas/temp-store";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("window", { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe("temporary transfer recovery receipt", () => {
  it("keeps the original recovery state and expiry, scoped to one destination", () => {
    const source = createEmptyTempCanvasState(123);
    saveTempCanvasState(source);
    const original = storage.get("inspiration-canvas:temporary-state");
    markTempCanvasTransferred(source, "account-canvas");
    expect(storage.get("inspiration-canvas:temporary-state")).toBe(original);
    expect(source.expiresAt).toBe(123 + 4 * 60 * 60 * 1000);
    expect(wasTempCanvasTransferred(source, "account-canvas")).toBe(true);
    expect(wasTempCanvasTransferred(source, "another-canvas")).toBe(false);
  });

  it("does not hide later or concurrent local edits", () => {
    const original = createEmptyTempCanvasState(123);
    const edited = { ...original, canvas: { ...original.canvas, name: "A later edit" } };
    saveTempCanvasState(edited);
    const recovery = storage.get("inspiration-canvas:temporary-state");
    markTempCanvasTransferred(original, "account-canvas");
    expect(storage.get("inspiration-canvas:temporary-state")).toBe(recovery);
    expect(wasTempCanvasTransferred(edited, "account-canvas")).toBe(false);
  });

  it("treats a missing or corrupt receipt as pending", () => {
    const source = createEmptyTempCanvasState(123);
    expect(wasTempCanvasTransferred(source, "account-canvas")).toBe(false);
    storage.set("inspiration-canvas:temporary-transfer-receipt", "{broken");
    expect(wasTempCanvasTransferred(source, "account-canvas")).toBe(false);
  });
});
