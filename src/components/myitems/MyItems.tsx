"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BrandMatch, CaseSummary, MatchRequest, OwnedItem } from "@/lib/types";
import { apiFetch, messageFor } from "../api";
import { Alert, Spinner } from "../Alert";
import { CaseCard } from "../CaseCard";
import { sortClaimsOpenFirst } from "../MatchResults";
import { ItemRow } from "./ItemRow";
import { AnimatePresence, motion } from "motion/react";
import {
  getItemsServerSnapshot,
  getItemsSnapshot,
  mergeItems,
  setItems,
  splitList,
  subscribeItems,
} from "./storage";

type CheckState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; matches: BrandMatch[]; checked: string[] };

const key = (s: string) => s.trim().toLowerCase();

export function MyItems() {
  const items = useSyncExternalStore(subscribeItems, getItemsSnapshot, getItemsServerSnapshot);
  const [draft, setDraft] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const autoRan = useRef(false);

  const update = useCallback((next: OwnedItem[]) => {
    setStorageWarning(!setItems(next));
  }, []);

  function addLabels(labels: string[]) {
    if (!items) return;
    const { items: next } = mergeItems(items, labels.map((label) => ({ label })));
    update(next);
  }

  const runCheck = useCallback(async (list: OwnedItem[]) => {
    if (!list.length) return;
    setCheck({ kind: "loading" });
    try {
      const body: MatchRequest = {
        detections: list.map((i) => ({
          brand: i.brand ?? i.label,
          product: i.label,
          confidence: 1,
          source: "manual",
        })),
        activeOnly: true,
      };
      const { matches } = await apiFetch<{ matches: BrandMatch[] }>("/api/match", { json: body });
      setCheck({ kind: "done", matches, checked: list.map((i) => i.id) });
    } catch (err) {
      setCheck({ kind: "error", message: messageFor(err, "Matching") });
    }
  }, []);

  // Check automatically once, when the stored list loads non-empty.
  useEffect(() => {
    if (!items || autoRan.current) return;
    const t = setTimeout(() => {
      autoRan.current = true;
      if (items.length) void runCheck(items);
    }, 0);
    return () => clearTimeout(t);
  }, [items, runCheck]);

  if (items === null) return <Spinner label="Loading your list…" />;

  const stale =
    check.kind === "done" &&
    (check.checked.length !== items.length || items.some((i, n) => check.checked[n] !== i.id));

  return (
    <div className="space-y-8">
      <section aria-labelledby="list-heading" className="card-glass relative space-y-4 overflow-hidden p-5 sm:p-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1 animate-gradient-pan bg-gradient-to-r from-emerald-400 via-cyan-500 to-violet-500 [background-size:200%_auto]" />
        <h2 id="list-heading" className="text-2xl font-bold">
          Your items{" "}
          {items.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2.5 py-0.5 align-middle text-sm font-semibold text-primary">
              {items.length}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted">
          This list is saved only in this browser on this device. It is never sent to our servers
          except the item names, at the moment you check them, and we don&apos;t keep them.
        </p>
        {storageWarning && (
          <Alert tone="warn">
            Your browser is blocking local storage, so this list will be lost when you leave the page.
          </Alert>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            addLabels([draft]);
            setDraft("");
          }}
          className="flex gap-2"
        >
          <label htmlFor="new-item" className="sr-only">Add an item you own</label>
          <input
            id="new-item"
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Crest toothpaste, Peloton bike, Verizon"
            maxLength={120}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={!draft.trim()}>Add</button>
        </form>

        <div>
          <button
            type="button"
            className="link text-sm"
            aria-expanded={showPaste}
            aria-controls="paste-panel"
            onClick={() => setShowPaste((v) => !v)}
          >
            {showPaste ? "Hide paste box" : "Paste a list instead"}
          </button>
          {showPaste && (
            <form
              id="paste-panel"
              className="mt-2 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                const labels = splitList(paste);
                if (!labels.length) return;
                addLabels(labels);
                setPaste("");
                setShowPaste(false);
              }}
            >
              <label htmlFor="paste-items" className="block text-sm font-medium">
                One item per line, or separated by commas
              </label>
              <textarea id="paste-items" rows={5} className="input resize-y" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <button type="submit" className="btn-secondary" disabled={!paste.trim()}>Add all</button>
            </form>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-border p-6 text-center text-sm text-muted">
            Your list is empty. Add the products, apps, and services you use — we&apos;ll check them
            against active lawsuits.
          </p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onRemove={() => update(items.filter((i) => i.id !== item.id))}
                onSave={(label, brand) =>
                  update(
                    items.map((i) => {
                      if (i.id !== item.id) return i;
                      const b = brand.trim();
                      const next: OwnedItem = { ...i, label: label.trim() };
                      if (b && key(b) !== key(label)) next.brand = b;
                      else delete next.brand;
                      return next;
                    }),
                  )
                }
              />
            ))}
            </AnimatePresence>
          </ul>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={() => runCheck(items)} disabled={check.kind === "loading"}>
              Check my items
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (window.confirm("Remove every item from this list?")) {
                  update([]);
                  setCheck({ kind: "idle" });
                }
              }}
            >
              Clear list
            </button>
            {check.kind === "loading" && <Spinner label="Checking active lawsuits…" />}
          </div>
        )}
      </section>

      {check.kind === "error" && <Alert>{check.message}</Alert>}
      {check.kind === "done" && <ItemResults items={items} matches={check.matches} stale={stale} />}
    </div>
  );
}

