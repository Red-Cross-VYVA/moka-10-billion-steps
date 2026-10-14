"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/supabase/config";
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
      router.replace(getSafeNextPath(params.get("next")));
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span>DMC</span>
          <b>10 Billion Steps</b>
          <small>Operations control</small>
        </div>
        <div>
          <span className="eyebrow">Secure access</span>
          <h1>Sign in</h1>
          <p>
            {method === "magic-link"
              ? "Enter your invited email address to sign in without a password."
              : "Use an account invited by an operations administrator."}
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
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {method === "password" && (
            <>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                  disabled={busy}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <Link
                className="auth-link auth-link-right"
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            </>
          )}
          {sent && (
            <div className="auth-success" role="status">
              <b>Check your email</b>
              <span>
                If this address belongs to an invited account, a sign-in link
                has been sent. Open it in this browser to finish signing in.
              </span>
            </div>
          )}
          {error || (!sent && linkError) ? (
            <p className="auth-error" role="alert">
              {error || linkError}
            </p>
          ) : null}
          <button
            className="button primary full"
            disabled={busy || (method === "magic-link" && cooldown > 0)}
          >
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
            className="button secondary full"
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
        <small>Invite-only · Supabase Auth · No public registration</small>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-page" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}
