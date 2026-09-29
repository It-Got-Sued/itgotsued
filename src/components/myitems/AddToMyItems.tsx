"use client";

import { useState } from "react";
import Link from "next/link";
import { addToStoredItems } from "./storage";

/** Button that saves brands to the on-device My Items list. */
export function AddToMyItems({
  items,
  label = "Add to My Items",
  className = "btn-secondary",
}: {
  items: { label: string; brand?: string }[];
  label?: string;
  className?: string;
}) {
  const [msg, setMsg] = useState<React.ReactNode>(null);

  function add() {
    const n = addToStoredItems(items);
    if (n === null) setMsg("Couldn't save — your browser is blocking local storage.");
    else
      setMsg(
        <>
          {n === 0 ? "Already in" : `Added ${n} to`}{" "}
          <Link href="/my-items" className="link">My Items</Link>
        </>,
      );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={className} onClick={add} disabled={!items.length}>
        {label}
      </button>
      <span role="status" className="text-sm text-muted">{msg}</span>
    </span>
  );
}
