import { NextResponse } from "next/server";

import { getMissingAiMessage } from "@/lib/config";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { tasteBriefRequestSchema, type mediaContextSchema } from "@/lib/ai/schemas";
import {
  generateTasteBriefText,
  MissingAICredentialsError,
} from "@/lib/ai/service";
import { createTasteBrief, getMediaItem, listComments } from "@/lib/db/repository";
import {
  createTasteBriefForUser,
  getMediaItemForUser,
  listCommentsForUser,
} from "@/lib/db/supabase-repository";
import type { CommentRecord, DesignAnalysis, MediaItem } from "@/lib/types";
import type { z } from "zod";

type ClientMediaContext = z.infer<typeof mediaContextSchema>;

function mediaFromClientContext(input: ClientMediaContext, canvasId: string): MediaItem {
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

function commentsFromClientContext(input: ClientMediaContext): CommentRecord[] {
  const timestamp = new Date().toISOString();
  return input.comments.map((comment) => ({
    ...comment,
    createdAt: comment.createdAt || timestamp,
    updatedAt: comment.updatedAt || comment.createdAt || timestamp,
  }));
}

export async function POST(request: Request) {
  const parsed = tasteBriefRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  if (parsed.data.mediaContext?.length) {
    try {
      const text = await generateTasteBriefText({
        mediaContexts: parsed.data.mediaContext.map((context) => ({
          media: mediaFromClientContext(context, parsed.data.canvasId),
          comments: commentsFromClientContext(context),
          file: context.file,
        })),
      });
      return NextResponse.json({ text, persisted: false });
    } catch (error) {
      if (error instanceof MissingAICredentialsError) {
        return NextResponse.json(
          { error: getMissingAiMessage(), requiresAiCredentials: true },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Taste brief failed." },
        { status: 500 },
      );
    }
  }

  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  const mediaContexts =
    persistence.mode === "supabase"
      ? (
          await Promise.all(
            parsed.data.mediaIds.map(async (id) => {
              const media = await getMediaItemForUser(
                persistence.context.supabase,
                persistence.context.user.id,
                id,
              );
              return media
                ? {
                    media,
                    comments: await listCommentsForUser(
                      persistence.context.supabase,
                      persistence.context.user.id,
                      id,
                    ),
                  }
                : null;
            }),
          )
        ).filter((item) => item != null)
      : (
          await Promise.all(
            parsed.data.mediaIds.map(async (id) => {
              const media = await getMediaItem(id);
              return media ? { media, comments: await listComments(id) } : null;
            }),
          )
        ).filter((item) => item != null);
  const mediaItems = mediaContexts.map(({ media }) => media);
  if (mediaItems.length === 0) {
    return NextResponse.json({ error: "No selected media found." }, { status: 404 });
  }
  try {
    const text = await generateTasteBriefText({
      mediaContexts,
    });
    if (persistence.mode === "supabase") {
      await createTasteBriefForUser(
        persistence.context.supabase,
        persistence.context.user.id,
        parsed.data.canvasId,
        mediaItems.map((item) => item.id),
        text,
      );
    } else {
      await createTasteBrief(
        parsed.data.canvasId,
        mediaItems.map((item) => item.id),
        text,
      );
    }
    return NextResponse.json({ text, persisted: true });
  } catch (error) {
    if (error instanceof MissingAICredentialsError) {
      return NextResponse.json(
        { error: getMissingAiMessage(), requiresAiCredentials: true },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Taste brief failed." },
      { status: 500 },
    );
  }
}
