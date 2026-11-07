import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  context: vi.fn(), generate: vi.fn(), ownedRun: vi.fn(), engineRun: vi.fn(),
  localRun: vi.fn(), localMedia: vi.fn(), createLocal: vi.fn(), updateLocal: vi.fn(),
  startLocal: vi.fn(), propose: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ getRequestPersistenceContext: ports.context }));
vi.mock("@/lib/db/supabase-repository", () => ({ getGenerationRunForUser: ports.ownedRun }));
vi.mock("@/lib/db/repository", () => ({
  getGenerationRun: ports.localRun, getMediaItem: ports.localMedia,
  createGenerationRun: ports.createLocal, updateGenerationRun: ports.updateLocal,
}));
vi.mock("@/lib/workflows/start", () => ({ startChildGenerationRun: ports.startLocal }));
vi.mock("workflow/api", () => ({ getRun: ports.engineRun }));
vi.mock("@/lib/ai/service", () => ({
  MissingAICredentialsError: class MissingAICredentialsError extends Error {},
  proposeChildMediaPrompt: ports.propose,
}));
vi.mock("@/lib/workflows/supabase-child-generation", () => ({
  runSupabaseChildGeneration: ports.generate,
  SupabaseChildGenerationError: class SupabaseChildGenerationError extends Error {},
}));

import { POST } from "@/app/api/generate-child/route";
import { GET as statusGET } from "@/app/api/workflows/runs/[runId]/route";
import { GET as eventsGET } from "@/app/api/workflows/runs/[runId]/events/route";
import { SupabaseChildGenerationError } from "@/lib/workflows/supabase-child-generation";

const client = { scope: "authored-request-client" };
const input = { canvasId: "owned-canvas", mediaIds: ["first-parent", "second-parent"], prompt: "Authored image" };
const run = { id: "owned-run", canvasId: "owned-canvas", status: "complete", resultMediaItemId: "owned-child" };
const routeContext = () => ({ params: Promise.resolve({ runId: "owned-run" }) });
const post = (value: unknown = input) => new Request("http://localhost/api/generate-child", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
});
const get = () => new Request("http://localhost/api/workflows/runs/owned-run");
function noLocalOrEngine() {
  for (const port of [ports.localRun, ports.localMedia, ports.createLocal, ports.updateLocal, ports.startLocal, ports.engineRun, ports.propose]) {
    expect(port).not.toHaveBeenCalled();
  }
}
function failure(code: string, runId: string | null = "owned-run") {
  return Object.assign(Object.create(SupabaseChildGenerationError.prototype), {
    code, runId, message: "Authored safe failure.",
  }) as SupabaseChildGenerationError;
}
beforeEach(() => {
  vi.resetAllMocks();
  ports.context.mockResolvedValue({ mode: "supabase", context: { supabase: client, user: { id: "verified-actor" } } });
  ports.generate.mockResolvedValue({ run, media: { id: "owned-child", canvasId: "owned-canvas" }, prompt: input.prompt });
  ports.ownedRun.mockResolvedValue(run);
});

