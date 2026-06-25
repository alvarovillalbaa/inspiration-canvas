import { NextResponse } from "next/server";
import { z } from "zod";

import { mediaPatchSchema } from "@/lib/ai/schemas";
import { updateMediaItemsBatch } from "@/lib/db/repository";

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
  const mediaItems = await updateMediaItemsBatch(parsed.data.updates);
  return NextResponse.json({ mediaItems });
}

