export const LOCAL_SCHEMA = "inspiration_canvas_local";
export const SCHEMA_VERSION = 1;
export const LOCAL_TABLES = ["canvases", "media_items", "comments", "taste_briefs", "generation_runs", "agent_tool_approvals"];

// Trusted single-user local tables are separate from Supabase's auth/RLS schema.
export const POSTGRES_SCHEMA = [
  `CREATE TABLE inspiration_canvas_local.canvases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE inspiration_canvas_local.media_items (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES inspiration_canvas_local.canvases(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    storage_driver TEXT NOT NULL DEFAULT 'local',
    storage_key TEXT NOT NULL,
    thumbnail_url TEXT,
    thumbnail_storage_key TEXT,
    mime_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    title TEXT,
    size_bytes BIGINT NOT NULL,
    intrinsic_width INTEGER,
    intrinsic_height INTEGER,
    duration_seconds DOUBLE PRECISION,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    width DOUBLE PRECISION NOT NULL,
    height DOUBLE PRECISION NOT NULL,
    z_index BIGINT NOT NULL,
    rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
    crop_json JSONB,
    tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    category TEXT,
    subcategory TEXT,
    description TEXT,
    design_analysis_json JSONB,
    analysis_status TEXT NOT NULL DEFAULT 'pending',
    analysis_error TEXT,
    parent_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE inspiration_canvas_local.comments (
    id TEXT PRIMARY KEY,
    media_item_id TEXT NOT NULL REFERENCES inspiration_canvas_local.media_items(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE inspiration_canvas_local.taste_briefs (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES inspiration_canvas_local.canvases(id) ON DELETE CASCADE,
    media_item_ids_json JSONB NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE inspiration_canvas_local.generation_runs (
    id TEXT PRIMARY KEY,
    canvas_id TEXT NOT NULL REFERENCES inspiration_canvas_local.canvases(id) ON DELETE CASCADE,
    media_item_ids_json JSONB NOT NULL,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    result_media_item_id TEXT REFERENCES inspiration_canvas_local.media_items(id) ON DELETE SET NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE inspiration_canvas_local.agent_tool_approvals (
    id TEXT PRIMARY KEY,
    tool_name TEXT NOT NULL,
    canvas_id TEXT REFERENCES inspiration_canvas_local.canvases(id) ON DELETE CASCADE,
    media_item_ids_json JSONB NOT NULL,
    payload_json JSONB NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX media_items_canvas_idx ON inspiration_canvas_local.media_items(canvas_id)`,
  `CREATE INDEX comments_media_item_idx ON inspiration_canvas_local.comments(media_item_id)`,
  `CREATE INDEX generation_runs_canvas_idx ON inspiration_canvas_local.generation_runs(canvas_id)`,
];
