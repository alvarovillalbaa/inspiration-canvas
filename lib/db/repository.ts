import { DEFAULT_CANVAS_ID } from "@/lib/config";
import { getDatabase, initializeDatabase, type DbRow } from "@/lib/db/client";
import type {
  AgentToolApproval,
  AnalysisStatus,
  CanvasRecord,
  CommentRecord,
  GenerationRun,
  GenerationStatus,
  JsonRecord,
  MediaItem,
  MediaKind,
  TasteBrief,
} from "@/lib/types";

function now(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function canvasFromRow(row: DbRow): CanvasRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mediaFromRow(row: DbRow): MediaItem {
  return {
    id: String(row.id),
    canvasId: String(row.canvas_id),
    type: String(row.type) as MediaKind,
    url: String(row.url),
    storageKey: String(row.storage_key),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    thumbnailStorageKey: row.thumbnail_storage_key
      ? String(row.thumbnail_storage_key)
      : null,
    mimeType: String(row.mime_type),
    fileName: String(row.file_name),
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
    cropJson: parseJson<JsonRecord | null>(row.crop_json, null),
    tagsJson: parseJson<string[]>(row.tags_json, []),
    category: row.category ? String(row.category) : null,
    subcategory: row.subcategory ? String(row.subcategory) : null,
    description: row.description ? String(row.description) : null,
    designAnalysisJson: parseJson(row.design_analysis_json, null),
    analysisStatus: String(row.analysis_status) as AnalysisStatus,
    analysisError: row.analysis_error ? String(row.analysis_error) : null,
    parentIdsJson: parseJson<string[]>(row.parent_ids_json, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function commentFromRow(row: DbRow): CommentRecord {
  return {
    id: String(row.id),
    mediaItemId: String(row.media_item_id),
    body: String(row.body),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function tasteBriefFromRow(row: DbRow): TasteBrief {
  return {
    id: String(row.id),
    canvasId: String(row.canvas_id),
    mediaItemIdsJson: parseJson<string[]>(row.media_item_ids_json, []),
    text: String(row.text),
    createdAt: String(row.created_at),
  };
}

function generationRunFromRow(row: DbRow): GenerationRun {
  return {
    id: String(row.id),
    canvasId: String(row.canvas_id),
    mediaItemIdsJson: parseJson<string[]>(row.media_item_ids_json, []),
    status: String(row.status) as GenerationStatus,
    prompt: String(row.prompt),
    resultMediaItemId: row.result_media_item_id ? String(row.result_media_item_id) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function approvalFromRow(row: DbRow): AgentToolApproval {
  return {
    id: String(row.id),
    toolName: String(row.tool_name),
    canvasId: row.canvas_id ? String(row.canvas_id) : null,
    mediaItemIdsJson: parseJson<string[]>(row.media_item_ids_json, []),
    payloadJson: parseJson<JsonRecord>(row.payload_json, {}),
    status: String(row.status) as AgentToolApproval["status"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function first(sql: string, args: unknown[] = []): Promise<DbRow | null> {
  await initializeDatabase();
  const db = await getDatabase();
  const result = await db.query(sql, args);
  return result.rows[0] || null;
}

async function all(sql: string, args: unknown[] = []): Promise<DbRow[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const result = await db.query(sql, args);
  return result.rows;
}

export async function getOrCreateDefaultCanvas(): Promise<CanvasRecord> {
  await initializeDatabase();
  const existing = await first("SELECT * FROM canvases WHERE id = ?", [
    DEFAULT_CANVAS_ID,
  ]);
  if (existing) return canvasFromRow(existing);

  const createdAt = now();
  const db = await getDatabase();
  await db.query(
    "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [DEFAULT_CANVAS_ID, "Untitled inspiration canvas", createdAt, createdAt],
  );
  return {
    id: DEFAULT_CANVAS_ID,
    name: "Untitled inspiration canvas",
    createdAt,
    updatedAt: createdAt,
  };
}

export async function createCanvas(name: string): Promise<CanvasRecord> {
  await initializeDatabase();
  const createdAt = now();
  const canvas = { id: id(), name, createdAt, updatedAt: createdAt };
  const db = await getDatabase();
  await db.query(
    "INSERT INTO canvases (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [canvas.id, canvas.name, canvas.createdAt, canvas.updatedAt],
  );
  return canvas;
}

export async function updateCanvas(
  canvasId: string,
  patch: { name?: string },
): Promise<CanvasRecord | null> {
  await initializeDatabase();
  const updatedAt = now();
  const current = await first("SELECT * FROM canvases WHERE id = ?", [canvasId]);
  if (!current) return null;
  const nextName = patch.name?.trim() || String(current.name);
  const db = await getDatabase();
  await db.query("UPDATE canvases SET name = ?, updated_at = ? WHERE id = ?", [
    nextName,
    updatedAt,
    canvasId,
  ]);
  return canvasFromRow({
    ...current,
    name: nextName,
    updated_at: updatedAt,
  });
}

export async function getCanvasData(canvasId = DEFAULT_CANVAS_ID): Promise<{
  canvas: CanvasRecord;
  mediaItems: MediaItem[];
}> {
  const canvas =
    canvasId === DEFAULT_CANVAS_ID
      ? await getOrCreateDefaultCanvas()
      : canvasFromRow((await first("SELECT * FROM canvases WHERE id = ?", [canvasId]))!);
  const mediaItems = (await all(
    "SELECT * FROM media_items WHERE canvas_id = ? ORDER BY z_index ASC, created_at ASC",
    [canvas.id],
  )).map(mediaFromRow);
  return { canvas, mediaItems };
}

export async function getMediaItem(idValue: string): Promise<MediaItem | null> {
  const row = await first("SELECT * FROM media_items WHERE id = ?", [idValue]);
  return row ? mediaFromRow(row) : null;
}

export async function listCanvasMedia(canvasId: string): Promise<MediaItem[]> {
  return (await all(
    "SELECT * FROM media_items WHERE canvas_id = ? ORDER BY z_index ASC, created_at ASC",
    [canvasId],
  )).map(mediaFromRow);
}

export type CreateMediaInput = Omit<
  MediaItem,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string;
};

export async function createMediaItem(input: CreateMediaInput): Promise<MediaItem> {
  await initializeDatabase();
  await getOrCreateDefaultCanvas();
  const createdAt = now();
  const mediaId = input.id || id();
  const media: MediaItem = {
    ...input,
    id: mediaId,
    createdAt,
    updatedAt: createdAt,
  };
  const db = await getDatabase();
  await db.query(
    `INSERT INTO media_items (
      id, canvas_id, type, url, storage_key, thumbnail_url, thumbnail_storage_key,
      mime_type, file_name, size_bytes, intrinsic_width, intrinsic_height,
      duration_seconds, x, y, width, height, z_index, rotation, crop_json,
      tags_json, category, subcategory, description, design_analysis_json,
      analysis_status, analysis_error, parent_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      media.id,
      media.canvasId,
      media.type,
      media.url,
      media.storageKey,
      media.thumbnailUrl,
      media.thumbnailStorageKey,
      media.mimeType,
      media.fileName,
      media.sizeBytes,
      media.intrinsicWidth,
      media.intrinsicHeight,
      media.durationSeconds,
      media.x,
      media.y,
      media.width,
      media.height,
      media.zIndex,
      media.rotation,
      media.cropJson ? JSON.stringify(media.cropJson) : null,
      JSON.stringify(media.tagsJson),
      media.category,
      media.subcategory,
      media.description,
      media.designAnalysisJson ? JSON.stringify(media.designAnalysisJson) : null,
      media.analysisStatus,
      media.analysisError,
      JSON.stringify(media.parentIdsJson),
      media.createdAt,
      media.updatedAt,
    ],
  );
  return media;
}

const MEDIA_UPDATE_COLUMNS: Partial<Record<keyof MediaItem, string>> = {
  url: "url",
  storageKey: "storage_key",
  thumbnailUrl: "thumbnail_url",
  thumbnailStorageKey: "thumbnail_storage_key",
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

function serializePatchValue(key: keyof MediaItem, value: unknown): unknown {
  if (
    key === "cropJson" ||
    key === "tagsJson" ||
    key === "designAnalysisJson" ||
    key === "parentIdsJson"
  ) {
    return value == null ? null : JSON.stringify(value);
  }
  return value;
}

export async function updateMediaItem(
  idValue: string,
  patch: Partial<MediaItem>,
): Promise<MediaItem | null> {
  await initializeDatabase();
  const entries = Object.entries(patch).filter(([key]) =>
    Object.hasOwn(MEDIA_UPDATE_COLUMNS, key),
  ) as [keyof MediaItem, unknown][];
  if (entries.length === 0) return getMediaItem(idValue);

  const updatedAt = now();
  const assignments = entries
    .map(([key]) => `${MEDIA_UPDATE_COLUMNS[key]} = ?`)
    .join(", ");
  const args = entries.map(([key, value]) => serializePatchValue(key, value));
  const db = await getDatabase();
  await db.query(
    `UPDATE media_items SET ${assignments}, updated_at = ? WHERE id = ?`,
    [...args, updatedAt, idValue],
  );
  return getMediaItem(idValue);
}

export async function updateMediaItemsBatch(
  updates: Array<{ id: string; patch: Partial<MediaItem> }>,
): Promise<MediaItem[]> {
  const updated: MediaItem[] = [];
  for (const update of updates) {
    const item = await updateMediaItem(update.id, update.patch);
    if (item) updated.push(item);
  }
  return updated;
}

export async function deleteMediaItem(idValue: string): Promise<MediaItem | null> {
  const item = await getMediaItem(idValue);
  if (!item) return null;
  const db = await getDatabase();
  await db.query("DELETE FROM media_items WHERE id = ?", [idValue]);
  return item;
}

export async function listComments(mediaItemId: string): Promise<CommentRecord[]> {
  return (await all(
    "SELECT * FROM comments WHERE media_item_id = ? ORDER BY created_at ASC",
    [mediaItemId],
  )).map(commentFromRow);
}

export async function createComment(
  mediaItemId: string,
  body: string,
): Promise<CommentRecord> {
  await initializeDatabase();
  const createdAt = now();
  const comment: CommentRecord = {
    id: id(),
    mediaItemId,
    body: body.trim(),
    createdAt,
    updatedAt: createdAt,
  };
  const db = await getDatabase();
  await db.query(
    "INSERT INTO comments (id, media_item_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [comment.id, comment.mediaItemId, comment.body, comment.createdAt, comment.updatedAt],
  );
  return comment;
}

export async function createTasteBrief(
  canvasId: string,
  mediaIds: string[],
  text: string,
): Promise<TasteBrief> {
  await initializeDatabase();
  const brief: TasteBrief = {
    id: id(),
    canvasId,
    mediaItemIdsJson: mediaIds,
    text,
    createdAt: now(),
  };
  const db = await getDatabase();
  await db.query(
    "INSERT INTO taste_briefs (id, canvas_id, media_item_ids_json, text, created_at) VALUES (?, ?, ?, ?, ?)",
    [brief.id, brief.canvasId, JSON.stringify(mediaIds), brief.text, brief.createdAt],
  );
  return brief;
}

export async function listTasteBriefs(canvasId: string): Promise<TasteBrief[]> {
  return (await all(
    "SELECT * FROM taste_briefs WHERE canvas_id = ? ORDER BY created_at DESC",
    [canvasId],
  )).map(tasteBriefFromRow);
}

export async function createGenerationRun(input: {
  canvasId: string;
  mediaIds: string[];
  prompt: string;
  status?: GenerationStatus;
}): Promise<GenerationRun> {
  await initializeDatabase();
  const createdAt = now();
  const run: GenerationRun = {
    id: id(),
    canvasId: input.canvasId,
    mediaItemIdsJson: input.mediaIds,
    status: input.status || "pending",
    prompt: input.prompt,
    resultMediaItemId: null,
    error: null,
    createdAt,
    updatedAt: createdAt,
  };
  const db = await getDatabase();
  await db.query(
    `INSERT INTO generation_runs (
      id, canvas_id, media_item_ids_json, status, prompt, result_media_item_id,
      error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.canvasId,
      JSON.stringify(run.mediaItemIdsJson),
      run.status,
      run.prompt,
      run.resultMediaItemId,
      run.error,
      run.createdAt,
      run.updatedAt,
    ],
  );
  return run;
}

export async function updateGenerationRun(
  idValue: string,
  patch: Partial<Pick<GenerationRun, "status" | "prompt" | "resultMediaItemId" | "error">>,
): Promise<GenerationRun | null> {
  const existing = await first("SELECT * FROM generation_runs WHERE id = ?", [idValue]);
  if (!existing) return null;
  const updatedAt = now();
  const run = {
    status: patch.status ?? existing.status,
    prompt: patch.prompt ?? existing.prompt,
    resultMediaItemId: patch.resultMediaItemId ?? existing.result_media_item_id,
    error: patch.error ?? existing.error,
  };
  const db = await getDatabase();
  await db.query(
    "UPDATE generation_runs SET status = ?, prompt = ?, result_media_item_id = ?, error = ?, updated_at = ? WHERE id = ?",
    [run.status, run.prompt, run.resultMediaItemId, run.error, updatedAt, idValue],
  );
  return generationRunFromRow({
    ...existing,
    status: run.status,
    prompt: run.prompt,
    result_media_item_id: run.resultMediaItemId,
    error: run.error,
    updated_at: updatedAt,
  });
}

export async function getGenerationRun(idValue: string): Promise<GenerationRun | null> {
  const row = await first("SELECT * FROM generation_runs WHERE id = ?", [idValue]);
  return row ? generationRunFromRow(row) : null;
}

export async function createAgentApproval(input: {
  toolName: string;
  canvasId?: string | null;
  mediaIds?: string[];
  payload: JsonRecord;
}): Promise<AgentToolApproval> {
  await initializeDatabase();
  const createdAt = now();
  const approval: AgentToolApproval = {
    id: id(),
    toolName: input.toolName,
    canvasId: input.canvasId || null,
    mediaItemIdsJson: input.mediaIds || [],
    payloadJson: input.payload,
    status: "pending",
    createdAt,
    updatedAt: createdAt,
  };
  const db = await getDatabase();
  await db.query(
    `INSERT INTO agent_tool_approvals (
      id, tool_name, canvas_id, media_item_ids_json, payload_json, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      approval.id,
      approval.toolName,
      approval.canvasId,
      JSON.stringify(approval.mediaItemIdsJson),
      JSON.stringify(approval.payloadJson),
      approval.status,
      approval.createdAt,
      approval.updatedAt,
    ],
  );
  return approval;
}

export async function getAgentApproval(
  idValue: string,
): Promise<AgentToolApproval | null> {
  const row = await first("SELECT * FROM agent_tool_approvals WHERE id = ?", [idValue]);
  return row ? approvalFromRow(row) : null;
}

export async function updateAgentApprovalStatus(
  idValue: string,
  status: AgentToolApproval["status"],
): Promise<AgentToolApproval | null> {
  const row = await first("SELECT * FROM agent_tool_approvals WHERE id = ?", [idValue]);
  if (!row) return null;
  const updatedAt = now();
  const db = await getDatabase();
  await db.query(
    "UPDATE agent_tool_approvals SET status = ?, updated_at = ? WHERE id = ?",
    [status, updatedAt, idValue],
  );
  return approvalFromRow({ ...row, status, updated_at: updatedAt });
}

