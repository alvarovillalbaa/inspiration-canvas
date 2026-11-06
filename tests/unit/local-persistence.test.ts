import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestPersistenceContext } from "@/lib/api/auth";
import { localPersistenceRequestAllowed } from "@/lib/api/local-context";
import { getConfig, hasLocalPersistenceConfig } from "@/lib/config";

const request = vi.hoisted(() => ({ headers: vi.fn(), supabase: vi.fn() }));
vi.mock("next/headers", () => ({ headers: request.headers }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: request.supabase }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ["DATABASE_URL", "LOCAL_PERSISTENCE_ENABLED", "VERCEL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) vi.stubEnv(name, "");
  request.headers.mockResolvedValue(new Headers({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" }));
});
afterEach(() => vi.unstubAllEnvs());

describe("explicit local persistence", () => {
  it("defaults to temporary storage without a database URL or a pool/auth attempt", async () => {
    expect(getConfig().databaseUrl).toBe("");
    expect(hasLocalPersistenceConfig()).toBe(false);
    const result = await getRequestPersistenceContext();
    expect(result.mode).toBe("error");
    if (result.mode === "error") expect(result.response.status).toBe(503);
    expect(request.headers).not.toHaveBeenCalled(); expect(request.supabase).not.toHaveBeenCalled();
  });

  it.each(["file:old.db", "mysql://127.0.0.1/canvas", "postgresql://", "postgresql://localhost/", "postgresql://localhost/canvas#fragment"])("rejects unsupported or incomplete database configuration %s", (url) => {
    vi.stubEnv("LOCAL_PERSISTENCE_ENABLED", "true"); vi.stubEnv("DATABASE_URL", url);
    expect(hasLocalPersistenceConfig()).toBe(false);
  });

  it("opens the local API only after explicit opt-in on a loopback app origin", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/inspiration_canvas");
    expect(hasLocalPersistenceConfig()).toBe(false);
    vi.stubEnv("LOCAL_PERSISTENCE_ENABLED", "true");
    expect(hasLocalPersistenceConfig()).toBe(true);
    await expect(getRequestPersistenceContext()).resolves.toEqual({ mode: "local" });
    expect(request.supabase).not.toHaveBeenCalled();
  });

  it("cannot activate the local path in Vercel even when both local variables are set", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/inspiration_canvas"); vi.stubEnv("LOCAL_PERSISTENCE_ENABLED", "true"); vi.stubEnv("VERCEL", "1");
    expect(hasLocalPersistenceConfig()).toBe(false);
    const result = await getRequestPersistenceContext();
    expect(result.mode).toBe("error");
    if (result.mode === "error") expect(result.response.status).toBe(503);
    expect(request.headers).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin local request before exposing the local repository", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/inspiration_canvas"); vi.stubEnv("LOCAL_PERSISTENCE_ENABLED", "true");
    request.headers.mockResolvedValue(new Headers({ host: "localhost:3000", origin: "https://untrusted.invalid" }));
    const result = await getRequestPersistenceContext();
    expect(result.mode).toBe("error");
    if (result.mode === "error") expect(result.response.status).toBe(403);
    expect(request.supabase).not.toHaveBeenCalled();
  });

  it("keeps configured Supabase authoritative instead of manufacturing a local identity", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/inspiration_canvas"); vi.stubEnv("LOCAL_PERSISTENCE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://authored.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "authored-public-placeholder");
    const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } };
    request.supabase.mockResolvedValue(supabase);
    const result = await getRequestPersistenceContext();
    expect(result.mode).toBe("error");
    if (result.mode === "error") expect(result.response.status).toBe(401);
    expect(request.headers).not.toHaveBeenCalled();
  });
});

describe("local request origin boundary", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("accepts exact loopback origin %s", (host) => {
    expect(localPersistenceRequestAllowed(new Headers({ host, origin: `http://${host}`, "sec-fetch-site": "same-origin" }))).toBe(true);
  });
  const rejected: HeadersInit[] = [
    { host: "public.example", origin: "http://public.example" },
    { host: "localhost:3000", origin: "http://localhost:4000" },
    { host: "localhost:3000", origin: "https://localhost:3000" },
    { host: "localhost:3000", origin: "null" },
    { host: "localhost:3000", "sec-fetch-site": "cross-site" },
    { host: "localhost:3000", "sec-fetch-site": "same-site" },
    { host: "localhost:3000", "x-forwarded-host": "public.example" },
    { host: "localhost:3000,path" },
    {},
  ];
  it.each(rejected)("rejects foreign, ambiguous or opaque origins", (input) => {
    expect(localPersistenceRequestAllowed(new Headers(input))).toBe(false);
  });
});
