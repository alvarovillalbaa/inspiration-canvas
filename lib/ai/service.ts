import { generateText, Output } from "ai";

import { getConfig, getMissingAiMessage, hasAiCredentials } from "@/lib/config";
import {
  createTasteBrief,
  listComments,
  updateMediaItem,
} from "@/lib/db/repository";
import { designMetadataSchema, type DesignMetadataOutput } from "@/lib/ai/schemas";
import type { CommentRecord, MediaItem } from "@/lib/types";

export class MissingAICredentialsError extends Error {
  constructor() {
    super(getMissingAiMessage());
    this.name = "MissingAICredentialsError";
  }
}

export function assertAiAvailable(): void {
  const config = getConfig();
  if (!config.enableAi || !hasAiCredentials()) {
    throw new MissingAICredentialsError();
  }
}

function summarizeMedia(media: MediaItem, comments: CommentRecord[] = []): string {
  const tags = media.tagsJson.length ? media.tagsJson.join(", ") : "none yet";
  const commentText = comments.length
    ? comments.map((comment) => `- ${comment.body}`).join("\n")
    : "No comments.";
  return [
    `ID: ${media.id}`,
    `Type: ${media.type}`,
    `File: ${media.fileName}`,
    `MIME: ${media.mimeType}`,
    `Category: ${media.category || "unknown"} / ${media.subcategory || "unknown"}`,
    `Tags: ${tags}`,
    `Description: ${media.description || "not analyzed yet"}`,
    `Design analysis: ${JSON.stringify(media.designAnalysisJson || {})}`,
    `Comments:\n${commentText}`,
  ].join("\n");
}

export async function analyzeMediaMetadata(media: MediaItem): Promise<DesignMetadataOutput> {
  assertAiAvailable();
  const config = getConfig();
  const { output } = await generateText({
    model: config.aiTextModel,
    output: Output.object({ schema: designMetadataSchema }),
    prompt: [
      "Analyze this visual reference for a moodboard/design-taste canvas.",
      "Return structured metadata only. If the URL is local or not visible, infer cautiously from filename, MIME type, and existing metadata.",
      "",
      summarizeMedia(media),
      `URL: ${media.url}`,
    ].join("\n"),
    providerOptions: {
      gateway: {
        tags: ["feature:media-analysis"],
      },
    },
  });
  return output;
}

export async function persistMediaAnalysis(media: MediaItem): Promise<MediaItem | null> {
  const metadata = await analyzeMediaMetadata(media);
  return updateMediaItem(media.id, {
    tagsJson: metadata.tags,
    category: metadata.category,
    subcategory: metadata.subcategory,
    description: metadata.description,
    designAnalysisJson: {
      colorPalette: metadata.colorPalette,
      composition: metadata.composition,
      mood: metadata.mood,
      styleKeywords: metadata.styleKeywords,
      designPrinciples: metadata.designPrinciples,
      visualDensity: metadata.visualDensity,
      eraReferences: metadata.eraReferences,
      materialTexture: metadata.materialTexture,
      confidence: metadata.confidence,
    },
    analysisStatus: "complete",
    analysisError: null,
  });
}

export async function generateTasteBrief(input: {
  canvasId: string;
  mediaItems: MediaItem[];
}): Promise<string> {
  assertAiAvailable();
  const config = getConfig();
  const commentsByItem = await Promise.all(
    input.mediaItems.map(async (media) => ({
      media,
      comments: await listComments(media.id),
    })),
  );
  const selectionContext = commentsByItem
    .map(({ media, comments }) => summarizeMedia(media, comments))
    .join("\n\n---\n\n");

  const { text } = await generateText({
    model: config.aiTextModel,
    prompt: [
      "Write one cohesive copy-paste creative direction prompt from the selected references.",
      "Synthesize them into a unified taste/design direction. Do not describe each image separately.",
      "Make it useful for brand design, art direction, UI design, or image generation.",
      "Use concise markdown with a short title and 3-5 dense paragraphs or bullets.",
      "",
      selectionContext,
    ].join("\n"),
    providerOptions: {
      gateway: {
        tags: ["feature:taste-brief"],
      },
    },
  });

  await createTasteBrief(
    input.canvasId,
    input.mediaItems.map((item) => item.id),
    text,
  );
  return text;
}

export async function proposeChildMediaPrompt(input: {
  mediaItems: MediaItem[];
  userPrompt?: string;
}): Promise<string> {
  assertAiAvailable();
  const config = getConfig();
  const context = input.mediaItems.map((media) => summarizeMedia(media)).join("\n\n---\n\n");
  const { text } = await generateText({
    model: config.aiTextModel,
    prompt: [
      "Create one image-generation prompt that combines these references into a coherent child image.",
      "Preserve shared taste signals without copying any single parent literally.",
      "Include composition, mood, materials, color, and design language.",
      input.userPrompt ? `User intent: ${input.userPrompt}` : "",
      "",
      context,
    ].join("\n"),
    providerOptions: {
      gateway: {
        tags: ["feature:child-prompt"],
      },
    },
  });
  return text.trim();
}

export async function generateChildImageBytes(prompt: string): Promise<{
  data: Uint8Array;
  mediaType: string;
}> {
  assertAiAvailable();
  const config = getConfig();
  const result = await generateText({
    model: config.aiImageModel,
    prompt,
    providerOptions: {
      gateway: {
        tags: ["feature:child-image"],
      },
    },
  });
  const file = result.files.find((item) => item.mediaType?.startsWith("image/"));
  if (!file) {
    throw new Error("The image model did not return an image file.");
  }
  return {
    data: file.uint8Array,
    mediaType: file.mediaType || "image/png",
  };
}

