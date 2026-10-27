"use client";

import { useEffect, useRef, useState } from "react";

import { getCroppedImageStyle, getCropViewportStyle, type NormalizedCrop } from "@/lib/canvas/crop";

type CroppedImageProps = {
  src: string;
  alt: string;
  crop: NormalizedCrop;
  frameWidth: number;
  frameHeight: number;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
};

function aspectRatio(width: number | null, height: number | null): number | null {
  if (width === null || height === null || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function CroppedImage({ src, alt, crop, frameWidth, frameHeight, intrinsicWidth, intrinsicHeight }: CroppedImageProps) {
  const frame = useRef<HTMLSpanElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState<{ src: string; aspect: number } | null>(null);
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  const sourceAspect = (loaded?.src === src ? loaded.aspect : null) ?? aspectRatio(intrinsicWidth, intrinsicHeight) ?? 1;
  const frameAspect = measuredAspect ?? aspectRatio(frameWidth, frameHeight) ?? 1;

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const aspect = aspectRatio(element.clientWidth, element.clientHeight);
      if (aspect !== null) setMeasuredAspect(aspect);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = image.current;
    if (!element?.complete) return;
    const aspect = aspectRatio(element.naturalWidth, element.naturalHeight);
    if (aspect !== null) setLoaded({ src, aspect });
  }, [src]);

  return <span ref={frame} className="grid size-full place-items-center">
    <span className="relative block overflow-hidden" style={getCropViewportStyle(crop, sourceAspect, frameAspect)}>
      {/* The viewport matches the selected pixel aspect, so object-fill preserves the original source aspect. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={image} src={src} alt={alt} loading="lazy" draggable={false}
        className="absolute left-0 top-0 max-w-none object-fill" data-testid="media-image"
        style={getCroppedImageStyle(crop)}
        onLoad={event => {
          const element = event.currentTarget;
          const aspect = aspectRatio(element.naturalWidth, element.naturalHeight);
          if (aspect !== null) setLoaded({ src, aspect });
        }} />
    </span>
  </span>;
}
