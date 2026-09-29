"use client";

import { useState } from "react";
import { apiFetch, messageFor } from "../api";
import { Alert, Spinner } from "../Alert";

export function FollowBrand({ brands }: { brands: string[] }) {
  const [email, setEmail] = useState("");
  const [brand, setBrand] = useState(brands[0] ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  if (!brands.length) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      await apiFetch<{ ok: boolean }>("/api/watchlist", { json: { email: email.trim(), brand } });
      setState("done");
    } catch (err) {
      setError(messageFor(err, "Brand alerts"));
      setState("error");
    }
  }

  return (
    <section aria-labelledby="follow-heading" className="space-y-3">
      <h2 id="follow-heading" className="text-xl font-bold">Follow this brand</h2>
      <p className="text-sm text-muted">
        Get an email when a new lawsuit names this brand or a claim form opens. Unsubscribe anytime.
      </p>
      {state === "done" ? (
        <Alert tone="success">You&apos;re following {brand}. We&apos;ll email {email} about new developments.</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {brands.length > 1 && (
            <div>
              <label htmlFor="follow-brand" className="mb-1 block text-sm font-medium">Brand</label>
              <select id="follow-brand" className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="follow-email" className="mb-1 block text-sm font-medium">Email</label>
            <div className="flex gap-2">
              <input
                id="follow-email"
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button type="submit" className="btn-primary shrink-0" disabled={state === "busy"}>
                {brands.length > 1 ? "Follow" : `Follow ${brand}`}
              </button>
            </div>
          </div>
          {state === "busy" && <Spinner label="Saving…" />}
          {state === "error" && <Alert>{error}</Alert>}
        </form>
      )}
    </section>
  );
}
