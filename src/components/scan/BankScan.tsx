"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import Link from "next/link";
import type { BrandDetection } from "@/lib/types";
import { apiFetch, messageFor } from "../api";
import { Alert, Spinner } from "../Alert";

type Phase = "idle" | "explain" | "token" | "linking" | "scanning";

export function BankScan({ onDetections }: { onDetections: (d: BrandDetection[]) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function start() {
    setError(null);
    setNote(null);
    setPhase("token");
    try {
      const { linkToken } = await apiFetch<{ linkToken: string }>("/api/plaid/link-token", { method: "POST" });
      setToken(linkToken);
      setPhase("linking");
    } catch (err) {
      setError(messageFor(err, "Bank scanning"));
      setPhase("explain");
    }
  }

  const onSuccess = useCallback(
    async (publicToken: string | null) => {
      setToken(null);
      if (!publicToken) {
        setPhase("explain");
        setError("The bank connection didn't complete. Please try again.");
        return;
      }
      setPhase("scanning");
      try {
        const { detections } = await apiFetch<{ detections: BrandDetection[] }>("/api/plaid/scan", {
          json: { publicToken },
        });
        setNote(
          detections.length
            ? `Found ${detections.length} merchant brand${detections.length === 1 ? "" : "s"}. Your bank connection has been removed.`
            : "We didn't find recognizable merchant brands. Your bank connection has been removed.",
        );
        onDetections(detections);
        setPhase("idle");
      } catch (err) {
        setError(messageFor(err, "Bank scanning"));
        setPhase("explain");
      }
    },
    [onDetections],
  );

  const onExit = useCallback(() => {
    setToken(null);
    setPhase((p) => (p === "linking" ? "explain" : p));
  }, []);

  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Optional: scan your bank transactions</h3>
      {phase === "idle" && (
        <button type="button" className="btn-secondary" onClick={() => setPhase("explain")}>
          Scan my bank transactions
        </button>
      )}
      {phase !== "idle" && (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4 text-sm">
          <p className="font-semibold">Before you connect</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>We use Plaid for a <strong>read-only</strong> look at recent transactions. We can&apos;t move money.</li>
            <li>We never see or store your bank username or password — you sign in on Plaid&apos;s screen.</li>
            <li>Transactions are processed in memory and never stored. The bank connection is removed as soon as the scan finishes.</li>
            <li>Only the list of matched brand names comes back to your browser.</li>
            <li>
              Bank data shows <strong>merchants, not individual products</strong> — e.g. &ldquo;Amazon&rdquo; or
              &ldquo;Walmart&rdquo;, not what you bought there. It works best for subscriptions, phone and internet
              providers, banks, airlines, and brands you buy from directly.
            </li>
          </ul>
          <p>
            <Link href="/privacy" className="link">Read the full privacy page</Link>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={start}
              disabled={phase !== "explain"}
            >
              Continue to Plaid
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPhase("idle");
                setError(null);
              }}
              disabled={phase === "scanning"}
            >
              Cancel
            </button>
            {phase === "token" && <Spinner label="Preparing secure connection…" />}
            {phase === "linking" && <Spinner label="Waiting for Plaid…" />}
            {phase === "scanning" && <Spinner label="Scanning transactions…" />}
          </div>
        </div>
      )}
      {token && <PlaidOpener token={token} onSuccess={onSuccess} onExit={onExit} />}
      {error && <Alert>{error}</Alert>}
      {note && <Alert tone="success">{note}</Alert>}
    </div>
  );
}

/** Mounted only once a link token exists; opens Plaid Link as soon as it's ready. */
function PlaidOpener({
  token,
  onSuccess,
  onExit,
}: {
  token: string;
  onSuccess: (publicToken: string | null) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });
  useEffect(() => {
    if (ready) open();
  }, [ready, open]);
  return null;
}
