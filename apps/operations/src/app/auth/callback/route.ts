import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  try {
    if (code) {
      const { error } = await (
        await createClient()
      ).auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }
  } catch {
    // A failed exchange must return to sign-in without exposing the auth code.
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("error", "auth_callback");
  login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
