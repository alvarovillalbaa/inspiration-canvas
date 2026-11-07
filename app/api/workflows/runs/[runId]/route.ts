import { NextResponse } from "next/server";

import { getGenerationRun } from "@/lib/db/repository";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { getGenerationRunForUser } from "@/lib/db/supabase-repository";

type WorkflowRunRouteContext = { params: Promise<{ runId: string }> };

export async function GET(
  _request: Request,
  context: WorkflowRunRouteContext,
) {
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  const { runId } = await context.params;
  if (persistence.mode === "supabase") {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const generationRun = await getGenerationRunForUser(persistence.context.supabase, persistence.context.user.id, runId);
      if (!generationRun) return NextResponse.json({ error: "Run not found." }, { status: 404, headers });
      return NextResponse.json({ runId, status: generationRun.status, generationRun }, { headers });
    } catch {
      return NextResponse.json({ error: "Saved run status is temporarily unavailable." }, { status: 503, headers });
    }
  }
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
