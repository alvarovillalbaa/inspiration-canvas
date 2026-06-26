import type { CanvasRecord, CommentRecord, MediaItem } from "@/lib/types";

export const TEMP_CANVAS_TTL_MS = 4 * 60 * 60 * 1000;

const DB_NAME = "inspiration-canvas-temp";
const DB_VERSION = 1;
const BLOB_STORE = "media-blobs";
const STATE_KEY = "inspiration-canvas:temporary-state";
const ACK_KEY = "inspiration-canvas:temporary-storage-acknowledged-at";
const MAX_TEMP_UPLOAD_BYTES = 50 * 1024 * 1024;

export type TempCanvasState = {
  canvas: CanvasRecord;
  mediaItems: MediaItem[];
  commentsByMediaId: Record<string, CommentRecord[]>;
  expiresAt: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createTempCanvas(now = Date.now()): CanvasRecord {
  const iso = new Date(now).toISOString();
  return {
    id: "temporary-canvas",
    name: "Untitled inspiration canvas",
    createdAt: iso,
    updatedAt: iso,
  };
}

export function createEmptyTempCanvasState(now = Date.now()): TempCanvasState {
  return {
    canvas: createTempCanvas(now),
    mediaItems: [],
    commentsByMediaId: {},
    expiresAt: now + TEMP_CANVAS_TTL_MS,
  };
}

export function isTempSessionExpired(expiresAt: number, now = Date.now()): boolean {
  return expiresAt <= now;
}

export function getTemporaryStorageAcknowledgedAt(): number | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(ACK_KEY);
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function markTemporaryStorageAcknowledged(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACK_KEY, String(Date.now()));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, mode);
    const store = transaction.objectStore(BLOB_STORE);
    const request = callback(store);
    let value: T | undefined;
    if (request) {
      request.onsuccess = () => {
        value = request.result;
      };
      request.onerror = () => reject(request.error);
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(value);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("IndexedDB transaction failed."));
    };
  });
}

async function putTempBlob(key: string, blob: Blob): Promise<void> {
  await withStore("readwrite", (store) => store.put(blob, key));
}

export async function getTempBlob(key: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined") return null;
  const blob = await withStore<Blob>("readonly", (store) => store.get(key));
  return blob || null;
}

async function deleteTempBlob(key: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(key));
}

async function clearTempBlobs(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await withStore("readwrite", (store) => store.clear());
}

function sanitizeFileName(fileName: string): string {
  return (
    fileName
      .normalize("NFKD")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 120) || "upload"
  );
}

function isSupportedTempFile(file: File): boolean {
  return (
    [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ].includes(file.type) && file.size > 0 && file.size <= MAX_TEMP_UPLOAD_BYTES
  );
}

function getTempMediaKind(file: File): MediaItem["type"] {
  return file.type.startsWith("video/") ? "video" : "image";
}

function readImageMetadata(url: string): Promise<{
  width: number | null;
  height: number | null;
}> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    };
    image.onerror = () => resolve({ width: null, height: null });
    image.src = url;
  });
}

function serializeState(state: TempCanvasState): string {
  return JSON.stringify({
    ...state,
    mediaItems: state.mediaItems.map((item) => ({
      ...item,
      url: item.storageKey,
      thumbnailUrl: item.thumbnailStorageKey,
    })),
  });
}

export function saveTempCanvasState(state: TempCanvasState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATE_KEY, serializeState(state));
}

export async function clearTempCanvasState(): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STATE_KEY);
  }
  await clearTempBlobs();
}

async function rehydrateObjectUrls(state: TempCanvasState): Promise<TempCanvasState> {
  const mediaItems = await Promise.all(
    state.mediaItems.map(async (item) => {
      const blob = await getTempBlob(item.storageKey);
      if (!blob) return item;
      const url = URL.createObjectURL(blob);
      return {
        ...item,
        url,
        thumbnailUrl: item.thumbnailStorageKey ? url : null,
      };
    }),
  );
  return { ...state, mediaItems };
}

export async function loadTempCanvasState(now = Date.now()): Promise<TempCanvasState> {
  if (typeof window === "undefined") return createEmptyTempCanvasState(now);
  const raw = window.localStorage.getItem(STATE_KEY);
  if (!raw) {
    const state = createEmptyTempCanvasState(now);
    saveTempCanvasState(state);
    return state;
  }
  try {
    const state = JSON.parse(raw) as TempCanvasState;
    if (isTempSessionExpired(state.expiresAt, now)) {
      await clearTempCanvasState();
      const next = createEmptyTempCanvasState(now);
      saveTempCanvasState(next);
      return next;
    }
    return rehydrateObjectUrls(state);
  } catch {
    await clearTempCanvasState();
    const next = createEmptyTempCanvasState(now);
    saveTempCanvasState(next);
    return next;
  }
}

