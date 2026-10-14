"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/supabase/config";
import { requestMagicLink } from "@/lib/supabase/magic-link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<"password" | "magic-link">("password");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const linkError = params.has("error")
    ? "This sign-in link is invalid or has expired. Request a new link below."
    : "";
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") === "invite" && hash.get("access_token")) {
      window.location.replace(`/set-password${window.location.hash}`);
    }
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (method === "magic-link" && cooldown > 0)) return;
    setBusy(true);
    setError("");
    setSent(false);
    try {
      const auth = createClient().auth;
      if (method === "magic-link") {
        const { error: authError } = await requestMagicLink(
          auth,
          email,
          window.location.origin,
          params.get("next"),
        );
        if (
          authError &&
          !["otp_disabled", "user_not_found"].includes(authError.code ?? "")
        ) {
          setError(authError.message);
        } else {
          setSent(true);
          setCooldown(60);
        }
        return;
      }
      const { error: authError } = await auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.replace(safeNext(params.get("next")));
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <section>
        <div className="brand">
          <span>DMC</span>
          <b>10 Billion Steps</b>
          <small>Driver field app</small>
        </div>
        <div>
          <p className="kicker">Sites Activation</p>
          <h1>Welcome back</h1>
          <p>
            {method === "magic-link"
              ? "Enter your invited email address to sign in without a password."
              : "Sign in with the email invitation sent by operations."}
          </p>
        </div>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {method === "password" && (
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {sent && (
            <div className="login-success" role="status">
              <b>Check your email</b>
              <span>
                If this address belongs to an invited account, a sign-in link
                has been sent. Open it in this browser to finish signing in.
              </span>
            </div>
          )}
          {error || (!sent && linkError) ? (
            <p className="error" role="alert">
              {error || linkError}
            </p>
          ) : null}
          <button disabled={busy || (method === "magic-link" && cooldown > 0)}>
            {method === "password"
              ? busy
                ? "Signing in…"
                : "Sign in"
              : busy
                ? "Sending link…"
                : cooldown > 0
                  ? `Send again in ${cooldown}s`
                  : "Send sign-in link"}
          </button>
          <button
            className="login-alternative"
            type="button"
            disabled={busy}
            onClick={() => {
              setMethod(method === "password" ? "magic-link" : "password");
              setError("");
              setSent(false);
            }}
          >
            {method === "password"
              ? "Email me a sign-in link"
              : "Use a password instead"}
          </button>
        </form>
        <small>Invite-only demo · No public registration</small>
      </section>
    </main>
  );
}
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}
