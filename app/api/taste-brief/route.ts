import { NextResponse } from "next/server";

import { getMissingAiMessage } from "@/lib/config";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { tasteBriefRequestSchema } from "@/lib/ai/schemas";
import { generateTasteBrief, MissingAICredentialsError } from "@/lib/ai/service";
import { getMediaItem } from "@/lib/db/repository";
import { getMediaItemForUser } from "@/lib/db/supabase-repository";

export async function POST(request: Request) {
  const parsed = tasteBriefRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  const mediaItems =
    persistence.mode === "supabase"
      ? (
          await Promise.all(
            parsed.data.mediaIds.map((id) =>
              getMediaItemForUser(
                persistence.context.supabase,
                persistence.context.user.id,
                id,
              ),
            ),
          )
        ).filter((item) => item != null)
      : (await Promise.all(parsed.data.mediaIds.map((id) => getMediaItem(id)))).filter(
          (item) => item != null,
        );
  if (mediaItems.length === 0) {
    return NextResponse.json({ error: "No selected media found." }, { status: 404 });
  }
  try {
    const text = await generateTasteBrief({
      canvasId: parsed.data.canvasId,
      mediaItems,
    });
    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof MissingAICredentialsError) {
      return NextResponse.json(
        { error: getMissingAiMessage(), requiresAiCredentials: true },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Taste brief failed." },
      { status: 500 },
    );
  }
}
