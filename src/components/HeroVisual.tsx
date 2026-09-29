"use client";

import { motion, useReducedMotion } from "motion/react";
import { IconCamera, IconCheck, IconSparkle } from "./icons";

// Generic product categories only — the hero is decorative and must not imply that any
// real brand is being sued.
const ITEMS = [
  { label: "Soda", x: "4%", y: "12%", tint: "from-rose-500 to-orange-400", d: 0 },
  { label: "Toothpaste", x: "56%", y: "4%", tint: "from-cyan-500 to-indigo-500", d: 0.6 },
  { label: "Vitamins", x: "66%", y: "60%", tint: "from-emerald-400 to-teal-500", d: 1.2 },
  { label: "Face cream", x: "0%", y: "66%", tint: "from-fuchsia-500 to-violet-500", d: 1.8 },
  { label: "Phone plan", x: "36%", y: "86%", tint: "from-amber-400 to-pink-500", d: 2.4 },
];

export function HeroVisual() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-md select-none">
      {/* Glow */}
      <div className="absolute inset-[12%] animate-aurora rounded-full bg-brand-gradient opacity-30 blur-3xl" />

      {/* Rotating dashed orbit */}
      <motion.div
        className="absolute inset-[8%] rounded-full border-2 border-dashed border-primary/25"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-[22%] rounded-full border border-g2/20" />

      {/* Center scanner card */}
      <motion.div
        className="card-glass absolute inset-[27%] flex flex-col items-center justify-center gap-2 overflow-hidden p-4 text-center"
        initial={reduce ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-lift">
          <IconCamera size={28} />
        </span>
        <span className="font-display text-sm font-bold">Scanning…</span>
        <span className="text-[11px] text-muted">5 products found</span>
        <div className="absolute inset-x-0 h-0.5 animate-scan-line bg-gradient-to-r from-transparent via-g2 to-transparent shadow-[0_0_18px_4px_rgba(236,72,153,0.5)]" />
      </motion.div>

      {/* Floating product chips */}
      {ITEMS.map((it) => (
        <motion.div
          key={it.label}
          className="absolute"
          style={{ left: it.x, top: it.y }}
          initial={reduce ? false : { opacity: 0, scale: 0.6, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.4 + it.d * 0.25, type: "spring", stiffness: 260, damping: 18 }}
        >
          <div className="animate-float" style={{ animationDelay: `${-it.d}s` }}>
            <div className="glass flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border py-1 pl-1 pr-3 text-xs font-semibold shadow-soft sm:gap-2 sm:py-1.5 sm:pl-1.5 sm:pr-3.5 sm:text-sm">
              <span className={`grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br ${it.tint} text-white`}>
                <IconCheck size={14} />
              </span>
              {it.label}
            </div>
          </div>
        </motion.div>
      ))}

      {/* Match toast */}
      <motion.div
        className="absolute bottom-[26%] right-0 sm:right-[-6%]"
        initial={reduce ? false : { opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.6, duration: 0.6 }}
      >
        <div className="flex items-center gap-2 rounded-2xl bg-foreground px-3.5 py-2.5 text-xs font-semibold text-background shadow-lift">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-emerald-400" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <IconSparkle size={14} /> 2 lawsuits match
        </div>
      </motion.div>
    </div>
  );
}
