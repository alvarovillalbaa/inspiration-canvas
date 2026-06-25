"use client";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Copy,
  Crop,
  FileText,
  Focus,
  ImagePlus,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Rnd } from "react-rnd";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

import { MessageResponse } from "@/components/ai-elements/message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getFitTransform,
  getItemsBounds,
  screenToCanvas,
  type Transform,
} from "@/lib/canvas/math";
import { getCroppedImageStyle, normalizeCropJson } from "@/lib/canvas/crop";
import type { CanvasRecord, CommentRecord, MediaItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type CanvasResponse = {
  canvas: CanvasRecord;
  mediaItems: MediaItem[];
};

type CropDraft = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CANVAS_SIZE = 12000;
const DEFAULT_TRANSFORM: Transform = { scale: 0.65, positionX: 120, positionY: 80 };

function ToolButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          size="icon"
          variant="ghost"
          disabled={disabled}
          onClick={onClick}
          className="size-9 rounded-md"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function isVideo(item: MediaItem) {
  return item.type === "video" || item.type === "generated_video";
}

export function InspirationCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draggingItem, setDraggingItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [tasteText, setTasteText] = useState("");
  const [tasteOpen, setTasteOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentOutput, setAgentOutput] = useState("");
  const [cropItem, setCropItem] = useState<MediaItem | null>(null);
  const [cropDraft, setCropDraft] = useState<CropDraft>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const primarySelected = selectedItems[0] || null;

  const loadCanvas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/canvas", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load canvas.");
      const data = (await response.json()) as CanvasResponse;
      setCanvas(data.canvas);
      setItems(data.mediaItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load canvas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fitToView = useCallback(() => {
    const bounds = getItemsBounds(items);
    const wrapper = wrapperRef.current;
    if (!bounds || !wrapper) {
      transformRef.current?.resetTransform(160);
      return;
    }
    const next = getFitTransform(bounds, {
      width: wrapper.clientWidth,
      height: wrapper.clientHeight,
    });
    transformRef.current?.setTransform(next.positionX, next.positionY, next.scale, 160);
  }, [items]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadCanvas();
    });
  }, [loadCanvas]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreview(null);
        setCropItem(null);
        setSelectedIds(new Set());
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(new Set(items.map((item) => item.id)));
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.size > 0) setConfirmDelete(true);
      }
      if (event.key === "+") transformRef.current?.zoomIn(0.2, 120);
      if (event.key === "-") transformRef.current?.zoomOut(0.2, 120);
      if (event.key === "0") fitToView();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fitToView, items, selectedIds]);

  async function patchMedia(id: string, patch: Partial<MediaItem>) {
    const response = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Could not update media.");
    }
    const data = (await response.json()) as { media: MediaItem };
    setItems((current) => current.map((item) => (item.id === id ? data.media : item)));
  }

  async function patchMediaBatch(updates: Array<{ id: string; patch: Partial<MediaItem> }>) {
    const response = await fetch("/api/media/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    if (!response.ok) throw new Error("Could not update media.");
    const data = (await response.json()) as { mediaItems: MediaItem[] };
    const byId = new Map(data.mediaItems.map((item) => [item.id, item]));
    setItems((current) => current.map((item) => byId.get(item.id) || item));
  }

  function selectItem(item: MediaItem, event: MouseEvent) {
    event.stopPropagation();
    setSelectedIds((current) => {
      const next = new Set(event.shiftKey ? current : []);
      if (event.shiftKey && next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function uploadFiles(files: FileList | File[], point?: { x: number; y: number }) {
    if (!canvas) return;
    setUploading(true);
    setError(null);
    try {
      for (const [index, file] of Array.from(files).entries()) {
        const form = new FormData();
        form.append("file", file);
        form.append("canvasId", canvas.id);
        form.append("x", String((point?.x ?? 240) + index * 32));
        form.append("y", String((point?.y ?? 180) + index * 32));
        const response = await fetch("/api/upload", { method: "POST", body: form });
        const data = (await response.json()) as { media?: MediaItem; error?: string };
        if (!response.ok || !data.media) throw new Error(data.error || "Upload failed.");
        setItems((current) => [...current, data.media!]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function getCanvasPoint(clientX: number, clientY: number) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 240, y: 180 };
    return screenToCanvas({ x: clientX, y: clientY }, rect, transform);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    if (event.dataTransfer.files.length === 0) return;
    void uploadFiles(event.dataTransfer.files, getCanvasPoint(event.clientX, event.clientY));
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => fetch(`/api/media/${id}`, { method: "DELETE" })));
    setItems((current) => current.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    setConfirmDelete(false);
  }

  async function loadComments(mediaId: string) {
    const response = await fetch(`/api/media/${mediaId}/comments`, { cache: "no-store" });
    const data = (await response.json()) as { comments: CommentRecord[] };
    setComments(data.comments);
  }

  async function addComment() {
    if (!primarySelected || !commentBody.trim()) return;
    const response = await fetch(`/api/media/${primarySelected.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    const data = (await response.json()) as { comment?: CommentRecord; error?: string };
    if (!response.ok || !data.comment) {
      setError(data.error || "Could not add comment.");
      return;
    }
    setComments((current) => [...current, data.comment!]);
    setCommentBody("");
  }

  async function generateTasteBrief() {
    if (!canvas || selectedItems.length === 0) return;
    setTasteOpen(true);
    setTasteText("");
    setError(null);
    const response = await fetch("/api/taste-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canvasId: canvas.id,
        mediaIds: selectedItems.map((item) => item.id),
      }),
    });
    const data = (await response.json()) as { text?: string; error?: string };
    if (!response.ok || !data.text) {
      setTasteText(data.error || "Taste brief generation failed.");
      return;
    }
    setTasteText(data.text);
  }

  async function generateChildMedia() {
    if (!canvas || selectedItems.length < 2) return;
    setError(null);
    const response = await fetch("/api/generate-child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canvasId: canvas.id,
        mediaIds: selectedItems.map((item) => item.id),
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Child media generation failed.");
      return;
    }
    setTimeout(() => void loadCanvas(), 1200);
  }

  async function sendAgentMessage() {
    if (!agentPrompt.trim()) return;
    const selection = selectedItems.map((item) => `${item.fileName} (${item.id})`).join(", ");
    setAgentOutput(
      [
        "## Curator Agent",
        "",
        "Eve agent files are installed under `agent/` with canvas/media tools and approval gates.",
        "",
        selection
          ? `Current selection: ${selection}.`
          : "No media selected. Select references before asking for curation.",
        "",
        `Request: ${agentPrompt}`,
        "",
        "In local fallback mode this panel summarizes available context. On Vercel, Eve endpoints can stream full agent sessions through the same tool set.",
      ].join("\n"),
    );
  }

  function openCrop(item: MediaItem) {
    const crop = item.cropJson as Partial<CropDraft> | null;
    setCropDraft({
      x: Number(crop?.x ?? 0),
      y: Number(crop?.y ?? 0),
      width: Number(crop?.width ?? 1),
      height: Number(crop?.height ?? 1),
    });
    setCropItem(item);
  }

  async function saveCrop() {
    if (!cropItem) return;
    await patchMedia(cropItem.id, { cropJson: cropDraft });
    setCropItem(null);
  }

  function renderMedia(item: MediaItem) {
    const selected = selectedIds.has(item.id);
    const crop = isVideo(item) ? null : normalizeCropJson(item.cropJson);
    return (
      <Rnd
        key={item.id}
        scale={transform.scale}
        bounds="parent"
        resizeHandleClasses={{ bottomRight: "resize-handle-bottom-right" }}
        position={{ x: item.x, y: item.y }}
        size={{ width: item.width, height: item.height }}
        onDragStart={() => setDraggingItem(true)}
        onDragStop={(_, data) => {
          setDraggingItem(false);
          const ids = selectedIds.has(item.id) ? [...selectedIds] : [item.id];
          const activeDelta = { x: data.x - item.x, y: data.y - item.y };
          const updates = ids.map((id) => {
            const current = items.find((candidate) => candidate.id === id)!;
            return {
              id,
              patch: { x: current.x + activeDelta.x, y: current.y + activeDelta.y },
            };
          });
          setItems((current) =>
            current.map((candidate) =>
              ids.includes(candidate.id)
                ? {
                    ...candidate,
                    x: candidate.x + activeDelta.x,
                    y: candidate.y + activeDelta.y,
                  }
                : candidate,
            ),
          );
          void patchMediaBatch(updates);
        }}
        onResizeStop={(_, __, ref, ___, position) => {
          void patchMedia(item.id, {
            x: position.x,
            y: position.y,
            width: ref.offsetWidth,
            height: ref.offsetHeight,
          });
        }}
        className="group"
        style={{ zIndex: item.zIndex }}
      >
        <button
          type="button"
          data-testid="media-item"
          data-media-id={item.id}
          onClick={(event) => selectItem(item, event)}
          onDoubleClick={() => setPreview(item)}
          className={cn(
            "relative size-full overflow-hidden rounded-md border bg-card text-left shadow-sm outline-none transition-colors",
            selected ? "border-primary ring-2 ring-primary/35" : "border-border",
          )}
        >
          {isVideo(item) ? (
            <video
              src={item.url}
              className="size-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : (
            <span
              className="absolute inset-0 overflow-hidden"
              data-cropped={crop ? "true" : "false"}
              data-testid="media-crop-viewport"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbnailUrl || item.url}
                alt={item.description || item.fileName}
                className={cn(
                  crop
                    ? "absolute left-0 top-0 max-w-none object-cover"
                    : "size-full object-cover",
                )}
                data-testid="media-image"
                loading="lazy"
                style={crop ? getCroppedImageStyle(crop) : undefined}
              />
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
            <span className="truncate">{item.fileName}</span>
            {item.analysisStatus === "processing" || item.analysisStatus === "pending" ? (
              <Activity className="size-3" />
            ) : item.analysisStatus === "complete" ? (
              <Check className="size-3 text-primary" />
            ) : (
              <X className="size-3 text-destructive" />
            )}
          </div>
          {item.parentIdsJson.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Badge className="absolute left-2 top-2 h-6 gap-1 rounded-md" variant="secondary">
                  <Sparkles className="size-3" />
                  child
                </Badge>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <div className="text-sm font-medium">Lineage</div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {item.parentIdsJson.map((parentId) => {
                    const parent = items.find((candidate) => candidate.id === parentId);
                    return <div key={parentId}>{parent?.fileName || parentId}</div>;
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </button>
      </Rnd>
    );
  }

  return (
    <TooltipProvider>
      <div
        ref={wrapperRef}
        className="relative min-h-[100dvh] overflow-hidden bg-background text-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <TransformWrapper
          ref={transformRef}
          minScale={0.12}
          maxScale={4}
          initialScale={DEFAULT_TRANSFORM.scale}
          initialPositionX={DEFAULT_TRANSFORM.positionX}
          initialPositionY={DEFAULT_TRANSFORM.positionY}
          limitToBounds={false}
          centerOnInit={false}
          doubleClick={{ disabled: true }}
          panning={{ disabled: draggingItem, excluded: ["input", "textarea", "button"] }}
          wheel={{ step: 0.08 }}
          onTransform={(_, state) => setTransform(state)}
        >
          <TransformComponent
            wrapperClass="!h-[100dvh] !w-full"
            contentClass="!h-[12000px] !w-[12000px]"
          >
            <div
              className="relative"
              style={{
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
                backgroundSize: "32px 32px",
              }}
              onClick={() => setSelectedIds(new Set())}
            >
              {items.map(renderMedia)}
            </div>
          </TransformComponent>
        </TransformWrapper>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
          <div className="pointer-events-auto rounded-md border border-border bg-background/85 px-3 py-2 shadow-sm backdrop-blur-sm">
            <div className="text-sm font-medium">{canvas?.name || "Inspiration Canvas"}</div>
            <div className="text-xs text-muted-foreground">
              {items.length} media / {selectedIds.size} selected
            </div>
          </div>
          {error ? (
            <Alert className="pointer-events-auto w-[420px] border-destructive/50 bg-background/95">
              <AlertTitle>Action needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background">
            <div className="w-[420px] space-y-3">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="pointer-events-auto max-w-sm rounded-md border border-dashed border-border bg-background/85 p-5 text-center shadow-sm backdrop-blur-sm">
              <ImagePlus className="mx-auto size-8 text-muted-foreground" />
              <div className="mt-3 text-sm font-medium">Drop references anywhere</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload images or videos to start arranging visual direction.
              </p>
              <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" />
                Upload media
              </Button>
            </div>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          aria-label="Upload media files"
          data-testid="media-upload-input"
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          onChange={(event) => {
            if (event.target.files) {
              void uploadFiles(
                event.target.files,
                getCanvasPoint(window.innerWidth / 2, window.innerHeight / 2),
              );
            }
            event.currentTarget.value = "";
          }}
        />

        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+18px)] z-30 flex justify-center px-4">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background/90 p-1 shadow-lg backdrop-blur-sm">
            <ToolButton label="Upload" onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Activity className="size-4" /> : <Upload className="size-4" />}
            </ToolButton>
            <Separator orientation="vertical" className="h-6" />
            <ToolButton label="Zoom out" onClick={() => transformRef.current?.zoomOut(0.2, 120)}>
              <Minus className="size-4" />
            </ToolButton>
            <div className="w-14 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(transform.scale * 100)}%
            </div>
            <ToolButton label="Zoom in" onClick={() => transformRef.current?.zoomIn(0.2, 120)}>
              <Plus className="size-4" />
            </ToolButton>
            <ToolButton label="Fit view" onClick={fitToView}>
              <Focus className="size-4" />
            </ToolButton>
            <ToolButton label="Reset zoom" onClick={() => transformRef.current?.resetTransform(120)}>
              <RefreshCcw className="size-4" />
            </ToolButton>
            <Separator orientation="vertical" className="h-6" />
            <ToolButton
              label="Generate taste text"
              disabled={selectedItems.length === 0}
              onClick={generateTasteBrief}
            >
              <FileText className="size-4" />
            </ToolButton>
            <ToolButton
              label="Generate child media"
              disabled={selectedItems.length < 2}
              onClick={generateChildMedia}
            >
              <WandSparkles className="size-4" />
            </ToolButton>
            <ToolButton label="Curator Agent" onClick={() => setAgentOpen(true)}>
              <Bot className="size-4" />
            </ToolButton>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="More actions"
                      size="icon"
                      variant="ghost"
                      className="size-9 rounded-md"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>More actions</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!primarySelected}
                  onClick={() => {
                    if (primarySelected) {
                      setCommentsOpen(true);
                      void loadComments(primarySelected.id);
                    }
                  }}
                >
                  <MessageSquare className="size-4" />
                  Comments
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!primarySelected || isVideo(primarySelected)}
                  onClick={() => primarySelected && openCrop(primarySelected)}
                >
                  <Crop className="size-4" />
                  Crop metadata
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!primarySelected}
                  onClick={() =>
                    primarySelected &&
                    void patchMedia(primarySelected.id, { zIndex: primarySelected.zIndex + 1 })
                  }
                >
                  <ArrowUp className="size-4" />
                  Bring forward
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!primarySelected}
                  onClick={() =>
                    primarySelected &&
                    void patchMedia(primarySelected.id, {
                      zIndex: Math.max(0, primarySelected.zIndex - 1),
                    })
                  }
                >
                  <ArrowDown className="size-4" />
                  Send backward
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={selectedItems.length === 0}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  Delete selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
          <SheetContent className="w-[380px] sm:max-w-[380px]">
            <SheetHeader>
              <SheetTitle>Comments</SheetTitle>
              <SheetDescription>{primarySelected?.fileName || "No media selected"}</SheetDescription>
            </SheetHeader>
            <ScrollArea className="mt-4 h-[calc(100dvh-230px)] pr-4">
              <div className="space-y-3">
                {comments.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No comments yet.
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded-md border border-border p-3 text-sm">
                      {comment.body}
                      <div className="mt-2 text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="mt-4 space-y-2">
              <Textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                placeholder="Add a note about why this reference matters..."
              />
              <Button className="w-full" onClick={addComment} disabled={!commentBody.trim()}>
                Add comment
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={agentOpen} onOpenChange={setAgentOpen}>
          <SheetContent className="w-[460px] sm:max-w-[460px]">
            <SheetHeader>
              <SheetTitle>Curator Agent</SheetTitle>
              <SheetDescription>Eve-backed tools with approval gates for writes.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <Textarea
                value={agentPrompt}
                onChange={(event) => setAgentPrompt(event.target.value)}
                placeholder="Ask for clusters, metadata suggestions, duplicate detection, or child prompt ideas..."
                className="min-h-28"
              />
              <Button onClick={sendAgentMessage} disabled={!agentPrompt.trim()}>
                <Bot className="size-4" />
                Send
              </Button>
              <div className="rounded-md border border-border p-3">
                {agentOutput ? (
                  <MessageResponse>{agentOutput}</MessageResponse>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Select media and ask the curator for a design direction, metadata cleanup, or
                    arrangement proposal.
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Dialog open={tasteOpen} onOpenChange={setTasteOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Taste/design text</DialogTitle>
              <DialogDescription>One cohesive direction from the selected references.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60dvh] rounded-md border border-border p-4">
              {tasteText ? <MessageResponse>{tasteText}</MessageResponse> : <Skeleton className="h-40 w-full" />}
            </ScrollArea>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => tasteText && void navigator.clipboard.writeText(tasteText)}
              >
                <Copy className="size-4" />
                Copy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-[92vw] p-0">
            {preview ? (
              <div className="relative grid max-h-[88dvh] place-items-center bg-black">
                {isVideo(preview) ? (
                  <video src={preview.url} controls autoPlay className="max-h-[88dvh] max-w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview.url}
                    alt={preview.description || preview.fileName}
                    className="max-h-[88dvh] max-w-full object-contain"
                  />
                )}
                <Button
                  aria-label="Close preview"
                  size="icon"
                  variant="secondary"
                  className="absolute right-3 top-3"
                  onClick={() => setPreview(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(cropItem)} onOpenChange={(open) => !open && setCropItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crop metadata</DialogTitle>
              <DialogDescription>Store normalized crop bounds for this image.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="space-y-1 text-sm">
                  <span className="capitalize text-muted-foreground">{field}</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={cropDraft[field]}
                    onChange={(event) =>
                      setCropDraft((current) => ({
                        ...current,
                        [field]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCropItem(null)}>
                Cancel
              </Button>
              <Button onClick={saveCrop}>Save crop</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete selected media?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} from the
                canvas and deletes stored files when possible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void deleteSelected()}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
