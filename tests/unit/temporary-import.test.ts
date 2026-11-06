import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { POST } from "@/app/api/canvas/[id]/import/route";
import {
  importTemporaryCanvasItem,
  type TemporaryImportDependencies,
  type TemporaryImportItem,
} from "@/lib/api/temporary-import";
import {
  createCommentForUser,
  createMediaItemForUser,
} from "@/lib/db/supabase-repository";
import type { CommentRecord, MediaItem } from "@/lib/types";

// These are callback/SDK boundary fixtures, not a database or RLS emulator.
const boundary = vi.hoisted(() => ({
  configured: vi.fn(),
  hosted: vi.fn(),
  serverClient: vi.fn(),
  storage: vi.fn(),
  metadata: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  hasSupabaseConfig: boundary.configured,
  isHostedRuntime: boundary.hosted,
  getConfig: () => ({ maxUploadMb: 50, enableVideoUploads: true, storageDriver: "supabase" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: boundary.serverClient }));
vi.mock("@/lib/storage/adapter", () => ({
  SupabaseStorageAdapter: function (...args: unknown[]) { return boundary.storage(...args); },
  VercelBlobStorageAdapter: function (...args: unknown[]) { return boundary.storage(...args); },
}));
vi.mock("@/lib/workflows/media-processing", () => ({ extractImageMetadata: boundary.metadata }));

const USER = "11111111-1111-4111-8111-111111111111";
const CANVAS = "22222222-2222-4222-8222-222222222222";
const STAMP = "2026-11-06T00:00:00.000Z";
// Upload validation is real; image decoding is an injected, authored boundary.
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const clone = <T,>(value: T): T => structuredClone(value);
type CreateMediaInput = Parameters<TemporaryImportDependencies["createMedia"]>[0];

function sourceItem(): TemporaryImportItem {
  return {
    sourceId: "temp-33333333-3333-4333-8333-333333333333",
    title: "Authored paper study",
    x: -12.5, y: 48.25, width: 320, height: 240, zIndex: 7, rotation: 12.5,
    cropJson: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    tagsJson: ["warm, paper", "minimal"],
    category: "Editorial", subcategory: "Printed matter",
    description: "Authored description\nwith a second line.",
    comments: [
      { sourceId: "temp-comment-44444444-4444-4444-8444-444444444444", body: "Authored first comment" },
      { sourceId: "temp-comment-55555555-5555-4555-8555-555555555555", body: "Authored second comment\nwith detail" },
    ],
  };
}

function file(name = "authored.png", bytes: Uint8Array = PNG): File {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

function mediaRow(input: CreateMediaInput): MediaItem {
  if (!input.id) throw new Error("The importer must supply its stable identity");
  return { ...clone(input), id: input.id, userId: USER, createdAt: STAMP, updatedAt: STAMP };
}

function harness() {
  const media = new Map<string, MediaItem>();
  const comments = new Map<string, CommentRecord>();
  const objects = new Map<string, Buffer>();
  const getCanvas = vi.fn(async () => ({ id: CANVAS, name: "Owned canvas", createdAt: STAMP, updatedAt: STAMP }));
  const getMedia = vi.fn(async (id: string) => clone(media.get(id) ?? null));
  const createMedia = vi.fn(async (input: CreateMediaInput) => {
    const row = mediaRow(input);
    if (media.has(row.id)) throw { code: "23505" };
    media.set(row.id, clone(row));
    return clone(row);
  });
  const getComment = vi.fn(async (id: string) => clone(comments.get(id) ?? null));
  const createComment = vi.fn(async (mediaId: string, body: string, id: string) => {
    if (comments.has(id)) throw { code: "23505" };
    const row = { id, mediaItemId: mediaId, body, createdAt: STAMP, updatedAt: STAMP };
    comments.set(id, clone(row));
    return clone(row);
  });
  const putFile = vi.fn<TemporaryImportDependencies["storage"]["putFile"]>(async (input, key) => {
    const bytes = input instanceof File ? Buffer.from(await input.arrayBuffer()) : Buffer.from(input);
    objects.set(key, bytes);
    return `https://authored-assets.invalid/${encodeURIComponent(key)}`;
  });
  const metadata = vi.fn<TemporaryImportDependencies["extractImageMetadata"]>(async () => ({ width: 640, height: 480, thumbnail: null }));
  const deps: TemporaryImportDependencies = {
    getCanvas, getMedia, createMedia, getComment, createComment,
    storage: { putFile }, storageDriver: "supabase", extractImageMetadata: metadata,
  };
  const transfer = (item: unknown = sourceItem(), upload = file()) =>
    importTemporaryCanvasItem({ userId: USER, canvasId: CANVAS, item, file: upload }, deps);
  return { deps, transfer, media, comments, objects, getCanvas, getMedia, createMedia, getComment, createComment, putFile, metadata };
}

function conflictingSupabase() {
  const single = vi.fn(async () => ({ data: null, error: { code: "23505", message: "Authored unique conflict" } }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as SupabaseClient, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  boundary.configured.mockReturnValue(true);
  boundary.hosted.mockReturnValue(true);
  boundary.serverClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } }, error: null })) } });
  boundary.storage.mockReturnValue({ putFile: vi.fn() });
});

