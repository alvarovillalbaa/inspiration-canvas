import { describe, expect, it } from "vitest";

import { adjustCrop, getCroppedImageStyle, getCropViewportStyle, normalizeCropJson, type CropHandle } from "@/lib/canvas/crop";

describe("crop helpers", () => {
  it("normalizes valid crop JSON", () => {
    expect(
      normalizeCropJson({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 }),
    ).toEqual({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 });
  });

  it("rejects invalid crop bounds", () => {
    expect(normalizeCropJson({ x: 0.7, y: 0, width: 0.5, height: 1 })).toBeNull();
    expect(normalizeCropJson({ x: 0, y: 0, width: 0, height: 1 })).toBeNull();
    expect(normalizeCropJson(null)).toBeNull();
  });

  it("rejects missing, nonnumeric and nonfinite values in every crop field", () => {
    const valid = { x: 0.2, y: 0.1, width: 0.5, height: 0.7 };
    for (const field of ["x", "y", "width", "height"] as const) {
      const missing: Partial<typeof valid> = { ...valid };
      delete missing[field];
      expect(normalizeCropJson(missing)).toBeNull();
      for (const value of [Number.NaN, Infinity, -Infinity, undefined, null, "0.2"]) {
        expect(normalizeCropJson({ ...valid, [field]: value })).toBeNull();
      }
    }
    expect(normalizeCropJson({})).toBeNull();
    expect(normalizeCropJson([])).toBeNull();
  });

  it("preserves the existing payload and rounded-edge tolerance", () => {
    const crop = { x: 0.5, y: 0.4, width: 0.5005, height: 0.6 };
    expect(normalizeCropJson({ ...crop, unrelated: true })).toEqual(crop);
    expect(normalizeCropJson({ x: 0, y: 0, width: 0.001, height: 0.001 })).toEqual({ x: 0, y: 0, width: 0.001, height: 0.001 });
  });

  it("returns style that zooms and offsets the cropped region", () => {
    expect(
      getCroppedImageStyle({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 }),
    ).toEqual({
      width: "200%",
      height: "125%",
      transform: "translate(-25%, -10%)",
      transformOrigin: "top left",
    });
  });
});

describe("crop viewport", () => {
  it("fits square-source crops into a square frame without clipping the selection", () => {
    expect(getCropViewportStyle({ x: 0.2, y: 0, width: 0.5, height: 1 }, 1, 1)).toEqual({ width: "50%", height: "100%" });
    expect(getCropViewportStyle({ x: 0, y: 0.2, width: 1, height: 0.5 }, 1, 1)).toEqual({ width: "100%", height: "50%" });
  });

  it("includes the source's intrinsic aspect in the selected pixel aspect", () => {
    expect(getCropViewportStyle({ x: 0.2, y: 0, width: 0.5, height: 1 }, 2, 1)).toEqual({ width: "100%", height: "100%" });
    expect(getCropViewportStyle({ x: 0, y: 0, width: 1, height: 1 }, 2, 1)).toEqual({ width: "100%", height: "50%" });
    expect(getCropViewportStyle({ x: 0, y: 0, width: 1, height: 1 }, 1, 2)).toEqual({ width: "50%", height: "100%" });
  });

  it("returns safe full-frame styles for invalid geometry or aspect calculations", () => {
    const full = { x: 0, y: 0, width: 1, height: 1 };
    for (const invalid of [0, -1, Number.NaN, Infinity, -Infinity]) {
      expect(getCropViewportStyle(full, invalid, 1)).toEqual({ width: "100%", height: "100%" });
      expect(getCropViewportStyle(full, 1, invalid)).toEqual({ width: "100%", height: "100%" });
    }
    expect(getCropViewportStyle({ ...full, width: Number.NaN }, 1, 1)).toEqual({ width: "100%", height: "100%" });
    expect(getCropViewportStyle({ ...full, height: Number.MIN_VALUE }, Number.MAX_VALUE, 1)).toEqual({ width: "100%", height: "100%" });
    expect(getCropViewportStyle({ ...full, width: Number.MIN_VALUE }, Number.MIN_VALUE, 1)).toEqual({ width: "100%", height: "100%" });
  });

  it("keeps finite positive dimensions within the frame while preserving selected pixel aspect", () => {
    for (const crop of [
      { x: 0.1, y: 0.2, width: 0.7, height: 0.5 },
      { x: 0.2, y: 0.3, width: 0.001, height: 0.005 },
    ]) {
      for (const sourceAspect of [0.25, 1, 16 / 9, 4]) {
        for (const frameAspect of [0.5, 1, 3]) {
          const style = getCropViewportStyle(crop, sourceAspect, frameAspect);
          const width = Number.parseFloat(style.width), height = Number.parseFloat(style.height);
          expect(Number.isFinite(width) && width > 0 && width <= 100).toBe(true);
          expect(Number.isFinite(height) && height > 0 && height <= 100).toBe(true);
          expect(Math.max(width, height)).toBe(100);
          expect(frameAspect * width / height).toBeCloseTo(sourceAspect * crop.width / crop.height, 12);
        }
      }
    }
  });
});