describe("authenticated child-generation route boundaries", () => {
  it("returns 200 only for the awaited completed Supabase result", async () => {
    const request = post();
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ run, media: { id: "owned-child", canvasId: "owned-canvas" }, prompt: input.prompt, workflow: { workflowRunId: null, mode: "supabase" } });
    expect(ports.generate).toHaveBeenCalledExactlyOnceWith({ supabase: client, userId: "verified-actor", ...input, signal: request.signal });
    noLocalOrEngine();
  });
  it("authenticates before parsing a generation body", async () => {
    const denied = Response.json({ error: "Sign in." }, { status: 401 });
    ports.context.mockResolvedValue({ mode: "error", response: denied });
    const response = await POST(new Request("http://localhost/api/generate-child", { method: "POST", body: "{" }));
    expect(response).toBe(denied);
    expect(ports.generate).not.toHaveBeenCalled();
    noLocalOrEngine();
  });
  it("refuses malformed JSON without creating or dispatching work", async () => {
    const response = await POST(new Request("http://localhost/api/generate-child", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(ports.generate).not.toHaveBeenCalled();
    noLocalOrEngine();
  });
  it("refuses fewer than two parents before the coordinator", async () => {
    expect((await POST(post({ ...input, mediaIds: ["first-parent"] }))).status).toBe(400);
    expect(ports.generate).not.toHaveBeenCalled();
    noLocalOrEngine();
  });
  it("derives the actor and client from authentication rather than request fields", async () => {
    const request = post({ ...input, userId: "foreign-actor", supabase: "foreign-client", signal: "foreign-signal" });
    await POST(request);
    expect(ports.generate).toHaveBeenCalledExactlyOnceWith({ supabase: client, userId: "verified-actor", ...input, signal: request.signal });
  });
  it("returns an invalid-request refusal without local fallback", async () => {
    ports.generate.mockRejectedValue(failure("invalid_request", null));
    expect((await POST(post())).status).toBe(400);
    noLocalOrEngine();
  });
  it("keeps missing and foreign scope behind the same 404", async () => {
    ports.generate.mockRejectedValue(failure("not_found", null));
    const response = await POST(post());
    expect(response.status).toBe(404);
    expect((await response.json()).runId).toBeNull();
    noLocalOrEngine();
  });
  it("reports missing AI credentials without dispatching a workflow", async () => {
    ports.generate.mockRejectedValue(failure("credentials"));
    const response = await POST(post());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ requiresAiCredentials: true, unconfirmed: false, runId: "owned-run" });
    noLocalOrEngine();
  });
  it("retains the known run ID for an unconfirmed write and never regenerates", async () => {
    ports.generate.mockRejectedValue(failure("unconfirmed"));
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ unconfirmed: true, runId: "owned-run", requiresAiCredentials: false });
    expect(ports.generate).toHaveBeenCalledTimes(1);
    noLocalOrEngine();
  });
  it("reports a definite coordinator failure separately from uncertainty", async () => {
    ports.generate.mockRejectedValue(failure("failed"));
    const response = await POST(post());
    expect(response.status).toBe(500);
    expect((await response.json()).unconfirmed).toBe(false);
    noLocalOrEngine();
  });
  it("does not expose an unexpected provider error or fall back to local work", async () => {
    ports.generate.mockRejectedValue(new Error("private-provider-token: authored-secret"));
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("authored-secret");
    noLocalOrEngine();
  });
  it("reads a saved run only with the verified actor and request client", async () => {
    const response = await statusGET(get(), routeContext());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ runId: "owned-run", status: "complete", generationRun: run });
    expect(ports.ownedRun).toHaveBeenCalledExactlyOnceWith(client, "verified-actor", "owned-run");
    noLocalOrEngine();
  });
  it("never asks the global engine when an owned-run lookup returns missing", async () => {
    ports.ownedRun.mockResolvedValue(null);
    expect((await statusGET(get(), routeContext())).status).toBe(404);
    noLocalOrEngine();
  });
  it("keeps status lookup errors private and never probes the local repository", async () => {
    ports.ownedRun.mockRejectedValue(new Error("private database endpoint"));
    const response = await statusGET(get(), routeContext());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database endpoint");
    noLocalOrEngine();
  });
  it("denies unauthenticated status requests before any run lookup", async () => {
    const denied = Response.json({ error: "Sign in." }, { status: 401 });
    ports.context.mockResolvedValue({ mode: "error", response: denied });
    expect(await statusGET(get(), routeContext())).toBe(denied);
    expect(ports.ownedRun).not.toHaveBeenCalled();
    noLocalOrEngine();
  });
  it("refuses unsupported Supabase event streaming only after owned lookup", async () => {
    const response = await eventsGET(get(), routeContext());
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(ports.ownedRun).toHaveBeenCalledExactlyOnceWith(client, "verified-actor", "owned-run");
    noLocalOrEngine();
  });
  it("does not reveal whether a foreign run has an event stream", async () => {
    ports.ownedRun.mockResolvedValue(null);
    expect((await eventsGET(get(), routeContext())).status).toBe(404);
    noLocalOrEngine();
  });
  it("denies unauthenticated events before the workflow engine", async () => {
    const denied = Response.json({ error: "Sign in." }, { status: 401 });
    ports.context.mockResolvedValue({ mode: "error", response: denied });
    expect(await eventsGET(get(), routeContext())).toBe(denied);
    expect(ports.ownedRun).not.toHaveBeenCalled();
    noLocalOrEngine();
  });
  it("keeps event lookup failures private without engine fallback", async () => {
    ports.ownedRun.mockRejectedValue(new Error("private database endpoint"));
    const response = await eventsGET(get(), routeContext());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database endpoint");
    noLocalOrEngine();
  });
  it("retains the local queued-generation contract behind local admission", async () => {
    ports.context.mockResolvedValue({ mode: "local" });
    ports.localMedia.mockImplementation(async (id: string) => ({ id }));
    ports.createLocal.mockResolvedValue({ ...run, status: "pending", resultMediaItemId: null });
    ports.startLocal.mockResolvedValue({ workflowRunId: "local-workflow", mode: "workflow" });
    const response = await POST(post());
    expect(response.status).toBe(202);
    expect(ports.startLocal).toHaveBeenCalledExactlyOnceWith("owned-run");
    expect(ports.generate).not.toHaveBeenCalled();
    expect(ports.ownedRun).not.toHaveBeenCalled();
  });
  it("permits workflow status only after the request is admitted as local", async () => {
    ports.context.mockResolvedValue({ mode: "local" });
    ports.engineRun.mockResolvedValue({ status: "running", workflowName: "authored-workflow", createdAt: new Date(0), startedAt: null, completedAt: null });
    expect((await statusGET(get(), routeContext())).status).toBe(200);
    expect(ports.engineRun).toHaveBeenCalledExactlyOnceWith("owned-run");
    expect(ports.ownedRun).not.toHaveBeenCalled();
    expect(ports.localRun).not.toHaveBeenCalled();
  });
  it("retains the local saved-run fallback without using it for Supabase", async () => {
    ports.context.mockResolvedValue({ mode: "local" });
    ports.engineRun.mockRejectedValue(new Error("No engine run"));
    ports.localRun.mockResolvedValue(run);
    expect((await statusGET(get(), routeContext())).status).toBe(200);
    expect(ports.localRun).toHaveBeenCalledExactlyOnceWith("owned-run");
    expect(ports.ownedRun).not.toHaveBeenCalled();
  });
  it("retains the local SSE format behind local admission", async () => {
    ports.context.mockResolvedValue({ mode: "local" });
    ports.engineRun.mockResolvedValue({ getReadable: () => new ReadableStream({ start(controller) { controller.enqueue({ type: "done" }); controller.close(); } }) });
    const response = await eventsGET(get(), routeContext());
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(await response.text()).toBe('data: {"type":"done"}\n\n');
    expect(ports.ownedRun).not.toHaveBeenCalled();
  });
});
