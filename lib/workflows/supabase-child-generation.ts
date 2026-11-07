import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MissingAICredentialsError, generateChildImageBytes, proposeChildMediaPrompt } from "@/lib/ai/service";
import { getClusterChildPosition } from "@/lib/canvas/math";
import { getConfig } from "@/lib/config";
import {
  createGenerationRunForUser,
  createMediaItemForUser,
  getCanvasForUser,
  getGenerationRunForUser,
  getMediaItemForUser,
  listCanvasMediaForUser,
  updateGenerationRunForUser,
  type CreateSupabaseMediaInput,
  type SupabaseGenerationRunPatch,
} from "@/lib/db/supabase-repository";
import { buildStorageKey, validateUploadFile } from "@/lib/media";
import { SupabaseStorageAdapter, VercelBlobStorageAdapter } from "@/lib/storage/adapter";
import type { GenerationRun, MediaItem } from "@/lib/types";
import { extractImageMetadata } from "@/lib/workflows/media-processing";

type ErrorCode = "invalid_request" | "not_found" | "credentials" | "unconfirmed" | "failed";
const MESSAGES: Record<ErrorCode, string> = {
  invalid_request: "Select at least two distinct media items from one canvas and a valid prompt.",
  not_found: "The canvas or one of its media items is unavailable.",
  credentials: "Child generation requires configured AI credentials.",
  unconfirmed: "The generation result could not be confirmed. Check this run before starting another request.",
  failed: "Child generation failed before its result could be confirmed.",
};

export class SupabaseChildGenerationError extends Error {
  readonly code: ErrorCode;
  readonly runId: string | null;

  constructor(code: ErrorCode, runId: string | null = null) {
    super(MESSAGES[code]);
    this.name = "SupabaseChildGenerationError";
    this.code = code;
    this.runId = runId;
  }
}

export type SupabaseChildGenerationInput = {
  supabase: SupabaseClient;
  userId: string;
  canvasId: string;
  mediaIds: string[];
  prompt?: string;
  signal?: AbortSignal;
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};
function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && value.trim() === value && !value.includes("\0");
}
function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

