import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { hasSupabaseConfig, isHostedRuntime } from "@/lib/config";
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
