import { NextResponse } from "next/server";

import {
  deleteMediaItem,
  getMediaItem,
  updateMediaItem,
} from "@/lib/db/repository";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import {
  deleteMediaItemForUser,
  getMediaItemForUser,
  updateMediaItemForUser,
} from "@/lib/db/supabase-repository";
import { mediaPatchSchema } from "@/lib/ai/schemas";
import { getStorageAdapter } from "@/lib/storage/adapter";

type MediaRouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: MediaRouteContext,
) {
  const { id } = await context.params;
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const media = await getMediaItemForUser(supabase, user.id, id);
    if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
    return NextResponse.json({ media });
  }

  const media = await getMediaItem(id);
  if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  return NextResponse.json({ media });
}

export async function PATCH(
  request: Request,
  context: MediaRouteContext,
) {
  const { id } = await context.params;
  const parsed = mediaPatchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const media = await updateMediaItemForUser(supabase, user.id, id, parsed.data);
    if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
    return NextResponse.json({ media });
  }

  const media = await updateMediaItem(id, parsed.data);
  if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  return NextResponse.json({ media });
}

export async function DELETE(
  _request: Request,
  context: MediaRouteContext,
) {
  const { id } = await context.params;
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const media = await deleteMediaItemForUser(supabase, user.id, id);
    if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
    const storage = getStorageAdapter({
      driver: media.storageDriver,
      supabase: media.storageDriver === "supabase" ? supabase : undefined,
    });
    await Promise.allSettled([
      storage.deleteFile(media.storageKey),
      media.thumbnailStorageKey
        ? storage.deleteFile(media.thumbnailStorageKey)
        : Promise.resolve(),
    ]);
    return NextResponse.json({ media });
  }

  const media = await deleteMediaItem(id);
  if (!media) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const storage = getStorageAdapter({ driver: media.storageDriver });
  await Promise.allSettled([
    storage.deleteFile(media.storageKey),
    media.thumbnailStorageKey ? storage.deleteFile(media.thumbnailStorageKey) : Promise.resolve(),
  ]);
  return NextResponse.json({ media });
}
