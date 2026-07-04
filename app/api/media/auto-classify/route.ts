import { NextResponse } from "next/server";
import type { z } from "zod";

import {
  autoClassifyRequestSchema,
  type mediaContextSchema,
} from "@/lib/ai/schemas";
import {
  analyzeMediaMetadataWithContext,
  createAutoClassificationPatch,
  MissingAICredentialsError,
} from "@/lib/ai/service";
import { getMissingAiMessage } from "@/lib/config";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { getMediaItem, listComments, updateMediaItem } from "@/lib/db/repository";
import {
  getMediaItemForUser,
  listCommentsForUser,
  updateMediaItemForUser,
} from "@/lib/db/supabase-repository";
import type { CommentRecord, DesignAnalysis, MediaItem } from "@/lib/types";

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
  const parsed = autoClassifyRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    if (parsed.data.mediaContext?.length) {
      const results = await Promise.all(
        parsed.data.mediaContext.map(async (context) => {
          const media = mediaFromClientContext(context, parsed.data.canvasId);
          const metadata = await analyzeMediaMetadataWithContext({
            media,
            comments: commentsFromClientContext(context),
            file: context.file,
          });
          const patch = createAutoClassificationPatch(media, metadata);
          return {
            id: media.id,
            mediaId: media.id,
            patch,
            suggestions: metadata,
          };
        }),
      );
      return NextResponse.json({ results, persisted: false });
    }

    const persistence = await getRequestPersistenceContext();
    if (persistence.mode === "error") return persistence.response;

    const results =
      persistence.mode === "supabase"
        ? await Promise.all(
            parsed.data.mediaIds.map(async (id) => {
              const media = await getMediaItemForUser(
                persistence.context.supabase,
                persistence.context.user.id,
                id,
              );
              if (!media) return null;
              const metadata = await analyzeMediaMetadataWithContext({
                media,
                comments: await listCommentsForUser(
                  persistence.context.supabase,
                  persistence.context.user.id,
                  id,
                ),
              });
              const patch = createAutoClassificationPatch(media, metadata);
              const updated = await updateMediaItemForUser(
                persistence.context.supabase,
                persistence.context.user.id,
                id,
                patch,
              );
              return {
                id,
                mediaId: id,
                media: updated,
                patch,
                suggestions: metadata,
              };
            }),
          )
        : await Promise.all(
            parsed.data.mediaIds.map(async (id) => {
              const media = await getMediaItem(id);
              if (!media) return null;
              const metadata = await analyzeMediaMetadataWithContext({
                media,
                comments: await listComments(id),
              });
              const patch = createAutoClassificationPatch(media, metadata);
              const updated = await updateMediaItem(id, patch);
              return {
                id,
                mediaId: id,
                media: updated,
                patch,
                suggestions: metadata,
              };
            }),
          );

    return NextResponse.json({
      results: results.filter((result) => result != null),
      persisted: true,
    });
  } catch (error) {
    if (error instanceof MissingAICredentialsError) {
      return NextResponse.json(
        { error: getMissingAiMessage(), requiresAiCredentials: true },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auto-classify failed." },
      { status: 500 },
    );
  }
}
