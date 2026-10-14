import { describe, expect, it, vi } from "vitest";
import { requestMagicLink } from "./magic-link";

describe("invitation-only magic links", () => {
  it("requests sign-in without creating an account and keeps the originating app", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    await requestMagicLink(
      { signInWithOtp },
      " invited@example.com ",
      "https://drivers.example",
      "/reviews?status=pending",
    );
    const request = signInWithOtp.mock.calls[0][0];
    expect(request.email).toBe("invited@example.com");
    expect(request.options.shouldCreateUser).toBe(false);
    const callback = new URL(request.options.emailRedirectTo);
    expect(callback.origin).toBe("https://drivers.example");
    expect(callback.pathname).toBe("/auth/callback");
    expect(callback.searchParams.get("next")).toBe("/reviews?status=pending");
  });
  it("does not put an external return target into an email link", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    await requestMagicLink(
      { signInWithOtp },
      "invited@example.com",
      "https://drivers.example",
      "//attacker.example",
    );
    const callback = new URL(
      signInWithOtp.mock.calls[0][0].options.emailRedirectTo,
    );
    expect(callback.searchParams.get("next")).toBe("/");
  });
});
