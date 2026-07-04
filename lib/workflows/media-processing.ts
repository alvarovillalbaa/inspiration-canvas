import sharp from "sharp";

import { getConfig, getMissingAiMessage } from "@/lib/config";
import {
  createMediaItem,
  getMediaItem,
  listCanvasMedia,
  updateGenerationRun,
  updateMediaItem,
} from "@/lib/db/repository";
import { MissingAICredentialsError, persistMediaAnalysis } from "@/lib/ai/service";
import { getClusterChildPosition } from "@/lib/canvas/math";
import { buildStorageKey } from "@/lib/media";
import { getStorageAdapter } from "@/lib/storage/adapter";
import type { GenerationRun, MediaItem } from "@/lib/types";

export async function extractImageMetadata(buffer: Buffer): Promise<{
  width: number | null;
  height: number | null;
  thumbnail: Buffer | null;
}> {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const thumbnail = await image
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return {
      width: metadata.width || null,
      height: metadata.height || null,
      thumbnail,
    };
  } catch {
    return { width: null, height: null, thumbnail: null };
  }
}

export async function ingestMedia(mediaId: string): Promise<MediaItem | null> {
  const media = await getMediaItem(mediaId);
  if (!media) return null;

  await updateMediaItem(media.id, {
    analysisStatus: "processing",
    analysisError: null,
  });

  try {
    return await persistMediaAnalysis(media);
  } catch (error) {
    const message =
      error instanceof MissingAICredentialsError
        ? getMissingAiMessage()
        : error instanceof Error
          ? error.message
          : "Media analysis failed.";
    return updateMediaItem(media.id, {
      analysisStatus:
        error instanceof MissingAICredentialsError ? "skipped" : "failed",
      analysisError: message,
    });
  }
}

export async function completeChildGeneration(input: {
  run: GenerationRun;
  parentItems: MediaItem[];
  prompt: string;
  image: { data: Uint8Array; mediaType: string };
}): Promise<MediaItem> {
  const storage = getStorageAdapter();
  const ext = input.image.mediaType.includes("jpeg") ? "jpg" : "png";
  const fileName = `generated-child-${input.run.id}.${ext}`;
  const key = buildStorageKey(fileName);
  const url = await storage.putFile(input.image.data, key, {
    contentType: input.image.mediaType,
  });
  const metadata = await extractImageMetadata(Buffer.from(input.image.data));
  const thumbnailKey = metadata.thumbnail
    ? buildStorageKey(`thumb-${fileName}.webp`)
    : null;
  const thumbnailUrl =
    metadata.thumbnail && thumbnailKey
      ? await storage.putFile(metadata.thumbnail, thumbnailKey, {
          contentType: "image/webp",
        })
      : null;
  const position = getClusterChildPosition(input.parentItems);
  const siblings = await listCanvasMedia(input.run.canvasId);
  const child = await createMediaItem({
    canvasId: input.run.canvasId,
    type: "generated_image",
    url,
    storageDriver: getConfig().storageDriver,
    storageKey: key,
    thumbnailUrl,
    thumbnailStorageKey: thumbnailKey,
    mimeType: input.image.mediaType,
    fileName,
    title: "Generated child media",
    sizeBytes: input.image.data.byteLength,
    intrinsicWidth: metadata.width,
    intrinsicHeight: metadata.height,
    durationSeconds: null,
    x: position.x,
    y: position.y,
    width: 360,
    height: 360,
    zIndex: Math.max(0, ...siblings.map((item) => item.zIndex)) + 1,
    rotation: 0,
    cropJson: null,
    tagsJson: ["generated", "child-media"],
    category: "generated",
    subcategory: "child-media",
    description: input.prompt,
    designAnalysisJson: null,
    analysisStatus: "complete",
    analysisError: null,
    parentIdsJson: input.parentItems.map((item) => item.id),
  });
  await updateGenerationRun(input.run.id, {
    status: "complete",
    resultMediaItemId: child.id,
    error: null,
  });
  return child;
}
