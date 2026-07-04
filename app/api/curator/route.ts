import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mediaContextSchema } from "@/lib/ai/schemas";
import { assertAiAvailable, MissingAICredentialsError, summarizeMedia } from "@/lib/ai/service";
import { getConfig, getMissingAiMessage } from "@/lib/config";
import type { CommentRecord, DesignAnalysis, MediaItem } from "@/lib/types";

const curatorRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
  canvas: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  selectedIds: z.array(z.string()).default([]),
  mediaContext: z.array(mediaContextSchema).default([]),
});

function mediaFromClientContext(
  input: z.infer<typeof mediaContextSchema>,
  canvasId: string,
): MediaItem {
  const timestamp = new Date().toISOString();
  return {
    id: input.id,
    canvasId: input.canvasId || canvasId,
    userId: null,
    type: input.type,
    url: input.url || "",
    storageDriver: input.storageDriver || "local",
    storageKey: input.storageKey || input.id,
    thumbnailUrl: input.thumbnailUrl ?? null,
    thumbnailStorageKey: input.thumbnailStorageKey ?? null,
    mimeType: input.mimeType,
    fileName: input.fileName,
    title: input.title ?? null,
    sizeBytes: input.sizeBytes || 0,
    intrinsicWidth: input.intrinsicWidth ?? null,
    intrinsicHeight: input.intrinsicHeight ?? null,
    durationSeconds: input.durationSeconds ?? null,
    x: input.x || 0,
    y: input.y || 0,
    width: input.width || 360,
    height: input.height || 260,
    zIndex: input.zIndex || 0,
    rotation: input.rotation || 0,
    cropJson: input.cropJson || null,
    tagsJson: input.tagsJson,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    description: input.description ?? null,
    designAnalysisJson: (input.designAnalysisJson as DesignAnalysis | null) || null,
    analysisStatus: input.analysisStatus || "skipped",
    analysisError: input.analysisError ?? null,
    parentIdsJson: input.parentIdsJson,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function POST(request: Request) {
  const parsed = curatorRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    assertAiAvailable();
    const config = getConfig();
    const canvasId = parsed.data.canvas?.id || "temporary-canvas";
    const selection = parsed.data.mediaContext
      .filter((media) => parsed.data.selectedIds.includes(media.id))
      .map((context) =>
        summarizeMedia(
          mediaFromClientContext(context, canvasId),
          context.comments as CommentRecord[],
        ),
      )
      .join("\n\n---\n\n");
    const inventory = parsed.data.mediaContext
      .map((media) => {
        const title = media.title || media.fileName;
        const category = media.category || "uncategorized";
        const tags = media.tagsJson.length ? media.tagsJson.join(", ") : "no tags";
        return `- ${title} (${media.id}): ${category}; ${tags}`;
      })
      .join("\n");

    const result = streamText({
      model: config.aiTextModel,
      system: [
        "You are Curator, the agentic design-taste assistant for inspiration-canvas.",
        "You help users cluster references, refine categories and tags, write design direction, and identify better arrangements.",
        "Be concise, concrete, and operational. Prefer specific visual vocabulary over generic adjectives.",
        "Do not claim to have changed the canvas. When recommending metadata or layout changes, present them as proposals the user can apply.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `Canvas: ${parsed.data.canvas?.name || "Untitled inspiration canvas"} (${canvasId})`,
            `Selected media IDs: ${parsed.data.selectedIds.join(", ") || "none"}`,
            "",
            "Selected media detail:",
            selection || "No selected media detail.",
            "",
            "Canvas inventory:",
            inventory || "No media yet.",
          ].join("\n"),
        },
        ...(await convertToModelMessages(parsed.data.messages)),
      ],
      providerOptions: {
        gateway: {
          tags: ["feature:curator-chat"],
        },
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) =>
        error instanceof Error ? error.message : "Curator response failed.",
    });
  } catch (error) {
    if (error instanceof MissingAICredentialsError) {
      return NextResponse.json(
        { error: getMissingAiMessage(), requiresAiCredentials: true },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Curator response failed." },
      { status: 500 },
    );
  }
}
