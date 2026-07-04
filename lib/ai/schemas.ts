import { z } from "zod";

export const designMetadataSchema = z.object({
  title: z.string().default(""),
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
  mediaContext: z.array(z.lazy(() => mediaContextSchema)).optional(),
});

export const childGenerationRequestSchema = z.object({
  canvasId: z.string().min(1),
  mediaIds: z.array(z.string().min(1)).min(2),
  prompt: z.string().max(4000).optional(),
});

export const mediaContextSchema = z.object({
  id: z.string().min(1),
  canvasId: z.string().optional(),
  type: z.enum(["image", "video", "generated_image", "generated_video"]),
  url: z.string().optional(),
  storageDriver: z.enum(["local", "blob", "supabase"]).optional(),
  storageKey: z.string().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  thumbnailStorageKey: z.string().nullable().optional(),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  title: z.string().nullable().optional(),
  sizeBytes: z.number().nonnegative().optional(),
  intrinsicWidth: z.number().nullable().optional(),
  intrinsicHeight: z.number().nullable().optional(),
  durationSeconds: z.number().nullable().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  zIndex: z.number().int().optional(),
  rotation: z.number().optional(),
  cropJson: z.record(z.string(), z.unknown()).nullable().optional(),
  tagsJson: z.array(z.string()).default([]),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  designAnalysisJson: z.record(z.string(), z.unknown()).nullable().optional(),
  analysisStatus: z
    .enum(["pending", "processing", "complete", "failed", "skipped"])
    .optional(),
  analysisError: z.string().nullable().optional(),
  parentIdsJson: z.array(z.string()).default([]),
  comments: z
    .array(
      z.object({
        id: z.string().min(1),
        mediaItemId: z.string().min(1),
        body: z.string().min(1),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    )
    .default([]),
  file: z
    .object({
      dataUrl: z.string().max(8_000_000),
      mediaType: z.string().min(1),
      filename: z.string().optional(),
    })
    .optional(),
});

export const autoClassifyRequestSchema = z.object({
  canvasId: z.string().min(1),
  mediaIds: z.array(z.string().min(1)).min(1),
  mediaContext: z.array(mediaContextSchema).optional(),
});

export const mediaPatchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(24).optional(),
  height: z.number().min(24).optional(),
  zIndex: z.number().int().optional(),
  rotation: z.number().optional(),
  cropJson: cropSchema.nullable().optional(),
  title: z.string().trim().max(160).nullable().optional(),
  tagsJson: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  analysisStatus: z
    .enum(["pending", "processing", "complete", "failed", "skipped"])
    .optional(),
  analysisError: z.string().nullable().optional(),
});