// This function is awaited inside the authenticated request. No client, token,
// or actor identity is handed to a durable workflow or detached continuation.
export async function runSupabaseChildGeneration(input: SupabaseChildGenerationInput): Promise<{
  run: GenerationRun; media: MediaItem; prompt: string;
}> {
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId)
    || !validId(input.canvasId) || !Array.isArray(input.mediaIds) || input.mediaIds.length < 2
    || !input.mediaIds.every(validId) || new Set(input.mediaIds).size !== input.mediaIds.length
    || (input.prompt !== undefined && (typeof input.prompt !== "string" || input.prompt.length > 4000))) {
    throw new SupabaseChildGenerationError("invalid_request");
  }
  const { supabase, userId, canvasId } = input;
  const mediaIds = [...input.mediaIds];
  const deadline = AbortSignal.timeout(45_000);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
  const modelOptions = { abortSignal: signal, maxRetries: 0 as const };
  let prompt = input.prompt?.trim() || "";
  let run: GenerationRun | null = null;
  let runningConfirmed = false;
  let storageAttempted = false;

  const unavailable = () => new SupabaseChildGenerationError("not_found", run?.id ?? null);
  const unconfirmed = () => new SupabaseChildGenerationError("unconfirmed", run?.id ?? null);
  const runMatches = (value: GenerationRun | null, patch: SupabaseGenerationRunPatch): value is GenerationRun =>
    value !== null && value.id === run?.id && value.canvasId === canvasId
    && equal(value.mediaItemIdsJson, mediaIds)
    && Object.entries(patch).every(([key, expected]) => equal(value[key as keyof GenerationRun], expected));
  async function ownedParents(): Promise<MediaItem[]> {
    const canvas = await getCanvasForUser(supabase, userId, canvasId);
    if (!canvas || canvas.id !== canvasId) throw unavailable();
    const parents: MediaItem[] = [];
    for (const id of mediaIds) {
      const media = await getMediaItemForUser(supabase, userId, id);
      if (!media || media.id !== id || media.userId !== userId || media.canvasId !== canvasId) throw unavailable();
      if (![media.x, media.y, media.width, media.height].every(Number.isFinite)
        || media.width <= 0 || media.height <= 0) throw unavailable();
      parents.push(media);
    }
    return parents;
  }
  async function updateRunning(patch: SupabaseGenerationRunPatch, expectedStatus: "pending" | "running") {
    const expected = { status: "running" as const, prompt, resultMediaItemId: null, error: null, ...patch };
    let acknowledged: GenerationRun | null = null;
    try {
      acknowledged = await updateGenerationRunForUser(supabase, userId, run!.id, patch, { expectedStatus });
    } catch { /* A response can be lost after the row update committed. */ }
    if (!runMatches(acknowledged, expected)) {
      try { acknowledged = await getGenerationRunForUser(supabase, userId, run!.id); } catch { throw unconfirmed(); }
    }
    if (!runMatches(acknowledged, expected)) throw unconfirmed();
    run = acknowledged;
  }
  async function requireRunning() {
    const current = await getGenerationRunForUser(supabase, userId, run!.id);
    if (!runMatches(current, { status: "running", prompt, resultMediaItemId: null, error: null })) throw unconfirmed();
  }

  try {
    signal.throwIfAborted();
    const auth = await supabase.auth.getUser();
    if (auth.error || auth.data.user?.id !== userId) throw unavailable();
    await ownedParents();
    signal.throwIfAborted();
    try {
      run = await createGenerationRunForUser(supabase, userId, { canvasId, mediaIds, prompt, status: "pending" });
    } catch {
      // Creation has no caller-supplied run ID. Its outcome cannot be retried here.
      throw unconfirmed();
    }
    if (!run) throw unavailable();
    if (!validId(run.id) || !runMatches(run, { status: "pending", prompt, resultMediaItemId: null, error: null })) {
      throw unconfirmed();
    }
    await updateRunning({ status: "running" }, "pending");
    runningConfirmed = true;
    if (!prompt) {
      const promptParents = await ownedParents();
      await requireRunning();
      signal.throwIfAborted();
      prompt = (await proposeChildMediaPrompt({ mediaItems: promptParents, ...modelOptions })).trim();
      signal.throwIfAborted();
      if (!prompt || prompt.length > 4000) throw new SupabaseChildGenerationError("failed", run.id);
      await updateRunning({ prompt }, "running");
    }
    await ownedParents();
    await requireRunning();
    signal.throwIfAborted();
    const image = await generateChildImageBytes(prompt, modelOptions);
    signal.throwIfAborted();
    const ext = IMAGE_EXTENSIONS[image.mediaType];
    const maxBytes = getConfig().maxUploadMb * 1024 * 1024;
    if (!ext || !(image.data instanceof Uint8Array) || image.data.byteLength === 0
      || image.data.byteLength > maxBytes) throw new SupabaseChildGenerationError("failed", run.id);
    const fileName = `generated-child-${run.id}.${ext}`;
    signal.throwIfAborted();
    const validated = await validateUploadFile(new File([new Uint8Array(image.data)], fileName, { type: image.mediaType }));
    if (validated.mimeType !== image.mediaType) throw new SupabaseChildGenerationError("failed", run.id);
    signal.throwIfAborted();
    const metadata = await extractImageMetadata(validated.buffer);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
      || metadata.width! <= 0 || metadata.height! <= 0) throw new SupabaseChildGenerationError("failed", run.id);
    let thumbnail: Buffer | null = null;
    if (metadata.thumbnail) {
      signal.throwIfAborted();
      const checked = await validateUploadFile(new File([new Uint8Array(metadata.thumbnail)], `thumb-${fileName}.webp`, { type: "image/webp" }));
      if (checked.mimeType !== "image/webp") throw new SupabaseChildGenerationError("failed", run.id);
      thumbnail = checked.buffer;
    }
    const storageDriver = getConfig().storageDriver === "blob" ? "blob" : "supabase";
    const storage = storageDriver === "blob"
      ? new VercelBlobStorageAdapter()
      : new SupabaseStorageAdapter(supabase);
    const mediaId = randomUUID();
    const storageKey = `${userId}/${buildStorageKey(validated.safeName)}`;
    const thumbnailStorageKey = thumbnail ? `${userId}/${buildStorageKey(`thumb-${fileName}.webp`)}` : null;
    await ownedParents();
    await requireRunning();
    signal.throwIfAborted();
    // Any subsequent error may leave an acknowledged or unacknowledged object.
    // Retain it: deleting here could erase a late successful publication.
    storageAttempted = true;
    const url = await storage.putFile(validated.buffer, storageKey, { contentType: validated.mimeType });
    let thumbnailUrl: string | null = null;
    if (thumbnail && thumbnailStorageKey) {
      await ownedParents();
      await requireRunning();
      signal.throwIfAborted();
      thumbnailUrl = await storage.putFile(thumbnail, thumbnailStorageKey, { contentType: "image/webp" });
    }
    signal.throwIfAborted();
    const parents = await ownedParents();
    const siblings = await listCanvasMediaForUser(supabase, userId, canvasId);
    if (siblings.some(item => item.canvasId !== canvasId || item.userId !== userId || !Number.isFinite(item.zIndex))) throw unconfirmed();
    const position = getClusterChildPosition(parents);
    const zIndex = Math.max(0, ...siblings.map(item => item.zIndex)) + 1;
    if (![position.x, position.y, zIndex].every(Number.isFinite)) throw unconfirmed();
    await requireRunning();
    signal.throwIfAborted();
    const expected: CreateSupabaseMediaInput = {
      id: mediaId, canvasId, type: "generated_image", url, storageDriver, storageKey,
      thumbnailUrl, thumbnailStorageKey, mimeType: validated.mimeType, fileName: validated.safeName,
      title: "Generated child media", sizeBytes: validated.buffer.length,
      intrinsicWidth: metadata.width, intrinsicHeight: metadata.height, durationSeconds: null,
      x: position.x, y: position.y, width: 360, height: 360, zIndex, rotation: 0,
      cropJson: null, tagsJson: ["generated", "child-media"], category: "generated", subcategory: "child-media",
      description: prompt, designAnalysisJson: null, analysisStatus: "complete", analysisError: null, parentIdsJson: mediaIds,
    };
    const mediaMatches = (value: MediaItem | null): value is MediaItem => value !== null && value.userId === userId
      && Object.entries(expected).every(([key, expectedValue]) => equal(value[key as keyof MediaItem], expectedValue));
    let media: MediaItem | null = null;
    try { media = await createMediaItemForUser(supabase, userId, expected); } catch { /* Reconcile this exact ID only. */ }
    if (!mediaMatches(media)) {
      try { media = await getMediaItemForUser(supabase, userId, mediaId); } catch { throw unconfirmed(); }
    }
    if (!mediaMatches(media)) throw unconfirmed();
    signal.throwIfAborted();
    const completion = { status: "complete" as const, prompt, resultMediaItemId: mediaId, error: null };
    let completed: GenerationRun | null = null;
    try { completed = await updateGenerationRunForUser(supabase, userId, run.id, completion, { expectedStatus: "running" }); } catch { /* Confirm below. */ }
    if (signal.aborted || !runMatches(completed, completion)) {
      // An in-flight DB write is not cancellable here. After an abort, recover
      // only an already-complete exact receipt, never start a new publication.
      try {
        completed = await getGenerationRunForUser(supabase, userId, run.id);
        media = await getMediaItemForUser(supabase, userId, mediaId);
      } catch { throw unconfirmed(); }
      if (!mediaMatches(media)) throw unconfirmed();
    }
    if (!runMatches(completed, completion)) throw unconfirmed();
    return { run: completed, media, prompt };
  } catch (error) {
    const code = error instanceof SupabaseChildGenerationError ? error.code
      : error instanceof MissingAICredentialsError ? "credentials" : "failed";
    if (storageAttempted || code === "unconfirmed") throw unconfirmed();
    const failure = new SupabaseChildGenerationError(code, run?.id ?? null);
    if (run && runningConfirmed) {
      const patch = { status: "failed" as const, error: failure.message, resultMediaItemId: null, prompt };
      let failed: GenerationRun | null = null;
      try { failed = await updateGenerationRunForUser(supabase, userId, run.id, patch, { expectedStatus: "running" }); } catch { /* Confirm below. */ }
      if (!runMatches(failed, patch)) {
        try { failed = await getGenerationRunForUser(supabase, userId, run.id); } catch { throw unconfirmed(); }
      }
      if (!runMatches(failed, patch)) throw unconfirmed();
    }
    throw failure;
  }
}
