import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTempBlob, markTempCanvasTransferred, type TempCanvasState } from "@/lib/canvas/temp-store";
import { transferTemporaryCanvas } from "@/lib/canvas/transfer";
import type { CommentRecord, MediaItem } from "@/lib/types";

vi.mock("@/lib/canvas/temp-store", () => ({
  getTempBlob: vi.fn(),
  markTempCanvasTransferred: vi.fn(),
}));

const comment: CommentRecord = {
  id: "temp-comment-3b3bb020-3161-48fc-b68d-cb51221624fa",
  mediaItemId: "temp-66120726-387f-46b3-87c2-47d665e08c25",
  body: "Keep the warm, muted colour",
  createdAt: "2026-11-06T00:00:00.000Z",
  updatedAt: "2026-11-06T00:00:00.000Z",
};
const media: MediaItem = {
  id: comment.mediaItemId, canvasId: "temporary-canvas", type: "image",
  url: "blob:authored", storageKey: "temporary/authored.png", storageDriver: "local",
  thumbnailUrl: null, thumbnailStorageKey: null, mimeType: "image/png", fileName: "authored.png",
  title: "Warm study", sizeBytes: 3, intrinsicWidth: 200, intrinsicHeight: 100,
  durationSeconds: null, x: -20, y: 450, width: 180, height: 120, zIndex: 4,
  rotation: 12, cropJson: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
  tagsJson: ["warm, muted", "study"], category: "Colour", subcategory: "Warm",
  description: "Authored reference", designAnalysisJson: null,
  analysisStatus: "skipped", analysisError: null, parentIdsJson: [],
  createdAt: comment.createdAt, updatedAt: comment.updatedAt,
};
function state(items = [media]): TempCanvasState {
  return {
    canvas: { id: "temporary-canvas", name: "Study", createdAt: comment.createdAt, updatedAt: comment.updatedAt },
    mediaItems: items, commentsByMediaId: { [media.id]: [comment] }, expiresAt: 9_999_999_999_999,
  };
}
function acknowledgement(item = media) {
  return {
    sourceId: item.id, canvasId: "account-canvas",
    media: { id: `saved-${item.id}`, canvasId: "account-canvas" },
    comments: item.id === media.id ? [{
      sourceId: comment.id,
      comment: { ...comment, id: "saved-comment", mediaItemId: `saved-${item.id}` },
    }] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTempBlob).mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("temporary canvas transfer", () => {
  it("sends the complete layout, crop, metadata and comment identities before acknowledging", async () => {
    const source = state();
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect(markTempCanvasTransferred).not.toHaveBeenCalled();
      const form = options.body as FormData;
      expect((form.get("file") as File).name).toBe("authored.png");
      expect(JSON.parse(String(form.get("item")))).toEqual({
        sourceId: media.id, title: media.title, x: -20, y: 450, width: 180, height: 120,
        zIndex: 4, rotation: 12, cropJson: media.cropJson, tagsJson: ["warm, muted", "study"],
        category: "Colour", subcategory: "Warm", description: media.description,
        comments: [{ sourceId: comment.id, body: comment.body }],
      });
      return Response.json(acknowledgement());
    });
    vi.stubGlobal("fetch", fetcher);
    await transferTemporaryCanvas(source, "account-canvas");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(markTempCanvasTransferred).toHaveBeenCalledExactlyOnceWith(source, "account-canvas");
  });

  it("checks all blobs before any server write, retaining the copy if one is missing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getTempBlob).mockResolvedValueOnce(new Blob(["png"])).mockResolvedValueOnce(null);
    await expect(transferTemporaryCanvas(state([media, { ...media, id: "second", fileName: "missing.png" }]), "account-canvas"))
      .rejects.toThrow("missing.png");
    expect(fetcher).not.toHaveBeenCalled();
    expect(markTempCanvasTransferred).not.toHaveBeenCalled();
  });

  it.each([401, 409, 500])("retains recovery on HTTP %i even if the JSON looks like success", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(acknowledgement(), { status })));
    await expect(transferTemporaryCanvas(state(), "account-canvas")).rejects.toThrow();
    expect(markTempCanvasTransferred).not.toHaveBeenCalled();
  });

  it.each([
    { ...acknowledgement(), comments: [] },
    { ...acknowledgement(), sourceId: "wrong-source" },
    { ...acknowledgement(), canvasId: "another-canvas" },
    { ...acknowledgement(), media: { id: "saved-media", canvasId: "another-canvas" } },
    { ...acknowledgement(), comments: [{ sourceId: comment.id, comment: { ...comment, id: "saved", body: "changed" } }] },
  ])("requires an exact receipt for every source and comment", async (receipt) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(receipt)));
    await expect(transferTemporaryCanvas(state(), "account-canvas")).rejects.toThrow("not fully confirmed");
    expect(markTempCanvasTransferred).not.toHaveBeenCalled();
  });

  it("reuses the same identities after a later item fails or its response is lost", async () => {
    const second = { ...media, id: "temp-ec2a0428-2372-4c91-85eb-d9955aa6418e", storageKey: "temporary/second.png" };
    const sent: string[] = [];
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const input = String((options.body as FormData).get("item"));
      sent.push(input);
      if (++calls === 2) throw new Error("Response lost after server save");
      return Response.json(acknowledgement(JSON.parse(input).sourceId === media.id ? media : second));
    }));
    const source = state([media, second]);
    await expect(transferTemporaryCanvas(source, "account-canvas")).rejects.toThrow("Response lost");
    expect(markTempCanvasTransferred).not.toHaveBeenCalled();
    await transferTemporaryCanvas(source, "account-canvas");
    expect(sent.slice(0, 2)).toEqual(sent.slice(2));
    expect(markTempCanvasTransferred).toHaveBeenCalledOnce();
  });

  it("times out without discarding recovery when the server never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const pending = transferTemporaryCanvas(state(), "account-canvas");
    const rejected = expect(pending).rejects.toThrow("Saving did not finish");
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    expect(markTempCanvasTransferred).not.toHaveBeenCalled();
  });
});
