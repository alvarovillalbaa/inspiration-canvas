export type NormalizedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

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
    !Object.values(crop).every(Number.isFinite) ||
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

const MIN_DIMENSION = 0.02;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

/** Apply image-relative gesture deltas without mutating the gesture's starting crop. */
export function adjustCrop(
  crop: NormalizedCrop,
  handle: CropHandle,
  dx: number,
  dy: number,
): NormalizedCrop {
  const valid = normalizeCropJson(crop) ?? { x: 0, y: 0, width: 1, height: 1 };
  let { x, y, width, height } = valid;
  const minimumWidth = Math.min(MIN_DIMENSION, width);
  const minimumHeight = Math.min(MIN_DIMENSION, height);
  dx = Number.isFinite(dx) ? dx : 0;
  dy = Number.isFinite(dy) ? dy : 0;

  if (handle === "move") {
    return {
      x: dx === 0 ? x : clamp(x + dx, 0, 1 - width),
      y: dy === 0 ? y : clamp(y + dy, 0, 1 - height),
      width,
      height,
    };
  }
  if (!["n", "s", "e", "w", "ne", "nw", "se", "sw"].includes(handle)) return { x, y, width, height };
  // Existing tiny crops keep their size floor; untouched axes keep their exact geometry.
  if (dx !== 0 && (handle.includes("w") || handle.includes("e"))) {
    x = clamp(x, 0, 1 - width);
    if (handle.includes("w")) {
      const right = x + width;
      width = clamp(width - dx, minimumWidth, right);
      x = right - width;
    } else width = clamp(width + dx, minimumWidth, 1 - x);
  }
  if (dy !== 0 && (handle.includes("n") || handle.includes("s"))) {
    y = clamp(y, 0, 1 - height);
    if (handle.includes("n")) {
      const bottom = y + height;
      height = clamp(height - dy, minimumHeight, bottom);
      y = bottom - height;
    } else height = clamp(height + dy, minimumHeight, 1 - y);
  }
  return { x, y, width, height };
}

export function getCropViewportStyle(
  crop: NormalizedCrop,
  sourceAspect: number,
  frameAspect: number,
): { width: string; height: string } {
  const fallback = { width: "100%", height: "100%" };
  const valid = normalizeCropJson(crop);
  if (!valid || !Number.isFinite(sourceAspect) || sourceAspect <= 0 || !Number.isFinite(frameAspect) || frameAspect <= 0) return fallback;
  const selectedAspect = sourceAspect * valid.width / valid.height;
  if (!Number.isFinite(selectedAspect) || selectedAspect <= 0) return fallback;
  const percent = 100 * (selectedAspect > frameAspect ? frameAspect / selectedAspect : selectedAspect / frameAspect);
  if (!Number.isFinite(percent) || percent <= 0) return fallback;
  return selectedAspect > frameAspect
    ? { width: "100%", height: `${percent}%` }
    : { width: `${percent}%`, height: "100%" };
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
