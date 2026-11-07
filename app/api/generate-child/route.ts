import { NextResponse } from "next/server";

import { getMissingAiMessage } from "@/lib/config";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { childGenerationRequestSchema } from "@/lib/ai/schemas";
import {
  MissingAICredentialsError,
  proposeChildMediaPrompt,
} from "@/lib/ai/service";
import {
  createGenerationRun,
  getMediaItem,
  updateGenerationRun,
} from "@/lib/db/repository";
import { startChildGenerationRun } from "@/lib/workflows/start";
import {
  runSupabaseChildGeneration,
  SupabaseChildGenerationError,
} from "@/lib/workflows/supabase-child-generation";

const privateHeaders = { "Cache-Control": "private, no-store" };
export const maxDuration = 60;

export async function POST(request: Request) {
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid generation request." }, { status: 400, headers: privateHeaders });
  }
  const parsed = childGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400, headers: privateHeaders });
  }
  if (persistence.mode === "supabase") {
    try {
      const result = await runSupabaseChildGeneration({
        supabase: persistence.context.supabase,
        userId: persistence.context.user.id,
        ...parsed.data,
        signal: request.signal,
      });
      return NextResponse.json(
        { ...result, workflow: { workflowRunId: null, mode: "supabase" } },
        { status: 200, headers: privateHeaders },
      );
    } catch (error) {
      if (error instanceof SupabaseChildGenerationError) {
        const status = { invalid_request: 400, not_found: 404, credentials: 402, unconfirmed: 503, failed: 500 }[error.code];
        return NextResponse.json(
          { error: error.message, runId: error.runId, unconfirmed: error.code === "unconfirmed", requiresAiCredentials: error.code === "credentials" },
          { status, headers: privateHeaders },
        );
      }
      return NextResponse.json(
        { error: "Child media generation could not be confirmed. Refresh your canvas before trying again." },
        { status: 503, headers: privateHeaders },
      );
    }
  }

  const mediaItems = (
    await Promise.all(parsed.data.mediaIds.map((id) => getMediaItem(id)))
  ).filter((item) => item != null);
  if (mediaItems.length < 2) {
    return NextResponse.json(
      { error: "Select at least two media items to generate child media." },
      { status: 400 },
    );
  }

  let prompt = parsed.data.prompt?.trim() || "";
  let run = await createGenerationRun({
    canvasId: parsed.data.canvasId,
    mediaIds: mediaItems.map((item) => item.id),
    prompt,
    status: "pending",
  });

  try {
    if (!prompt) {
      prompt = await proposeChildMediaPrompt({ mediaItems });
      run = (await updateGenerationRun(run.id, { prompt })) || run;
    }
    const workflow = await startChildGenerationRun(run.id);
    return NextResponse.json({ run, prompt, workflow }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof MissingAICredentialsError
        ? getMissingAiMessage()
        : error instanceof Error
          ? error.message
          : "Child generation failed.";
    await updateGenerationRun(run.id, {
      status: "failed",
      error: message,
    });
    return NextResponse.json(
      {
        error: message,
        requiresAiCredentials: error instanceof MissingAICredentialsError,
        run,
      },
      { status: error instanceof MissingAICredentialsError ? 402 : 500 },
    );
  }
}
