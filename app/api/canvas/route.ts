import { NextResponse } from "next/server";

import {
  createCanvas,
  getCanvasData,
  getOrCreateDefaultCanvas,
} from "@/lib/db/repository";

export async function GET() {
  const canvas = await getOrCreateDefaultCanvas();
  const data = await getCanvasData(canvas.id);
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const canvas = await createCanvas(body.name?.trim() || "Untitled inspiration canvas");
  return NextResponse.json({ canvas, mediaItems: [] }, { status: 201 });
}

