import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { LocalStorageAdapter } from "@/lib/storage/adapter";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

type UploadRouteContext = { params: Promise<{ key: string[] }> };

export async function GET(
  _request: Request,
  context: UploadRouteContext,
) {
  const { key } = await context.params;
  const storageKey = key.join("/");
  const adapter = new LocalStorageAdapter();
  try {
    const fullPath = adapter.getFullPath(storageKey);
    const bytes = await fs.readFile(fullPath);
    const ext = fullPath.slice(fullPath.lastIndexOf(".")).toLowerCase();
    return new Response(bytes, {
      headers: {
        "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
