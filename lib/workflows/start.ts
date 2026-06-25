import { ingestMedia } from "@/lib/workflows/media-processing";
import { updateGenerationRun } from "@/lib/db/repository";

export async function startMediaIngestionRun(mediaId: string): Promise<{
  runId: string | null;
  mode: "workflow" | "local";
}> {
  try {
    const [{ start }, { mediaIngestionWorkflow }] = await Promise.all([
      import("workflow/api"),
      import("@/workflows/media-ingestion"),
    ]);
    const run = await start(mediaIngestionWorkflow, [mediaId]);
    return { runId: run.runId, mode: "workflow" };
  } catch {
    void ingestMedia(mediaId);
    return { runId: null, mode: "local" };
  }
}

export async function startChildGenerationRun(runId: string): Promise<{
  workflowRunId: string | null;
  mode: "workflow" | "local";
}> {
  try {
    const [{ start }, { childGenerationWorkflow }] = await Promise.all([
      import("workflow/api"),
      import("@/workflows/child-generation"),
    ]);
    const run = await start(childGenerationWorkflow, [runId]);
    return { workflowRunId: run.runId, mode: "workflow" };
  } catch {
    const { runChildGeneration } = await import("@/lib/workflows/child-generation");
    void runChildGeneration(runId).catch(async (error: unknown) => {
      await updateGenerationRun(runId, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Child media generation failed.",
      });
    });
    return { workflowRunId: null, mode: "local" };
  }
}
