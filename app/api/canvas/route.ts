import { NextResponse } from "next/server";

import {
  createCanvas,
  getCanvasData,
  getOrCreateDefaultCanvas,
} from "@/lib/db/repository";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import {
  createCanvasForUser,
  getCanvasDataForUser,
  getOrCreateDefaultCanvasForUser,
} from "@/lib/db/supabase-repository";

export async function GET() {
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const canvas = await getOrCreateDefaultCanvasForUser(supabase, user.id);
    const data = await getCanvasDataForUser(supabase, user.id, canvas.id);
    return NextResponse.json(data);
  }

  const canvas = await getOrCreateDefaultCanvas();
  const data = await getCanvasData(canvas.id);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const canvas = await createCanvasForUser(
      supabase,
      user.id,
      body.name?.trim() || "Untitled inspiration canvas",
    );
    return NextResponse.json({ canvas, mediaItems: [] }, { status: 201 });
  }

  const canvas = await createCanvas(body.name?.trim() || "Untitled inspiration canvas");
  return NextResponse.json({ canvas, mediaItems: [] }, { status: 201 });
}
