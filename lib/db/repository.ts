import { DEFAULT_CANVAS_ID } from "@/lib/config";
import { getDatabase, initializeDatabase, type DatabaseTransaction, type DbRow } from "@/lib/db/client";
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

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid database timestamp.");
  return date.toISOString();
}

function canvasFromRow(row: DbRow): CanvasRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mediaFromRow(row: DbRow): MediaItem {
  return {
    id: String(row.id),
    canvasId: String(row.canvas_id),
    type: String(row.type) as MediaKind,
    url: String(row.url),
    storageDriver:
      row.storage_driver === "blob" || row.storage_driver === "supabase"
        ? row.storage_driver
        : "local",
    storageKey: String(row.storage_key),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    thumbnailStorageKey: row.thumbnail_storage_key
      ? String(row.thumbnail_storage_key)
      : null,
    mimeType: String(row.mime_type),
    fileName: String(row.file_name),
    title: row.title ? String(row.title) : null,
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
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function commentFromRow(row: DbRow): CommentRecord {
  return {
    id: String(row.id),
    mediaItemId: String(row.media_item_id),
    body: String(row.body),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function tasteBriefFromRow(row: DbRow): TasteBrief {
  return {
    id: String(row.id),
    canvasId: String(row.canvas_id),
    mediaItemIdsJson: parseJson<string[]>(row.media_item_ids_json, []),
    text: String(row.text),
    createdAt: timestamp(row.created_at),
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
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
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
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
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
  const createdAt = now();
  const db = await getDatabase();
  const inserted = await db.query(
    "INSERT INTO inspiration_canvas_local.canvases (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING *",
    [DEFAULT_CANVAS_ID, "Untitled inspiration canvas", createdAt, createdAt],
  );
  const existing = inserted.rows[0] || (await db.query("SELECT * FROM inspiration_canvas_local.canvases WHERE id = $1", [DEFAULT_CANVAS_ID])).rows[0];
  if (!existing) throw new Error("The default canvas is unavailable.");
  return canvasFromRow(existing);
}

export async function createCanvas(name: string): Promise<CanvasRecord> {
  await initializeDatabase();
  const createdAt = now();
  const canvas = { id: id(), name, createdAt, updatedAt: createdAt };
  const db = await getDatabase();
  const result = await db.query(
    "INSERT INTO inspiration_canvas_local.canvases (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4) RETURNING *",
    [canvas.id, canvas.name, canvas.createdAt, canvas.updatedAt],
  );
  return canvasFromRow(result.rows[0]);
}

export async function updateCanvas(
  canvasId: string,
  patch: { name?: string },
): Promise<CanvasRecord | null> {
  await initializeDatabase();
  const updatedAt = now();
  const db = await getDatabase();
  const result = await db.query("UPDATE inspiration_canvas_local.canvases SET name = COALESCE(NULLIF(BTRIM($1), ''), name), updated_at = $2 WHERE id = $3 RETURNING *", [
    patch.name ?? null,
    updatedAt,
    canvasId,
  ]);
  return result.rows[0] ? canvasFromRow(result.rows[0]) : null;
}

export async function getCanvasData(canvasId = DEFAULT_CANVAS_ID): Promise<{
  canvas: CanvasRecord;
  mediaItems: MediaItem[];
}> {
  const row = canvasId === DEFAULT_CANVAS_ID ? null : await first("SELECT * FROM inspiration_canvas_local.canvases WHERE id = $1", [canvasId]);
  if (canvasId !== DEFAULT_CANVAS_ID && !row) throw new Error("Canvas not found.");
  const canvas = row ? canvasFromRow(row) : await getOrCreateDefaultCanvas();
  const mediaItems = (await all(
    "SELECT * FROM inspiration_canvas_local.media_items WHERE canvas_id = $1 ORDER BY z_index ASC, created_at ASC",
    [canvas.id],
  )).map(mediaFromRow);
  return { canvas, mediaItems };
}

export async function getMediaItem(idValue: string): Promise<MediaItem | null> {
  const row = await first("SELECT * FROM inspiration_canvas_local.media_items WHERE id = $1", [idValue]);
  return row ? mediaFromRow(row) : null;
}

export async function listCanvasMedia(canvasId: string): Promise<MediaItem[]> {
  return (await all(
    "SELECT * FROM inspiration_canvas_local.media_items WHERE canvas_id = $1 ORDER BY z_index ASC, created_at ASC",
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
  const result = await db.query(
    `INSERT INTO inspiration_canvas_local.media_items (
      id, canvas_id, type, url, storage_driver, storage_key, thumbnail_url, thumbnail_storage_key,
      mime_type, file_name, title, size_bytes, intrinsic_width, intrinsic_height,
      duration_seconds, x, y, width, height, z_index, rotation, crop_json,
      tags_json, category, subcategory, description, design_analysis_json,
      analysis_status, analysis_error, parent_ids_json, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32) RETURNING *`,
    [
      media.id,
      media.canvasId,
      media.type,
      media.url,
      media.storageDriver,
      media.storageKey,
      media.thumbnailUrl,
      media.thumbnailStorageKey,
      media.mimeType,
      media.fileName,
      media.title,
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
  return mediaFromRow(result.rows[0]);
}

const MEDIA_UPDATE_COLUMNS: Partial<Record<keyof MediaItem, string>> = {
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

async function updateMediaItemWith(
  db: DatabaseTransaction,
  idValue: string,
  patch: Partial<MediaItem>,
): Promise<MediaItem | null> {
  const entries = Object.entries(patch).filter(([key, value]) =>
    Object.hasOwn(MEDIA_UPDATE_COLUMNS, key) && value !== undefined,
  ) as [keyof MediaItem, unknown][];
  if (entries.length === 0) {
    const current = await db.query("SELECT * FROM inspiration_canvas_local.media_items WHERE id = $1", [idValue]);
    return current.rows[0] ? mediaFromRow(current.rows[0]) : null;
  }

  const updatedAt = now();
  const assignments = entries
    .map(([key], index) => `${MEDIA_UPDATE_COLUMNS[key]} = $${index + 1}`)
    .join(", ");
  const args = entries.map(([key, value]) => serializePatchValue(key, value));
  const result = await db.query(
    `UPDATE inspiration_canvas_local.media_items SET ${assignments}, updated_at = $${args.length + 1} WHERE id = $${args.length + 2} RETURNING *`,
    [...args, updatedAt, idValue],
  );
  return result.rows[0] ? mediaFromRow(result.rows[0]) : null;
}

export async function updateMediaItem(idValue: string, patch: Partial<MediaItem>): Promise<MediaItem | null> {
  await initializeDatabase();
  return updateMediaItemWith(await getDatabase(), idValue, patch);
}

export async function updateMediaItemsBatch(
  updates: Array<{ id: string; patch: Partial<MediaItem> }>,
): Promise<MediaItem[]> {
  await initializeDatabase();
  const db = await getDatabase();
  return db.transaction(async (client) => {
    const updated: MediaItem[] = [];
    for (const update of updates) {
      const item = await updateMediaItemWith(client, update.id, update.patch);
      if (item) updated.push(item);
    }
    return updated;
  });
}

export async function deleteMediaItem(idValue: string): Promise<MediaItem | null> {
  await initializeDatabase();
  const db = await getDatabase();
  const result = await db.query("DELETE FROM inspiration_canvas_local.media_items WHERE id = $1 RETURNING *", [idValue]);
  return result.rows[0] ? mediaFromRow(result.rows[0]) : null;
}

export async function listComments(mediaItemId: string): Promise<CommentRecord[]> {
  return (await all(
    "SELECT * FROM inspiration_canvas_local.comments WHERE media_item_id = $1 ORDER BY created_at ASC",
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
  const result = await db.query(
    "INSERT INTO inspiration_canvas_local.comments (id, media_item_id, body, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [comment.id, comment.mediaItemId, comment.body, comment.createdAt, comment.updatedAt],
  );
  return commentFromRow(result.rows[0]);
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
  const result = await db.query(
    "INSERT INTO inspiration_canvas_local.taste_briefs (id, canvas_id, media_item_ids_json, text, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [brief.id, brief.canvasId, JSON.stringify(mediaIds), brief.text, brief.createdAt],
  );
  return tasteBriefFromRow(result.rows[0]);
}

export async function listTasteBriefs(canvasId: string): Promise<TasteBrief[]> {
  return (await all(
    "SELECT * FROM inspiration_canvas_local.taste_briefs WHERE canvas_id = $1 ORDER BY created_at DESC",
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
  const result = await db.query(
    `INSERT INTO inspiration_canvas_local.generation_runs (
      id, canvas_id, media_item_ids_json, status, prompt, result_media_item_id,
      error, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
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
  return generationRunFromRow(result.rows[0]);
}

export async function updateGenerationRun(
  idValue: string,
  patch: Partial<Pick<GenerationRun, "status" | "prompt" | "resultMediaItemId" | "error">>,
): Promise<GenerationRun | null> {
  await initializeDatabase();
  const columns: Record<string, string> = { status: "status", prompt: "prompt", resultMediaItemId: "result_media_item_id", error: "error" };
  const entries = Object.entries(patch).filter(([key, value]) => Object.hasOwn(columns, key) && value !== undefined);
  if (!entries.length) return getGenerationRun(idValue);
  const updatedAt = now();
  const db = await getDatabase();
  const result = await db.query(
    `UPDATE inspiration_canvas_local.generation_runs SET ${entries.map(([key], index) => `${columns[key]} = $${index + 1}`).join(", ")}, updated_at = $${entries.length + 1} WHERE id = $${entries.length + 2} RETURNING *`,
    [...entries.map(([, value]) => value), updatedAt, idValue],
  );
  return result.rows[0] ? generationRunFromRow(result.rows[0]) : null;
}

export async function getGenerationRun(idValue: string): Promise<GenerationRun | null> {
  const row = await first("SELECT * FROM inspiration_canvas_local.generation_runs WHERE id = $1", [idValue]);
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
  const result = await db.query(
    `INSERT INTO inspiration_canvas_local.agent_tool_approvals (
      id, tool_name, canvas_id, media_item_ids_json, payload_json, status,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
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
  return approvalFromRow(result.rows[0]);
}

export async function getAgentApproval(
  idValue: string,
): Promise<AgentToolApproval | null> {
  const row = await first("SELECT * FROM inspiration_canvas_local.agent_tool_approvals WHERE id = $1", [idValue]);
  return row ? approvalFromRow(row) : null;
}

export async function updateAgentApprovalStatus(
  idValue: string,
  status: AgentToolApproval["status"],
): Promise<AgentToolApproval | null> {
  await initializeDatabase();
  const updatedAt = now();
  const db = await getDatabase();
  const result = await db.query(
    "UPDATE inspiration_canvas_local.agent_tool_approvals SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *",
    [status, updatedAt, idValue],
  );
  return result.rows[0] ? approvalFromRow(result.rows[0]) : null;
}
