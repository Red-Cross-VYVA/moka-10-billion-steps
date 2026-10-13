"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function establishInviteSession() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError(
          "This invitation link is invalid or has expired. Request a new invitation.",
        );
        return;
      }
      const { error: sessionError } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      window.history.replaceState(null, "", "/set-password");
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      else setReady(true);
    }
    void establishInviteSession();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({
      password,
    });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }
    router.replace("/overview");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span>DMC</span>
          <b>10 Billion Steps</b>
          <small>Operations control</small>
        </div>
        <div>
          <span className="eyebrow">Invitation accepted</span>
          <h1>Create your password</h1>
          <p>Choose a password for your invite-only administrator account.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            Password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={!ready || busy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              disabled={!ready || busy}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          {!ready && !error ? <p>Verifying your invitation…</p> : null}
          <button className="button primary full" disabled={!ready || busy}>
            {busy ? "Saving…" : "Set password and continue"}
          </button>
        </form>
        <small>Your invitation is processed securely by Supabase Auth.</small>
      </section>
    </main>
  );
}
