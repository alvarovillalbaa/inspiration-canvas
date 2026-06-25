import fs from "node:fs/promises";
import path from "node:path";

import { getConfig } from "@/lib/config";

export type StoredFileInput = Buffer | Uint8Array | File;

export type PutFileOptions = {
  contentType?: string;
};

export type StorageAdapter = {
  putFile(input: StoredFileInput, key: string, options?: PutFileOptions): Promise<string>;
  getUrl(key: string): Promise<string>;
  deleteFile(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
};

async function toBuffer(input: StoredFileInput): Promise<Buffer> {
  if (input instanceof Buffer) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  return Buffer.from(await input.arrayBuffer());
}

function safePath(root: string, key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.resolve(root, normalized);
  const rootPath = path.resolve(root);
  if (!fullPath.startsWith(rootPath)) {
    throw new Error("Invalid storage key.");
  }
  return fullPath;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root = getConfig().uploadDir) {}

  async putFile(input: StoredFileInput, key: string): Promise<string> {
    const fullPath = safePath(this.root, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, await toBuffer(input));
    return this.getUrl(key);
  }

  async getUrl(key: string): Promise<string> {
    const encoded = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `/api/uploads/${encoded}`;
  }

  async deleteFile(key: string): Promise<void> {
    await fs.rm(safePath(this.root, key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(safePath(this.root, key));
      return true;
    } catch {
      return false;
    }
  }

  getFullPath(key: string): string {
    return safePath(this.root, key);
  }
}

export class VercelBlobStorageAdapter implements StorageAdapter {
  async putFile(
    input: StoredFileInput,
    key: string,
    options: PutFileOptions = {},
  ): Promise<string> {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, await toBuffer(input), {
      access: "public",
      contentType: options.contentType,
      allowOverwrite: true,
    });
    return blob.url;
  }

  async getUrl(key: string): Promise<string> {
    const { list } = await import("@vercel/blob");
    const result = await list({ prefix: key, limit: 1 });
    return result.blobs[0]?.url || key;
  }

  async deleteFile(key: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(key);
  }

  async exists(key: string): Promise<boolean> {
    const { list } = await import("@vercel/blob");
    const result = await list({ prefix: key, limit: 1 });
    return result.blobs.some((blob) => blob.pathname === key || blob.url === key);
  }
}

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (adapter) return adapter;
  adapter =
    getConfig().storageDriver === "blob"
      ? new VercelBlobStorageAdapter()
      : new LocalStorageAdapter();
  return adapter;
}

