"use client";

import { MotionConfig, motion } from "motion/react";

// Generic product categories only. The hero is decorative and must not imply
// that any real brand is being sued.
const BACK_LABELS = [
  {
    name: "Phone plan",
    detail: "Unlimited, monthly",
    rotate: 6,
    x: "38%",
    y: "2%",
    tone: "bg-sticker text-[#17175c]",
  },
  {
    name: "Vitamins",
    detail: "90 gummies",
    rotate: -8,
    x: "0%",
    y: "16%",
    tone: "bg-mint text-[#062b1a]",
  },
];

// Bar widths for a fake barcode, in px.
const BARS = [
  3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3,
];

export function HeroVisual() {
  // reducedMotion="user" skips the slam and shake for people who ask for less motion,
  // without branching the server-rendered markup (which would break hydration).
  return (
    <MotionConfig reducedMotion="user">
      <div
        aria-hidden
        className="relative mx-auto aspect-[5/4] w-full max-w-md select-none"
      >
        {BACK_LABELS.map((l) => (
          <div
            key={l.name}
            className={`absolute w-[62%] rounded-2xl border-2 border-[#17175c] p-5 ${l.tone}`}
            style={{ left: l.x, top: l.y, transform: `rotate(${l.rotate}deg)` }}
          >
            <p className="font-display text-2xl leading-none">{l.name}</p>
            <p className="mt-1 text-sm font-semibold opacity-80">{l.detail}</p>
          </div>
        ))}

        {/* Front label: the product that gets stamped. */}
        <motion.div
          className="absolute bottom-0 left-[10%] w-[82%] rounded-2xl border-2 border-[#17175c] bg-white p-6 text-[#17175c] shadow-[6px_6px_0_#17175c]"
          style={{ rotate: -2 }}
          initial={false}
          animate={{ x: [0, 0, -3, 3, -1, 0] }}
          transition={{
            duration: 0.35,
            delay: 0.75,
            times: [0, 0.01, 0.3, 0.6, 0.85, 1],
          }}
        >
          <p className="text-sm font-bold">Net wt 6 oz (170 g)</p>
          <p className="mt-2 font-display text-[2rem] leading-none sm:text-[2.6rem]">
            Toothpaste
          </p>
          <p className="mt-2 text-sm font-semibold text-[#4c4f86]">
            Whitening, fresh mint
          </p>
          <div className="mt-6 flex h-12 items-stretch gap-[3px]">
            {BARS.map((w, i) => (
              <span key={i} className="bg-[#17175c]" style={{ width: w * 2 }} />
            ))}
          </div>

          <motion.span
            className="stamp absolute bottom-[10%] right-[6%] text-5xl sm:text-6xl"
            initial={{ opacity: 0, scale: 2.6, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: -12 }}
            transition={{
              delay: 0.6,
              type: "spring",
              stiffness: 520,
              damping: 22,
              mass: 0.9,
            }}
          >
            sued
          </motion.span>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
