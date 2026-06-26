import { NextResponse } from "next/server";

import { createComment, listComments } from "@/lib/db/repository";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import {
  createCommentForUser,
  listCommentsForUser,
} from "@/lib/db/supabase-repository";

type MediaCommentsRouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: MediaCommentsRouteContext,
) {
  const { id } = await context.params;
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    return NextResponse.json({
      comments: await listCommentsForUser(supabase, user.id, id),
    });
  }

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
  const persistence = await getRequestPersistenceContext();
  if (persistence.mode === "error") return persistence.response;
  if (persistence.mode === "supabase") {
    const { supabase, user } = persistence.context;
    const comment = await createCommentForUser(supabase, user.id, id, body.body);
    return NextResponse.json({ comment }, { status: 201 });
  }

  const comment = await createComment(id, body.body);
  return NextResponse.json({ comment }, { status: 201 });
}
