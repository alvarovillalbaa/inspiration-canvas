import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_CANVAS_ID } from "@/lib/config";
import { closeDatabase, getDatabase, initializeDatabase } from "@/lib/db/client";
import { LOCAL_SCHEMA, SCHEMA_VERSION } from "@/lib/db/schema";
import {
  createAgentApproval,
  createCanvas,
  createComment,
  createGenerationRun,
  createMediaItem,
  createTasteBrief,
  deleteMediaItem,
  getAgentApproval,
  getCanvasData,
  getGenerationRun,
  getMediaItem,
  getOrCreateDefaultCanvas,
  listCanvasMedia,
  listComments,
  listTasteBriefs,
  updateAgentApprovalStatus,
  updateCanvas,
  updateGenerationRun,
  updateMediaItem,
  updateMediaItemsBatch,
  type CreateMediaInput,
} from "@/lib/db/repository";

// Real PostgreSQL in the runner-owned database only. This suite never creates
// or drops a database, invokes a provider/model, or claims Supabase RLS proof.
const DATABASE = "inspiration_canvas_checks";
const DATABASE_MARKER = "inspiration-canvas-postgres-ci-v1";
const SCHEMA = "inspiration_canvas_local";
const VIEW_MARKER = "inspiration-canvas-init-retry-fixture-v1";
const SENTINEL_ID = "authored-public-sentinel";
let control: Pool | undefined;

function guardedUrl(): string {
  if (process.env.CI !== "true" || process.env.INSPIRATION_CANVAS_DISPOSABLE_DATABASE !== "true"
    || process.env.LOCAL_PERSISTENCE_ENABLED !== "true" || process.env.VERCEL) {
    throw new Error("Explicit disposable local PostgreSQL CI scope is required");
  }
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("The runner must supply its database URL");
  if (value !== "postgresql://postgres:authored-ci-only@127.0.0.1:5432/inspiration_canvas_checks") throw new Error("The exact authored CI database is required");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1"
    || url.port !== "5432" || decodeURIComponent(url.pathname.slice(1)) !== DATABASE
    || url.username !== "postgres" || url.search || url.hash) {
    throw new Error("The dedicated loopback PostgreSQL target is required");
  }
  return value;
}

function admin(): Pool {
  if (!control) throw new Error("Disposable database guard has not completed");
  return control;
}

function mediaInput(canvasId: string, patch: Partial<CreateMediaInput> = {}): CreateMediaInput {
  return {
    canvasId, type: "image", url: "https://authored.invalid/fixture.png",
    storageDriver: "local", storageKey: `authored/${crypto.randomUUID()}.png`,
    thumbnailUrl: null, thumbnailStorageKey: null, mimeType: "image/png",
    fileName: "authored.png", title: "Authored material", sizeBytes: 12,
    intrinsicWidth: 640, intrinsicHeight: 480, durationSeconds: null,
    x: -12.5, y: 25.75, width: 320, height: 240, zIndex: 3, rotation: 12.5,
    cropJson: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    tagsJson: ["warm, paper", "minimal"], category: "Editorial", subcategory: "Print",
    description: "Authored description\nwith detail.",
    designAnalysisJson: {
      colorPalette: ["#faf8f0"], composition: "Authored composition", mood: ["quiet"],
      styleKeywords: ["paper"], designPrinciples: ["contrast"], visualDensity: "low",
      eraReferences: [], materialTexture: ["grain"], confidence: 0.75,
    },
    analysisStatus: "complete", analysisError: null, parentIdsJson: ["authored,parent"],
    ...patch,
  };
}

function iso(value: string): void {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  expect(new Date(value).toISOString()).toBe(value);
}

beforeAll(async () => {
  const connectionString = guardedUrl();
  expect(LOCAL_SCHEMA).toBe(SCHEMA); expect(SCHEMA_VERSION).toBe(1);
  control = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 1000, application_name: "inspiration-canvas-integration-control" });
  const { rows } = await admin().query("SELECT current_database() AS name, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()");
  expect(rows).toEqual([{ name: DATABASE, marker: DATABASE_MARKER }]);
  expect((await admin().query("SELECT to_regnamespace($1) AS namespace", [SCHEMA])).rows[0].namespace).toBeNull();
  // Deliberately shadow the unqualified app table to catch public-schema leakage.
  await admin().query("CREATE TABLE public.canvases (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
  await admin().query("INSERT INTO public.canvases (id, name) VALUES ($1, $2)", [SENTINEL_ID, "Public sentinel must remain unchanged"]);
});

afterAll(async () => {
  try { await closeDatabase(); }
  finally { await control?.end(); }
  // The outer runner verifies pool closure and owns database/container teardown.
});