function ItemResults({ items, matches, stale }: { items: OwnedItem[]; matches: BrandMatch[]; stale: boolean }) {
  const rows = items.map((item) => {
    const itemKeys = new Set([key(item.label), key(item.brand ?? item.label)]);
    const hits = matches.filter((m) =>
      m.detections.some((d) => itemKeys.has(key(d.product ?? "")) || itemKeys.has(key(d.brand))),
    );
    const seen = new Set<string>();
    const cases: CaseSummary[] = [];
    for (const m of hits) for (const c of m.cases) if (!seen.has(c.id) && seen.add(c.id)) cases.push(c);
    return { item, brands: hits.map((m) => m.brand.name), cases: sortClaimsOpenFirst(cases) };
  });
  const found = rows.filter((r) => r.cases.length);
  const none = rows.filter((r) => !r.cases.length);

  return (
    <section aria-labelledby="results-heading" className="space-y-6" aria-live="polite">
      <h2 id="results-heading" className="text-xl font-bold">
        {found.length ? `${found.length} of your items are named in active lawsuits` : "No active lawsuits found for your items yet"}
      </h2>
      {stale && <Alert tone="info">Your list changed since this check. Press &ldquo;Check my items&rdquo; to refresh.</Alert>}
      {found.map(({ item, brands, cases }, i) => (
        <motion.section
          key={item.id}
          aria-labelledby={`r-${item.id}`}
          className="space-y-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 * i, duration: 0.45 }}
        >
          <h3 id={`r-${item.id}`} className="text-lg font-semibold">
            {item.label}
            {brands.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted">matched {brands.join(", ")}</span>
            )}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {cases.map((c) => (
              <li key={c.id}>
                <CaseCard c={c} headingLevel={4} />
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
      {none.length > 0 && (
        <div className="space-y-1">
          <h3 className="font-semibold">No active lawsuits found yet</h3>
          <p className="text-sm text-muted">{none.map((r) => r.item.label).join(", ")}</p>
          <p className="text-sm text-muted">New cases are added daily — check back later.</p>
        </div>
      )}
      <p className="text-sm text-muted">
        A match means a lawsuit names this brand — not that you qualify. Read each case&apos;s
        &ldquo;who qualifies&rdquo; section.
      </p>
    </section>
  );
}
