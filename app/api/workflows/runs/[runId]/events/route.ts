type WorkflowEventsRouteContext = { params: Promise<{ runId: string }> };

export async function GET(
  _request: Request,
  context: WorkflowEventsRouteContext,
) {
  const { runId } = await context.params;
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
