"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { adjustCrop, normalizeCropJson, type CropHandle, type NormalizedCrop } from "@/lib/canvas/crop";

type CropEditorProps = {
  src: string;
  alt: string;
  value: NormalizedCrop;
  onChange: (crop: NormalizedCrop) => void;
  disabled?: boolean;
};

type Gesture = {
  pointer: number;
  element: HTMLButtonElement;
  handle: CropHandle;
  startX: number;
  startY: number;
  crop: NormalizedCrop;
};

const handles: { handle: Exclude<CropHandle, "move">; label: string; left: string; top: string; cursor: string }[] = [
  { handle: "nw", label: "top left", left: "0%", top: "0%", cursor: "nwse-resize" },
  { handle: "n", label: "top", left: "50%", top: "0%", cursor: "ns-resize" },
  { handle: "ne", label: "top right", left: "100%", top: "0%", cursor: "nesw-resize" },
  { handle: "e", label: "right", left: "100%", top: "50%", cursor: "ew-resize" },
  { handle: "se", label: "bottom right", left: "100%", top: "100%", cursor: "nwse-resize" },
  { handle: "s", label: "bottom", left: "50%", top: "100%", cursor: "ns-resize" },
  { handle: "sw", label: "bottom left", left: "0%", top: "100%", cursor: "nesw-resize" },
  { handle: "w", label: "left", left: "0%", top: "50%", cursor: "ew-resize" },
];
const percent = (value: number) => `${value * 100}%`;
const readablePercent = (value: number) => `${Math.round(value * 1000) / 10}%`;
const sameCrop = (a: NormalizedCrop, b: NormalizedCrop) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export function CropEditor({ src, alt, value, onChange, disabled = false }: CropEditorProps) {
  const crop = normalizeCropJson(value) ?? { x: 0, y: 0, width: 1, height: 1 };
  const image = useRef<HTMLImageElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef(crop);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [dragging, setDragging] = useState<CropHandle | null>(null);
  const [imageRatio, setImageRatio] = useState(1);
  const instructions = useId();
  useEffect(() => { latest.current = normalizeCropJson(value) ?? { x: 0, y: 0, width: 1, height: 1 }; }, [value]);

  const stopGesture = useCallback((updateState = true) => {
    const active = gesture.current;
    gesture.current = null;
    if (active) {
      try {
        if (active.element.hasPointerCapture(active.pointer)) active.element.releasePointerCapture(active.pointer);
      } catch { /* The pointer or element may already have gone away. */ }
    }
    if (updateState) setDragging(null);
  }, []);

  useEffect(() => {
    stopGesture();
    const element = image.current;
    if (element?.complete && element.naturalWidth > 0 && element.naturalHeight > 0) setImageRatio(element.naturalWidth / element.naturalHeight);
    setStatus(!src ? "error" : element?.complete ? element.naturalWidth > 0 && element.naturalHeight > 0 ? "ready" : "error" : "loading");
    return () => stopGesture(false);
  }, [src, attempt, stopGesture]);
  useEffect(() => { if (disabled) stopGesture(); }, [disabled, stopGesture]);
  useEffect(() => {
    function interrupted() { stopGesture(); }
    function hidden() { if (document.hidden) stopGesture(); }
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [stopGesture]);

  function emit(next: NormalizedCrop) {
    if (sameCrop(next, latest.current)) return;
    latest.current = next;
    onChange(next);
  }
  function begin(event: PointerEvent<HTMLButtonElement>, handle: CropHandle) {
    const element = image.current;
    if (disabled || status !== "ready" || !element?.complete || !element.naturalWidth || gesture.current || !event.isPrimary || event.button !== 0) return;
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    gesture.current = { pointer: event.pointerId, element: event.currentTarget, handle,
      startX: (event.clientX - rect.left) / rect.width, startY: (event.clientY - rect.top) / rect.height, crop: latest.current };
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { stopGesture(); return; }
    setDragging(handle);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (disabled || status !== "ready") { stopGesture(); return; }
    const rect = image.current?.getBoundingClientRect();
    if (!rect || !(rect.width > 0 && rect.height > 0)) { stopGesture(); return; }
    event.preventDefault(); event.stopPropagation();
    // Measure the actual image, not a padded/letterboxed preview container.
    const dx = (event.clientX - rect.left) / rect.width - active.startX;
    const dy = (event.clientY - rect.top) / rect.height - active.startY;
    emit(adjustCrop(active.crop, active.handle, dx, dy));
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointer !== event.pointerId) return;
    move(event);
    stopGesture();
  }
  function cancel(event: PointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointer === event.pointerId) stopGesture();
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, handle: CropHandle) {
    if (disabled || status !== "ready" || event.altKey || event.ctrlKey || event.metaKey) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    event.preventDefault(); event.stopPropagation(); stopGesture();
    emit(adjustCrop(latest.current, handle, dx, dy));
  }

  const inactive = disabled || status !== "ready";
  return <div className="space-y-4">
    <p id={instructions} className="text-sm leading-relaxed text-muted-foreground">
      Drag the selected area to move it, or drag an edge or corner to resize. For small selections, use Drag to move crop below the preview. Tab to a handle and use arrow keys to adjust by 1%; hold Shift for 5%. The shaded area will be hidden.
    </p>
    <div className="relative flex min-h-48 items-center justify-center rounded-xl border bg-muted/40 p-6 sm:p-8" aria-busy={status === "loading"}>
      <div className={status === "error" ? "hidden" : "relative w-full select-none"} style={{ maxWidth: `calc(min(52svh, 520px) * ${imageRatio})` }}>
        {/* Match the wrapper to the natural ratio, including upscaled small images. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={`${src}:${attempt}`} ref={image} src={src || undefined} alt={alt || "Original image to crop"}
          data-testid="crop-preview-image" draggable={false}
          className={status === "error" ? "hidden" : "block h-auto w-full select-none"}
          onLoad={event => {
            const element = event.currentTarget;
            if (element.naturalWidth > 0 && element.naturalHeight > 0) { setImageRatio(element.naturalWidth / element.naturalHeight); setStatus("ready"); }
            else setStatus("error");
          }}
          onError={() => { stopGesture(); setStatus("error"); }} />
        {status === "ready" && <>
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: percent(crop.y) }} />
            <div className="absolute bg-black/55" style={{ left: 0, top: percent(crop.y), width: percent(crop.x), height: percent(crop.height) }} />
            <div className="absolute bg-black/55" style={{ left: percent(crop.x + crop.width), top: percent(crop.y), right: 0, height: percent(crop.height) }} />
            <div className="absolute bg-black/55" style={{ left: 0, top: percent(crop.y + crop.height), right: 0, bottom: 0 }} />
          </div>
          <div data-testid="crop-selection" role="group" aria-label="Crop selection"
            className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
            style={{ left: percent(crop.x), top: percent(crop.y), width: percent(crop.width), height: percent(crop.height) }}>
            <button type="button" aria-label="Move crop" aria-describedby={instructions} disabled={inactive}
              className="absolute inset-0 h-full min-h-11 w-full min-w-11 touch-none cursor-grab bg-transparent outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed"
              style={{ cursor: dragging === "move" ? "grabbing" : undefined }}
              onPointerDown={event => begin(event, "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
              onKeyDown={event => keyboard(event, "move")}>
              <span className="pointer-events-none absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white" aria-hidden="true">✥</span>
            </button>
            {handles.map(handle => <button key={handle.handle} type="button" aria-label={`Resize crop from ${handle.label}`} aria-describedby={instructions} disabled={inactive}
              className="absolute flex size-11 touch-none items-center justify-center rounded-sm bg-transparent p-0 outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed"
              style={{ left: handle.left, top: handle.top, transform: "translate(-50%, -50%)", cursor: inactive ? "not-allowed" : handle.cursor }}
              onPointerDown={event => begin(event, handle.handle)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
              onKeyDown={event => keyboard(event, handle.handle)}>
              <span className="pointer-events-none size-3 rounded-[2px] border border-black/70 bg-white shadow-sm" aria-hidden="true" />
            </button>)}
          </div>
        </>}
      </div>
      {status === "loading" && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" role="status">Loading image preview…</p>}
      {status === "error" && <div className="max-w-sm space-y-3 text-center">
        <p className="text-sm text-destructive" role="alert">The image preview could not load. Retry the preview or cancel cropping.</p>
        <Button type="button" variant="outline" className="min-h-11" disabled={disabled} onClick={() => { stopGesture(); setStatus("loading"); setAttempt(count => count + 1); }}>Retry preview</Button>
      </div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="outline" className="min-h-11 min-w-11 touch-none select-none cursor-grab" disabled={inactive}
        aria-describedby={instructions} style={{ cursor: dragging === "move" ? "grabbing" : undefined }}
        onPointerDown={event => begin(event, "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={event => keyboard(event, "move")}>
        Drag to move crop
      </Button>
      <output className="text-xs leading-relaxed text-muted-foreground" aria-live="polite" aria-atomic="true">
        Left {readablePercent(crop.x)}, top {readablePercent(crop.y)} · width {readablePercent(crop.width)}, height {readablePercent(crop.height)}
      </output>
    </div>
  </div>;
}
