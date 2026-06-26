import { NextResponse } from "next/server";
import { z } from "zod";

import { mediaPatchSchema } from "@/lib/ai/schemas";
import { updateMediaItemsBatch } from "@/lib/db/repository";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { updateMediaItemsBatchForUser } from "@/lib/db/supabase-repository";

const batchSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().min(1),
      patch: mediaPatchSchema,
    }),
  ),
});

export async function PATCH(request: Request) {
  const parsed = batchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const mediaItems = await updateMediaItemsBatchForUser(
      supabase,
      user.id,
      parsed.data.updates,
    );
    return NextResponse.json({ mediaItems });
  }

  const mediaItems = await updateMediaItemsBatch(parsed.data.updates);
  return NextResponse.json({ mediaItems });
}
