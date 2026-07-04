import { NextResponse } from "next/server";

import { DEFAULT_CANVAS_ID, getConfig } from "@/lib/config";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import {
  createMediaItem,
  getOrCreateDefaultCanvas,
  listCanvasMedia,
} from "@/lib/db/repository";
import {
  createMediaItemForUser,
  getOrCreateDefaultCanvasForUser,
  listCanvasMediaForUser,
} from "@/lib/db/supabase-repository";
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
    const persistence = await getRequestPersistenceContext();
    if (persistence.mode === "error") return persistence.response;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }
    let canvasId = String(form.get("canvasId") || DEFAULT_CANVAS_ID);
    const x = Number(form.get("x") || 240);
    const y = Number(form.get("y") || 180);
    const validated = await validateUploadFile(file);

    if (persistence.mode === "supabase") {
      const { supabase, user } = persistence.context;
      if (!canvasId || canvasId === DEFAULT_CANVAS_ID) {
        canvasId = (await getOrCreateDefaultCanvasForUser(supabase, user.id)).id;
      }
      const config = getConfig();
      const storageDriver = config.storageDriver === "blob" ? "blob" : "supabase";
      const storage = getStorageAdapter({
        driver: storageDriver,
        supabase: storageDriver === "supabase" ? supabase : undefined,
      });
      const storageKey = `${user.id}/${buildStorageKey(validated.safeName)}`;
      const url = await storage.putFile(validated.buffer, storageKey, {
        contentType: validated.mimeType,
      });
      const kind = getMediaKind(validated.mimeType);
      const imageMetadata =
        kind === "image"
          ? await extractImageMetadata(validated.buffer)
          : { width: null, height: null, thumbnail: null };
      const thumbnailStorageKey = imageMetadata.thumbnail
        ? `${user.id}/${buildStorageKey(`thumb-${validated.safeName}.webp`)}`
        : null;
      const thumbnailUrl =
        imageMetadata.thumbnail && thumbnailStorageKey
          ? await storage.putFile(imageMetadata.thumbnail, thumbnailStorageKey, {
              contentType: "image/webp",
            })
          : null;
      const siblings = await listCanvasMediaForUser(supabase, user.id, canvasId);
      const displayWidth =
        imageMetadata.width && imageMetadata.width >= 120
          ? Math.min(420, imageMetadata.width)
          : 360;
      const displayHeight =
        imageMetadata.height && imageMetadata.height >= 100
          ? Math.min(420, imageMetadata.height)
          : 260;
      const media = await createMediaItemForUser(supabase, user.id, {
        canvasId,
        type: kind,
        url,
        storageDriver,
        storageKey,
        thumbnailUrl,
        thumbnailStorageKey,
        mimeType: validated.mimeType,
        fileName: validated.safeName,
        title: validated.safeName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
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
        analysisStatus: "skipped",
        analysisError: null,
        parentIdsJson: [],
      });
      return NextResponse.json(
        { media, workflow: { runId: null, mode: "supabase" } },
        { status: 201 },
      );
    }

    await getOrCreateDefaultCanvas();
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
      storageDriver: getConfig().storageDriver,
      storageKey,
      thumbnailUrl,
      thumbnailStorageKey,
      mimeType: validated.mimeType,
      fileName: validated.safeName,
      title: validated.safeName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
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