describe("crop gestures", () => {
  const start = { x: 0.2, y: 0.3, width: 0.4, height: 0.5 };
  const near = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 12);

  it("moves with normalized deltas while keeping both dimensions", () => {
    const moved = adjustCrop(start, "move", 0.1, -0.1);
    near(moved.x, 0.3); near(moved.y, 0.2);
    expect(moved.width).toBe(start.width); expect(moved.height).toBe(start.height);
  });

  it("clamps movement at all four image boundaries", () => {
    expect(adjustCrop(start, "move", -10, -10)).toEqual({ ...start, x: 0, y: 0 });
    const moved = adjustCrop(start, "move", 10, 10);
    near(moved.x, 0.6); near(moved.y, 0.5);
    expect(moved.width).toBe(start.width); expect(moved.height).toBe(start.height);
  });

  it("resizes each single edge without moving its opposite edge", () => {
    const east = adjustCrop(start, "e", 0.1, 1);
    near(east.width, 0.5); expect(east.x).toBe(start.x); expect(east.height).toBe(start.height);
    const west = adjustCrop(start, "w", 0.1, 1);
    near(west.x, 0.3); near(west.width, 0.3); near(west.x + west.width, start.x + start.width);
    expect(west.y).toBe(start.y); expect(west.height).toBe(start.height);
    const south = adjustCrop(start, "s", 1, -0.1);
    near(south.height, 0.4); expect(south.y).toBe(start.y); expect(south.width).toBe(start.width);
    const north = adjustCrop(start, "n", 1, 0.1);
    near(north.y, 0.4); near(north.height, 0.4); near(north.y + north.height, start.y + start.height);
    expect(north.x).toBe(start.x); expect(north.width).toBe(start.width);
  });

  it("cannot cross the opposite edge when shrinking from any side", () => {
    for (const [handle, dx, dy] of [["e", -10, 0], ["w", 10, 0], ["n", 0, 10], ["s", 0, -10]] as const) {
      const crop = adjustCrop(start, handle, dx, dy);
      expect(crop.width).toBeGreaterThanOrEqual(0.02); expect(crop.height).toBeGreaterThanOrEqual(0.02);
      if (handle === "e" || handle === "w") expect(crop.width).toBe(0.02);
      else expect(crop.height).toBe(0.02);
      if (handle === "w") near(crop.x + crop.width, start.x + start.width);
      if (handle === "n") near(crop.y + crop.height, start.y + start.height);
    }
  });

  it("keeps all four corners anchored while resizing diagonally", () => {
    for (const handle of ["ne", "nw", "se", "sw"] as const) {
      const crop = adjustCrop(start, handle, 0.1, -0.1);
      if (handle.includes("w")) near(crop.x + crop.width, start.x + start.width);
      else expect(crop.x).toBe(start.x);
      if (handle.includes("n")) near(crop.y + crop.height, start.y + start.height);
      else expect(crop.y).toBe(start.y);
      near(crop.width, handle.includes("w") ? 0.3 : 0.5);
      near(crop.height, handle.includes("n") ? 0.6 : 0.4);
    }
  });

  it("bounds expansion and diagonal crossing at the image and minimum dimensions", () => {
    const expanded = adjustCrop(start, "nw", -100, -100);
    expect(expanded.x).toBe(0); expect(expanded.y).toBe(0);
    near(expanded.width, 0.6); near(expanded.height, 0.8);
    const crossed = adjustCrop(start, "se", -100, -100);
    expect(crossed).toEqual({ ...start, width: 0.02, height: 0.02 });
    const full = adjustCrop({ x: 0, y: 0, width: 1, height: 1 }, "se", 100, 100);
    expect(full).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("ignores nonfinite gesture axes independently and never mutates its input", () => {
    const crop = Object.freeze({ ...start });
    expect(adjustCrop(crop, "move", Number.NaN, Infinity)).toEqual(start);
    const changed = adjustCrop(crop, "se", Number.NaN, -0.1);
    expect(changed.width).toBe(start.width); near(changed.height, 0.4);
    const moved = adjustCrop(crop, "move", 0.1, -Infinity);
    near(moved.x, 0.3); expect(moved.y).toBe(start.y); expect(crop).toEqual(start);
  });

  it("falls back to the full image only for invalid initial geometry", () => {
    expect(adjustCrop({ ...start, x: Number.NaN }, "move", 0, 0)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("preserves valid tiny crops and rounded-edge geometry for every no-op handle", () => {
    for (const crop of [
      { x: 0.999, y: 0.995, width: 0.001, height: 0.005 },
      { x: 0.5, y: 0.4, width: 0.5005, height: 0.6 },
    ]) {
      for (const handle of ["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"] as const) {
        expect(adjustCrop(crop, handle, 0, 0)).toEqual(crop);
        expect(adjustCrop(crop, handle, Number.NaN, Infinity)).toEqual(crop);
      }
    }
  });

  it("moves tiny crops without expanding either dimension, including at image edges", () => {
    const tiny = { x: 0.2, y: 0.3, width: 0.001, height: 0.005 };
    for (const [dx, dy] of [[0.1, -0.1], [-10, -10], [10, 10]]) {
      const moved = adjustCrop(tiny, "move", dx, dy);
      expect(moved.width).toBe(tiny.width); expect(moved.height).toBe(tiny.height);
      near(moved.x, Math.max(0, Math.min(1 - tiny.width, tiny.x + dx)));
      near(moved.y, Math.max(0, Math.min(1 - tiny.height, tiny.y + dy)));
    }
  });

  it("keeps the unrelated axis unchanged when resizing a crop with a tiny dimension", () => {
    const tiny = { x: 0.2, y: 0.3, width: 0.001, height: 0.005 };
    for (const handle of ["e", "w"] as const) {
      const crop = adjustCrop(tiny, handle, 0.1, 0.1);
      expect(crop.y).toBe(tiny.y); expect(crop.height).toBe(tiny.height);
    }
    for (const handle of ["n", "s"] as const) {
      const crop = adjustCrop(tiny, handle, 0.1, 0.1);
      expect(crop.x).toBe(tiny.x); expect(crop.width).toBe(tiny.width);
    }
  });

  it("lets tiny crops expand but never shrink below their starting size on either axis", () => {
    const tiny = { x: 0.2, y: 0.3, width: 0.001, height: 0.005 };
    const expanded = adjustCrop(tiny, "se", 0.1, 0.1);
    near(expanded.width, 0.101); near(expanded.height, 0.105);
    for (const [handle, dx, dy] of [["e", -10, 0], ["w", 10, 0], ["n", 0, 10], ["s", 0, -10], ["nw", 10, 10], ["se", -10, -10]] as const) {
      const crop = adjustCrop(tiny, handle, dx, dy);
      expect(crop.width).toBe(tiny.width); expect(crop.height).toBe(tiny.height);
      near(crop.x, tiny.x); near(crop.y, tiny.y);
    }
  });

  it("keeps repeated mixed gestures within bounds instead of accumulating edge overflow", () => {
    let crop = { ...start };
    const handles: CropHandle[] = ["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"];
    for (let step = 0; step < 180; step++) {
      crop = adjustCrop(crop, handles[step % handles.length], ((step % 7) - 3) / 8, ((step % 5) - 2) / 6);
      expect(Object.values(crop).every(Number.isFinite)).toBe(true);
      expect(crop.x).toBeGreaterThanOrEqual(0); expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.width).toBeGreaterThanOrEqual(0.02); expect(crop.height).toBeGreaterThanOrEqual(0.02);
      expect(crop.x + crop.width).toBeLessThanOrEqual(1.000000000001);
      expect(crop.y + crop.height).toBeLessThanOrEqual(1.000000000001);
    }
  });
});
