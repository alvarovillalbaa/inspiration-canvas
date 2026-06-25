import { z } from "zod";

export const designMetadataSchema = z.object({
  tags: z.array(z.string()).default([]),
  category: z.string().default("uncategorized"),
  subcategory: z.string().default("general"),
  description: z.string().default(""),
  colorPalette: z.array(z.string()).default([]),
  composition: z.string().default(""),
  mood: z.array(z.string()).default([]),
  styleKeywords: z.array(z.string()).default([]),
  designPrinciples: z.array(z.string()).default([]),
  visualDensity: z.enum(["low", "medium", "high"]).default("medium"),
  eraReferences: z.array(z.string()).default([]),
  materialTexture: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.3),
});

export type DesignMetadataOutput = z.infer<typeof designMetadataSchema>;

export const cropSchema = z
  .object({
    x: z.number().min(0).max(1).default(0),
    y: z.number().min(0).max(1).default(0),
    width: z.number().min(0.01).max(1).default(1),
    height: z.number().min(0.01).max(1).default(1),
  })
  .refine((value) => value.x + value.width <= 1.001, {
    message: "Crop width exceeds image bounds.",
  })
  .refine((value) => value.y + value.height <= 1.001, {
    message: "Crop height exceeds image bounds.",
  });

export const tasteBriefRequestSchema = z.object({
  canvasId: z.string().min(1),
  mediaIds: z.array(z.string().min(1)).min(1),
});

export const childGenerationRequestSchema = z.object({
  canvasId: z.string().min(1),
  mediaIds: z.array(z.string().min(1)).min(2),
  prompt: z.string().max(4000).optional(),
});

export const mediaPatchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(24).optional(),
  height: z.number().min(24).optional(),
  zIndex: z.number().int().optional(),
  rotation: z.number().optional(),
  cropJson: cropSchema.nullable().optional(),
  tagsJson: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  analysisStatus: z
    .enum(["pending", "processing", "complete", "failed", "skipped"])
    .optional(),
  analysisError: z.string().nullable().optional(),
});

