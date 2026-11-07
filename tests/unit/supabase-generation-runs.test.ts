import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  createGenerationRunForUser,
  getGenerationRunForUser,
  updateGenerationRunForUser,
  type CreateSupabaseGenerationRunInput,
  type SupabaseGenerationRunPatch,
  type SupabaseGenerationRunUpdateOptions,
} from "@/lib/db/supabase-repository";

// T2: authored PostgREST boundary fake. No real Supabase, RLS, database or HTTP.
type Row = Record<string, unknown>;
type Operation = "select" | "insert" | "update";
type QueryInfo = { table: string; operation: Operation };
type FakeQuery = {
  select: () => FakeQuery;
  eq: (key: string, value: unknown) => FakeQuery;
  insert: (value: Row) => FakeQuery;
  update: (value: Row) => FakeQuery;
  single: <T>() => Promise<{ data: T; error: Error | null }>;
  maybeSingle: <T>() => Promise<{ data: T | null; error: Error | null }>;
};
const OWNER = "authored-owner", OTHER = "authored-other", CANVAS = "canvas-a", SECOND = "canvas-b";
const STAMP = "2026-11-07T00:00:00.000Z";
const clone = <T>(value: T): T => structuredClone(value);
const input = (): CreateSupabaseGenerationRunInput => ({ canvasId: CANVAS, mediaIds: ["parent-b", "parent-a"], prompt: "Authored two-parent composition" });
const runRow = (id = "run-a", userId = OWNER, canvasId = CANVAS): Row => ({
  id, user_id: userId, canvas_id: canvasId, media_item_ids_json: ["parent-b", "parent-a"],
  status: "pending", prompt: "Original prompt", result_media_item_id: null, error: null, created_at: STAMP, updated_at: STAMP,
});

function fixture() {
  const rows: Record<string, Row[]> = {
    canvases: [
      { id: CANVAS, user_id: OWNER, name: "Owned", created_at: STAMP, updated_at: STAMP },
      { id: SECOND, user_id: OWNER, name: "Second", created_at: STAMP, updated_at: STAMP },
      { id: "foreign-canvas", user_id: OTHER, name: "Foreign", created_at: STAMP, updated_at: STAMP },
    ],
    media_items: [
      { id: "parent-a", user_id: OWNER, canvas_id: CANVAS },
      { id: "parent-b", user_id: OWNER, canvas_id: CANVAS },
      { id: "result-a", user_id: OWNER, canvas_id: CANVAS },
      { id: "other-canvas-parent", user_id: OWNER, canvas_id: SECOND },
      { id: "foreign-parent", user_id: OTHER, canvas_id: "foreign-canvas" },
    ],
    generation_runs: [runRow(), runRow("foreign-run", OTHER, "foreign-canvas")],
  };
  const state = {
    reads: 0, writes: 0,
    before: undefined as ((info: QueryInfo) => void) | undefined,
    failure: undefined as (QueryInfo & { error: Error }) | undefined,
  };
  const from = (table: string) => {
    if (!Object.hasOwn(rows, table)) throw new Error("Unexpected authored table");
    let operation: Operation = "select", payload: Row = {};
    const filters: Array<[string, unknown]> = [];
    const execute = async () => {
      if (operation === "select") state.reads++;
      state.before?.({ table, operation });
      if (state.failure?.table === table && state.failure.operation === operation) {
        const error = state.failure.error; state.failure = undefined; return { data: null, error };
      }
      if (operation === "insert") {
        const row = clone(payload); rows[table].push(row); state.writes++; return { data: clone(row), error: null };
      }
      const matched = rows[table].filter(row => filters.every(([key, value]) => row[key] === value));
      if (matched.length > 1) throw new Error("Ambiguous authored singleton");
      const row = matched[0];
      if (row && operation === "update") { Object.assign(row, clone(payload)); state.writes++; }
      return { data: clone(row ?? null), error: null };
    };
    const query: FakeQuery = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      insert: (value: Row) => { operation = "insert"; payload = clone(value); return query; },
      update: (value: Row) => { operation = "update"; payload = clone(value); return query; },
      single: async <T>() => { const result = await execute(); return { ...result, data: result.data as T }; },
      maybeSingle: async <T>() => { const result = await execute(); return { ...result, data: result.data as T | null }; },
    };
    return query;
  };
  const client = { from } as unknown as SupabaseClient;
  return {
    client, rows, state,
    create: (value: unknown = input(), owner = OWNER) => createGenerationRunForUser(client, owner, value as CreateSupabaseGenerationRunInput),
    get: (id = "run-a", owner = OWNER) => getGenerationRunForUser(client, owner, id),
    update: (patch: unknown, id = "run-a", owner = OWNER, options?: unknown) => updateGenerationRunForUser(client, owner, id, patch as SupabaseGenerationRunPatch, options as SupabaseGenerationRunUpdateOptions | undefined),
  };
}