describe("temporary canvas import service", () => {
  it("inserts complete metadata and comma-bearing tags without a later patch or thumbnail collision", async () => {
    const h = harness(), item = sourceItem(), before = clone(item), thumbnail = Buffer.from("authored thumbnail");
    h.metadata.mockResolvedValue({ width: 640, height: 480, thumbnail });
    const result = await h.transfer(item, file("thumbnail.webp"));
    expect(h.createMedia).toHaveBeenCalledTimes(1);
    expect(h.createMedia.mock.calls[0][0]).toMatchObject({
      canvasId: CANVAS, title: item.title, x: item.x, y: item.y, width: item.width,
      height: item.height, zIndex: item.zIndex, rotation: item.rotation,
      cropJson: item.cropJson, tagsJson: ["warm, paper", "minimal"], category: item.category,
      subcategory: item.subcategory, description: item.description, intrinsicWidth: 640,
      intrinsicHeight: 480, analysisStatus: "skipped", parentIdsJson: [],
    });
    expect(result.media.storageKey).not.toBe(result.media.thumbnailStorageKey);
    expect(h.objects.get(result.media.storageKey)).toEqual(Buffer.from(PNG));
    expect(h.objects.get(result.media.thumbnailStorageKey!)).toEqual(thumbnail);
    expect(result.comments.map(({ sourceId, comment }) => ({ sourceId, body: comment.body }))).toEqual(item.comments);
    expect(item).toEqual(before);
  });

  it("resumes only missing comments after a partial failure without reuploading or reinserting media", async () => {
    const h = harness(), normal = h.createComment.getMockImplementation()!, item = sourceItem();
    let fail = true;
    h.createComment.mockImplementation(async (...args) => {
      if (args[1] === item.comments[1].body && fail) { fail = false; throw new Error("Authored comment unavailable"); }
      return normal(...args);
    });
    await expect(h.transfer(item)).rejects.toThrow("Authored comment unavailable");
    expect(h.media.size).toBe(1); expect(h.comments.size).toBe(1);
    const result = await h.transfer(item);
    expect(h.media.size).toBe(1); expect(h.comments.size).toBe(2);
    expect(h.putFile).toHaveBeenCalledTimes(1); expect(h.createMedia).toHaveBeenCalledTimes(1);
    expect(result.comments.map(({ comment }) => comment.body)).toEqual(item.comments.map(({ body }) => body));
  });

  it("recovers media and comment commits whose acknowledgments were lost without duplicate records", async () => {
    for (const phase of ["media", "comment"] as const) {
      const h = harness(); let lost = true;
      if (phase === "media") {
        const normal = h.createMedia.getMockImplementation()!;
        h.createMedia.mockImplementation(async (...args) => {
          const row = await normal(...args);
          if (lost) { lost = false; throw new Error("Authored lost acknowledgment"); }
          return row;
        });
      } else {
        const normal = h.createComment.getMockImplementation()!;
        h.createComment.mockImplementation(async (...args) => {
          const row = await normal(...args);
          if (lost) { lost = false; throw new Error("Authored lost acknowledgment"); }
          return row;
        });
      }
      await expect(h.transfer()).rejects.toThrow("Authored lost acknowledgment");
      const result = await h.transfer();
      expect(h.media.size).toBe(1); expect(h.comments.size).toBe(2);
      expect(h.createMedia).toHaveBeenCalledTimes(1); expect(h.putFile).toHaveBeenCalledTimes(1);
      expect(result.comments).toHaveLength(2);
    }
  });

  it("returns current signed-in edits on replay without overwriting their metadata", async () => {
    const h = harness(), first = await h.transfer();
    const edited = { ...first.media, title: "Later account edit", x: 999, tagsJson: ["edited, tag"], cropJson: null };
    h.media.set(edited.id, clone(edited));
    const result = await h.transfer();
    expect(result.media).toEqual(edited); expect(h.media.get(edited.id)).toEqual(edited);
    expect(h.createMedia).toHaveBeenCalledTimes(1); expect(h.putFile).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed source snapshot or file with 409 while preserving the existing import", async () => {
    const h = harness(), item = sourceItem(), first = await h.transfer(item), saved = clone(first.media);
    await expect(h.transfer({ ...item, title: "Changed temporary title" })).rejects.toMatchObject({ status: 409, code: "temporary_import_conflict" });
    await expect(h.transfer(item, file("authored.png", new Uint8Array([...PNG, 1])))).rejects.toMatchObject({ status: 409, code: "temporary_import_conflict" });
    expect(h.media.get(saved.id)).toEqual(saved);
    expect(h.putFile).toHaveBeenCalledTimes(1); expect(h.createMedia).toHaveBeenCalledTimes(1);
  });

  it("rereads an identical winner after a parallel insert conflicts through the real repository adapter", async () => {
    const h = harness(), normalMedia = h.createMedia.getMockImplementation()!, normalComment = h.createComment.getMockImplementation()!;
    const conflict = conflictingSupabase(); let probes = 0, release!: () => void;
    const bothReading = new Promise<void>((resolve) => { release = resolve; });
    h.getMedia.mockImplementation(async (id) => {
      if (++probes <= 2) { if (probes === 2) release(); await bothReading; return null; }
      return clone(h.media.get(id) ?? null);
    });
    h.createMedia.mockImplementation(async (input) => h.media.has(input.id!)
      ? createMediaItemForUser(conflict.client, USER, input) : normalMedia(input));
    h.createComment.mockImplementation(async (...args) => h.comments.has(args[2])
      ? createCommentForUser(conflict.client, USER, args[0], args[1], args[2]) : normalComment(...args));
    const [a, b] = await Promise.all([h.transfer(), h.transfer()]);
    expect(a.media.id).toBe(b.media.id); expect(a.comments).toEqual(b.comments);
    expect(h.media.size).toBe(1); expect(h.comments.size).toBe(2);
    expect(h.createMedia).toHaveBeenCalledTimes(2);
    expect(conflict.from).toHaveBeenCalledWith("media_items");
    expect(h.getMedia.mock.calls.length).toBeGreaterThan(2);
  });

  it("refuses a conflicting winner belonging to another owner instead of accepting a unique error as success", async () => {
    const h = harness();
    h.createMedia.mockImplementation(async (input) => {
      const row = { ...mediaRow(input), userId: "another-owner" };
      h.media.set(row.id, row);
      throw { code: "23505" };
    });
    await expect(h.transfer()).rejects.toMatchObject({ status: 409, code: "temporary_import_conflict" });
    expect(h.createComment).not.toHaveBeenCalled();
    expect([...h.media.values()][0].userId).toBe("another-owner");
  });

  it("propagates an unrelated insert failure without a blind retry or conflict reread", async () => {
    const h = harness(), unavailable = new Error("Authored database unavailable");
    h.createMedia.mockRejectedValue(unavailable);
    await expect(h.transfer()).rejects.toBe(unavailable);
    expect(h.createMedia).toHaveBeenCalledTimes(1); expect(h.getMedia).toHaveBeenCalledTimes(1);
    expect(h.createComment).not.toHaveBeenCalled();
  });

  it("rejects malformed snapshots before any ownership lookup or storage write", async () => {
    const h = harness(), item = sourceItem();
    const invalid = [
      { ...item, userId: "caller-controlled-owner" },
      { ...item, cropJson: { x: 0, y: 0, width: 2, height: 1 } },
      { ...item, comments: [item.comments[0], item.comments[0]] },
      { ...item, width: Number.NaN },
    ];
    for (const value of invalid) await expect(h.transfer(value)).rejects.toMatchObject({ status: 400, code: "invalid_temporary_item" });
    expect(h.getCanvas).not.toHaveBeenCalled(); expect(h.putFile).not.toHaveBeenCalled(); expect(h.createMedia).not.toHaveBeenCalled();
  });

  it("rejects an invalid upload before metadata extraction or storage writes", async () => {
    const h = harness();
    await expect(h.transfer(sourceItem(), new File(["authored text"], "not-media.txt", { type: "text/plain" })))
      .rejects.toMatchObject({ status: 400, code: "invalid_import_file" });
    expect(h.metadata).not.toHaveBeenCalled(); expect(h.putFile).not.toHaveBeenCalled();
  });
});

