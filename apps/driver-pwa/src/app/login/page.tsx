"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/supabase/config";

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
    router.replace(safeNext(params.get("next")));
    router.refresh();
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
          <p>Sign in with the email invitation sent by operations.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
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
