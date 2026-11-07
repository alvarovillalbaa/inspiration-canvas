import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MissingAICredentialsError } from "@/lib/ai/service";
import type { CreateSupabaseMediaInput, SupabaseGenerationRunPatch } from "@/lib/db/supabase-repository";
import type { GenerationRun, MediaItem } from "@/lib/types";
import { runSupabaseChildGeneration, SupabaseChildGenerationError } from "@/lib/workflows/supabase-child-generation";

// These are mocked request/SDK/model/storage boundaries. They do not exercise
// Supabase auth, RLS, image decoding, a real model, or a hosted request lifetime.
const boundary = vi.hoisted(() => ({
  config: vi.fn(), getCanvas: vi.fn(), getMedia: vi.fn(), listMedia: vi.fn(),
  createRun: vi.fn(), getRun: vi.fn(), updateRun: vi.fn(), createMedia: vi.fn(),
  propose: vi.fn(), generate: vi.fn(), metadata: vi.fn(), storage: vi.fn(),
  supabaseStorage: vi.fn(), blobStorage: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ getConfig: boundary.config }));
vi.mock("@/lib/db/supabase-repository", () => ({
  getCanvasForUser: boundary.getCanvas, getMediaItemForUser: boundary.getMedia,
  listCanvasMediaForUser: boundary.listMedia, createGenerationRunForUser: boundary.createRun,
  getGenerationRunForUser: boundary.getRun, updateGenerationRunForUser: boundary.updateRun,
  createMediaItemForUser: boundary.createMedia,
}));
vi.mock("@/lib/ai/service", () => ({
  MissingAICredentialsError: class extends Error {},
  proposeChildMediaPrompt: boundary.propose, generateChildImageBytes: boundary.generate,
}));
vi.mock("@/lib/workflows/media-processing", () => ({ extractImageMetadata: boundary.metadata }));
vi.mock("@/lib/storage/adapter", () => ({
  getStorageAdapter: boundary.storage,
  SupabaseStorageAdapter: function (...args: unknown[]) { return boundary.supabaseStorage(...args); },
  VercelBlobStorageAdapter: function (...args: unknown[]) { return boundary.blobStorage(...args); },
}));

const USER = "11111111-1111-4111-8111-111111111111";
const FOREIGN = "99999999-9999-4999-8999-999999999999";
const CANVAS = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const PARENTS = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const STAMP = "2026-11-07T08:00:00.000Z";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const WEBP = Buffer.from("RIFF0000WEBPauthored-thumbnail", "ascii");
const clone = <T,>(value: T): T => structuredClone(value);

function parent(id: string, x: number): MediaItem {
  return {
    id, userId: USER, canvasId: CANVAS, type: "image", url: "https://authored.invalid/parent.png",
    storageDriver: "supabase", storageKey: `${USER}/parent/${id}.png`, thumbnailUrl: null,
    thumbnailStorageKey: null, mimeType: "image/png", fileName: "parent.png", title: "Authored parent",
    sizeBytes: PNG.length, intrinsicWidth: 640, intrinsicHeight: 480, durationSeconds: null,
    x, y: 50, width: 200, height: 300, zIndex: 7, rotation: 0, cropJson: null,
    tagsJson: ["authored"], category: null, subcategory: null, description: "Paper and light",
    designAnalysisJson: null, analysisStatus: "complete", analysisError: null, parentIdsJson: [],
    createdAt: STAMP, updatedAt: STAMP,
  };
}