export async function addTempFilesToCanvas(
  state: TempCanvasState,
  files: File[],
  point?: { x: number; y: number },
): Promise<TempCanvasState> {
  const baseState = isTempSessionExpired(state.expiresAt)
    ? createEmptyTempCanvasState()
    : state;
  const createdItems: MediaItem[] = [];
  let zIndex = Math.max(0, ...baseState.mediaItems.map((item) => item.zIndex));

  for (const [index, file] of files.entries()) {
    if (!isSupportedTempFile(file)) {
      throw new Error(`Unsupported file type or size: ${file.name}`);
    }
    const safeName = sanitizeFileName(file.name);
    const mediaId = `temp-${crypto.randomUUID()}`;
    const storageKey = `temporary/${mediaId}/${safeName}`;
    const objectUrl = URL.createObjectURL(file);
    await putTempBlob(storageKey, file);
    const metadata = file.type.startsWith("image/")
      ? await readImageMetadata(objectUrl)
      : { width: null, height: null };
    const displayWidth =
      metadata.width && metadata.width >= 120 ? Math.min(420, metadata.width) : 360;
    const displayHeight =
      metadata.height && metadata.height >= 100 ? Math.min(420, metadata.height) : 260;

    createdItems.push({
      id: mediaId,
      canvasId: baseState.canvas.id,
      userId: null,
      type: getTempMediaKind(file),
      url: objectUrl,
      storageDriver: "local",
      storageKey,
      thumbnailUrl: file.type.startsWith("image/") ? objectUrl : null,
      thumbnailStorageKey: file.type.startsWith("image/") ? storageKey : null,
      mimeType: file.type,
      fileName: safeName,
      sizeBytes: file.size,
      intrinsicWidth: metadata.width,
      intrinsicHeight: metadata.height,
      durationSeconds: null,
      x: (point?.x ?? 240) + index * 32,
      y: (point?.y ?? 180) + index * 32,
      width: displayWidth,
      height: displayHeight,
      zIndex: ++zIndex,
      rotation: 0,
      cropJson: null,
      tagsJson: [],
      category: null,
      subcategory: null,
      description: null,
      designAnalysisJson: null,
      analysisStatus: "skipped",
      analysisError: null,
      parentIdsJson: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  const next = {
    ...baseState,
    canvas: { ...baseState.canvas, updatedAt: nowIso() },
    mediaItems: [...baseState.mediaItems, ...createdItems],
  };
  saveTempCanvasState(next);
  return next;
}

export async function deleteTempMedia(
  state: TempCanvasState,
  mediaIds: string[],
): Promise<TempCanvasState> {
  await Promise.all(
    state.mediaItems
      .filter((item) => mediaIds.includes(item.id))
      .flatMap((item) => [
        deleteTempBlob(item.storageKey),
        item.thumbnailStorageKey && item.thumbnailStorageKey !== item.storageKey
          ? deleteTempBlob(item.thumbnailStorageKey)
          : Promise.resolve(),
      ]),
  );
  const ids = new Set(mediaIds);
  const commentsByMediaId = { ...state.commentsByMediaId };
  ids.forEach((id) => delete commentsByMediaId[id]);
  const next = {
    ...state,
    canvas: { ...state.canvas, updatedAt: nowIso() },
    mediaItems: state.mediaItems.filter((item) => !ids.has(item.id)),
    commentsByMediaId,
  };
  saveTempCanvasState(next);
  return next;
}

export function updateTempMediaItems(
  state: TempCanvasState,
  updater: (items: MediaItem[]) => MediaItem[],
): TempCanvasState {
  const next = {
    ...state,
    canvas: { ...state.canvas, updatedAt: nowIso() },
    mediaItems: updater(state.mediaItems),
  };
  saveTempCanvasState(next);
  return next;
}

export function addTempComment(
  state: TempCanvasState,
  mediaId: string,
  body: string,
): { state: TempCanvasState; comment: CommentRecord } {
  const timestamp = nowIso();
  const comment = {
    id: `temp-comment-${crypto.randomUUID()}`,
    mediaItemId: mediaId,
    body: body.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const next = {
    ...state,
    commentsByMediaId: {
      ...state.commentsByMediaId,
      [mediaId]: [...(state.commentsByMediaId[mediaId] || []), comment],
    },
  };
  saveTempCanvasState(next);
  return { state: next, comment };
}
