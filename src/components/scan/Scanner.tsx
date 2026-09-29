"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { BrandDetection, BrandMatch } from "@/lib/types";
import { apiFetch, messageFor } from "../api";
import { Alert, Spinner } from "../Alert";
import { BrandMatchSection } from "../MatchResults";
import { AddToMyItems } from "../myitems/AddToMyItems";
import { IconBank, IconCamera, IconPencil, IconSparkle } from "../icons";
import { brandKey, groupDetections } from "./detections";
import { DetectionChips } from "./DetectionChips";
import { TextDescribe } from "./TextDescribe";
import { PhotoScan } from "./PhotoScan";
import { BankScan } from "./BankScan";

type MatchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; matches: BrandMatch[] };

type Tab = "text" | "photo" | "bank";

const TABS: { id: Tab; label: string; icon: React.ReactNode; tint: string }[] = [
  { id: "text", label: "Describe", icon: <IconPencil size={18} />, tint: "from-violet-500 to-fuchsia-500" },
  { id: "photo", label: "Photo", icon: <IconCamera size={18} />, tint: "from-pink-500 to-orange-400" },
  { id: "bank", label: "Bank", icon: <IconBank size={18} />, tint: "from-cyan-500 to-indigo-500" },
];

/** The "What do you own?" panel: collect → confirm chips → match. */
export function Scanner({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const H = `h${headingLevel}` as "h1" | "h2";
  const [tab, setTab] = useState<Tab>("text");
  const [detections, setDetections] = useState<BrandDetection[]>([]);
  const [match, setMatch] = useState<MatchState>({ kind: "idle" });
  const resultsRef = useRef<HTMLHeadingElement>(null);

  const groups = useMemo(() => groupDetections(detections), [detections]);
  const usedBank = detections.some((d) => d.source === "bank");

  const addDetections = useCallback((d: BrandDetection[]) => {
    if (!d.length) return;
    setDetections((prev) => [...prev, ...d]);
    setMatch({ kind: "idle" });
  }, []);

  function removeGroup(key: string) {
    setDetections((prev) => prev.filter((d) => brandKey(d.brand) !== key));
    setMatch({ kind: "idle" });
  }

  function addManual(brand: string) {
    addDetections([{ brand, confidence: 1, source: "manual" }]);
  }

  async function findMatches() {
    setMatch({ kind: "loading" });
    try {
      const { matches } = await apiFetch<{ matches: BrandMatch[] }>("/api/match", {
        json: { detections },
      });
      setMatch({ kind: "done", matches });
    } catch (err) {
      setMatch({ kind: "error", message: messageFor(err, "Matching") });
    }
  }

  useEffect(() => {
    if (match.kind === "done") resultsRef.current?.focus();
  }, [match.kind]);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length] : e.key === "ArrowLeft" ? TABS[(i + TABS.length - 1) % TABS.length] : null;
    if (next) {
      e.preventDefault();
      setTab(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  }

  const withCases = match.kind === "done" ? match.matches.filter((m) => m.cases.length > 0) : [];
  const matchedKeys = new Set(withCases.flatMap((m) => m.detections.map((d) => brandKey(d.brand))));
  const unmatched = groups.filter((g) => !matchedKeys.has(g.key));

  return (
    <section aria-labelledby="own-heading" className="card-glass relative overflow-hidden p-5 sm:p-8">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 animate-gradient-pan bg-brand-gradient [background-size:200%_auto]" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <IconSparkle size={14} /> Step 1 · Tell us what you own
          </p>
          <H id="own-heading" className="text-2xl font-bold sm:text-3xl">
            What do you own?
          </H>
          <p className="mt-1 max-w-xl text-muted">
            Pick a way below. You&apos;ll confirm the brands before we search. No account needed —
            or keep a running list in{" "}
            <Link href="/my-items" className="link">My Items</Link>.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Ways to tell us what you own"
        onKeyDown={onTabKey}
        className="mt-6 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface-muted/70 p-1"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`relative flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors ${
                active ? "text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="scanner-tab"
                  className={`absolute inset-0 rounded-xl bg-gradient-to-r ${t.tint} shadow-soft`}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {t.icon}
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panels stay mounted (hidden) so a photo preview or typed text survives tab switches. */}
      <div className="mt-6">
        {TABS.map((t) => (
          <div
            key={t.id}
            id={`panel-${t.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${t.id}`}
            hidden={t.id !== tab}
            className="animate-fade-up"
          >
            {t.id === "text" && <TextDescribe onDetections={addDetections} />}
            {t.id === "photo" && <PhotoScan onDetections={addDetections} />}
            {t.id === "bank" && <BankScan onDetections={addDetections} />}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {detections.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-8 space-y-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-violet-500/[0.07] via-pink-500/[0.05] to-orange-400/[0.07] p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 2</p>
                <h3 className="text-lg font-bold">Confirm your brands</h3>
                <p className="text-sm text-muted">
                  Remove anything that&apos;s wrong, add anything we missed, then search.
                </p>
              </div>
              <DetectionChips groups={groups} onRemove={removeGroup} onAdd={addManual} />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={findMatches}
                  disabled={!groups.length || match.kind === "loading"}
                >
                  <IconSparkle size={16} />
                  Find lawsuits for {groups.length} brand{groups.length === 1 ? "" : "s"}
                </button>
                <AddToMyItems items={groups.map((g) => ({ label: g.label }))} label="Save all to My Items" />
                {match.kind === "loading" && <Spinner label="Matching against every lawsuit…" />}
              </div>
              {match.kind === "error" && <Alert>{match.message}</Alert>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {match.kind === "loading" && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      )}

      {match.kind === "done" && (
        <motion.div
          className="mt-10 space-y-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 3 · Results</p>
            <h3 ref={resultsRef} tabIndex={-1} className="text-2xl font-bold">
              {withCases.length ? (
                <>
                  <span className="text-gradient">{withCases.length}</span> of your brands appear in
                  lawsuits
                </>
              ) : (
                "No lawsuits found for these brands yet"
              )}
            </h3>
          </div>
          {usedBank && (
            <Alert tone="info">
              Bank results are based on merchants, not individual products. A charge at Amazon or
              Walmart can&apos;t tell us which products you bought — add those brands by typing or
              with a photo.
            </Alert>
          )}
          {withCases.map((m, i) => (
            <motion.div
              key={m.brand.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.45 }}
            >
              <BrandMatchSection match={m} actions={<AddToMyItems items={[{ label: m.brand.name }]} />} />
            </motion.div>
          ))}
          {unmatched.length > 0 && (
            <p className="text-sm text-muted">
              No lawsuits found yet for: {unmatched.map((g) => g.label).join(", ")}. Save them to{" "}
              <Link href="/my-items" className="link">My Items</Link> to check again later.
            </p>
          )}
          <p className="text-sm text-muted">
            A match means a lawsuit names this brand — not that you qualify. Read each case&apos;s
            &ldquo;who qualifies&rdquo; section.
          </p>
        </motion.div>
      )}
    </section>
  );
}