function harness() {
  const media = new Map(PARENTS.map((id, index) => [id, parent(id, index * 300)]));
  const objects = new Map<string, Buffer>();
  let current: GenerationRun | null = null;
  const getUser = vi.fn(async () => ({ data: { user: { id: USER } }, error: null }));
  const supabase = { auth: { getUser } } as unknown as SupabaseClient;
  boundary.config.mockReturnValue({ storageDriver: "local", maxUploadMb: 1, enableVideoUploads: true });
  boundary.getCanvas.mockImplementation(async () => ({ id: CANVAS, name: "Owned canvas", createdAt: STAMP, updatedAt: STAMP }));
  boundary.getMedia.mockImplementation(async (_client: SupabaseClient, _user: string, id: string) => clone(media.get(id) ?? null));
  boundary.listMedia.mockImplementation(async () => clone([...media.values()]));
  boundary.createRun.mockImplementation(async (_client: SupabaseClient, _user: string, input: { canvasId: string; mediaIds: string[]; prompt: string }) => {
    current = { id: RUN, canvasId: input.canvasId, mediaItemIdsJson: [...input.mediaIds], prompt: input.prompt,
      status: "pending", resultMediaItemId: null, error: null, createdAt: STAMP, updatedAt: STAMP };
    return clone(current);
  });
  boundary.getRun.mockImplementation(async () => clone(current));
  const update = async (_client: SupabaseClient, _user: string, id: string, patch: SupabaseGenerationRunPatch, options: { expectedStatus: string }) => {
    if (!current || current.id !== id || current.status !== options.expectedStatus) return null;
    current = { ...current, ...clone(patch) };
    return clone(current);
  };
  boundary.updateRun.mockImplementation(update);
  const insert = async (_client: SupabaseClient, _user: string, input: CreateSupabaseMediaInput) => {
    if (!input.id) throw new Error("Expected predetermined child identity");
    const row: MediaItem = { ...clone(input), id: input.id, userId: USER, createdAt: STAMP, updatedAt: STAMP };
    media.set(row.id, row);
    return clone(row);
  };
  boundary.createMedia.mockImplementation(insert);
  const putFile = vi.fn(async (bytes: Buffer, key: string) => {
    objects.set(key, Buffer.from(bytes));
    return `https://authored.invalid/${key}`;
  });
  const deleteFile = vi.fn();
  boundary.storage.mockImplementation(() => { throw new Error("Global cached storage must not be selected"); });
  boundary.supabaseStorage.mockReturnValue({ putFile, deleteFile });
  boundary.blobStorage.mockReturnValue({ putFile, deleteFile });
  boundary.propose.mockResolvedValue("  Authored combined image  ");
  boundary.generate.mockResolvedValue({ data: PNG, mediaType: "image/png" });
  boundary.metadata.mockResolvedValue({ width: 640, height: 480, thumbnail: WEBP });
  const execute = (extra: Partial<Parameters<typeof runSupabaseChildGeneration>[0]> = {}) =>
    runSupabaseChildGeneration({ supabase, userId: USER, canvasId: CANVAS, mediaIds: [...PARENTS], ...extra });
  return { execute, getUser, supabase, media, objects, putFile, deleteFile, update, insert,
    current: () => clone(current), setRun: (run: GenerationRun) => { current = clone(run); } };
}

beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("request-bound Supabase child generation", () => {
  it("creates complete child metadata with authenticated storage and fresh same-canvas parents", async () => {
    const h = harness();
    const result = await h.execute();
    expect(result.prompt).toBe("Authored combined image");
    expect(result.run).toMatchObject({ id: RUN, status: "complete", resultMediaItemId: result.media.id, error: null });
    expect(result.media).toMatchObject({ userId: USER, canvasId: CANVAS, type: "generated_image",
      x: 572, y: 50, width: 360, height: 360, zIndex: 8, rotation: 0,
      tagsJson: ["generated", "child-media"], parentIdsJson: PARENTS,
      description: result.prompt, intrinsicWidth: 640, intrinsicHeight: 480,
      mimeType: "image/png", sizeBytes: PNG.length, analysisStatus: "complete", storageDriver: "supabase" });
    expect(boundary.supabaseStorage).toHaveBeenCalledWith(h.supabase);
    expect(boundary.storage).not.toHaveBeenCalled();
    expect(boundary.blobStorage).not.toHaveBeenCalled();
    expect(h.objects.get(result.media.storageKey)).toEqual(Buffer.from(PNG));
    expect(h.objects.get(result.media.thumbnailStorageKey!)).toEqual(WEBP);
    expect(result.media.storageKey.startsWith(`${USER}/`)).toBe(true);
    expect(result.media.thumbnailStorageKey?.startsWith(`${USER}/`)).toBe(true);
    expect(h.getUser).toHaveBeenCalledOnce();
    expect(boundary.getCanvas.mock.calls.length).toBeGreaterThan(3);
    expect(boundary.getMedia.mock.calls.every(call => call[0] === h.supabase && call[1] === USER)).toBe(true);
    expect(boundary.updateRun.mock.calls.map(call => call[4])).toEqual([
      { expectedStatus: "pending" }, { expectedStatus: "running" }, { expectedStatus: "running" },
    ]);
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("uses the supplied prompt and configured Blob without selecting a local storage fallback", async () => {
    const h = harness();
    boundary.config.mockReturnValue({ storageDriver: "blob", maxUploadMb: 1, enableVideoUploads: true });
    const result = await h.execute({ prompt: "  Deliberate composition  " });
    expect(result.prompt).toBe("Deliberate composition");
    expect(boundary.propose).not.toHaveBeenCalled();
    expect(boundary.blobStorage).toHaveBeenCalledWith();
    expect(boundary.supabaseStorage).not.toHaveBeenCalled();
    expect(boundary.storage).not.toHaveBeenCalled();
    expect(result.media.storageDriver).toBe("blob");
  });

  it("rejects duplicate parents and malformed input before auth or side effects", async () => {
    const h = harness();
    for (const extra of [{ mediaIds: [PARENTS[0], PARENTS[0]] }, { mediaIds: [PARENTS[0]] },
      { canvasId: " " }, { userId: "../foreign" }, { prompt: "x".repeat(4001) }]) {
      await expect(h.execute(extra)).rejects.toMatchObject({ code: "invalid_request", runId: null });
    }
    expect(h.getUser).not.toHaveBeenCalled();
    expect(boundary.createRun).not.toHaveBeenCalled();
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(h.putFile).not.toHaveBeenCalled();
  });

  it("refuses a caller actor ID that differs from the authenticated client's user", async () => {
    const h = harness();
    h.getUser.mockResolvedValue({ data: { user: { id: FOREIGN } }, error: null });
    await expect(h.execute()).rejects.toMatchObject({ code: "not_found", runId: null });
    expect(boundary.getCanvas).not.toHaveBeenCalled();
    expect(boundary.createRun).not.toHaveBeenCalled();
    expect(boundary.propose).not.toHaveBeenCalled();
  });

  it("refuses an unavailable canvas or any foreign parent without filtering it out", async () => {
    const h = harness();
    boundary.getCanvas.mockResolvedValueOnce(null);
    await expect(h.execute()).rejects.toMatchObject({ code: "not_found", runId: null });
    h.media.set(PARENTS[1], { ...h.media.get(PARENTS[1])!, userId: FOREIGN });
    await expect(h.execute()).rejects.toMatchObject({ code: "not_found", runId: null });
    h.media.set(PARENTS[1], { ...h.media.get(PARENTS[1])!, userId: USER, canvasId: "foreign-canvas" });
    await expect(h.execute()).rejects.toMatchObject({ code: "not_found", runId: null });
    expect(boundary.createRun).not.toHaveBeenCalled();
    expect(boundary.propose).not.toHaveBeenCalled();
    expect(h.putFile).not.toHaveBeenCalled();
  });

  it("snapshots the requested identities before awaits so caller mutation cannot change the run", async () => {
    const h = harness();
    const mediaIds = [...PARENTS];
    h.getUser.mockImplementation(async () => {
      mediaIds.splice(0, 2, "foreign-one", "foreign-two");
      return { data: { user: { id: USER } }, error: null };
    });
    const result = await h.execute({ mediaIds, prompt: "Authored prompt" });
    expect(result.media.parentIdsJson).toEqual(PARENTS);
    expect(result.run.mediaItemIdsJson).toEqual(PARENTS);
  });

  it("rechecks parent existence after model work before writing any storage object", async () => {
    const h = harness();
    boundary.generate.mockImplementation(async () => {
      h.media.delete(PARENTS[1]);
      return { data: PNG, mediaType: "image/png" };
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "not_found", runId: RUN });
    expect(h.current()?.status).toBe("failed");
    expect(h.putFile).not.toHaveBeenCalled();
    expect(boundary.createMedia).not.toHaveBeenCalled();
  });

  it("retains the original object if ownership disappears before thumbnail or media publication", async () => {
    const h = harness();
    h.putFile.mockImplementationOnce(async (bytes, key) => {
      h.objects.set(key, Buffer.from(bytes)); h.media.delete(PARENTS[1]);
      return `https://authored.invalid/${key}`;
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.objects.size).toBe(1);
    expect(h.current()?.status).toBe("running");
    expect(boundary.createMedia).not.toHaveBeenCalled();
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("rejects unsupported oversized mismatched and undecodable model images before storage", async () => {
    const h = harness();
    for (const image of [{ data: PNG, mediaType: "image/svg+xml" },
      { data: new Uint8Array(1024 * 1024 + 1), mediaType: "image/png" },
      { data: PNG, mediaType: "image/jpeg" }]) {
      boundary.generate.mockResolvedValueOnce(image);
      await expect(h.execute()).rejects.toMatchObject({ code: "failed", runId: RUN });
    }
    boundary.metadata.mockResolvedValueOnce({ width: null, height: null, thumbnail: null });
    await expect(h.execute()).rejects.toMatchObject({ code: "failed", runId: RUN });
    expect(h.putFile).not.toHaveBeenCalled();
    expect(boundary.createMedia).not.toHaveBeenCalled();
  });

  it("records finite credential and model failures with running-only CAS and no raw provider detail", async () => {
    const h = harness();
    boundary.propose.mockRejectedValueOnce(new MissingAICredentialsError());
    await expect(h.execute()).rejects.toMatchObject({ code: "credentials", runId: RUN });
    expect(h.current()).toMatchObject({ status: "failed", error: "Child generation requires configured AI credentials." });
    boundary.generate.mockRejectedValueOnce(new Error("secret-token database/provider diagnostic"));
    try { await h.execute({ prompt: "Authored prompt" }); throw new Error("Expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(SupabaseChildGenerationError);
      expect(error).toMatchObject({ code: "failed", runId: RUN });
      expect((error as Error).message).not.toContain("secret-token");
    }
    expect(h.current()?.error).not.toContain("secret-token");
    expect(boundary.updateRun.mock.calls.filter(call => call[3].status === "failed").every(call => call[4].expectedStatus === "running")).toBe(true);
    expect(h.putFile).not.toHaveBeenCalled();
  });

  it("does not generate when the pending-to-running CAS outcome cannot be confirmed", async () => {
    const h = harness();
    boundary.updateRun.mockResolvedValue(null);
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(boundary.updateRun).toHaveBeenCalledOnce();
    expect(boundary.propose).not.toHaveBeenCalled();
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(h.current()?.status).toBe("pending");
  });

  it("retains an unacknowledged storage write and does not insert retry or delete", async () => {
    const h = harness();
    h.putFile.mockImplementationOnce(async (bytes, key) => {
      h.objects.set(key, Buffer.from(bytes)); throw new Error("authored response lost");
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.objects.size).toBe(1);
    expect(h.putFile).toHaveBeenCalledOnce();
    expect(boundary.createMedia).not.toHaveBeenCalled();
    expect(h.current()?.status).toBe("running");
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("reconciles a lost media insertion response using only the predetermined exact child", async () => {
    const h = harness();
    boundary.createMedia.mockImplementationOnce(async (...args: Parameters<typeof h.insert>) => {
      await h.insert(...args); throw new Error("authored insert ACK lost");
    });
    const result = await h.execute();
    expect(boundary.createMedia).toHaveBeenCalledOnce();
    expect(boundary.getMedia).toHaveBeenCalledWith(h.supabase, USER, result.media.id);
    expect(result.run.resultMediaItemId).toBe(result.media.id);
    expect(result.run.status).toBe("complete");
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("leaves a missing or differently edited child unconfirmed without another insert", async () => {
    const h = harness();
    boundary.createMedia.mockRejectedValueOnce(new Error("authored insert outcome unknown"));
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.current()?.status).toBe("running");
    boundary.createMedia.mockImplementationOnce(async (...args: Parameters<typeof h.insert>) => {
      const child = await h.insert(...args);
      h.media.set(child.id, { ...child, title: "A later owner's edit" });
      throw new Error("authored insert ACK lost");
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect([...h.media.values()].some(row => row.title === "A later owner's edit")).toBe(true);
    expect(boundary.createMedia).toHaveBeenCalledTimes(2);
    expect(boundary.updateRun.mock.calls.some(call => call[3].status === "complete")).toBe(false);
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("confirms a lost completion ACK only when the owned run and exact child both match", async () => {
    const h = harness();
    boundary.updateRun.mockImplementation(async (...args: Parameters<typeof h.update>) => {
      const result = await h.update(...args);
      if (args[3].status === "complete") throw new Error("authored completion ACK lost");
      return result;
    });
    const result = await h.execute();
    expect(result.run).toMatchObject({ status: "complete", resultMediaItemId: result.media.id });
    expect(boundary.getMedia).toHaveBeenLastCalledWith(h.supabase, USER, result.media.id);
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("returns uncertainty without a failed overwrite when completion may arrive after its readback", async () => {
    const h = harness();
    const pendingCompletion: Array<Parameters<typeof h.update>> = [];
    boundary.updateRun.mockImplementation(async (...args: Parameters<typeof h.update>) => {
      if (args[3].status === "complete") { pendingCompletion.push(args); throw new Error("authored delayed response"); }
      return h.update(...args);
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.current()?.status).toBe("running");
    expect(boundary.updateRun.mock.calls.some(call => call[3].status === "failed")).toBe(false);
    expect(pendingCompletion).toHaveLength(1);
    await h.update(...pendingCompletion[0]!);
    expect(h.current()?.status).toBe("complete");
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("does not overwrite a competing complete state while recording a pre-storage failure", async () => {
    const h = harness();
    boundary.generate.mockImplementation(async () => {
      h.setRun({ ...h.current()!, status: "complete", resultMediaItemId: PARENTS[0], error: null });
      throw new Error("authored model failure");
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.current()).toMatchObject({ status: "complete", resultMediaItemId: PARENTS[0], error: null });
    expect(h.putFile).not.toHaveBeenCalled();
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("reports an uncertain run creation without creating a replacement or starting generation", async () => {
    const h = harness();
    boundary.createRun.mockRejectedValueOnce(new Error("authored insert ACK lost with no known ID"));
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: null });
    expect(boundary.createRun).toHaveBeenCalledOnce();
    expect(boundary.updateRun).not.toHaveBeenCalled();
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("refuses a request already aborted before auth persistence or model work", async () => {
    const h = harness();
    const request = new AbortController();
    request.abort(new Error("authored private cancellation detail"));
    await expect(h.execute({ signal: request.signal })).rejects.toMatchObject({ code: "failed", runId: null });
    expect(h.getUser).not.toHaveBeenCalled();
    expect(boundary.createRun).not.toHaveBeenCalled();
    expect(boundary.propose).not.toHaveBeenCalled();
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(h.putFile).not.toHaveBeenCalled();
  });

  it("passes one combined 45 second request deadline and zero retries to both model helpers", async () => {
    const h = harness();
    const request = new AbortController(), deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    await h.execute({ signal: request.signal });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(45_000);
    const promptOptions = boundary.propose.mock.calls[0][0];
    const imageOptions = boundary.generate.mock.calls[0][1];
    expect(promptOptions.maxRetries).toBe(0);
    expect(imageOptions.maxRetries).toBe(0);
    expect(promptOptions.abortSignal).toBe(imageOptions.abortSignal);
    expect(imageOptions.abortSignal).toBeInstanceOf(AbortSignal);
    expect(imageOptions.abortSignal).not.toBe(request.signal);
    expect(imageOptions.abortSignal).not.toBe(deadline.signal);
    expect(imageOptions.abortSignal.aborted).toBe(false);
    request.abort();
    expect(imageOptions.abortSignal.aborted).toBe(true);
  });

  it("observes caller cancellation after the prompt without starting the image model", async () => {
    const h = harness();
    const request = new AbortController();
    boundary.propose.mockImplementation(async (options: { abortSignal: AbortSignal; maxRetries: number }) => {
      expect(options.maxRetries).toBe(0);
      request.abort();
      expect(options.abortSignal.aborted).toBe(true);
      return "Authored prompt delivered after cancellation";
    });
    await expect(h.execute({ signal: request.signal })).rejects.toMatchObject({ code: "failed", runId: RUN });
    expect(boundary.generate).not.toHaveBeenCalled();
    expect(boundary.metadata).not.toHaveBeenCalled();
    expect(h.putFile).not.toHaveBeenCalled();
    expect(h.current()?.status).toBe("failed");
    expect(boundary.updateRun).toHaveBeenLastCalledWith(h.supabase, USER, RUN,
      expect.objectContaining({ status: "failed" }), { expectedStatus: "running" });
  });

  it("observes the shared deadline after an image response before metadata or storage", async () => {
    const h = harness();
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    boundary.generate.mockImplementation(async (_prompt: string, options: { abortSignal: AbortSignal; maxRetries: number }) => {
      expect(options.abortSignal).toBe(deadline.signal);
      expect(options.maxRetries).toBe(0);
      deadline.abort();
      return { data: PNG, mediaType: "image/png" };
    });
    await expect(h.execute({ prompt: "Authored prompt" })).rejects.toMatchObject({ code: "failed", runId: RUN });
    expect(boundary.metadata).not.toHaveBeenCalled();
    expect(h.putFile).not.toHaveBeenCalled();
    expect(boundary.createMedia).not.toHaveBeenCalled();
  });

  it("retains an in-flight storage result after deadline without starting thumbnail or media writes", async () => {
    const h = harness();
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    h.putFile.mockImplementationOnce(async (bytes, key) => {
      h.objects.set(key, Buffer.from(bytes)); deadline.abort();
      return `https://authored.invalid/${key}`;
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.putFile).toHaveBeenCalledOnce();
    expect(h.objects.size).toBe(1);
    expect(boundary.createMedia).not.toHaveBeenCalled();
    expect(h.current()?.status).toBe("running");
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("does not start completion after an observed deadline during the media insertion ACK", async () => {
    const h = harness();
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    boundary.createMedia.mockImplementationOnce(async (...args: Parameters<typeof h.insert>) => {
      const row = await h.insert(...args); deadline.abort(); return row;
    });
    await expect(h.execute()).rejects.toMatchObject({ code: "unconfirmed", runId: RUN });
    expect(h.media.size).toBe(3);
    expect(boundary.updateRun.mock.calls.some(call => call[3].status === "complete" || call[3].status === "failed")).toBe(false);
    expect(h.current()?.status).toBe("running");
    expect(h.deleteFile).not.toHaveBeenCalled();
  });

  it("recovers an already-complete exact receipt by readback after cancellation during its ACK", async () => {
    const h = harness();
    const request = new AbortController();
    boundary.updateRun.mockImplementation(async (...args: Parameters<typeof h.update>) => {
      const result = await h.update(...args);
      if (args[3].status === "complete") request.abort();
      return result;
    });
    const result = await h.execute({ signal: request.signal });
    expect(result.run).toMatchObject({ status: "complete", resultMediaItemId: result.media.id });
    expect(request.signal.aborted).toBe(true);
    expect(boundary.getRun).toHaveBeenLastCalledWith(h.supabase, USER, RUN);
    expect(boundary.getMedia).toHaveBeenLastCalledWith(h.supabase, USER, result.media.id);
    expect(boundary.createMedia).toHaveBeenCalledOnce();
    expect(h.deleteFile).not.toHaveBeenCalled();
  });
});
