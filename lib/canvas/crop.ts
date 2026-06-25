export type NormalizedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function readNumber(record: Record<string, unknown>, key: keyof NormalizedCrop): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

export function normalizeCropJson(value: unknown): NormalizedCrop | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const crop = {
    x: readNumber(record, "x"),
    y: readNumber(record, "y"),
    width: readNumber(record, "width"),
    height: readNumber(record, "height"),
  };
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.width > 1 ||
    crop.height > 1 ||
    crop.x + crop.width > 1.001 ||
    crop.y + crop.height > 1.001
  ) {
    return null;
  }
  return crop;
}

export function getCroppedImageStyle(crop: NormalizedCrop): {
  width: string;
  height: string;
  transform: string;
  transformOrigin: string;
} {
  return {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    transform: `translate(${-crop.x * 100}%, ${-crop.y * 100}%)`,
    transformOrigin: "top left",
  };
}
