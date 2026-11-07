import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/types";

const sdk = vi.hoisted(() => ({ generate: vi.fn(), credentials: vi.fn(), config: vi.fn() }));
vi.mock("ai", () => ({ generateText: sdk.generate, Output: { object: vi.fn() } }));
vi.mock("@/lib/config", () => ({
  getConfig: sdk.config, hasAiCredentials: sdk.credentials,
  getMissingAiMessage: () => "Authored missing credentials.",
}));
vi.mock("@/lib/db/repository", () => ({ createTasteBrief: vi.fn(), listComments: vi.fn(), updateMediaItem: vi.fn() }));

import { generateChildImageBytes, MissingAICredentialsError, proposeChildMediaPrompt } from "@/lib/ai/service";

const parent: MediaItem = {
  id: "authored-parent", canvasId: "authored-canvas", userId: "00000000-0000-4000-8000-000000000001",
  type: "image", title: "Authored reference", fileName: "reference.png",
  url: "https://example.invalid/authored-reference.png", storageDriver: "supabase", storageKey: "authored/reference.png",
  thumbnailUrl: null, thumbnailStorageKey: null, mimeType: "image/png", sizeBytes: 3,
  intrinsicWidth: 64, intrinsicHeight: 64, durationSeconds: null,
  x: 0, y: 0, width: 64, height: 64, zIndex: 0, rotation: 0,
  cropJson: null, tagsJson: [], category: null, subcategory: null,
  description: null, designAnalysisJson: null, analysisStatus: "complete", analysisError: null, parentIdsJson: [],
  createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.credentials.mockReturnValue(true);
  sdk.config.mockReturnValue({ enableAi: true, aiTextModel: "authored-text-model", aiImageModel: "authored-image-model" });
  sdk.generate.mockResolvedValue({ text: "  Authored child prompt  ", files: [{ uint8Array: new Uint8Array([1, 2, 3]), mediaType: "image/png" }] });
});

describe("child generation SDK request policy", () => {
  it("passes the exact caller deadline and zero retries to prompt generation", async () => {
    const controller = new AbortController();
    expect(await proposeChildMediaPrompt({ mediaItems: [parent], abortSignal: controller.signal, maxRetries: 0 })).toBe("Authored child prompt");
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(sdk.generate.mock.calls[0][0]).toMatchObject({ model: "authored-text-model", abortSignal: controller.signal, maxRetries: 0 });
  });
  it("passes the exact caller deadline and zero retries to image generation", async () => {
    const controller = new AbortController();
    expect(await generateChildImageBytes("Authored prompt", { abortSignal: controller.signal, maxRetries: 0 })).toEqual({ data: new Uint8Array([1, 2, 3]), mediaType: "image/png" });
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(sdk.generate.mock.calls[0][0]).toMatchObject({ model: "authored-image-model", prompt: "Authored prompt", abortSignal: controller.signal, maxRetries: 0 });
  });
  it("preserves the existing local callers' unspecified SDK policy", async () => {
    await proposeChildMediaPrompt({ mediaItems: [parent] });
    await generateChildImageBytes("Authored prompt");
    expect(sdk.generate).toHaveBeenCalledTimes(2);
    for (const [request] of sdk.generate.mock.calls) {
      expect(request.abortSignal).toBeUndefined();
      expect(request.maxRetries).toBeUndefined();
    }
  });
  it("refuses prompt generation without credentials before any SDK call", async () => {
    sdk.credentials.mockReturnValue(false);
    await expect(proposeChildMediaPrompt({ mediaItems: [parent], maxRetries: 0 })).rejects.toBeInstanceOf(MissingAICredentialsError);
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("refuses image generation without credentials before any SDK call", async () => {
    sdk.credentials.mockReturnValue(false);
    await expect(generateChildImageBytes("Authored prompt", { maxRetries: 0 })).rejects.toBeInstanceOf(MissingAICredentialsError);
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("keeps the disabled-AI gate even when credentials are available", async () => {
    sdk.config.mockReturnValue({ enableAi: false });
    await expect(generateChildImageBytes("Authored prompt", { maxRetries: 0 })).rejects.toBeInstanceOf(MissingAICredentialsError);
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it("propagates SDK rejection without invoking generation again", async () => {
    const controller = new AbortController();
    controller.abort();
    const rejection = new Error("Authored cancellation");
    sdk.generate.mockRejectedValue(rejection);
    await expect(generateChildImageBytes("Authored prompt", { abortSignal: controller.signal, maxRetries: 0 })).rejects.toBe(rejection);
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(sdk.generate.mock.calls[0][0].abortSignal.aborted).toBe(true);
  });
});
