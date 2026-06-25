import { getWritable } from "workflow";

export type ChildGenerationEvent =
  | { type: "step_start"; runId: string; name: string }
  | { type: "step_done"; runId: string; name: string }
  | { type: "failed"; runId: string; error: string }
  | { type: "done"; runId: string; mediaItemId: string };

async function emit(event: ChildGenerationEvent): Promise<void> {
  "use step";
  const writer = getWritable<ChildGenerationEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function generateStep(runId: string): Promise<{ mediaItemId: string }> {
  "use step";
  const { runChildGeneration } = await import("@/lib/workflows/child-generation");
  return runChildGeneration(runId);
}

async function markFailedStep(runId: string, error: string): Promise<void> {
  "use step";
  const { updateGenerationRun } = await import("@/lib/db/repository");
  await updateGenerationRun(runId, { status: "failed", error });
}

export async function childGenerationWorkflow(
  runId: string,
): Promise<{ mediaItemId: string }> {
  "use workflow";
  await emit({ type: "step_start", runId, name: "child-generation" });
  try {
    const result = await generateStep(runId);
    await emit({ type: "step_done", runId, name: "child-generation" });
    await emit({ type: "done", runId, mediaItemId: result.mediaItemId });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Child generation failed.";
    await markFailedStep(runId, message);
    await emit({ type: "failed", runId, error: message });
    throw error;
  }
}
