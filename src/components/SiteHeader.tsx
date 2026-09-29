"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu, IconX } from "./icons";

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
    <Link
      href="/"
      className="group inline-flex items-baseline gap-1.5 font-display text-xl leading-none"
      aria-label="It Got Sued home"
    >
      <span>it got</span>
      <span className="stamp text-[1.05em] transition-transform duration-200 group-hover:rotate-[-10deg]">
        sued
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
        scrolled ? "border-b-2 border-border bg-background" : "border-b-2 border-transparent bg-background"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1 text-[0.95rem]">
            {NAV.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href} className="relative">
                  {active && (
                    <motion.span
                      layoutId="nav-mark"
                      aria-hidden
                      className="absolute inset-x-2 bottom-1 h-2.5 -rotate-1 rounded-sm bg-sticker"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative z-10 block px-3 py-2 font-semibold transition-colors ${
                      active ? "text-foreground" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Link href="/scan" className="btn-primary hidden min-h-11 px-5 text-[0.95rem] md:inline-flex">
          Check my stuff
        </Link>

        <button
          type="button"
          className="btn-secondary min-h-11 px-3 md:hidden"
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
            className="overflow-hidden border-t-2 border-border bg-background md:hidden"
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
                    className={`block rounded-xl px-4 py-3 font-semibold ${
                      isActive(pathname, n.href)
                        ? "bg-sticker text-[#17175c]"
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
