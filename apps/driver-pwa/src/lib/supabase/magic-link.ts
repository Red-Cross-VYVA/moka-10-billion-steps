import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "./config";

export function requestMagicLink(
  auth: Pick<SupabaseClient["auth"], "signInWithOtp">,
  email: string,
  origin: string,
  next: string | null,
) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNext(next));
  return auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
  });
}
