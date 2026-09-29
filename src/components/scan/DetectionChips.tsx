"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DetectionSource } from "@/lib/types";
import type { DetectionGroup } from "./detections";
import { SOURCE_LABEL } from "./detections";
import { IconX } from "../icons";

const SOURCE_TINT: Record<DetectionSource, string> = {
  text: "bg-surface border-border",
  photo: "bg-surface border-border",
  bank: "bg-surface border-border",
  receipt: "bg-surface border-border",
  manual: "bg-surface border-border",
};

export function DetectionChips({
  groups,
  onRemove,
  onAdd,
}: {
  groups: DetectionGroup[];
  onRemove: (key: string) => void;
  onAdd: (brand: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <p className="text-sm text-muted">No brands yet. Add one below.</p>
      ) : (
        <motion.ul layout className="flex flex-wrap gap-2" aria-label="Detected brands">
          <AnimatePresence mode="popLayout" initial={false}>
            {groups.map((g) => {
              const unsure = g.confidence < 0.6;
              return (
                <motion.li
                  key={g.key}
                  layout
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`inline-flex items-center gap-1 rounded-full border-2 py-1 pl-3.5 pr-1 text-sm ${
                    unsure ? "border-dashed border-border bg-warn-bg" : SOURCE_TINT[g.sources[0]]
                  }`}
                >
                  <span>
                    <span className="font-semibold">{g.label}</span>
                    <span className="ml-1.5 text-xs text-muted">
                      {g.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}
                      {unsure && " · not sure"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(g.key)}
                    aria-label={`Remove ${g.label}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                  >
                    <IconX size={14} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="add-brand" className="sr-only">Add a brand we missed</label>
        <input
          id="add-brand"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a brand we missed"
          className="input"
          maxLength={80}
        />
        <button type="submit" className="btn-secondary shrink-0" disabled={!draft.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}
