export type MediaKind = "image" | "video" | "generated_image" | "generated_video";
export type AnalysisStatus = "pending" | "processing" | "complete" | "failed" | "skipped";
export type GenerationStatus = "pending" | "running" | "complete" | "failed";

export type JsonRecord = Record<string, unknown>;

export type CanvasRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type DesignAnalysis = {
  colorPalette: string[];
  composition: string;
  mood: string[];
  styleKeywords: string[];
  designPrinciples: string[];
  visualDensity: "low" | "medium" | "high";
  eraReferences: string[];
  materialTexture: string[];
  confidence: number;
};

export type MediaItem = {
  id: string;
  canvasId: string;
  type: MediaKind;
  url: string;
  storageKey: string;
  thumbnailUrl: string | null;
  thumbnailStorageKey: string | null;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  durationSeconds: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  cropJson: JsonRecord | null;
  tagsJson: string[];
  category: string | null;
  subcategory: string | null;
  description: string | null;
  designAnalysisJson: DesignAnalysis | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  parentIdsJson: string[];
  createdAt: string;
  updatedAt: string;
};

export type CommentRecord = {
  id: string;
  mediaItemId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type TasteBrief = {
  id: string;
  canvasId: string;
  mediaItemIdsJson: string[];
  text: string;
  createdAt: string;
};

export type GenerationRun = {
  id: string;
  canvasId: string;
  mediaItemIdsJson: string[];
  status: GenerationStatus;
  prompt: string;
  resultMediaItemId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentToolApproval = {
  id: string;
  toolName: string;
  canvasId: string | null;
  mediaItemIdsJson: string[];
  payloadJson: JsonRecord;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  updatedAt: string;
};

