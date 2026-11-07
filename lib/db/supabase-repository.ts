import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AnalysisStatus,
  CanvasRecord,
  CommentRecord,
  DesignAnalysis,
  GenerationRun,
  JsonRecord,
  MediaItem,
  MediaKind,
  TasteBrief,
} from "@/lib/types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type CanvasRow = {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: string;
  canvas_id: string;
  user_id: string;
  type: string;
  url: string;
  storage_driver: string;
  storage_key: string;
  thumbnail_url: string | null;
  thumbnail_storage_key: string | null;
  mime_type: string;
  file_name: string;
  title: string | null;
  size_bytes: number;
  intrinsic_width: number | null;
  intrinsic_height: number | null;
  duration_seconds: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  rotation: number;
  crop_json: JsonValue | null;
  tags_json: JsonValue | null;
  category: string | null;
  subcategory: string | null;
  description: string | null;
  design_analysis_json: JsonValue | null;
  analysis_status: string;
  analysis_error: string | null;
  parent_ids_json: JsonValue | null;
  created_at: string;
  updated_at: string;
};

type CommentRow = {
  id: string;
  media_item_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type TasteBriefRow = {
  id: string;
  canvas_id: string;
  user_id: string;
  media_item_ids_json: JsonValue | null;
  text: string;
  created_at: string;
};

type GenerationRunRow = {
  id: string;
  canvas_id: string;
  user_id: string;
  media_item_ids_json: JsonValue | null;
  status: GenerationRun["status"];
  prompt: string;
  result_media_item_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSupabaseGenerationRunInput = {
  canvasId: string;
  mediaIds: string[];
  prompt: string;
  status?: GenerationRun["status"];
};

export type SupabaseGenerationRunPatch = Partial<
  Pick<GenerationRun, "status" | "prompt" | "resultMediaItemId" | "error">
>;

export type SupabaseGenerationRunUpdateOptions = {
  expectedStatus?: GenerationRun["status"];
};

export type CreateSupabaseMediaInput = Omit<
  MediaItem,
  "id" | "createdAt" | "updatedAt" | "userId"
> & {
  id?: string;
};

function now(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

function canvasFromRow(row: CanvasRow): CanvasRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asJsonRecord(value: JsonValue | null): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asStringArray(value: JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asDesignAnalysis(value: JsonValue | null): DesignAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as unknown as DesignAnalysis;
}

function mediaFromRow(row: MediaRow): MediaItem {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    userId: row.user_id,
    type: row.type as MediaKind,
    url: row.url,
    storageDriver:
      row.storage_driver === "blob" || row.storage_driver === "supabase"
        ? row.storage_driver
        : "local",
    storageKey: row.storage_key,
    thumbnailUrl: row.thumbnail_url,
    thumbnailStorageKey: row.thumbnail_storage_key,
    mimeType: row.mime_type,
    fileName: row.file_name,
    title: row.title,
    sizeBytes: Number(row.size_bytes),
    intrinsicWidth: row.intrinsic_width == null ? null : Number(row.intrinsic_width),
    intrinsicHeight: row.intrinsic_height == null ? null : Number(row.intrinsic_height),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    zIndex: Number(row.z_index),
    rotation: Number(row.rotation),
    cropJson: asJsonRecord(row.crop_json),
    tagsJson: asStringArray(row.tags_json),
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    designAnalysisJson: asDesignAnalysis(row.design_analysis_json),
    analysisStatus: row.analysis_status as AnalysisStatus,
    analysisError: row.analysis_error,
    parentIdsJson: asStringArray(row.parent_ids_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function commentFromRow(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    mediaItemId: row.media_item_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function tasteBriefFromRow(row: TasteBriefRow): TasteBrief {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    mediaItemIdsJson: asStringArray(row.media_item_ids_json),
    text: row.text,
    createdAt: row.created_at,
  };
}

function generationRunFromRow(row: GenerationRunRow): GenerationRun {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid stored generation run.");
  const parents = row.media_item_ids_json;
  if (!generationId(row.id) || !generationId(row.canvas_id) || !generationId(row.user_id)
    || !Array.isArray(parents) || parents.length < 2 || !parents.every(generationId) || new Set(parents).size !== parents.length
    || !generationStatus(row.status) || typeof row.prompt !== "string"
    || (row.result_media_item_id !== null && !generationId(row.result_media_item_id))
    || (row.error !== null && typeof row.error !== "string")
    || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))
    || typeof row.updated_at !== "string" || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error("Invalid stored generation run.");
  }
  return {
    id: row.id,
    canvasId: row.canvas_id,
    mediaItemIdsJson: [...parents],
    status: row.status,
    prompt: row.prompt,
    resultMediaItemId: row.result_media_item_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function throwIfError(error: unknown): asserts error is null | undefined {
  if (!error) return;
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

function isNoRowsError(error: { code?: string } | null): boolean {
  return error?.code === "PGRST116";
}

export class SupabaseUniqueConstraintError extends Error {
  readonly code = "23505";
  constructor() {
    super("Record already exists.");
    this.name = "SupabaseUniqueConstraintError";
  }
}

export async function getCanvasForUser(
  supabase: SupabaseClient,
  userId: string,
  canvasId: string,
): Promise<CanvasRecord | null> {
  const canvas = await supabase.from("canvases").select("*").eq("id", canvasId).eq("user_id", userId).maybeSingle<CanvasRow>();
  if (isNoRowsError(canvas.error)) return null;
  throwIfError(canvas.error);
  return canvas.data ? canvasFromRow(canvas.data) : null;
}

export async function getOrCreateDefaultCanvasForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<CanvasRecord> {
  const existing = await supabase
    .from("canvases")
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle<CanvasRow>();
  throwIfError(existing.error);
  if (existing.data) return canvasFromRow(existing.data);

  const createdAt = now();
  const inserted = await supabase
    .from("canvases")
    .insert({
      id: id(),
      user_id: userId,
      name: "Untitled inspiration canvas",
      is_default: true,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("*")
    .single<CanvasRow>();

  if (inserted.error?.code === "23505") {
    const fallback = await supabase
      .from("canvases")
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .single<CanvasRow>();
    throwIfError(fallback.error);
    return canvasFromRow(fallback.data);
  }

  throwIfError(inserted.error);
  return canvasFromRow(inserted.data);
}

export async function createCanvasForUser(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<CanvasRecord> {
  const createdAt = now();
  const inserted = await supabase
    .from("canvases")
    .insert({
      id: id(),
      user_id: userId,
      name,
      is_default: false,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("*")
    .single<CanvasRow>();
  throwIfError(inserted.error);
  return canvasFromRow(inserted.data);
}

export async function updateCanvasForUser(
  supabase: SupabaseClient,
  userId: string,
  canvasId: string,
  patch: { name?: string },
): Promise<CanvasRecord | null> {
  const updatedAt = now();
  const updated = await supabase
    .from("canvases")
    .update({
      name: patch.name?.trim() || "Untitled inspiration canvas",
      updated_at: updatedAt,
    })
    .eq("id", canvasId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle<CanvasRow>();
  throwIfError(updated.error);
  return updated.data ? canvasFromRow(updated.data) : null;
}

export async function getCanvasDataForUser(
  supabase: SupabaseClient,
  userId: string,
  canvasId?: string,
): Promise<{ canvas: CanvasRecord; mediaItems: MediaItem[] }> {
  let canvas: CanvasRecord;
  if (!canvasId) {
    canvas = await getOrCreateDefaultCanvasForUser(supabase, userId);
  } else {
    const existing = await supabase
      .from("canvases")
      .select("*")
      .eq("id", canvasId)
      .eq("user_id", userId)
      .maybeSingle<CanvasRow>();
    throwIfError(existing.error);
    if (!existing.data) throw new Error("Canvas not found.");
    canvas = canvasFromRow(existing.data);
  }

  const media = await supabase
    .from("media_items")
    .select("*")
    .eq("canvas_id", canvas.id)
    .eq("user_id", userId)
    .order("z_index", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<MediaRow[]>();
  throwIfError(media.error);
  return { canvas, mediaItems: (media.data || []).map(mediaFromRow) };
}

export async function listCanvasMediaForUser(
  supabase: SupabaseClient,
  userId: string,
  canvasId: string,
): Promise<MediaItem[]> {
  const media = await supabase
    .from("media_items")
    .select("*")
    .eq("canvas_id", canvasId)
    .eq("user_id", userId)
    .order("z_index", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<MediaRow[]>();
  throwIfError(media.error);
  return (media.data || []).map(mediaFromRow);
}

export async function getMediaItemForUser(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<MediaItem | null> {
  const media = await supabase
    .from("media_items")
    .select("*")
    .eq("id", mediaId)
    .eq("user_id", userId)
    .maybeSingle<MediaRow>();
  if (isNoRowsError(media.error)) return null;
  throwIfError(media.error);
  return media.data ? mediaFromRow(media.data) : null;
}

export async function createMediaItemForUser(
  supabase: SupabaseClient,
  userId: string,
  input: CreateSupabaseMediaInput,
): Promise<MediaItem> {
  const createdAt = now();
  const mediaId = input.id || id();
  const inserted = await supabase
    .from("media_items")
    .insert({
      id: mediaId,
      canvas_id: input.canvasId,
      user_id: userId,
      type: input.type,
      url: input.url,
      storage_driver: input.storageDriver,
      storage_key: input.storageKey,
      thumbnail_url: input.thumbnailUrl,
      thumbnail_storage_key: input.thumbnailStorageKey,
      mime_type: input.mimeType,
      file_name: input.fileName,
      title: input.title,
      size_bytes: input.sizeBytes,
      intrinsic_width: input.intrinsicWidth,
      intrinsic_height: input.intrinsicHeight,
      duration_seconds: input.durationSeconds,
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
      z_index: input.zIndex,
      rotation: input.rotation,
      crop_json: input.cropJson as JsonValue | null,
      tags_json: input.tagsJson,
      category: input.category,
      subcategory: input.subcategory,
      description: input.description,
      design_analysis_json: input.designAnalysisJson as JsonValue | null,
      analysis_status: input.analysisStatus,
      analysis_error: input.analysisError,
      parent_ids_json: input.parentIdsJson,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("*")
    .single<MediaRow>();
  if (inserted.error?.code === "23505") throw new SupabaseUniqueConstraintError();
  throwIfError(inserted.error);
  return mediaFromRow(inserted.data);
}

const MEDIA_UPDATE_COLUMNS: Partial<Record<keyof MediaItem, keyof MediaRow>> = {
  url: "url",
  storageKey: "storage_key",
  thumbnailUrl: "thumbnail_url",
  thumbnailStorageKey: "thumbnail_storage_key",
  title: "title",
  intrinsicWidth: "intrinsic_width",
  intrinsicHeight: "intrinsic_height",
  durationSeconds: "duration_seconds",
  x: "x",
  y: "y",
  width: "width",
  height: "height",
  zIndex: "z_index",
  rotation: "rotation",
  cropJson: "crop_json",
  tagsJson: "tags_json",
  category: "category",
  subcategory: "subcategory",
  description: "description",
  designAnalysisJson: "design_analysis_json",
  analysisStatus: "analysis_status",
  analysisError: "analysis_error",
  parentIdsJson: "parent_ids_json",
};

function serializePatchValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

export async function updateMediaItemForUser(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
  patch: Partial<MediaItem>,
): Promise<MediaItem | null> {
  const update: Record<string, unknown> = { updated_at: now() };
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof MediaItem, unknown]
  >) {
    const column = MEDIA_UPDATE_COLUMNS[key];
    if (column) update[column] = serializePatchValue(value);
  }

  const media = await supabase
    .from("media_items")
    .update(update)
    .eq("id", mediaId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle<MediaRow>();
  throwIfError(media.error);
  return media.data ? mediaFromRow(media.data) : null;
}

export async function updateMediaItemsBatchForUser(
  supabase: SupabaseClient,
  userId: string,
  updates: Array<{ id: string; patch: Partial<MediaItem> }>,
): Promise<MediaItem[]> {
  const results = await Promise.all(
    updates.map((update) =>
      updateMediaItemForUser(supabase, userId, update.id, update.patch),
    ),
  );
  return results.filter((item): item is MediaItem => item != null);
}

export async function deleteMediaItemForUser(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<MediaItem | null> {
  const media = await getMediaItemForUser(supabase, userId, mediaId);
  if (!media) return null;
  const deleted = await supabase
    .from("media_items")
    .delete()
    .eq("id", mediaId)
    .eq("user_id", userId);
  throwIfError(deleted.error);
  return media;
}

export async function listCommentsForUser(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
): Promise<CommentRecord[]> {
  const comments = await supabase
    .from("comments")
    .select("*")
    .eq("media_item_id", mediaId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<CommentRow[]>();
  throwIfError(comments.error);
  return (comments.data || []).map(commentFromRow);
}

export async function createCommentForUser(
  supabase: SupabaseClient,
  userId: string,
  mediaId: string,
  body: string,
  commentId?: string,
): Promise<CommentRecord> {
  const createdAt = now();
  const inserted = await supabase
    .from("comments")
    .insert({
      id: commentId || id(),
      media_item_id: mediaId,
      user_id: userId,
      body: body.trim(),
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("*")
    .single<CommentRow>();
  if (inserted.error?.code === "23505") throw new SupabaseUniqueConstraintError();
  throwIfError(inserted.error);
  return commentFromRow(inserted.data);
}

export async function getCommentForUser(
  supabase: SupabaseClient,
  userId: string,
  commentId: string,
): Promise<CommentRecord | null> {
  const comment = await supabase.from("comments").select("*").eq("id", commentId).eq("user_id", userId).maybeSingle<CommentRow>();
  if (isNoRowsError(comment.error)) return null;
  throwIfError(comment.error);
  return comment.data ? commentFromRow(comment.data) : null;
}

export async function createTasteBriefForUser(
  supabase: SupabaseClient,
  userId: string,
  canvasId: string,
  mediaIds: string[],
  text: string,
): Promise<TasteBrief> {
  const inserted = await supabase
    .from("taste_briefs")
    .insert({
      id: id(),
      canvas_id: canvasId,
      user_id: userId,
      media_item_ids_json: mediaIds,
      text,
      created_at: now(),
    })
    .select("*")
    .single<TasteBriefRow>();
  throwIfError(inserted.error);
  return tasteBriefFromRow(inserted.data);
}

function generationInput(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid generation run input.");
}

function generationId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 1024 && value.trim().length > 0 && !value.includes("\0");
}

function generationStatus(value: unknown): value is GenerationRun["status"] {
  return value === "pending" || value === "running" || value === "complete" || value === "failed";
}

async function generationMediaInCanvas(
  supabase: SupabaseClient,
  userId: string,
  canvasId: string,
  mediaId: string,
): Promise<boolean> {
  const media = await supabase.from("media_items").select("id, canvas_id, user_id")
    .eq("id", mediaId).eq("user_id", userId).eq("canvas_id", canvasId)
    .maybeSingle<{ id: string; canvas_id: string; user_id: string }>();
  if (isNoRowsError(media.error)) return false;
  throwIfError(media.error);
  return media.data?.id === mediaId && media.data.user_id === userId && media.data.canvas_id === canvasId;
}

export async function createGenerationRunForUser(
  supabase: SupabaseClient,
  userId: string,
  input: CreateSupabaseGenerationRunInput,
): Promise<GenerationRun | null> {
  generationInput(generationId(userId) && input && typeof input === "object" && !Array.isArray(input));
  generationInput(Object.keys(input).every(key => ["canvasId", "mediaIds", "prompt", "status"].includes(key)));
  generationInput(generationId(input.canvasId) && Array.isArray(input.mediaIds)
    && input.mediaIds.length >= 2 && input.mediaIds.every(generationId)
    && new Set(input.mediaIds).size === input.mediaIds.length
    && typeof input.prompt === "string" && input.prompt.length <= 4000
    && (input.status === undefined || generationStatus(input.status)));
  const { canvasId, prompt } = input, status = input.status ?? "pending", mediaIds = [...input.mediaIds];
  if (!await getCanvasForUser(supabase, userId, canvasId)) return null;
  // These are separate authenticated requests, not a transaction or parent lock.
  for (const mediaId of mediaIds) {
    if (!await generationMediaInCanvas(supabase, userId, canvasId, mediaId)) return null;
  }
  const createdAt = now();
  const inserted = await supabase.from("generation_runs").insert({
    id: id(), canvas_id: canvasId, user_id: userId, media_item_ids_json: mediaIds,
    status, prompt, result_media_item_id: null, error: null, created_at: createdAt, updated_at: createdAt,
  }).select("*").single<GenerationRunRow>();
  throwIfError(inserted.error);
  return generationRunFromRow(inserted.data);
}

export async function getGenerationRunForUser(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
): Promise<GenerationRun | null> {
  generationInput(generationId(userId) && generationId(runId));
  const run = await supabase.from("generation_runs").select("*").eq("id", runId).eq("user_id", userId)
    .maybeSingle<GenerationRunRow>();
  if (isNoRowsError(run.error)) return null;
  throwIfError(run.error);
  if (!run.data) return null;
  const value = generationRunFromRow(run.data);
  if (value.id !== runId || run.data.user_id !== userId
    || !await getCanvasForUser(supabase, userId, value.canvasId)) return null;
  return value;
}

export async function updateGenerationRunForUser(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  patch: SupabaseGenerationRunPatch,
  options: SupabaseGenerationRunUpdateOptions = {},
): Promise<GenerationRun | null> {
  generationInput(generationId(userId) && generationId(runId) && patch && typeof patch === "object" && !Array.isArray(patch));
  generationInput(options && typeof options === "object" && !Array.isArray(options)
    && Object.keys(options).every(key => key === "expectedStatus")
    && (options.expectedStatus === undefined || generationStatus(options.expectedStatus)));
  const columns: Record<string, string> = { status: "status", prompt: "prompt", resultMediaItemId: "result_media_item_id", error: "error" };
  generationInput(Object.keys(patch).every(key => Object.hasOwn(columns, key)));
  generationInput((patch.status === undefined || generationStatus(patch.status))
    && (patch.prompt === undefined || typeof patch.prompt === "string" && patch.prompt.length <= 4000)
    && (patch.resultMediaItemId === undefined || patch.resultMediaItemId === null || generationId(patch.resultMediaItemId))
    && (patch.error === undefined || patch.error === null || typeof patch.error === "string"));
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  const resultMediaItemId = patch.resultMediaItemId, expectedStatus = options.expectedStatus;
  const run = await getGenerationRunForUser(supabase, userId, runId);
  if (!run) return null;
  if (!entries.length) return expectedStatus === undefined || run.status === expectedStatus ? run : null;
  if (resultMediaItemId != null && !await generationMediaInCanvas(supabase, userId, run.canvasId, resultMediaItemId)) return null;
  let query = supabase.from("generation_runs")
    .update({ ...Object.fromEntries(entries.map(([key, value]) => [columns[key], value])), updated_at: now() })
    .eq("id", runId).eq("user_id", userId).eq("canvas_id", run.canvasId);
  if (expectedStatus !== undefined) query = query.eq("status", expectedStatus);
  const updated = await query.select("*").maybeSingle<GenerationRunRow>();
  if (isNoRowsError(updated.error)) return null;
  throwIfError(updated.error);
  return updated.data ? generationRunFromRow(updated.data) : null;
}
