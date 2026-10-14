"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    // Send recovery emails through the server-side OTP confirmation route.
    // This avoids tying the link to the browser that initiated the PKCE flow.
    const confirmationPage = new URL("/auth/confirm", window.location.origin);
    const { error: recoveryError } = await createClient().auth.resetPasswordForEmail(
      email,
      { redirectTo: confirmationPage.toString() },
    );
    setBusy(false);
    if (recoveryError) {
      setError(recoveryError.message);
      return;
    }
    setSent(true);
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
          <span className="eyebrow">Account recovery</span>
          <h1>Reset your password</h1>
          <p>We’ll send a secure recovery link to your invited account.</p>
        </div>
        {sent ? (
          <div className="auth-success" role="status">
            <b>Check your email</b>
            <span>If an invited account exists for that address, a recovery link has been sent.</span>
          </div>
        ) : (
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
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="button primary full" disabled={busy}>
              {busy ? "Sending…" : "Send recovery link"}
            </button>
          </form>
        )}
        <Link className="auth-link" href="/login">Back to sign in</Link>
        <small>Invite-only · No public registration</small>
      </section>
    </main>
  );
}
