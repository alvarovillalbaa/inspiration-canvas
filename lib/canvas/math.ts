export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = Point & Size;
export type Transform = { scale: number; positionX: number; positionY: number };

export function screenToCanvas(
  point: Point,
  canvasBounds: Pick<DOMRect, "left" | "top">,
  transform: Transform,
): Point {
  return {
    x: (point.x - canvasBounds.left - transform.positionX) / transform.scale,
    y: (point.y - canvasBounds.top - transform.positionY) / transform.scale,
  };
}

export function canvasToScreen(
  point: Point,
  canvasBounds: Pick<DOMRect, "left" | "top">,
  transform: Transform,
): Point {
  return {
    x: canvasBounds.left + point.x * transform.scale + transform.positionX,
    y: canvasBounds.top + point.y * transform.scale + transform.positionY,
  };
}

export function clampZoom(zoom: number, min = 0.12, max = 4): number {
  return Math.min(max, Math.max(min, zoom));
}

export function getItemsBounds(items: Rect[]): Rect | null {
  if (items.length === 0) return null;
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function getFitTransform(
  bounds: Rect,
  viewport: Size,
  padding = 96,
): Transform {
  const scaleX = (viewport.width - padding * 2) / Math.max(bounds.width, 1);
  const scaleY = (viewport.height - padding * 2) / Math.max(bounds.height, 1);
  const scale = clampZoom(Math.min(scaleX, scaleY), 0.12, 2);
  return {
    scale,
    positionX: viewport.width / 2 - (bounds.x + bounds.width / 2) * scale,
    positionY: viewport.height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

export function getClusterChildPosition(items: Rect[]): Point {
  const bounds = getItemsBounds(items);
  if (!bounds) return { x: 240, y: 180 };
  return {
    x: bounds.x + bounds.width + 72,
    y: bounds.y + Math.max(0, bounds.height / 2 - 180),
  };
}

export function moveRects<T extends Rect>(
  items: T[],
  ids: Set<string>,
  activeId: string,
  nextPoint: Point,
): T[] {
  const active = items.find((item) => "id" in item && item.id === activeId) as
    | (T & { id: string })
    | undefined;
  if (!active) return items;
  const deltaX = nextPoint.x - active.x;
  const deltaY = nextPoint.y - active.y;
  return items.map((item) => {
    const id = "id" in item ? String(item.id) : "";
    return ids.has(id) ? { ...item, x: item.x + deltaX, y: item.y + deltaY } : item;
  });
}

