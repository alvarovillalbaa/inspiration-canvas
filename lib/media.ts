import { getConfig } from "@/lib/config";

const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function hasAscii(buffer: Buffer, offset: number, value: string): boolean {
  return (
    buffer.length >= offset + value.length &&
    buffer.subarray(offset, offset + value.length).toString("ascii") === value
  );
}

function sniffMimeType(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (hasAscii(buffer, 0, "GIF87a") || hasAscii(buffer, 0, "GIF89a")) {
    return "image/gif";
  }

  if (hasAscii(buffer, 0, "RIFF") && hasAscii(buffer, 8, "WEBP")) {
    return "image/webp";
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3 &&
    buffer.subarray(4, 128).includes(Buffer.from("webm", "ascii"))
  ) {
    return "video/webm";
  }

  if (buffer.length >= 12 && hasAscii(buffer, 4, "ftyp")) {
    const majorBrand = buffer.subarray(8, 12).toString("ascii");
    return majorBrand === "qt  " ? "video/quicktime" : "video/mp4";
  }

  return null;
}

export function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120) || "upload";
}

export function isSupportedMimeType(mimeType: string): boolean {
  const config = getConfig();
  return (
    IMAGE_MIME_TYPES.has(mimeType) ||
    (config.enableVideoUploads && VIDEO_MIME_TYPES.has(mimeType))
  );
}

export function getMediaKind(mimeType: string): "image" | "video" {
  if (IMAGE_MIME_TYPES.has(mimeType)) return "image";
  return "video";
}

export async function validateUploadFile(file: File): Promise<{
  buffer: Buffer;
  mimeType: string;
  safeName: string;
}> {
  const config = getConfig();
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  if (file.size <= 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > maxBytes) {
    throw new Error(`File is too large. Maximum upload size is ${config.maxUploadMb} MB.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = sniffMimeType(buffer) || file.type;

  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType || "unknown"}.`);
  }

  return {
    buffer,
    mimeType,
    safeName: sanitizeFileName(file.name),
  };
}

export function buildStorageKey(fileName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const id = crypto.randomUUID();
  return `${date}/${id}-${sanitizeFileName(fileName)}`;
}
