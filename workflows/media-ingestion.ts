import { getWritable } from "workflow";

export type MediaIngestionEvent =
  | { type: "step_start"; mediaId: string; name: string }
  | { type: "step_done"; mediaId: string; name: string }
  | { type: "failed"; mediaId: string; error: string }
  | { type: "done"; mediaId: string };

async function emit(event: MediaIngestionEvent): Promise<void> {
  "use step";
  const writer = getWritable<MediaIngestionEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function analyzeStep(mediaId: string): Promise<void> {
  "use step";
  const { ingestMedia } = await import("@/lib/workflows/media-processing");
  await ingestMedia(mediaId);
}

export async function mediaIngestionWorkflow(mediaId: string): Promise<{ mediaId: string }> {
  "use workflow";
  await emit({ type: "step_start", mediaId, name: "media-analysis" });
  try {
    await analyzeStep(mediaId);
    await emit({ type: "step_done", mediaId, name: "media-analysis" });
    await emit({ type: "done", mediaId });
    return { mediaId };
  } catch (error) {
    await emit({
      type: "failed",
      mediaId,
      error: error instanceof Error ? error.message : "Media ingestion failed.",
    });
    throw error;
  }
}
