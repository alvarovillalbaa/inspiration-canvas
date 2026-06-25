import { NextResponse } from "next/server";

import { getCanvasData, updateCanvas } from "@/lib/db/repository";

type CanvasRouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: CanvasRouteContext,
) {
  const { id } = await context.params;
  const data = await getCanvasData(id);
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  context: CanvasRouteContext,
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const canvas = await updateCanvas(id, { name: body.name });
  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found." }, { status: 404 });
  }
  return NextResponse.json({ canvas });
}
