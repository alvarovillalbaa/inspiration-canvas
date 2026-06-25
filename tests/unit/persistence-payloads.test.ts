import { describe, expect, it } from "vitest";

import { mediaPatchSchema } from "@/lib/ai/schemas";

describe("persistence payload validation", () => {
  it("accepts drag persistence fields", () => {
    const patch = mediaPatchSchema.parse({ x: 120.5, y: 220.75 });
    expect(patch).toEqual({ x: 120.5, y: 220.75 });
  });

  it("accepts resize persistence fields", () => {
    const patch = mediaPatchSchema.parse({ width: 420, height: 315 });
    expect(patch).toEqual({ width: 420, height: 315 });
  });

  it("accepts crop JSON persistence", () => {
    const patch = mediaPatchSchema.parse({
      cropJson: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
    });
    expect(patch.cropJson).toEqual({ x: 0.1, y: 0.2, width: 0.7, height: 0.6 });
  });

  it("accepts child media parent lineage", () => {
    const patch = mediaPatchSchema.parse({
      tagsJson: ["generated"],
    });
    expect(patch.tagsJson).toEqual(["generated"]);
  });
});

