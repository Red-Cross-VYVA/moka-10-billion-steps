"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/supabase/config";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") === "invite" && hash.get("access_token")) {
      window.location.replace(`/set-password${window.location.hash}`);
    }
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }
    router.replace(getSafeNextPath(params.get("next")));
    router.refresh();
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
          <p>Use an account invited by an operations administrator.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
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
