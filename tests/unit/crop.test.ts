import { describe, expect, it } from "vitest";

import { getCroppedImageStyle, normalizeCropJson } from "@/lib/canvas/crop";

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
