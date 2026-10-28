"use client";

import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crop,
  FileText,
  Focus,
  GripVertical,
  ImagePlus,
  Info,
  Layers,
  LogIn,
  LogOut,
  MessageSquare,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
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

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { CropEditor } from "@/components/canvas/crop-editor";
import { CroppedImage } from "@/components/canvas/cropped-image";
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import {
  normalizeCropJson,
  type NormalizedCrop,
} from "@/lib/canvas/crop";
import {
  addTempComment,
  addTempFilesToCanvas,
  clearTempCanvasState,
  deleteTempMedia,
  getTempBlob,
  getTemporaryStorageAcknowledgedAt,
  loadTempCanvasState,
  markTemporaryStorageAcknowledged,
  updateTempMediaItems,
  type TempCanvasState,
} from "@/lib/canvas/temp-store";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { CanvasRecord, CommentRecord, MediaItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type CanvasResponse = {
  canvas: CanvasRecord;
  mediaItems: MediaItem[];
};

type AuthState = "checking" | "anonymous" | "authenticated";
type SidePanel = "info" | "curator" | null;
type GroupByMode = "none" | "category";

type InfoDraft = {
  title: string;
  category: string;
  subcategory: string;
  tags: string;
  description: string;
};

type ClientMediaContext = {
  id: string;
  canvasId: string;
  type: MediaItem["type"];
  url?: string;
  storageDriver: MediaItem["storageDriver"];
  storageKey: string;
  thumbnailUrl: string | null;
  thumbnailStorageKey: string | null;
  mimeType: string;
  fileName: string;
  title: string | null;
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
  cropJson: MediaItem["cropJson"];
  tagsJson: string[];
  category: string | null;
  subcategory: string | null;
  description: string | null;
  designAnalysisJson: MediaItem["designAnalysisJson"];
  analysisStatus: MediaItem["analysisStatus"];
  analysisError: string | null;
  parentIdsJson: string[];
  comments: CommentRecord[];
  file?: {
    dataUrl: string;
    mediaType: string;
    filename: string;
  };
};

const CANVAS_SIZE = 12000;
const DEFAULT_TRANSFORM: Transform = { scale: 0.65, positionX: 120, positionY: 80 };
const MAX_AI_INLINE_FILE_BYTES = 6 * 1024 * 1024;

const EMPTY_INFO_DRAFT: InfoDraft = {
  title: "",
  category: "",
  subcategory: "",
  tags: "",
  description: "",
};

const CURATOR_SUGGESTIONS = [
  "Cluster the selected references",
  "Suggest tighter tags and categories",
  "Write a design direction",
  "Find what feels inconsistent",
];

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

function mediaLabel(item: MediaItem) {
  return item.title?.trim() || item.fileName;
}

function mediaAnalysisLabel(item: MediaItem) {
  switch (item.analysisStatus) {
    case "pending": return "Analysis pending";
    case "processing": return "Analyzing media";
    case "complete": return "Analysis complete";
    case "failed": return "Analysis failed";
    case "skipped": return "Analysis skipped";
    default: return "Analysis status unavailable";
  }
}

function splitTags(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function infoDraftFromItem(item: MediaItem): InfoDraft {
  return {
    title: item.title || "",
    category: item.category || "",
    subcategory: item.subcategory || "",
    tags: item.tagsJson.join(", "),
    description: item.description || "",
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"], [cmdk-input]',
    ),
  );
}

function messageText(message: UIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(blob);
  });
}

