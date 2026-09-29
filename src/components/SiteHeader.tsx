"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu, IconScale, IconX } from "./icons";

const NAV = [
  { href: "/cases", label: "All lawsuits" },
  { href: "/scan", label: "Scan" },
  { href: "/my-items", label: "My Items" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about", label: "About" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Logo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label="ClassActionForMe home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-soft transition-transform duration-300 group-hover:rotate-[-8deg] group-hover:scale-105">
        <IconScale size={20} />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        ClassAction<span className="text-gradient">ForMe</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled ? "glass border-b border-border shadow-soft" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1 rounded-full border border-border bg-surface/60 p-1 text-sm">
            {NAV.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href} className="relative">
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-brand-gradient shadow-soft"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative z-10 block rounded-full px-4 py-2 font-medium transition-colors ${
                      active ? "text-white" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Link href="/scan" className="btn-primary hidden md:inline-flex">
          Scan what I own
        </Link>

        <button
          type="button"
          className="btn-secondary px-3 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <IconX /> : <IconMenu />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Main"
            className="glass overflow-hidden border-t border-border md:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <ul className="space-y-1 px-4 py-3">
              {NAV.map((n, i) => (
                <motion.li
                  key={n.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                >
                  <Link
                    href={n.href}
                    aria-current={isActive(pathname, n.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`block rounded-xl px-4 py-3 font-medium ${
                      isActive(pathname, n.href)
                        ? "bg-brand-gradient text-white"
                        : "hover:bg-surface-muted"
                    }`}
                  >
                    {n.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
