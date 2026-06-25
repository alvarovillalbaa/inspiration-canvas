export const DEFAULT_CANVAS_ID = "default-canvas";

export type StorageDriver = "local" | "blob";

export type AppConfig = {
  databaseUrl: string;
  storageDriver: StorageDriver;
  uploadDir: string;
  maxUploadMb: number;
  enableVideoUploads: boolean;
  enableAi: boolean;
  enableBlobStorage: boolean;
  aiTextModel: string;
  aiImageModel: string;
};

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(): AppConfig {
  const storageDriver =
    process.env.STORAGE_DRIVER === "blob" || readBoolean("ENABLE_BLOB_STORAGE", false)
      ? "blob"
      : "local";

  return {
    databaseUrl: process.env.DATABASE_URL || "file:.data/inspiration-canvas.db",
    storageDriver,
    uploadDir: process.env.UPLOAD_DIR || ".data/uploads",
    maxUploadMb: readNumber("MAX_UPLOAD_MB", 50),
    enableVideoUploads: readBoolean("ENABLE_VIDEO_UPLOADS", true),
    enableAi: readBoolean("ENABLE_AI", true),
    enableBlobStorage: storageDriver === "blob",
    aiTextModel: process.env.AI_TEXT_MODEL || "openai/gpt-5.4",
    aiImageModel:
      process.env.AI_IMAGE_MODEL || "google/gemini-3.1-flash-image-preview",
  };
}

export function hasAiCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export function getMissingAiMessage(): string {
  return "AI analysis requires Vercel AI Gateway credentials.";
}

export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//i.test(url);
}

