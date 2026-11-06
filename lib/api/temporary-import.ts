import { createHash } from "node:crypto";

import { z } from "zod";

import { cropSchema } from "@/lib/ai/schemas";
import type { CreateSupabaseMediaInput } from "@/lib/db/supabase-repository";
import { getMediaKind, validateUploadFile } from "@/lib/media";
import type { StorageAdapter } from "@/lib/storage/adapter";
import type { CanvasRecord, CommentRecord, MediaItem } from "@/lib/types";

export const MAX_TEMPORARY_IMPORT_JSON_BYTES = 262144;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const commentSchema = z.strictObject({
  sourceId: z.string().regex(new RegExp(`^temp-comment-${uuid}$`, "i")),
  body: z.string().trim().min(1).max(10000),
});
const itemSchema = z.strictObject({
  sourceId: z.string().regex(new RegExp(`^temp-${uuid}$`, "i")),
  title: z.string().trim().max(160).nullable(),
  x: z.number().finite().min(-1000000).max(1000000),
  y: z.number().finite().min(-1000000).max(1000000),
  width: z.number().finite().min(24).max(1000000),
  height: z.number().finite().min(24).max(1000000),
  zIndex: z.number().int().min(-2147483648).max(2147483647),
  rotation: z.number().finite().min(-360000).max(360000),
  cropJson: cropSchema.strict().nullable(),
  tagsJson: z.array(z.string().max(1000)).max(500),
  category: z.string().max(1000).nullable(),
  subcategory: z.string().max(1000).nullable(),
  description: z.string().max(10000).nullable(),
  comments: z.array(commentSchema).max(500),
});

export type TemporaryImportItem = z.infer<typeof itemSchema>;
export class TemporaryImportError extends Error {
  constructor(public readonly status: 400 | 404 | 409, public readonly code: string) {
    super(code);
    this.name = "TemporaryImportError";
  }
}

export function parseTemporaryImportItem(raw: unknown): TemporaryImportItem {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success || (parsed.success && new Set(parsed.data.comments.map((comment) => comment.sourceId)).size !== parsed.data.comments.length)) {
    throw new TemporaryImportError(400, "invalid_temporary_item");
  }
  return parsed.data;
}

export type TemporaryImportDependencies = {
  getCanvas(canvasId: string): Promise<CanvasRecord | null>;
  getMedia(mediaId: string): Promise<MediaItem | null>;
  createMedia(input: CreateSupabaseMediaInput): Promise<MediaItem>;
  getComment(commentId: string): Promise<CommentRecord | null>;
  createComment(mediaId: string, body: string, commentId: string): Promise<CommentRecord>;
  storage: Pick<StorageAdapter, "putFile">;
  storageDriver: "supabase" | "blob";
  extractImageMetadata(buffer: Buffer): Promise<{ width: number | null; height: number | null; thumbnail: Buffer | null }>;
};
export type TemporaryImportResult = {
  sourceId: string;
  canvasId: string;
  media: MediaItem;
  comments: Array<{ sourceId: string; comment: CommentRecord }>;
};

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function uniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function importTemporaryCanvasItem(
  input: { userId: string; canvasId: string; file: File; item: unknown },
  dependencies: TemporaryImportDependencies,
): Promise<TemporaryImportResult> {
  const item = parseTemporaryImportItem(input.item);
  if (!/^[0-9a-z-]{1,128}$/i.test(input.userId) || !input.canvasId || input.canvasId.length > 200) {
    throw new TemporaryImportError(400, "invalid_import_destination");
  }
  const canvas = await dependencies.getCanvas(input.canvasId);
  if (!canvas || canvas.id !== input.canvasId) {
    throw new TemporaryImportError(404, "canvas_not_found");
  }
  let validated: Awaited<ReturnType<typeof validateUploadFile>>;
  try {
    validated = await validateUploadFile(input.file);
  } catch {
    throw new TemporaryImportError(400, "invalid_import_file");
  }
  const mediaId = `temporary-import-${hash(JSON.stringify(["temporary-import-media-v1", input.userId, input.canvasId, item.sourceId]))}`;
  const fingerprint = hash(JSON.stringify({
    version: 1,
    fileSha256: hash(validated.buffer),
    fileBytes: validated.buffer.length,
    fileName: validated.safeName,
    mimeType: validated.mimeType,
    item,
  }));
  const prefix = `${input.userId}/temporary-import/${mediaId}/${fingerprint}`;
  const storageKey = `${prefix}/original/${validated.safeName}`;
  const verifyMedia = (media: MediaItem): MediaItem => {
    if (media.id !== mediaId || media.canvasId !== input.canvasId || media.userId !== input.userId
      || media.storageKey !== storageKey) {
      throw new TemporaryImportError(409, "temporary_import_conflict");
    }
    return media;
  };
  let media = await dependencies.getMedia(mediaId);
  if (media) {
    verifyMedia(media);
  } else {
    const kind = getMediaKind(validated.mimeType);
    const image = kind === "image"
      ? await dependencies.extractImageMetadata(validated.buffer)
      : { width: null, height: null, thumbnail: null };
    const url = await dependencies.storage.putFile(validated.buffer, storageKey, { contentType: validated.mimeType });
    const thumbnailStorageKey = image.thumbnail ? `${prefix}/thumbnail.webp` : null;
    const thumbnailUrl = image.thumbnail && thumbnailStorageKey
      ? await dependencies.storage.putFile(image.thumbnail, thumbnailStorageKey, { contentType: "image/webp" })
      : null;
    try {
      media = await dependencies.createMedia({
        id: mediaId, canvasId: input.canvasId, type: kind, url,
        storageDriver: dependencies.storageDriver, storageKey, thumbnailUrl, thumbnailStorageKey,
        mimeType: validated.mimeType, fileName: validated.safeName, sizeBytes: validated.buffer.length,
        intrinsicWidth: image.width, intrinsicHeight: image.height, durationSeconds: null,
        title: item.title, x: item.x, y: item.y, width: item.width, height: item.height,
        zIndex: item.zIndex, rotation: item.rotation, cropJson: item.cropJson, tagsJson: item.tagsJson,
        category: item.category, subcategory: item.subcategory, description: item.description,
        designAnalysisJson: null, analysisStatus: "skipped", analysisError: null, parentIdsJson: [],
      });
    } catch (error) {
      if (!uniqueViolation(error)) throw error;
      media = await dependencies.getMedia(mediaId);
      if (!media) throw new TemporaryImportError(409, "temporary_import_conflict");
    }
    verifyMedia(media);
  }
  const comments: TemporaryImportResult["comments"] = [];
  for (const source of item.comments) {
    const commentId = `temporary-import-comment-${hash(JSON.stringify(["temporary-import-comment-v1", input.userId, mediaId, source.sourceId]))}`;
    let comment = await dependencies.getComment(commentId);
    if (!comment) {
      try {
        comment = await dependencies.createComment(mediaId, source.body, commentId);
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        comment = await dependencies.getComment(commentId);
        if (!comment) throw new TemporaryImportError(409, "temporary_import_conflict");
      }
    }
    if (comment.id !== commentId || comment.mediaItemId !== mediaId || comment.body !== source.body) {
      throw new TemporaryImportError(409, "temporary_import_conflict");
    }
    comments.push({ sourceId: source.sourceId, comment });
  }
  return { sourceId: item.sourceId, canvasId: input.canvasId, media, comments };
}
