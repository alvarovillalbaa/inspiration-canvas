export const SQLITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS canvases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_items (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    storage_driver TEXT NOT NULL DEFAULT 'local',
    storage_key TEXT NOT NULL,
    thumbnail_url TEXT,
    thumbnail_storage_key TEXT,
    mime_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    title TEXT,
    size_bytes INTEGER NOT NULL,
    intrinsic_width INTEGER,
    intrinsic_height INTEGER,
    duration_seconds REAL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    z_index INTEGER NOT NULL,
    rotation REAL NOT NULL DEFAULT 0,
    crop_json TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    category TEXT,
    subcategory TEXT,
    description TEXT,
    design_analysis_json TEXT,
    analysis_status TEXT NOT NULL DEFAULT 'pending',
    analysis_error TEXT,
    parent_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS taste_briefs (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    media_item_ids_json TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS generation_runs (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    media_item_ids_json TEXT NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    result_media_item_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agent_tool_approvals (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    canvas_id TEXT,
    media_item_ids_json TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS media_items_canvas_idx ON media_items(canvas_id)`,
  `CREATE INDEX IF NOT EXISTS comments_media_item_idx ON comments(media_item_id)`,
  `CREATE INDEX IF NOT EXISTS generation_runs_canvas_idx ON generation_runs(canvas_id)`,
];

export const SQLITE_MIGRATIONS = [
  `ALTER TABLE media_items ADD COLUMN storage_driver TEXT NOT NULL DEFAULT 'local'`,
  `ALTER TABLE media_items ADD COLUMN title TEXT`,
];

export const POSTGRES_MIGRATIONS = [
  `ALTER TABLE media_items ADD COLUMN IF NOT EXISTS storage_driver TEXT NOT NULL DEFAULT 'local'`,
  `ALTER TABLE media_items ADD COLUMN IF NOT EXISTS title TEXT`,
];

export const POSTGRES_SCHEMA = SQLITE_SCHEMA.map((statement) =>
  statement
    .replaceAll("INTEGER", "BIGINT")
    .replaceAll("REAL", "DOUBLE PRECISION")
    .replaceAll("TEXT PRIMARY KEY", "TEXT PRIMARY KEY"),
);
