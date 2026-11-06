import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { hasLocalPersistenceConfig, hasSupabaseConfig, isHostedRuntime } from "@/lib/config";
import { localPersistenceRequestAllowed } from "@/lib/api/local-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AuthenticatedRequestContext = {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;
  user: User;
};

export type RequestContextResult =
  | { mode: "supabase"; context: AuthenticatedRequestContext }
  | { mode: "local" }
  | { mode: "error"; response: NextResponse };

export async function getRequestPersistenceContext(): Promise<RequestContextResult> {
  if (!hasSupabaseConfig()) {
    if (isHostedRuntime()) {
      return {
        mode: "error",
        response: NextResponse.json(
          {
            error:
              "Supabase is not configured. Sign-in and permanent hosted persistence require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
          },
          { status: 503 },
        ),
      };
    }
    if (!hasLocalPersistenceConfig()) {
      return {
        mode: "error",
        response: NextResponse.json({ error: "Permanent storage is not configured. Use the temporary browser canvas, configure local PostgreSQL, or sign in through Supabase." }, { status: 503 }),
      };
    }
    if (!localPersistenceRequestAllowed(await headers())) {
      return {
        mode: "error",
        response: NextResponse.json({ error: "Local persistence is available only from this app's loopback origin." }, { status: 403 }),
      };
    }
    return { mode: "local" };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      mode: "error",
      response: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }),
    };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      mode: "error",
      response: NextResponse.json(
        { error: "Sign in to save this canvas permanently." },
        { status: 401 },
      ),
    };
  }

  return { mode: "supabase", context: { supabase, user: data.user } };
}
