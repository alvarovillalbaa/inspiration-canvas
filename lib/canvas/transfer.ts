import { getTempBlob, markTempCanvasTransferred, type TempCanvasState } from "@/lib/canvas/temp-store";
import type { CommentRecord, MediaItem } from "@/lib/types";

export function temporaryImportItem(item: MediaItem, comments: CommentRecord[]) {
  return {
    sourceId: item.id,
    title: item.title,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    zIndex: item.zIndex,
    rotation: item.rotation,
    cropJson: item.cropJson,
    tagsJson: item.tagsJson,
    category: item.category,
    subcategory: item.subcategory,
    description: item.description,
    comments: comments.map((comment) => ({ sourceId: comment.id, body: comment.body })),
  };
}

/** Keep the recovery copy until every item and comment has an explicit receipt. */
export async function transferTemporaryCanvas(state: TempCanvasState, canvasId: string) {
  // Check every source first, so an unavailable file cannot silently become a
  // successful partial transfer. No server write has happened at this point.
  const sources = [];
  for (const item of state.mediaItems) {
    const blob = await getTempBlob(item.storageKey);
    if (!blob) {
      throw new Error(`The temporary file “${item.fileName}” is unavailable. Your recovery copy has been kept.`);
    }
    sources.push({ item, blob });
  }

  for (const { item, blob } of sources) {
    const input = temporaryImportItem(item, state.commentsByMediaId[item.id] || []);
    const form = new FormData();
    form.append("file", new File([blob], item.fileName, { type: item.mimeType }));
    form.append("item", JSON.stringify(input));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`/api/canvas/${encodeURIComponent(canvasId)}/import`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const data = await response.json() as {
        error?: string;
        sourceId?: string;
        canvasId?: string;
        media?: { id?: string; canvasId?: string };
        comments?: Array<{ sourceId: string; comment: CommentRecord }>;
      };
      if (!response.ok) throw new Error(data.error || "Could not save the temporary canvas.");
      const receipts = data.comments;
      if (data.sourceId !== item.id || data.canvasId !== canvasId ||
        !data.media?.id || data.media.canvasId !== canvasId ||
        !Array.isArray(receipts) || receipts.length !== input.comments.length ||
        input.comments.some((comment) => receipts.filter((receipt) =>
          receipt.sourceId === comment.sourceId && receipt.comment?.id &&
          receipt.comment.mediaItemId === data.media?.id &&
          receipt.comment.body === comment.body.trim()).length !== 1)) {
        throw new Error("The save was not fully confirmed. Your recovery copy has been kept; retry to confirm it.");
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("Saving did not finish. Your recovery copy has been kept; retry to confirm it.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // A separate receipt hides only this exact snapshot for this destination.
  // Keep the blobs and source state until their original expiry: another tab
  // may have edited that state while these requests were in flight.
  markTempCanvasTransferred(state, canvasId);
}
