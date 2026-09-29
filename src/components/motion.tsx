"use client";

import { motion, useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Layout wrapper kept for existing call sites. Scroll-triggered entrances were
 * removed in the It Got Sued redesign: the stamp in the hero is the page's one
 * motion moment, so content just sits on the page.
 */
export function Reveal({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const Comp = as;
  return <Comp className={className}>{children}</Comp>;
}

export function StaggerList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ul className={className}>{children}</ul>;
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={className}>{children}</li>;
}

/** Counts up from 0 to `value` the first time it scrolls into view. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 18 });
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) return;
    if (inView) mv.set(value);
  }, [inView, value, mv, reduce]);

  useEffect(() => spring.on("change", (v) => setShown(Math.round(v))), [spring]);

  return (
    <span ref={ref} className={className}>
      {(reduce ? value : shown).toLocaleString()}
    </span>
  );
}

export { motion, EASE };