function request(form?: FormData): Request {
  return new Request(`http://127.0.0.1/api/canvas/${CANVAS}/import`, { method: "POST", ...(form ? { body: form } : {}) });
}
const params = () => ({ params: Promise.resolve({ id: CANVAS }) });

describe("temporary canvas import request boundaries", () => {
  it("rejects local persistence with 401 before reading a file or constructing storage", async () => {
    boundary.configured.mockReturnValue(false); boundary.hosted.mockReturnValue(false);
    const input = request(), readForm = vi.spyOn(input, "formData");
    const response = await POST(input, params());
    expect(response.status).toBe(401); expect(readForm).not.toHaveBeenCalled();
    expect(boundary.serverClient).not.toHaveBeenCalled(); expect(boundary.storage).not.toHaveBeenCalled();
  });

  it("rejects an expired Supabase session with 401 before reading a file or constructing storage", async () => {
    boundary.serverClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: "Authored expired session" } })) } });
    const input = request(), readForm = vi.spyOn(input, "formData");
    const response = await POST(input, params());
    expect(response.status).toBe(401); expect(readForm).not.toHaveBeenCalled(); expect(boundary.storage).not.toHaveBeenCalled();
  });

  it("uses the authenticated owner filter and rejects an unowned canvas without storing the upload", async () => {
    const eq = vi.fn(); const query = { select: vi.fn(), eq, maybeSingle: vi.fn(async () => ({ data: null, error: null })) };
    query.select.mockReturnValue(query); eq.mockReturnValue(query);
    const from = vi.fn(() => query), putFile = vi.fn();
    boundary.serverClient.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } }, error: null })) }, from });
    boundary.storage.mockReturnValue({ putFile });
    const form = new FormData(); form.set("file", file()); form.set("item", JSON.stringify(sourceItem()));
    const response = await POST(request(form), params());
    expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ code: "canvas_not_found" });
    expect(from).toHaveBeenCalledWith("canvases"); expect(eq).toHaveBeenCalledWith("id", CANVAS); expect(eq).toHaveBeenCalledWith("user_id", USER);
    expect(putFile).not.toHaveBeenCalled(); expect(boundary.metadata).not.toHaveBeenCalled();
  });

  it("rejects extra multipart fields before constructing storage", async () => {
    const form = new FormData(); form.set("file", file()); form.set("item", JSON.stringify(sourceItem())); form.set("userId", "untrusted-owner");
    const response = await POST(request(form), params());
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "invalid_import_request" });
    expect(boundary.storage).not.toHaveBeenCalled();
  });
});
