"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { OwnedItem } from "@/lib/types";

const AVATAR_TINTS = [
  "from-violet-500 to-fuchsia-500",
  "from-pink-500 to-orange-400",
  "from-cyan-500 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-pink-500",
];

export function ItemRow({
  item,
  onSave,
  onRemove,
}: {
  item: OwnedItem;
  onSave: (label: string, brand: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [brand, setBrand] = useState(item.brand ?? "");

  if (editing) {
    return (
      <li className="card space-y-2 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            onSave(label, brand);
            setEditing(false);
          }}
          className="space-y-2"
        >
          <div>
            <label htmlFor={`label-${item.id}`} className="block text-sm font-medium">Item</label>
            <input id={`label-${item.id}`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} required />
          </div>
          <div>
            <label htmlFor={`brand-${item.id}`} className="block text-sm font-medium">
              Brand <span className="font-normal text-muted">(optional, if different)</span>
            </label>
            <input id={`brand-${item.id}`} className="input" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} placeholder="e.g. Crest" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Save</button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setLabel(item.label);
                setBrand(item.brand ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  const hue = [...item.label].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % AVATAR_TINTS.length, 0);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -16, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="card flex items-center justify-between gap-3 p-3 transition-shadow hover:shadow-lift"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${AVATAR_TINTS[hue]} font-display text-lg font-bold text-white shadow-soft`}
        >
          {item.label.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 break-words">
          <span className="font-semibold">{item.label}</span>
          {item.brand && <span className="ml-1 text-sm text-muted">({item.brand})</span>}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        <button type="button" className="btn-secondary px-3" onClick={() => setEditing(true)} aria-label={`Edit ${item.label}`}>
          Edit
        </button>
        <button type="button" className="btn-secondary px-3" onClick={onRemove} aria-label={`Remove ${item.label}`}>
          Remove
        </button>
      </span>
    </motion.li>
  );
}
