import { describe, expect, it } from "vitest";

import { cropSchema, designMetadataSchema } from "@/lib/ai/schemas";

describe("schemas", () => {
  it("validates design metadata", () => {
    const result = designMetadataSchema.parse({
      tags: ["minimal", "editorial"],
      category: "brand",
      subcategory: "identity",
      description: "Quiet editorial direction.",
      colorPalette: ["#111111"],
      composition: "centered",
      mood: ["calm"],
      styleKeywords: ["restrained"],
      designPrinciples: ["contrast"],
      visualDensity: "low",
      eraReferences: [],
      materialTexture: [],
      confidence: 0.8,
    });
    expect(result.visualDensity).toBe("low");
  });

  it("rejects invalid crop bounds", () => {
    expect(() => cropSchema.parse({ x: 0.8, y: 0, width: 0.4, height: 1 })).toThrow();
  });
});

