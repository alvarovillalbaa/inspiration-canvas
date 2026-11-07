import { NextResponse } from "next/server";

import { getRequestPersistenceContext } from "@/lib/api/auth";
import { getGenerationRunForUser } from "@/lib/db/supabase-repository";

type WorkflowEventsRouteContext = { params: Promise<{ runId: string }> };

export async function GET(
  _request: Request,
  context: WorkflowEventsRouteContext,
) {
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  const { runId } = await context.params;
  if (persistence.mode === "supabase") {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const run = await getGenerationRunForUser(persistence.context.supabase, persistence.context.user.id, runId);
      if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404, headers });
      return NextResponse.json(
        { error: "Live events are unavailable for this run. Check its saved status." },
        { status: 409, headers },
      );
    } catch {
      return NextResponse.json({ error: "Saved run status is temporarily unavailable." }, { status: 503, headers });
    }
  }
  try {
    const { getRun } = await import("workflow/api");
    const run = await getRun(runId);
    const readable = run.getReadable() as unknown as ReadableStream;
    const encoder = new TextEncoder();
    const stream = readable.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const data = typeof chunk === "string" ? chunk : JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        },
      }),
    );
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "unavailable", runId })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }
}