describe.sequential("disposable local PostgreSQL persistence", () => {
  it("rolls back unversioned initialization and retries after removing only the authored conflicting view", async () => {
    await admin().query(`CREATE SCHEMA ${SCHEMA}`);
    await admin().query(`CREATE VIEW ${SCHEMA}.canvases AS SELECT 'authored-conflict'::TEXT AS id`);
    await admin().query(`COMMENT ON VIEW ${SCHEMA}.canvases IS '${VIEW_MARKER}'`);
    try {
      await expect(initializeDatabase()).rejects.toThrow();
      const { rows } = await admin().query("SELECT to_regclass($1) AS version, to_regclass($2) AS media", [`${SCHEMA}.schema_version`, `${SCHEMA}.media_items`]);
      expect(rows[0]).toEqual({ version: null, media: null });
    } finally {
      const { rows } = await admin().query("SELECT c.relkind, obj_description(c.oid, 'pg_class') AS marker FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = 'canvases'", [SCHEMA]);
      if (rows.length === 1 && rows[0].relkind === "v" && rows[0].marker === VIEW_MARKER) {
        await admin().query(`DROP VIEW ${SCHEMA}.canvases`);
      } else {
        throw new Error("The authored conflict view changed; cleanup refused");
      }
    }
    await initializeDatabase();
    expect((await admin().query(`SELECT version FROM ${SCHEMA}.schema_version`)).rows).toEqual([{ version: 1 }]);
  });

  it("installs native JSONB and timestamp columns with one version marker", async () => {
    const { rows } = await admin().query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'media_items' AND column_name IN ('tags_json', 'crop_json', 'created_at', 'x') ORDER BY column_name", [SCHEMA]);
    expect(rows).toEqual([
      { column_name: "created_at", data_type: "timestamp with time zone" },
      { column_name: "crop_json", data_type: "jsonb" },
      { column_name: "tags_json", data_type: "jsonb" },
      { column_name: "x", data_type: "double precision" },
    ]);
    await Promise.all(Array.from({ length: 6 }, () => initializeDatabase()));
    expect((await admin().query(`SELECT count(*)::INTEGER AS count FROM ${SCHEMA}.schema_version`)).rows[0].count).toBe(1);
  });

  it("keeps public sentinel relations untouched and app relations in their fixed namespace", async () => {
    expect((await admin().query("SELECT id, name FROM public.canvases")).rows).toEqual([{ id: SENTINEL_ID, name: "Public sentinel must remain unchanged" }]);
    const { rows } = await admin().query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name", [SCHEMA]);
    expect(rows.map((row) => row.table_name)).toEqual(["agent_tool_approvals", "canvases", "comments", "generation_runs", "media_items", "schema_version", "taste_briefs"]);
    expect((await admin().query("SELECT to_regclass('public.media_items') AS media, to_regclass('public.comments') AS comments")).rows[0]).toEqual({ media: null, comments: null });
  });

  it("creates exactly one default canvas under concurrent first access", async () => {
    expect((await admin().query(`SELECT count(*)::INTEGER AS count FROM ${SCHEMA}.canvases WHERE id = $1`, [DEFAULT_CANVAS_ID])).rows[0].count).toBe(0);
    const rows = await Promise.all(Array.from({ length: 12 }, () => getOrCreateDefaultCanvas()));
    expect(new Set(rows.map((row) => row.id))).toEqual(new Set([DEFAULT_CANVAS_ID]));
    expect(rows.every((row) => row.name === "Untitled inspiration canvas")).toBe(true);
    expect((await admin().query(`SELECT count(*)::INTEGER AS count FROM ${SCHEMA}.canvases WHERE id = $1`, [DEFAULT_CANVAS_ID])).rows[0].count).toBe(1);
  });

  it("persists canvas creation and rename with canonical ISO timestamps", async () => {
    const created = await createCanvas("Authored canvas"), renamed = await updateCanvas(created.id, { name: "Renamed canvas" });
    expect(renamed?.name).toBe("Renamed canvas");
    expect((await getCanvasData(created.id)).canvas).toEqual(renamed);
    iso(created.createdAt); iso(created.updatedAt); iso(renamed!.updatedAt);
    expect(await updateCanvas("missing-authored-canvas", { name: "No row" })).toBeNull();
  });

  it("roundtrips full media metadata through native JSONB and numeric columns", async () => {
    const canvas = await createCanvas("Native metadata"), input = mediaInput(canvas.id), created = await createMediaItem(input);
    const read = await getMediaItem(created.id);
    expect(read).toMatchObject(input); expect(read?.id).toBe(created.id);
    const { rows } = await admin().query(`SELECT tags_json, crop_json, design_analysis_json, parent_ids_json, created_at FROM ${SCHEMA}.media_items WHERE id = $1`, [created.id]);
    expect(rows[0].tags_json).toEqual(["warm, paper", "minimal"]);
    expect(rows[0].crop_json).toEqual(input.cropJson); expect(rows[0].design_analysis_json).toEqual(input.designAnalysisJson);
    expect(rows[0].parent_ids_json).toEqual(["authored,parent"]); expect(rows[0].created_at).toBeInstanceOf(Date);
    iso(read!.createdAt); iso(read!.updatedAt);
  });

  it("persists position crop and comma-bearing tag edits without changing sibling media", async () => {
    const canvas = await createCanvas("Edits"), a = await createMediaItem(mediaInput(canvas.id)), b = await createMediaItem(mediaInput(canvas.id, { title: "Sibling", zIndex: 10 }));
    const patch = { x: -100.125, y: 200.75, width: 410, height: 305, rotation: -22.5,
      cropJson: { x: 0.2, y: 0.1, width: 0.5, height: 0.7 }, tagsJson: ["one, two", "three"], category: "Architecture", subcategory: "Detail" };
    expect(await updateMediaItem(a.id, patch)).toMatchObject(patch);
    expect(await getMediaItem(b.id)).toEqual(b);
    await updateMediaItemsBatch([{ id: a.id, patch: { zIndex: 20 } }, { id: b.id, patch: { x: 15 } }]);
    expect((await listCanvasMedia(canvas.id)).map((item) => item.id)).toEqual([b.id, a.id]);
    expect((await getMediaItem(a.id))?.tagsJson).toEqual(["one, two", "three"]);
  });

  it("persists comment text and enforces its media foreign key", async () => {
    const canvas = await createCanvas("Comments"), media = await createMediaItem(mediaInput(canvas.id));
    const first = await createComment(media.id, "  Authored first\ncomment  "), second = await createComment(media.id, "Authored second");
    const comments = await listComments(media.id);
    expect(new Map(comments.map((row) => [row.id, row.body]))).toEqual(new Map([[first.id, "Authored first\ncomment"], [second.id, "Authored second"]]));
    iso(comments[0].createdAt);
    await expect(createComment("missing-authored-media", "Not an orphan")).rejects.toMatchObject({ code: "23503" });
  });

  it("cascades deleted media comments and canvas media brief and generation children", async () => {
    const canvas = await createCanvas("Cascade"), media = await createMediaItem(mediaInput(canvas.id));
    await createComment(media.id, "Must cascade");
    expect(await deleteMediaItem(media.id)).toEqual(media); expect(await listComments(media.id)).toEqual([]);
    const remaining = await createMediaItem(mediaInput(canvas.id)), brief = await createTasteBrief(canvas.id, [remaining.id], "Authored brief");
    const generation = await createGenerationRun({ canvasId: canvas.id, mediaIds: [remaining.id], prompt: "Authored generation record only" });
    await admin().query(`DELETE FROM ${SCHEMA}.canvases WHERE id = $1`, [canvas.id]);
    expect(await getMediaItem(remaining.id)).toBeNull(); expect(await getGenerationRun(generation.id)).toBeNull();
    expect((await admin().query(`SELECT count(*)::INTEGER AS count FROM ${SCHEMA}.taste_briefs WHERE id = $1`, [brief.id])).rows[0].count).toBe(0);
  });

  it("persists taste briefs with exact selected media identities and literal text", async () => {
    const canvas = await createCanvas("Taste"), media = await createMediaItem(mediaInput(canvas.id));
    const brief = await createTasteBrief(canvas.id, [media.id], "Authored taste\nnot an AI response.");
    expect(await listTasteBriefs(canvas.id)).toEqual([brief]); iso(brief.createdAt);
    expect(brief.mediaItemIdsJson).toEqual([media.id]);
  });

  it("persists generation lifecycle without calling a model and clears an acknowledged error", async () => {
    const canvas = await createCanvas("Generation records"), media = await createMediaItem(mediaInput(canvas.id));
    const run = await createGenerationRun({ canvasId: canvas.id, mediaIds: [media.id], prompt: "Authored prompt" });
    expect(run.status).toBe("pending");
    expect(await updateGenerationRun(run.id, { status: "failed", error: "Authored failure" })).toMatchObject({ status: "failed", error: "Authored failure" });
    const completed = await updateGenerationRun(run.id, { status: "complete", resultMediaItemId: media.id, error: null });
    expect(completed).toMatchObject({ status: "complete", resultMediaItemId: media.id, error: null, mediaItemIdsJson: [media.id] });
    expect(await getGenerationRun(run.id)).toEqual(completed); iso(completed!.updatedAt);
    expect(await getGenerationRun("missing-authored-run")).toBeNull();
  });

  it("persists approval payloads and status independently from any agent execution", async () => {
    const canvas = await createCanvas("Approvals"), media = await createMediaItem(mediaInput(canvas.id));
    const payload = { label: "Authored approval", nested: { enabled: false, tags: ["a,b", "c"], count: 2 } };
    const approval = await createAgentApproval({ toolName: "authored-tool", canvasId: canvas.id, mediaIds: [media.id], payload });
    expect(approval.status).toBe("pending"); expect((await getAgentApproval(approval.id))?.payloadJson).toEqual(payload);
    const accepted = await updateAgentApprovalStatus(approval.id, "approved");
    expect(accepted).toMatchObject({ status: "approved", payloadJson: payload, mediaItemIdsJson: [media.id] });
    expect(await getAgentApproval(approval.id)).toEqual(accepted); iso(accepted!.updatedAt);
  });

  it("roundtrips parameter-shaped strings literally without touching the public sentinel", async () => {
    const text = "Authored '); DROP TABLE public.canvases; -- ? $1 \\ \u2603";
    const canvas = await createCanvas(text), media = await createMediaItem(mediaInput(canvas.id, { title: text, description: text, tagsJson: [text, "x,y"] }));
    const comment = await createComment(media.id, text);
    expect((await getCanvasData(canvas.id)).canvas.name).toBe(text);
    expect(await getMediaItem(media.id)).toMatchObject({ title: text, description: text, tagsJson: [text, "x,y"] });
    expect((await listComments(media.id))[0].body).toBe(comment.body);
    expect((await admin().query("SELECT id, name FROM public.canvases")).rows).toEqual([{ id: SENTINEL_ID, name: "Public sentinel must remain unchanged" }]);
  });

  it("uses one transaction connection and rolls back preceding writes after a constraint failure", async () => {
    const db = await getDatabase(), id = crypto.randomUUID();
    await expect(db.transaction(async (tx) => {
      const a = (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await tx.query(`INSERT INTO ${SCHEMA}.canvases (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`, [id, "Rollback fixture", "2026-11-06T00:00:00.000Z"]);
      expect((await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid).toBe(a);
      await tx.query(`INSERT INTO ${SCHEMA}.canvases (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3)`, [id, "Duplicate fixture", "2026-11-06T00:00:00.000Z"]);
    })).rejects.toMatchObject({ code: "23505" });
    expect((await admin().query(`SELECT count(*)::INTEGER AS count FROM ${SCHEMA}.canvases WHERE id = $1`, [id])).rows[0].count).toBe(0);
    expect((await db.query("SELECT 1 AS healthy")).rows[0].healthy).toBe(1);
  });

  it("refuses an unsupported schema version without changing rows and recovers after fixture restoration", async () => {
    const canvas = await createCanvas("Version fixture");
    await closeDatabase();
    await admin().query(`UPDATE ${SCHEMA}.schema_version SET version = $1`, [SCHEMA_VERSION + 1]);
    try {
      await expect(initializeDatabase()).rejects.toThrow();
      expect((await admin().query(`SELECT name FROM ${SCHEMA}.canvases WHERE id = $1`, [canvas.id])).rows).toEqual([{ name: "Version fixture" }]);
      expect((await admin().query(`SELECT version FROM ${SCHEMA}.schema_version`)).rows).toEqual([{ version: SCHEMA_VERSION + 1 }]);
    } finally {
      await admin().query(`UPDATE ${SCHEMA}.schema_version SET version = $1`, [SCHEMA_VERSION]);
      await closeDatabase();
    }
    await initializeDatabase(); expect((await getCanvasData(canvas.id)).canvas.name).toBe("Version fixture");
  });

  it("closes native pool connections and reopens the persisted records", async () => {
    const canvas = await createCanvas("Reopen fixture"), media = await createMediaItem(mediaInput(canvas.id));
    const db = await getDatabase(), oldPid = Number((await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await closeDatabase();
    let remaining = 1;
    for (let i = 0; i < 20 && remaining; i++) {
      remaining = Number((await admin().query("SELECT count(*)::INTEGER AS count FROM pg_stat_activity WHERE pid = $1", [oldPid])).rows[0].count);
      if (remaining) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(remaining).toBe(0);
    expect(await getMediaItem(media.id)).toEqual(media);
    expect((await getCanvasData(canvas.id)).canvas).toEqual(canvas);
    expect(await getDatabase()).not.toBe(db);
  });
});
