import { NextResponse } from "next/server";

import { getGenerationRun } from "@/lib/db/repository";

type WorkflowRunRouteContext = { params: Promise<{ runId: string }> };

export async function GET(
  _request: Request,
  context: WorkflowRunRouteContext,
) {
  const { runId } = await context.params;
  try {
    const { getRun } = await import("workflow/api");
    const run = await getRun(runId);
    return NextResponse.json({
      runId,
      status: await run.status,
      workflowName: await run.workflowName,
      createdAt: (await run.createdAt).toISOString(),
      startedAt: (await run.startedAt)?.toISOString() ?? null,
      completedAt: (await run.completedAt)?.toISOString() ?? null,
    });
  } catch {
    const generationRun = await getGenerationRun(runId);
    if (!generationRun) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }
    return NextResponse.json({ runId, status: generationRun.status, generationRun });
  }
}
