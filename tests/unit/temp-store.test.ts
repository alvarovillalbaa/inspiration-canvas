import { describe, expect, it } from "vitest";

import {
  TEMP_CANVAS_TTL_MS,
  createEmptyTempCanvasState,
  isTempSessionExpired,
} from "@/lib/canvas/temp-store";

describe("temporary canvas store", () => {
  it("creates a four hour anonymous canvas session", () => {
    const startedAt = new Date("2026-06-26T12:00:00.000Z").getTime();
    const state = createEmptyTempCanvasState(startedAt);

    expect(state.canvas.id).toBe("temporary-canvas");
    expect(state.expiresAt).toBe(startedAt + TEMP_CANVAS_TTL_MS);
    expect(isTempSessionExpired(state.expiresAt, startedAt + TEMP_CANVAS_TTL_MS - 1)).toBe(false);
    expect(isTempSessionExpired(state.expiresAt, startedAt + TEMP_CANVAS_TTL_MS)).toBe(true);
  });
});
