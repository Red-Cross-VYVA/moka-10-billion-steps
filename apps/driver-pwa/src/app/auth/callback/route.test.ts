import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { safeNext } from "@/lib/supabase/config";

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
import { GET } from "./route";

const origin = "https://app.example";
function request(code: string | null, next: string | null) {
  const url = new URL("/auth/callback", origin);
  if (code) url.searchParams.set("code", code);
  if (next) url.searchParams.set("next", next);
  return new NextRequest(url);
}

describe("magic-link callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });
  it("exchanges the code before returning to the requested page", async () => {
    const response = await GET(request("valid-code", "/sites?status=verified"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid-code");
    expect(response.headers.get("location")).toBe(
      `${origin}/sites?status=verified`,
    );
  });
  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/\n/attacker.example",
  ])("keeps the signed-in session on the app for target %s", async (next) => {
    const response = await GET(request("valid-code", next));
    expect(response.headers.get("location")).toBe(`${origin}${safeNext(null)}`);
  });
  it.each(["expired", "network", "missing"])(
    "returns a recoverable login page for a %s code",
    async (failure) => {
      if (failure === "network")
        exchangeCodeForSession.mockRejectedValue(new Error("Network error"));
      if (failure === "expired")
        exchangeCodeForSession.mockResolvedValue({
          error: { message: "Expired code" },
        });
      const response = await GET(
        request(failure === "missing" ? null : "private-code", "/sites"),
      );
      const destination = new URL(response.headers.get("location")!);
      expect(destination.origin).toBe(origin);
      expect(destination.pathname).toBe("/login");
      expect(destination.searchParams.get("error")).toBe("auth_callback");
      expect(destination.searchParams.get("next")).toBe("/sites");
      expect(destination.searchParams.has("code")).toBe(false);
      if (failure === "missing")
        expect(exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );
});
