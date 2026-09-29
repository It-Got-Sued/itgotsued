"use client";

import { useState } from "react";
import type { BrandDetection } from "@/lib/types";
import { apiFetch, messageFor } from "../api";
import { Alert, Spinner } from "../Alert";

const EXAMPLES = ["Coke", "Crest toothpaste", "iPhone", "Verizon", "Nature Made vitamins"];

export function TextDescribe({ onDetections }: { onDetections: (d: BrandDetection[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { detections } = await apiFetch<{ detections: BrandDetection[] }>("/api/detect/text", {
        json: { description: text.trim() },
      });
      if (!detections.length) setNote("We didn't recognize any brands. Try naming products or companies, e.g. “Crest toothpaste, Verizon phone”.");
      onDetections(detections);
    } catch (err) {
      setError(messageFor(err, "Brand detection from text"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="own-text" className="block font-semibold">
        Describe what you own or use
      </label>
      <p id="own-text-hint" className="text-sm text-muted">
        Products, apps, subscriptions, banks, cars — anything.
      </p>
      <textarea
        id="own-text"
        aria-describedby="own-text-hint"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        placeholder="I use Crest toothpaste, drink Coke, take Nature Made vitamins, and have Verizon…"
        className="input resize-y"
      />
      <div className="flex flex-wrap gap-2" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setText((t) => (t.trim() ? `${t.trim()}, ${ex}` : ex))}
            className="chip text-xs hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary"
          >
            + {ex}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy || !text.trim()}>
          Find brands
        </button>
        <span className="text-xs text-muted">{text.length}/2000</span>
        {busy && <Spinner label="Reading your list…" />}
      </div>
      {error && <Alert>{error}</Alert>}
      {note && <Alert tone="info">{note}</Alert>}
    </form>
  );
}
