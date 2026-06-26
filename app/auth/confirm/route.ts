import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") || "/";

  if (tokenHash && type) {
    const supabase = await createServerSupabaseClient();
    await supabase?.auth.verifyOtp({ type, token_hash: tokenHash });
  }

  redirect(next.startsWith("/") ? next : "/");
}