export function InspirationCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const curatorContextRef = useRef<{
    canvas: { id: string; name: string } | null;
    selectedIds: string[];
    mediaContext: ClientMediaContext[];
  }>({ canvas: null, selectedIds: [], mediaContext: [] });
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draggingItem, setDraggingItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [commentsByMediaId, setCommentsByMediaId] = useState<Record<string, CommentRecord[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [tempState, setTempState] = useState<TempCanvasState | null>(null);
  const [savingTemporaryCanvas, setSavingTemporaryCanvas] = useState(false);
  const [tasteText, setTasteText] = useState("");
  const [tasteOpen, setTasteOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [infoItemId, setInfoItemId] = useState<string | null>(null);
  const [infoDraft, setInfoDraft] = useState<InfoDraft>(EMPTY_INFO_DRAFT);
  const [curatorInput, setCuratorInput] = useState("");
  const [groupBy, setGroupBy] = useState<GroupByMode>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [classifying, setClassifying] = useState(false);
  const [cropItem, setCropItem] = useState<MediaItem | null>(null);
  const [cropDraft, setCropDraft] = useState<NormalizedCrop>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const cropSavingRef = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );
  const primarySelected = selectedItems[0] || null;
  const isAuthenticated = authState === "authenticated";
  const canAuthenticate = useMemo(() => Boolean(createBrowserSupabaseClient()), []);
  const infoItem = useMemo(
    () =>
      (infoItemId ? items.find((item) => item.id === infoItemId) : null) ||
      primarySelected,
    [infoItemId, items, primarySelected],
  );
  const existingCategories = useMemo(
    () => [...new Set(items.map((item) => item.category).filter(Boolean) as string[])],
    [items],
  );
  const existingTags = useMemo(
    () => [...new Set(items.flatMap((item) => item.tagsJson))].sort(),
    [items],
  );
  const groupSections = useMemo(() => {
    if (groupBy === "none") return [];
    const sections = new Map<string, MediaItem[]>();
    for (const item of items) {
      const key = item.category?.trim() || "Uncategorized";
      sections.set(key, [...(sections.get(key) || []), item]);
    }
    return [...sections.entries()]
      .map(([name, groupItems]) => {
        const bounds = getItemsBounds(groupItems);
        return bounds ? { id: name, name, items: groupItems, bounds } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a!.name.localeCompare(b!.name)) as Array<{
        id: string;
        name: string;
        items: MediaItem[];
        bounds: NonNullable<ReturnType<typeof getItemsBounds>>;
      }>;
  }, [groupBy, items]);
  const collapsedItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const section of groupSections) {
      if (!collapsedGroups.has(section.id)) continue;
      for (const item of section.items) ids.add(item.id);
    }
    return ids;
  }, [collapsedGroups, groupSections]);
  const curatorTransport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/curator",
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            ...curatorContextRef.current,
          },
        }),
      }),
    [],
  );
  const {
    messages: curatorMessages,
    sendMessage: sendCuratorMessage,
    status: curatorStatus,
    error: curatorError,
    stop: stopCurator,
  } = useChat({
    transport: curatorTransport,
    onError: (chatError) => setError(chatError.message),
  });

  const applyTemporaryState = useCallback((next: TempCanvasState) => {
    setTempState(next);
    setCanvas(next.canvas);
    setItems(next.mediaItems);
    setCommentsByMediaId(next.commentsByMediaId);
  }, []);

  const loadTemporaryCanvas = useCallback(async (showDialog = true) => {
    setError(null);
    const state = await loadTempCanvasState();
    applyTemporaryState(state);
    setAuthState("anonymous");
    setLoading(false);
    if (showDialog && !getTemporaryStorageAcknowledgedAt()) {
      setAuthDialogOpen(true);
    }
  }, [applyTemporaryState]);

  const loadCanvas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/canvas", { cache: "no-store" });
      if (response.status === 401 || response.status === 503) {
        await loadTemporaryCanvas();
        return;
      }
      if (!response.ok) throw new Error("Could not load canvas.");
      const data = (await response.json()) as CanvasResponse;
      setCanvas(data.canvas);
      setItems(data.mediaItems);
      setAuthState("authenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load canvas.");
    } finally {
      setLoading(false);
    }
  }, [loadTemporaryCanvas]);

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
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      queueMicrotask(() => {
        void loadTemporaryCanvas();
      });
      return;
    }

    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      const pendingTemporaryState = await loadTempCanvasState();
      setTempState(pendingTemporaryState);
      if (data.user) {
        setAuthState("authenticated");
        await loadCanvas();
        if (pendingTemporaryState.mediaItems.length > 0) {
          setAuthDialogOpen(true);
        }
      } else {
        await loadTemporaryCanvas();
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_IN") {
        setAuthState("authenticated");
        void loadCanvas();
      }
      if (event === "SIGNED_OUT") {
        void loadTemporaryCanvas();
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadCanvas, loadTemporaryCanvas]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (cropItem) return;
      if (event.key === "Escape") {
        setPreview(null);
        setCropItem(null);
        setSelectedIds(new Set());
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(new Set(items.map((item) => item.id)));
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !isEditableTarget(event.target)
      ) {
        if (selectedIds.size > 0) {
          event.preventDefault();
          setConfirmDelete(true);
        }
      }
      if (event.key === "+") transformRef.current?.zoomIn(0.2, 120);
      if (event.key === "-") transformRef.current?.zoomOut(0.2, 120);
      if (event.key === "0") fitToView();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cropItem, fitToView, items, selectedIds]);

  useEffect(() => {
    curatorContextRef.current = {
      canvas: canvas ? { id: canvas.id, name: canvas.name } : null,
      selectedIds: [...selectedIds],
      mediaContext: items.map((item) => createClientMediaContext(item)),
    };
  });

  async function patchMedia(id: string, patch: Partial<MediaItem>, signal?: AbortSignal) {
    if (!isAuthenticated) {
      if (!tempState) return;
      applyTemporaryState(
        updateTempMediaItems(tempState, (current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        ),
      );
      return;
    }

    const response = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Could not update media.");
    }
    const data = (await response.json()) as { media: MediaItem };
    setItems((current) => current.map((item) => (item.id === id ? data.media : item)));
  }

  async function patchMediaBatch(updates: Array<{ id: string; patch: Partial<MediaItem> }>) {
    if (!isAuthenticated) {
      if (!tempState) return;
      const byId = new Map(updates.map((update) => [update.id, update.patch]));
      applyTemporaryState(
        updateTempMediaItems(tempState, (current) =>
          current.map((item) => {
            const patch = byId.get(item.id);
            return patch
              ? { ...item, ...patch, updatedAt: new Date().toISOString() }
              : item;
          }),
        ),
      );
      return;
    }

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
    void loadComments(item.id);
  }

  async function uploadFiles(files: FileList | File[], point?: { x: number; y: number }) {
    setUploading(true);
    setError(null);
    try {
      if (!isAuthenticated) {
        const current = tempState || (await loadTempCanvasState());
        const next = await addTempFilesToCanvas(current, Array.from(files), point);
        applyTemporaryState(next);
        if (!getTemporaryStorageAcknowledgedAt()) {
          setAuthDialogOpen(true);
        }
        return;
      }
      if (!canvas) return;
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
    if (!isAuthenticated) {
      if (tempState) {
        const next = await deleteTempMedia(tempState, ids);
        applyTemporaryState(next);
      }
      setSelectedIds(new Set());
      setConfirmDelete(false);
      return;
    }

    await Promise.all(ids.map((id) => fetch(`/api/media/${id}`, { method: "DELETE" })));
    setItems((current) => current.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    setConfirmDelete(false);
  }

  async function loadComments(mediaId: string) {
    if (!isAuthenticated) {
      setCommentsByMediaId((current) => ({
        ...current,
        [mediaId]: tempState?.commentsByMediaId[mediaId] || [],
      }));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}/comments`, { cache: "no-store" });
    const data = (await response.json()) as { comments: CommentRecord[] };
    setCommentsByMediaId((current) => ({ ...current, [mediaId]: data.comments }));
  }

  async function addComment(mediaId: string) {
    const body = commentDrafts[mediaId]?.trim();
    if (!body) return;
    if (!isAuthenticated) {
      if (!tempState) return;
      const result = addTempComment(tempState, mediaId, body);
      setTempState(result.state);
      setCommentsByMediaId(result.state.commentsByMediaId);
      setCommentDrafts((current) => ({ ...current, [mediaId]: "" }));
      return;
    }

    const response = await fetch(`/api/media/${mediaId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = (await response.json()) as { comment?: CommentRecord; error?: string };
    if (!response.ok || !data.comment) {
      setError(data.error || "Could not add comment.");
      return;
    }
    setCommentsByMediaId((current) => ({
      ...current,
      [mediaId]: [...(current[mediaId] || []), data.comment!],
    }));
    setCommentDrafts((current) => ({ ...current, [mediaId]: "" }));
  }

  function createClientMediaContext(item: MediaItem): ClientMediaContext {
    return {
      id: item.id,
      canvasId: item.canvasId,
      type: item.type,
      url: item.url,
      storageDriver: item.storageDriver,
      storageKey: item.storageKey,
      thumbnailUrl: item.thumbnailUrl,
      thumbnailStorageKey: item.thumbnailStorageKey,
      mimeType: item.mimeType,
      fileName: item.fileName,
      title: item.title,
      sizeBytes: item.sizeBytes,
      intrinsicWidth: item.intrinsicWidth,
      intrinsicHeight: item.intrinsicHeight,
      durationSeconds: item.durationSeconds,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      zIndex: item.zIndex,
      rotation: item.rotation,
      cropJson: item.cropJson,
      tagsJson: item.tagsJson,
      category: item.category,
      subcategory: item.subcategory,
      description: item.description,
      designAnalysisJson: item.designAnalysisJson,
      analysisStatus: item.analysisStatus,
      analysisError: item.analysisError,
      parentIdsJson: item.parentIdsJson,
      comments:
        commentsByMediaId[item.id] ||
        tempState?.commentsByMediaId[item.id] ||
        [],
    };
  }

  async function createAiMediaContext(item: MediaItem): Promise<ClientMediaContext> {
    const context = createClientMediaContext(item);
    if (!isAuthenticated && item.mimeType.startsWith("image/")) {
      const blob = await getTempBlob(item.storageKey);
      if (blob && blob.size <= MAX_AI_INLINE_FILE_BYTES) {
        context.file = {
          dataUrl: await blobToDataUrl(blob),
          mediaType: item.mimeType,
          filename: item.fileName,
        };
      }
    }
    return context;
  }

  async function generateTasteBrief() {
    if (!canvas || selectedItems.length === 0) return;
    setTasteOpen(true);
    setTasteText("");
    setError(null);
    const mediaContext = !isAuthenticated
      ? await Promise.all(selectedItems.map((item) => createAiMediaContext(item)))
      : undefined;
    const response = await fetch("/api/taste-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canvasId: canvas.id,
        mediaIds: selectedItems.map((item) => item.id),
        mediaContext,
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
    if (!isAuthenticated) {
      setError("Sign in to save this temporary canvas before generating child media.");
      setAuthDialogOpen(true);
      return;
    }
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

  async function runAutoClassify() {
    if (!canvas || selectedItems.length === 0) return;
    setClassifying(true);
    setError(null);
    try {
      const mediaContext = !isAuthenticated
        ? await Promise.all(selectedItems.map((item) => createAiMediaContext(item)))
        : undefined;
      const response = await fetch("/api/media/auto-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: canvas.id,
          mediaIds: selectedItems.map((item) => item.id),
          mediaContext,
        }),
      });
      const data = (await response.json()) as {
        results?: Array<{ id: string; media?: MediaItem; patch?: Partial<MediaItem> }>;
        error?: string;
      };
      if (!response.ok || !data.results) {
        throw new Error(data.error || "Auto-classify failed.");
      }
      const updates = new Map(
        data.results.map((result) => [result.id, result.media || result.patch || null]),
      );
      setItems((current) =>
        current.map((item) => {
          const update = updates.get(item.id);
          return update ? { ...item, ...update } : item;
        }),
      );
      if (!isAuthenticated && tempState) {
        applyTemporaryState(
          updateTempMediaItems(tempState, (current) =>
            current.map((item) => {
              const update = updates.get(item.id);
              return update
                ? { ...item, ...update, updatedAt: new Date().toISOString() }
                : item;
            }),
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-classify failed.");
    } finally {
      setClassifying(false);
    }
  }

  async function sendSignInLink() {
    if (!authEmail.trim()) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setAuthMessage("Supabase sign-in is not configured for this deployment.");
      return;
    }
    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
        },
      });
      if (signInError) throw signInError;
      setAuthMessage("Check your email for a sign-in link.");
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : "Could not send sign-in link.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase?.auth.signOut();
    await loadTemporaryCanvas();
  }

  async function saveTemporaryCanvasToAccount() {
    if (!tempState || !canvas || !isAuthenticated || tempState.mediaItems.length === 0) return;
    setSavingTemporaryCanvas(true);
    setError(null);
    try {
      for (const tempItem of tempState.mediaItems) {
        const blob = await getTempBlob(tempItem.storageKey);
        if (!blob) continue;
        const file = new File([blob], tempItem.fileName, { type: tempItem.mimeType });
        const form = new FormData();
        form.append("file", file);
        form.append("canvasId", canvas.id);
        form.append("x", String(tempItem.x));
        form.append("y", String(tempItem.y));
        const response = await fetch("/api/upload", { method: "POST", body: form });
        const data = (await response.json()) as { media?: MediaItem; error?: string };
        if (!response.ok || !data.media) throw new Error(data.error || "Upload failed.");
        await fetch(`/api/media/${data.media.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: tempItem.title,
            width: tempItem.width,
            height: tempItem.height,
            zIndex: tempItem.zIndex,
            rotation: tempItem.rotation,
            cropJson: tempItem.cropJson,
            tagsJson: tempItem.tagsJson,
            category: tempItem.category,
            subcategory: tempItem.subcategory,
            description: tempItem.description,
          }),
        });
        for (const comment of tempState.commentsByMediaId[tempItem.id] || []) {
          await fetch(`/api/media/${data.media.id}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: comment.body }),
          });
        }
      }
      await clearTempCanvasState();
      setTempState(null);
      setAuthDialogOpen(false);
      await loadCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save temporary canvas.");
    } finally {
      setSavingTemporaryCanvas(false);
    }
  }

  function openCommentsForItem(item: MediaItem) {
    setSelectedIds(new Set([item.id]));
    void loadComments(item.id);
  }

  function openInfoForItem(item: MediaItem) {
    setSelectedIds(new Set([item.id]));
    setInfoItemId(item.id);
    setInfoDraft(infoDraftFromItem(item));
    setSidePanel("info");
    void loadComments(item.id);
  }

  async function saveInfo() {
    if (!infoItem) return;
    await patchMedia(infoItem.id, {
      title: infoDraft.title.trim() || null,
      category: infoDraft.category.trim() || null,
      subcategory: infoDraft.subcategory.trim() || null,
      tagsJson: splitTags(infoDraft.tags),
      description: infoDraft.description.trim() || null,
    });
  }

  function addCategoryToDraft(category: string) {
    setInfoDraft((current) => ({ ...current, category }));
  }

  function addTagToDraft(tag: string) {
    setInfoDraft((current) => {
      const tags = splitTags(current.tags);
      if (!tags.includes(tag)) tags.push(tag);
      return { ...current, tags: tags.join(", ") };
    });
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function renderGroupSections() {
    if (groupSections.length === 0) return null;
    return groupSections.map((section) => {
      const collapsed = collapsedGroups.has(section.id);
      const padding = 28;
      return (
        <div
          key={section.id}
          className="absolute rounded-md border border-dashed border-primary/60 bg-primary/5"
          style={{
            left: section.bounds.x - padding,
            top: section.bounds.y - padding,
            width: section.bounds.width + padding * 2,
            height: collapsed ? 54 : section.bounds.height + padding * 2,
            zIndex: 1,
          }}
        >
          <button
            type="button"
            className="absolute left-3 top-3 flex h-8 items-center gap-2 rounded-md border border-border bg-background/90 px-2 text-xs font-medium shadow-sm backdrop-blur"
            onClick={(event) => {
              event.stopPropagation();
              toggleGroup(section.id);
            }}
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            <span className="max-w-48 truncate">{section.name}</span>
            <span className="text-muted-foreground">{section.items.length}</span>
          </button>
        </div>
      );
    });
  }

  function renderCommentsPopover(item: MediaItem) {
    if (!selectedIds.has(item.id)) return null;
    const itemComments = commentsByMediaId[item.id] || tempState?.commentsByMediaId[item.id] || [];
    return (
      <div
        className="absolute left-[calc(100%+10px)] top-0 w-80 rounded-md border border-border bg-background/95 p-3 shadow-lg backdrop-blur"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ zIndex: 60 }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">Comments</div>
            <div className="truncate text-xs text-muted-foreground">{mediaLabel(item)}</div>
          </div>
          <Button
            aria-label="Close comments"
            size="icon"
            variant="ghost"
            className="size-7 rounded-md"
            onClick={() => setSelectedIds((current) => {
              const next = new Set(current);
              next.delete(item.id);
              return next;
            })}
          >
            <X className="size-3" />
          </Button>
        </div>
        <ScrollArea className="max-h-48 pr-3">
          <div className="space-y-2">
            {itemComments.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                No comments yet.
              </div>
            ) : (
              itemComments.map((comment) => (
                <div key={comment.id} className="rounded-md border border-border p-2 text-sm">
                  {comment.body}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="mt-3 space-y-2">
          <Textarea
            value={commentDrafts[item.id] || ""}
            onChange={(event) =>
              setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))
            }
            placeholder="Add a note..."
            className="min-h-20 resize-none"
          />
          <Button
            className="w-full"
            size="sm"
            onClick={() => void addComment(item.id)}
            disabled={!commentDrafts[item.id]?.trim()}
          >
            Add comment
          </Button>
        </div>
      </div>
    );
  }

  function renderSidePanel() {
    if (sidePanel === "info") {
      return (
        <aside className="flex h-[100dvh] w-[390px] shrink-0 flex-col border-l border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">Media info</div>
              <div className="truncate text-xs text-muted-foreground">
                {infoItem ? mediaLabel(infoItem) : "No media selected"}
              </div>
              {infoItem ? (
                <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                  {mediaAnalysisLabel(infoItem)}
                </p>
              ) : null}
            </div>
            <Button
              aria-label="Close info"
              size="icon"
              variant="ghost"
              className="size-8 rounded-md"
              onClick={() => setSidePanel(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          {infoItem ? (
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Title</span>
                  <Input
                    value={infoDraft.title}
                    onChange={(event) =>
                      setInfoDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Reference title"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <Input
                    value={infoDraft.category}
                    onChange={(event) =>
                      setInfoDraft((current) => ({ ...current, category: event.target.value }))
                    }
                    placeholder="Create or choose a category"
                    list="media-categories"
                  />
                  <datalist id="media-categories">
                    {existingCategories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </label>
                {existingCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {existingCategories.slice(0, 8).map((category) => (
                      <Button
                        key={category}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-md px-2 text-xs"
                        onClick={() => addCategoryToDraft(category)}
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Subcategory</span>
                  <Input
                    value={infoDraft.subcategory}
                    onChange={(event) =>
                      setInfoDraft((current) => ({ ...current, subcategory: event.target.value }))
                    }
                    placeholder="Optional subcategory"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Tags</span>
                  <Input
                    value={infoDraft.tags}
                    onChange={(event) =>
                      setInfoDraft((current) => ({ ...current, tags: event.target.value }))
                    }
                    placeholder="Comma-separated tags"
                    list="media-tags"
                  />
                  <datalist id="media-tags">
                    {existingTags.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                </label>
                {existingTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {existingTags.slice(0, 14).map((tag) => (
                      <Button
                        key={tag}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-md px-2 text-xs"
                        onClick={() => addTagToDraft(tag)}
                      >
                        {tag}
                      </Button>
                    ))}
                  </div>
                ) : null}
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Description</span>
                  <Textarea
                    value={infoDraft.description}
                    onChange={(event) =>
                      setInfoDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="What makes this reference useful?"
                    className="min-h-28 resize-none"
                  />
                </label>
              </div>
            </ScrollArea>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Select media to edit its metadata.</div>
          )}
          <div className="border-t border-border p-4">
            <Button className="w-full" onClick={() => void saveInfo()} disabled={!infoItem}>
              Save info
            </Button>
          </div>
        </aside>
      );
    }

    if (sidePanel === "curator") {
      return (
        <aside className="flex h-[100dvh] w-[460px] shrink-0 flex-col border-l border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <div className="text-sm font-medium">Curator</div>
              <div className="text-xs text-muted-foreground">
                {selectedIds.size} selected / {items.length} total
              </div>
            </div>
            <Button
              aria-label="Close curator"
              size="icon"
              variant="ghost"
              className="size-8 rounded-md"
              onClick={() => setSidePanel(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-4 p-4">
              {curatorMessages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Bot className="size-7" />}
                  title="Ask the curator"
                  description="Use the selected media and canvas metadata as context."
                />
              ) : (
                curatorMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[92%] rounded-md border px-3 py-2 text-sm",
                      message.role === "user"
                        ? "ml-auto border-primary/25 bg-primary/10"
                        : "border-border bg-muted/35",
                    )}
                  >
                    <MessageResponse className="prose-p:my-0">{messageText(message)}</MessageResponse>
                  </div>
                ))
              )}
              {curatorError ? (
                <Alert className="border-destructive/50">
                  <AlertTitle>Curator failed</AlertTitle>
                  <AlertDescription>{curatorError.message}</AlertDescription>
                </Alert>
              ) : null}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="space-y-3 border-t border-border p-4">
            <Suggestions>
              {CURATOR_SUGGESTIONS.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  suggestion={suggestion}
                  onClick={(value) => setCuratorInput(value)}
                />
              ))}
            </Suggestions>
            <PromptInput
              onSubmit={(message, event) => {
                event.preventDefault();
                const text = message.text.trim();
                if (!text) return;
                void sendCuratorMessage({ text });
                setCuratorInput("");
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  value={curatorInput}
                  onChange={(event) => setCuratorInput(event.target.value)}
                  placeholder="Ask for clusters, tags, direction, or cleanup..."
                  className="min-h-24"
                />
              </PromptInputBody>
              <PromptInputFooter>
                <div className="text-xs text-muted-foreground">
                  Uses current canvas context
                </div>
                <PromptInputSubmit
                  status={curatorStatus}
                  onStop={() => stopCurator()}
                  disabled={!curatorInput.trim() && curatorStatus === "ready"}
                />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </aside>
      );
    }

    return null;
  }

  function bringForward(item: MediaItem) {
    const maxZ = Math.max(0, ...items.map((candidate) => candidate.zIndex));
    void patchMedia(item.id, { zIndex: maxZ + 1 });
  }

  function sendBackward(item: MediaItem) {
    void patchMedia(item.id, { zIndex: Math.max(0, item.zIndex - 1) });
  }

  function openCrop(item: MediaItem) {
    setCropDraft(
      normalizeCropJson(item.cropJson) || { x: 0, y: 0, width: 1, height: 1 },
    );
    setCropError(null);
    setCropItem(item);
  }

  async function saveCrop() {
    if (!cropItem || cropSavingRef.current) return;
    const crop = normalizeCropJson(cropDraft);
    if (!crop) {
      setCropError("Choose a crop within the image before saving.");
      return;
    }
    cropSavingRef.current = true;
    setCropSaving(true);
    setCropError(null);
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 20_000);
    try {
      if (!isAuthenticated && !tempState) {
        throw new Error("The temporary canvas is unavailable. Keep this dialog open and try again.");
      }
      const currentItems = isAuthenticated ? items : tempState!.mediaItems;
      if (!currentItems.some((item) => item.id === cropItem.id)) {
        throw new Error("This image is no longer in the current canvas. Your crop selection is still here.");
      }
      await patchMedia(cropItem.id, { cropJson: crop }, controller.signal);
      setCropItem(null);
    } catch (err) {
      setCropError(
        controller.signal.aborted
          ? "Saving took too long. The server may have saved it; your selection is still here. Retry to confirm."
          : err instanceof Error ? err.message : "Could not save this crop. Your selection is still here.",
      );
    } finally {
      clearTimeout(deadline);
      cropSavingRef.current = false;
      setCropSaving(false);
    }
  }

  function renderMedia(item: MediaItem) {
    if (collapsedItemIds.has(item.id)) return null;
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
        style={{ zIndex: item.zIndex + 10 }}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              aria-label={mediaLabel(item)}
              aria-describedby={`media-description-${item.id}`}
              aria-pressed={selected}
              data-testid="media-item"
              data-media-id={item.id}
              onClick={(event) => selectItem(item, event)}
              onContextMenu={() => setSelectedIds(new Set([item.id]))}
              onDoubleClick={() => setPreview(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedIds(new Set([item.id]));
                }
              }}
              className={cn(
                "relative size-full overflow-visible rounded-md border bg-card text-left shadow-sm outline-none transition-colors",
                selected ? "border-primary ring-2 ring-primary/35" : "border-border",
              )}
            >
              <span id={`media-description-${item.id}`} className="sr-only">
                {item.description ? `${item.description} ` : ""}{mediaAnalysisLabel(item)}
              </span>
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
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
                    {crop ? (
                      <CroppedImage
                        src={item.url}
                        alt={item.description || item.fileName}
                        crop={crop}
                        frameWidth={item.width}
                        frameHeight={item.height}
                        intrinsicWidth={item.intrinsicWidth}
                        intrinsicHeight={item.intrinsicHeight}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnailUrl || item.url}
                        alt={item.description || item.fileName}
                        className="size-full object-cover"
                        data-testid="media-image"
                        loading="lazy"
                      />
                    )}
                  </span>
                )}
              </div>
              {selected ? (
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Media actions"
                          size="icon"
                          variant="secondary"
                          className="absolute right-2 top-2 size-8 rounded-md opacity-95 shadow-sm"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <GripVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Media actions</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openInfoForItem(item)}>
                      <Info className="size-4" />
                      Info
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openCommentsForItem(item)}>
                      <MessageSquare className="size-4" />
                      Comments
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isVideo(item)}
                      onClick={() => openCrop(item)}
                    >
                      <Crop className="size-4" />
                      Crop
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => bringForward(item)}>
                      <ArrowUp className="size-4" />
                      Bring forward
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => sendBackward(item)}>
                      <ArrowDown className="size-4" />
                      Send backward
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
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
                        return <div key={parentId}>{parent ? mediaLabel(parent) : parentId}</div>;
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
              {renderCommentsPopover(item)}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => openInfoForItem(item)}>
              <Info className="size-4" />
              Info
            </ContextMenuItem>
            <ContextMenuItem onClick={() => openCommentsForItem(item)}>
              <MessageSquare className="size-4" />
              Comments
            </ContextMenuItem>
            <ContextMenuItem disabled={isVideo(item)} onClick={() => openCrop(item)}>
              <Crop className="size-4" />
              Crop
            </ContextMenuItem>
            <ContextMenuItem onClick={() => bringForward(item)}>
              <ArrowUp className="size-4" />
              Bring forward
            </ContextMenuItem>
            <ContextMenuItem onClick={() => sendBackward(item)}>
              <ArrowDown className="size-4" />
              Send backward
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                setSelectedIds(new Set([item.id]));
                setConfirmDelete(true);
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Rnd>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-[100dvh] bg-background text-foreground">
        <div
          ref={wrapperRef}
          className="relative min-h-[100dvh] min-w-0 flex-1 overflow-hidden"
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
                {renderGroupSections()}
                {items.map(renderMedia)}
              </div>
            </TransformComponent>
          </TransformWrapper>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
            <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-border bg-background/85 px-3 py-2 shadow-sm backdrop-blur-sm">
            <div>
              <div className="text-sm font-medium">{canvas?.name || "Inspiration Canvas"}</div>
              <div className="text-xs text-muted-foreground">
                {items.length} media / {selectedIds.size} selected
              </div>
            </div>
            {authState === "authenticated" ? (
              <Button size="sm" variant="ghost" className="h-8 rounded-md" onClick={() => void signOut()}>
                <LogOut className="size-4" />
                Sign out
              </Button>
            ) : (
              <Button size="sm" variant="secondary" className="h-8 rounded-md" onClick={() => setAuthDialogOpen(true)}>
                <LogIn className="size-4" />
                Sign in
              </Button>
            )}
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

        <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+18px)] z-30 flex justify-center px-4">
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
            <ToolButton
              label="Auto-classify"
              disabled={selectedItems.length === 0 || classifying}
              onClick={runAutoClassify}
            >
              {classifying ? <Activity className="size-4" /> : <Sparkles className="size-4" />}
            </ToolButton>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label="Group media"
                      size="icon"
                      variant="ghost"
                      className="size-9 rounded-md"
                    >
                      <Layers className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Group media</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => setGroupBy("none")}>
                  {groupBy === "none" ? <Check className="size-4" /> : <span className="size-4" />}
                  None
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("category")}>
                  {groupBy === "category" ? <Check className="size-4" /> : <span className="size-4" />}
                  Category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ToolButton label="Curator" onClick={() => setSidePanel("curator")}>
              <Bot className="size-4" />
            </ToolButton>
            <ToolButton
              label="Delete selected"
              disabled={selectedItems.length === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </ToolButton>
          </div>
        </div>

        <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {authState === "authenticated" && tempState?.mediaItems.length
                  ? "Save temporary canvas"
                  : "Temporary canvas expires in 4 hours"}
              </DialogTitle>
              <DialogDescription>
                {authState === "authenticated" && tempState?.mediaItems.length
                  ? "Move your temporary uploads into your signed-in account so they persist in the database."
                  : `Uploads are stored in this browser until ${
                      tempState
                        ? new Date(tempState.expiresAt).toLocaleString()
                        : "four hours from now"
                    }. Sign in or register to keep them permanently.`}
              </DialogDescription>
            </DialogHeader>
            {authState === "authenticated" ? (
              <div className="space-y-3">
                {tempState?.mediaItems.length ? (
                  <Button
                    className="w-full"
                    onClick={() => void saveTemporaryCanvasToAccount()}
                    disabled={savingTemporaryCanvas}
                  >
                    {savingTemporaryCanvas ? <Activity className="size-4" /> : <Upload className="size-4" />}
                    Save temporary canvas
                  </Button>
                ) : (
                  <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                    Your signed-in canvas is already using permanent storage.
                  </div>
                )}
              </div>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendSignInLink();
                }}
              >
                <Input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  disabled={authLoading}
                />
                {!canAuthenticate ? (
                  <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                    Authentication is not configured here, but the field remains editable.
                  </div>
                ) : null}
                {authMessage ? (
                  <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                    {authMessage}
                  </div>
                ) : null}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      markTemporaryStorageAcknowledged();
                      setAuthDialogOpen(false);
                    }}
                  >
                    Keep temporary
                  </Button>
                  <Button type="submit" disabled={!canAuthenticate || authLoading || !authEmail.trim()}>
                    {authLoading ? <Activity className="size-4" /> : <LogIn className="size-4" />}
                    Send sign-in link
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

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

        <Dialog
          open={Boolean(cropItem)}
          onOpenChange={(open) => {
            if (!open && !cropSavingRef.current) setCropItem(null);
          }}
        >
          <DialogContent
            className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"
            showCloseButton={!cropSaving}
            onEscapeKeyDown={(event) => {
              if (cropSavingRef.current) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (cropSavingRef.current) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Crop image</DialogTitle>
              <DialogDescription>
                Drag the frame or its handles to choose what stays in view. The original file is preserved.
              </DialogDescription>
            </DialogHeader>
            {cropItem && (
              <CropEditor
                key={cropItem.id}
                src={cropItem.url}
                alt={cropItem.description || cropItem.fileName}
                value={cropDraft}
                disabled={cropSaving}
                onChange={(crop) => {
                  setCropDraft(crop);
                  setCropError(null);
                }}
              />
            )}
            {cropError && (
              <Alert variant="destructive">
                <AlertTitle>Crop not saved</AlertTitle>
                <AlertDescription>{cropError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                className="mr-auto min-h-11"
                variant="outline"
                disabled={cropSaving}
                onClick={() => {
                  setCropDraft({ x: 0, y: 0, width: 1, height: 1 });
                  setCropError(null);
                }}
              >
                Reset crop
              </Button>
              <Button className="min-h-11" variant="secondary" disabled={cropSaving} onClick={() => setCropItem(null)}>
                Cancel
              </Button>
              <Button className="min-h-11" disabled={cropSaving} onClick={() => void saveCrop()}>
                {cropSaving ? "Saving crop…" : "Save crop"}
              </Button>
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
        {renderSidePanel()}
      </div>
    </TooltipProvider>
  );
}
