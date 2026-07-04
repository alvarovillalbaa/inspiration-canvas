import { generateText, Output, type FilePart, type TextPart } from "ai";

import { getConfig, getMissingAiMessage, hasAiCredentials } from "@/lib/config";
import {
  createTasteBrief,
  listComments,
  updateMediaItem,
} from "@/lib/db/repository";
import { designMetadataSchema, type DesignMetadataOutput } from "@/lib/ai/schemas";
import type { CommentRecord, DesignAnalysis, MediaItem } from "@/lib/types";

export type AiMediaFile = {
  dataUrl: string;
  mediaType: string;
  filename?: string;
};

export type AiMediaContext = {
  media: MediaItem;
  comments?: CommentRecord[];
  file?: AiMediaFile;
};

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

export function summarizeMedia(media: MediaItem, comments: CommentRecord[] = []): string {
  const tags = media.tagsJson.length ? media.tagsJson.join(", ") : "none yet";
  const commentText = comments.length
    ? comments.map((comment) => `- ${comment.body}`).join("\n")
    : "No comments.";
  return [
    `ID: ${media.id}`,
    `Type: ${media.type}`,
    `Title: ${media.title || "untitled"}`,
    `File: ${media.fileName}`,
    `MIME: ${media.mimeType}`,
    `Category: ${media.category || "unknown"} / ${media.subcategory || "unknown"}`,
    `Tags: ${tags}`,
    `Description: ${media.description || "not analyzed yet"}`,
    `Design analysis: ${JSON.stringify(media.designAnalysisJson || {})}`,
    `Comments:\n${commentText}`,
  ].join("\n");
}

function toDesignAnalysis(metadata: DesignMetadataOutput): DesignAnalysis {
  return {
    colorPalette: metadata.colorPalette,
    composition: metadata.composition,
    mood: metadata.mood,
    styleKeywords: metadata.styleKeywords,
    designPrinciples: metadata.designPrinciples,
    visualDensity: metadata.visualDensity,
    eraReferences: metadata.eraReferences,
    materialTexture: metadata.materialTexture,
    confidence: metadata.confidence,
  };
}

function filePart(file: AiMediaFile): FilePart {
  return {
    type: "file",
    mediaType: file.mediaType,
    filename: file.filename,
    data: { type: "url", url: new URL(file.dataUrl) },
  };
}

function mediaContent(
  text: string,
  contexts: AiMediaContext[],
): Array<TextPart | FilePart> {
  const content: Array<TextPart | FilePart> = [{ type: "text", text }];
  for (const context of contexts) {
    if (context.file?.dataUrl && context.file.mediaType.startsWith("image/")) {
      content.push(filePart(context.file));
    }
  }
  return content;
}

export async function analyzeMediaMetadataWithContext(
  context: AiMediaContext,
): Promise<DesignMetadataOutput> {
  assertAiAvailable();
  const config = getConfig();
  const prompt = [
    "Analyze this visual reference for a moodboard/design-taste canvas.",
    "Return structured metadata only. If the image is not visible, infer cautiously from title, filename, MIME type, comments, and existing metadata.",
    "Prefer concrete design vocabulary and concise reusable taxonomy labels.",
    "",
    summarizeMedia(context.media, context.comments),
    `URL: ${context.media.url}`,
  ].join("\n");
  const { output } = await generateText({
    model: config.aiTextModel,
    output: Output.object({ schema: designMetadataSchema }),
    messages: [{ role: "user", content: mediaContent(prompt, [context]) }],
    providerOptions: {
      gateway: {
        tags: ["feature:media-analysis"],
      },
    },
  });
  return output;
}

export async function analyzeMediaMetadata(media: MediaItem): Promise<DesignMetadataOutput> {
  return analyzeMediaMetadataWithContext({ media });
}

export function createAutoClassificationPatch(
  media: MediaItem,
  metadata: DesignMetadataOutput,
): Partial<MediaItem> {
  const patch: Partial<MediaItem> = {
    designAnalysisJson: media.designAnalysisJson || toDesignAnalysis(metadata),
    analysisStatus: "complete",
    analysisError: null,
  };
  const title = metadata.title.trim();
  if (!media.title && title) patch.title = title;
  if (media.tagsJson.length === 0) patch.tagsJson = metadata.tags;
  if (!media.category) patch.category = metadata.category;
  if (!media.subcategory) patch.subcategory = metadata.subcategory;
  if (!media.description) patch.description = metadata.description;
  return patch;
}

export async function persistMediaAnalysis(media: MediaItem): Promise<MediaItem | null> {
  const metadata = await analyzeMediaMetadata(media);
  return updateMediaItem(media.id, {
    title: media.title || metadata.title || null,
    tagsJson: metadata.tags,
    category: metadata.category,
    subcategory: metadata.subcategory,
    description: metadata.description,
    designAnalysisJson: toDesignAnalysis(metadata),
    analysisStatus: "complete",
    analysisError: null,
  });
}

export async function generateTasteBriefText(input: {
  mediaContexts: AiMediaContext[];
}): Promise<string> {
  assertAiAvailable();
  const config = getConfig();
  const selectionContext = input.mediaContexts
    .map(({ media, comments }) => summarizeMedia(media, comments))
    .join("\n\n---\n\n");

  const prompt = [
    "Write one cohesive copy-paste creative direction prompt from the selected references.",
    "Synthesize them into a unified taste/design direction. Do not describe each image separately.",
    "Make it useful for brand design, art direction, UI design, or image generation.",
    "Use concise markdown with a short title and 3-5 dense paragraphs or bullets.",
    "",
    selectionContext,
  ].join("\n");

  const { text } = await generateText({
    model: config.aiTextModel,
    messages: [{ role: "user", content: mediaContent(prompt, input.mediaContexts) }],
    providerOptions: {
      gateway: {
        tags: ["feature:taste-brief"],
      },
    },
  });

  return text;
}

export async function generateTasteBrief(input: {
  canvasId: string;
  mediaItems: MediaItem[];
}): Promise<string> {
  const commentsByItem = await Promise.all(
    input.mediaItems.map(async (media) => ({
      media,
      comments: await listComments(media.id),
    })),
  );
  const text = await generateTasteBriefText({
    mediaContexts: commentsByItem.map(({ media, comments }) => ({ media, comments })),
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
