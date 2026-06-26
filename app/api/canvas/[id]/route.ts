import { NextResponse } from "next/server";

import { getCanvasData, updateCanvas } from "@/lib/db/repository";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import {
  getCanvasDataForUser,
  updateCanvasForUser,
} from "@/lib/db/supabase-repository";

type CanvasRouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: CanvasRouteContext,
) {
  const { id } = await context.params;
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    try {
      const { supabase, user } = persistence.context;
      return NextResponse.json(await getCanvasDataForUser(supabase, user.id, id));
    } catch {
      return NextResponse.json({ error: "Canvas not found." }, { status: 404 });
    }
  }

  const data = await getCanvasData(id);
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  context: CanvasRouteContext,
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const canvas = await updateCanvasForUser(supabase, user.id, id, {
      name: body.name,
    });
    if (!canvas) {
      return NextResponse.json({ error: "Canvas not found." }, { status: 404 });
    }
    return NextResponse.json({ canvas });
  }

  const canvas = await updateCanvas(id, { name: body.name });
  if (!canvas) {
    return NextResponse.json({ error: "Canvas not found." }, { status: 404 });
  }
  return NextResponse.json({ canvas });
}
