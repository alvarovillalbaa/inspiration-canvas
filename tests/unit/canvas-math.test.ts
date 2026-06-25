import { describe, expect, it } from "vitest";

import {
  canvasToScreen,
  clampZoom,
  getClusterChildPosition,
  getFitTransform,
  getItemsBounds,
  screenToCanvas,
} from "@/lib/canvas/math";

describe("canvas math", () => {
  it("converts between screen and canvas coordinates", () => {
    const transform = { scale: 2, positionX: 20, positionY: 40 };
    const bounds = { left: 10, top: 15 };
    const canvasPoint = screenToCanvas({ x: 130, y: 255 }, bounds, transform);
    expect(canvasPoint).toEqual({ x: 50, y: 100 });
    expect(canvasToScreen(canvasPoint, bounds, transform)).toEqual({ x: 130, y: 255 });
  });

  it("clamps zoom", () => {
    expect(clampZoom(0.01)).toBe(0.12);
    expect(clampZoom(5)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("calculates bounds and fit transforms", () => {
    const bounds = getItemsBounds([
      { x: 100, y: 100, width: 200, height: 100 },
      { x: 400, y: 300, width: 50, height: 50 },
    ]);
    expect(bounds).toEqual({ x: 100, y: 100, width: 350, height: 250 });
    const fit = getFitTransform(bounds!, { width: 1000, height: 800 }, 100);
    expect(fit.scale).toBeGreaterThan(0);
    expect(Number.isFinite(fit.positionX)).toBe(true);
  });

  it("places generated child media near the selected cluster", () => {
    expect(
      getClusterChildPosition([{ x: 100, y: 100, width: 200, height: 200 }]),
    ).toEqual({ x: 372, y: 100 });
  });
});

