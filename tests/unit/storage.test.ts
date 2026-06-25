import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LocalStorageAdapter } from "@/lib/storage/adapter";

describe("local storage adapter", () => {
  it("puts, checks, urls, and deletes files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inspiration-canvas-"));
    const adapter = new LocalStorageAdapter(dir);
    await adapter.putFile(Buffer.from("hello"), "a/b/file.txt");
    expect(await adapter.exists("a/b/file.txt")).toBe(true);
    expect(await adapter.getUrl("a/b/file.txt")).toBe("/api/uploads/a/b/file.txt");
    await adapter.deleteFile("a/b/file.txt");
    expect(await adapter.exists("a/b/file.txt")).toBe(false);
  });
});

