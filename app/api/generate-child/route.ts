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

export async function POST(request: Request) {
  const parsed = childGenerationRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    return NextResponse.json(
      {
        error:
          "Child media generation for signed-in Supabase canvases is not connected yet.",
      },
      { status: 501 },
    );
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