describe("Supabase generation run repository", () => {
  it("creates the local DTO from owned canvas and all ordered parents without exposing an owner field", async () => {
    const h = fixture(), result = await h.create();
    expect(result).toEqual({ id: expect.any(String), canvasId: CANVAS, mediaItemIdsJson: ["parent-b", "parent-a"],
      status: "pending", prompt: input().prompt, resultMediaItemId: null, error: null, createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(result?.createdAt).toBe(result?.updatedAt); expect(result).not.toHaveProperty("userId");
    expect(h.rows.generation_runs.at(-1)).toMatchObject({ user_id: OWNER, canvas_id: CANVAS, media_item_ids_json: ["parent-b", "parent-a"] });
    expect(h.state.writes).toBe(1);
  });

  it("accepts exactly the four existing generation statuses", async () => {
    for (const status of ["pending", "running", "complete", "failed"] as const) {
      const h = fixture(); expect((await h.create({ ...input(), status }))?.status).toBe(status);
    }
  });

  it("rejects invalid create shapes and duplicate or insufficient parents before querying", async () => {
    for (const value of [null, [], { ...input(), id: "chosen-id" }, { ...input(), userId: OTHER },
      { ...input(), mediaIds: ["parent-a"] }, { ...input(), mediaIds: ["parent-a", "parent-a"] },
      { ...input(), mediaIds: ["parent-a", ""] }, { ...input(), canvasId: "x".repeat(1025) },
      { ...input(), prompt: null }, { ...input(), prompt: "x".repeat(4001) }, { ...input(), status: "queued" }]) {
      const h = fixture(); await expect(h.create(value)).rejects.toThrow("Invalid generation run input.");
      expect(h.state).toMatchObject({ reads: 0, writes: 0 });
    }
  });

  it("returns null for missing or foreign canvases without inserting a run", async () => {
    for (const canvasId of ["missing-canvas", "foreign-canvas"]) {
      const h = fixture(); await expect(h.create({ ...input(), canvasId })).resolves.toBeNull(); expect(h.state.writes).toBe(0);
    }
  });

  it("rejects any missing foreign or different-canvas parent instead of filtering it out", async () => {
    for (const parent of ["missing-parent", "foreign-parent", "other-canvas-parent"]) {
      const h = fixture(), before = clone(h.rows.generation_runs);
      await expect(h.create({ ...input(), mediaIds: ["parent-a", "parent-b", parent] })).resolves.toBeNull();
      expect(h.rows.generation_runs).toEqual(before); expect(h.state.writes).toBe(0);
    }
  });

  it("reads only the requested owned run and its owned canvas", async () => {
    const h = fixture(); expect(await h.get()).toMatchObject({ id: "run-a", canvasId: CANVAS, mediaItemIdsJson: ["parent-b", "parent-a"] });
    await expect(h.get("foreign-run")).resolves.toBeNull(); await expect(h.get("missing-run")).resolves.toBeNull();
    h.rows.canvases[0].user_id = OTHER; await expect(h.get()).resolves.toBeNull(); expect(h.state.writes).toBe(0);
  });

  it("rejects malformed stored parent selections without silently dropping entries", async () => {
    for (const parents of [null, {}, [], ["parent-a"], ["parent-a", "parent-a"], ["parent-a", "", "parent-b"],
      ["parent-a", 7, "parent-b"], ["parent-a", "x\0y"], ["parent-a", "x".repeat(1025)]]) {
      const h = fixture(); h.rows.generation_runs[0].media_item_ids_json = parents;
      await expect(h.get()).rejects.toThrow("Invalid stored generation run."); expect(h.state.writes).toBe(0);
    }
  });

  it("rejects unknown stored statuses and malformed basic run fields", async () => {
    for (const patch of [{ status: "queued" }, { canvas_id: " " }, { prompt: 7 }, { error: false },
      { result_media_item_id: false }, { created_at: null }, { updated_at: "not-a-date" }]) {
      const h = fixture(); Object.assign(h.rows.generation_runs[0], patch);
      await expect(h.get()).rejects.toThrow("Invalid stored generation run."); expect(h.state.writes).toBe(0);
    }
  });

  it("rejects empty overlong and NUL identifiers before reading or writing", async () => {
    for (const value of ["", "   ", "x\0y", "x".repeat(1025)]) {
      const h = fixture(); await expect(h.create(input(), value)).rejects.toThrow();
      await expect(h.get(value)).rejects.toThrow(); await expect(h.update({ status: "failed" }, value)).rejects.toThrow();
      expect(h.state).toMatchObject({ reads: 0, writes: 0 });
    }
  });

  it("rejects identity ownership canvas parent and timestamp patch fields before a write", async () => {
    for (const key of ["id", "userId", "user_id", "canvasId", "canvas_id", "mediaItemIdsJson", "media_item_ids_json", "createdAt", "created_at", "updatedAt", "updated_at"]) {
      const h = fixture(); await expect(h.update({ status: "failed", [key]: "replacement" })).rejects.toThrow("Invalid generation run input.");
      expect(h.state).toMatchObject({ reads: 0, writes: 0 });
    }
  });

  it("updates allowed fields and can record failure after a parent is deleted", async () => {
    const h = fixture(), before = clone(h.rows.generation_runs[0]); h.rows.media_items = h.rows.media_items.filter(row => row.id !== "parent-b");
    const result = await h.update({ status: "failed", prompt: "Revised prompt", error: "Authored parent unavailable" });
    expect(result).toMatchObject({ id: "run-a", canvasId: CANVAS, status: "failed", prompt: "Revised prompt", error: "Authored parent unavailable",
      mediaItemIdsJson: ["parent-b", "parent-a"], createdAt: STAMP });
    expect(h.rows.generation_runs[0]).toMatchObject({ id: before.id, user_id: before.user_id, canvas_id: before.canvas_id, media_item_ids_json: before.media_item_ids_json, created_at: before.created_at });
    expect(h.rows.generation_runs[1]).toEqual(runRow("foreign-run", OTHER, "foreign-canvas")); expect(h.state.writes).toBe(1);
  });

  it("accepts only an owned same-canvas result and allows clearing it explicitly", async () => {
    for (const resultMediaItemId of ["missing-result", "foreign-parent", "other-canvas-parent"]) {
      const h = fixture(); await expect(h.update({ status: "complete", resultMediaItemId })).resolves.toBeNull(); expect(h.state.writes).toBe(0);
    }
    const h = fixture(); expect(await h.update({ status: "complete", resultMediaItemId: "result-a", error: null })).toMatchObject({ status: "complete", resultMediaItemId: "result-a", error: null });
    expect(await h.update({ resultMediaItemId: null })).toMatchObject({ resultMediaItemId: null }); expect(h.state.writes).toBe(2);
  });

  it("does not update missing foreign or newly inaccessible runs", async () => {
    for (const runId of ["missing-run", "foreign-run"]) {
      const h = fixture(), before = clone(h.rows.generation_runs);
      await expect(h.update({ error: "Authored refusal" }, runId)).resolves.toBeNull(); expect(h.rows.generation_runs).toEqual(before); expect(h.state.writes).toBe(0);
    }
    const h = fixture(); h.rows.canvases = h.rows.canvases.filter(row => row.id !== CANVAS);
    await expect(h.update({ status: "failed" })).resolves.toBeNull(); expect(h.state.writes).toBe(0);
  });

  it("treats empty and undefined-only patches as owned reads without timestamp writes", async () => {
    const h = fixture(); await expect(h.update({})).resolves.toMatchObject({ updatedAt: STAMP });
    await expect(h.update({ status: undefined, prompt: undefined, resultMediaItemId: undefined, error: undefined })).resolves.toMatchObject({ updatedAt: STAMP });
    expect(h.state.writes).toBe(0);
  });

  it("rejects invalid mutable values before any query", async () => {
    for (const value of [null, [], { status: "queued" }, { prompt: null }, { prompt: "x".repeat(4001) }, { error: 7 }, { resultMediaItemId: "" }, { resultMediaItemId: false }]) {
      const h = fixture(); await expect(h.update(value)).rejects.toThrow("Invalid generation run input."); expect(h.state).toMatchObject({ reads: 0, writes: 0 });
    }
    for (const options of [null, [], { expectedStatus: "queued" }, { expectedStatus: null }, { expectedStatus: "pending", owner: OTHER }]) {
      const h = fixture(); await expect(h.update({ status: "running" }, "run-a", OWNER, options)).rejects.toThrow("Invalid generation run input.");
      expect(h.state).toMatchObject({ reads: 0, writes: 0 });
    }
  });

  it("propagates lookup insert and update errors without partial fake-store writes", async () => {
    for (const [table, operation] of [["media_items", "select"], ["generation_runs", "insert"], ["generation_runs", "update"]] as const) {
      const h = fixture(), before = clone(h.rows.generation_runs), error = new Error("Authored PostgREST refusal");
      h.state.failure = { table, operation, error };
      await expect(operation === "update" ? h.update({ status: "failed" }) : h.create()).rejects.toBe(error);
      expect(h.rows.generation_runs).toEqual(before); expect(h.state.writes).toBe(0);
    }
  });

  it("captures caller inputs and patches before asynchronous ownership lookups", async () => {
    const h = fixture(), submitted = input(); let changed = false;
    h.state.before = () => { if (!changed) { changed = true; submitted.mediaIds.reverse(); submitted.mediaIds.push("foreign-parent"); submitted.prompt = "Changed after submission"; } };
    expect(await h.create(submitted)).toMatchObject({ mediaItemIdsJson: ["parent-b", "parent-a"], prompt: "Authored two-parent composition" });
    const patch: SupabaseGenerationRunPatch = { status: "complete", resultMediaItemId: "result-a" }; changed = false;
    h.state.before = () => { if (!changed) { changed = true; patch.resultMediaItemId = "foreign-parent"; patch.status = "failed"; } };
    expect(await h.update(patch)).toMatchObject({ status: "complete", resultMediaItemId: "result-a" });
  });

  it("does not follow a run retargeted to another canvas before its update", async () => {
    const h = fixture(); h.state.before = ({ table, operation }) => {
      if (table === "generation_runs" && operation === "update") h.rows.generation_runs[0].canvas_id = SECOND;
    };
    await expect(h.update({ status: "failed" })).resolves.toBeNull();
    expect(h.rows.generation_runs[0]).toMatchObject({ canvas_id: SECOND, status: "pending", error: null }); expect(h.state.writes).toBe(0);
  });

  it("matches and snapshots the expected status before ownership lookups", async () => {
    const h = fixture(), options = { expectedStatus: "pending" as const };
    h.state.before = () => { Object.assign(options, { expectedStatus: "complete" }); };
    expect(await h.update({ status: "running" }, "run-a", OWNER, options)).toMatchObject({ status: "running" });
    expect(h.state.writes).toBe(1);
  });

  it("returns null on a status mismatch without a fallback or completed-run overwrite", async () => {
    const h = fixture(); h.rows.generation_runs[0].status = "complete"; h.rows.generation_runs[0].result_media_item_id = "result-a";
    const before = clone(h.rows.generation_runs);
    await expect(h.update({ status: "failed", error: "Lost completion acknowledgement" }, "run-a", OWNER, { expectedStatus: "running" })).resolves.toBeNull();
    expect(h.rows.generation_runs).toEqual(before); expect(h.state.writes).toBe(0);
  });

  it("preserves a competing completion that wins between the read and conditional update", async () => {
    const h = fixture(); h.rows.generation_runs[0].status = "running";
    h.state.before = ({ table, operation }) => {
      if (table === "generation_runs" && operation === "update") Object.assign(h.rows.generation_runs[0], { status: "complete", result_media_item_id: "result-a" });
    };
    await expect(h.update({ status: "failed", error: "Authored stale failure" }, "run-a", OWNER, { expectedStatus: "running" })).resolves.toBeNull();
    expect(h.rows.generation_runs[0]).toMatchObject({ status: "complete", result_media_item_id: "result-a", error: null }); expect(h.state.writes).toBe(0);
  });
});
