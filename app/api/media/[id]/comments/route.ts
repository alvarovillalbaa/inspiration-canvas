import { NextResponse } from "next/server";

import { createComment, listComments } from "@/lib/db/repository";

type MediaCommentsRouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: MediaCommentsRouteContext,
) {
  const { id } = await context.params;
  return NextResponse.json({ comments: await listComments(id) });
}

export async function POST(
  request: Request,
  context: MediaCommentsRouteContext,
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { body?: string };
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Comment body is required." }, { status: 400 });
  }
  const comment = await createComment(id, body.body);
  return NextResponse.json({ comment }, { status: 201 });
}
