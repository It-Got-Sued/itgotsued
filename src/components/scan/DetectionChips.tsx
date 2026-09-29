"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { DetectionSource } from "@/lib/types";
import type { DetectionGroup } from "./detections";
import { SOURCE_LABEL } from "./detections";
import { IconX } from "../icons";

const SOURCE_TINT: Record<DetectionSource, string> = {
  text: "from-violet-500/15 to-fuchsia-500/15 border-violet-500/30",
  photo: "from-pink-500/15 to-orange-400/15 border-pink-500/30",
  bank: "from-cyan-500/15 to-indigo-500/15 border-cyan-500/30",
  receipt: "from-amber-400/15 to-orange-500/15 border-amber-500/30",
  manual: "from-emerald-400/15 to-teal-500/15 border-emerald-500/30",
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
                  className={`inline-flex items-center gap-1 rounded-full border bg-gradient-to-r py-1 pl-3.5 pr-1 text-sm ${
                    unsure ? "border-dashed border-warn-solid/60 from-amber-300/20 to-amber-300/10" : SOURCE_TINT[g.sources[0]]
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
