import { NextResponse } from "next/server";

import { DEFAULT_CANVAS_ID } from "@/lib/config";
import {
  createMediaItem,
  getOrCreateDefaultCanvas,
  listCanvasMedia,
} from "@/lib/db/repository";
import {
  buildStorageKey,
  getMediaKind,
  validateUploadFile,
} from "@/lib/media";
import { getStorageAdapter } from "@/lib/storage/adapter";
import { extractImageMetadata } from "@/lib/workflows/media-processing";
import { startMediaIngestionRun } from "@/lib/workflows/start";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }
    const canvasId = String(form.get("canvasId") || DEFAULT_CANVAS_ID);
    const x = Number(form.get("x") || 240);
    const y = Number(form.get("y") || 180);
    await getOrCreateDefaultCanvas();
    const validated = await validateUploadFile(file);
    const storage = getStorageAdapter();
    const storageKey = buildStorageKey(validated.safeName);
    const url = await storage.putFile(validated.buffer, storageKey, {
      contentType: validated.mimeType,
    });
    const kind = getMediaKind(validated.mimeType);
    const imageMetadata =
      kind === "image"
        ? await extractImageMetadata(validated.buffer)
        : { width: null, height: null, thumbnail: null };
    const thumbnailStorageKey = imageMetadata.thumbnail
      ? buildStorageKey(`thumb-${validated.safeName}.webp`)
      : null;
    const thumbnailUrl =
      imageMetadata.thumbnail && thumbnailStorageKey
        ? await storage.putFile(imageMetadata.thumbnail, thumbnailStorageKey, {
            contentType: "image/webp",
          })
        : null;
    const siblings = await listCanvasMedia(canvasId);
    const displayWidth =
      imageMetadata.width && imageMetadata.width >= 120
        ? Math.min(420, imageMetadata.width)
        : 360;
    const displayHeight =
      imageMetadata.height && imageMetadata.height >= 100
        ? Math.min(420, imageMetadata.height)
        : 260;
    const media = await createMediaItem({
      canvasId,
      type: kind,
      url,
      storageKey,
      thumbnailUrl,
      thumbnailStorageKey,
      mimeType: validated.mimeType,
      fileName: validated.safeName,
      sizeBytes: validated.buffer.byteLength,
      intrinsicWidth: imageMetadata.width,
      intrinsicHeight: imageMetadata.height,
      durationSeconds: null,
      x: Number.isFinite(x) ? x : 240,
      y: Number.isFinite(y) ? y : 180,
      width: displayWidth,
      height: displayHeight,
      zIndex: Math.max(0, ...siblings.map((item) => item.zIndex)) + 1,
      rotation: 0,
      cropJson: null,
      tagsJson: [],
      category: null,
      subcategory: null,
      description: null,
      designAnalysisJson: null,
      analysisStatus: "pending",
      analysisError: null,
      parentIdsJson: [],
    });
    const workflow = await startMediaIngestionRun(media.id);
    return NextResponse.json({ media, workflow }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 },
    );
  }
}
