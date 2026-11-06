import { NextResponse } from "next/server";

import { getRequestPersistenceContext } from "@/lib/api/auth";
import {
  importTemporaryCanvasItem,
  MAX_TEMPORARY_IMPORT_JSON_BYTES,
  TemporaryImportError,
} from "@/lib/api/temporary-import";
import { getConfig } from "@/lib/config";
import {
  createCommentForUser,
  createMediaItemForUser,
  getCanvasForUser,
  getCommentForUser,
  getMediaItemForUser,
} from "@/lib/db/supabase-repository";
import { SupabaseStorageAdapter, VercelBlobStorageAdapter } from "@/lib/storage/adapter";
import { extractImageMetadata } from "@/lib/workflows/media-processing";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const persistence = await getRequestPersistenceContext();
    if (persistence.mode === "error") return persistence.response;
    if (persistence.mode !== "supabase") {
      return NextResponse.json({ error: "Sign in to save this canvas permanently." }, { status: 401 });
    }
    const { id: canvasId } = await context.params;
    let form: FormData;
    try { form = await request.formData(); } catch {
      throw new TemporaryImportError(400, "invalid_import_request");
    }
    const keys = [...form.keys()];
    const file = form.get("file"), rawItem = form.get("item");
    if (keys.length !== 2 || !keys.includes("file") || !keys.includes("item") || !(file instanceof File)
      || typeof rawItem !== "string" || Buffer.byteLength(rawItem) > MAX_TEMPORARY_IMPORT_JSON_BYTES) {
      throw new TemporaryImportError(400, "invalid_import_request");
    }
    let item: unknown;
    try { item = JSON.parse(rawItem); } catch {
      throw new TemporaryImportError(400, "invalid_temporary_item");
    }
    const { supabase, user } = persistence.context;
    const storageDriver = getConfig().storageDriver === "blob" ? "blob" : "supabase";
    const result = await importTemporaryCanvasItem({ userId: user.id, canvasId, file, item }, {
      getCanvas: (id) => getCanvasForUser(supabase, user.id, id),
      getMedia: (id) => getMediaItemForUser(supabase, user.id, id),
      createMedia: (input) => createMediaItemForUser(supabase, user.id, input),
      getComment: (id) => getCommentForUser(supabase, user.id, id),
      createComment: (mediaId, body, commentId) => createCommentForUser(supabase, user.id, mediaId, body, commentId),
      storage: storageDriver === "supabase" ? new SupabaseStorageAdapter(supabase) : new VercelBlobStorageAdapter(),
      storageDriver,
      extractImageMetadata,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TemporaryImportError) {
      const messages: Record<string, string> = {
        temporary_import_conflict: "This temporary item differs from its previously saved copy. Your recovery copy is kept; review this item before saving again.",
        canvas_not_found: "The destination canvas is unavailable. Your temporary copy is kept.",
        invalid_import_file: "That file is empty, unsupported, or too large. Your temporary copy is kept.",
        invalid_temporary_item: "Some temporary item details are invalid or exceed the supported limits. Your temporary copy is kept.",
        invalid_import_request: "The temporary upload request is invalid. Your temporary copy is kept; try saving it again.",
        invalid_import_destination: "The destination canvas is invalid. Your temporary copy is kept.",
      };
      return NextResponse.json({ error: messages[error.code] || "The temporary item could not be saved. Your temporary copy is kept.", code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Temporary canvas import could not be completed. Your temporary copy is unchanged; retry to resume." }, { status: 500 });
  }
}
