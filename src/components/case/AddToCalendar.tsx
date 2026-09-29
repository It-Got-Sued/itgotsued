"use client";

import { useState } from "react";

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Builds an all-day .ics event on the deadline with reminders a week and a day before. */
export function buildIcs(opts: { caseId: string; caseName: string; deadline: string; claimUrl: string | null; pageUrl: string }): string {
  const start = new Date(`${opts.deadline.slice(0, 10)}T00:00:00Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const desc = [
    `Claim deadline for ${opts.caseName}.`,
    opts.claimUrl ? `Official claim site: ${opts.claimUrl}` : "",
    `Case details: ${opts.pageUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ClassActionForMe//Deadline//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${opts.caseId.replace(/[^A-Za-z0-9-]/g, "")}-deadline@classactionforme`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    `SUMMARY:${icsEscape(`Claim deadline: ${opts.caseName}`)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    ...(opts.claimUrl ? [`URL:${opts.claimUrl}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Class action claim deadline in 7 days",
    "TRIGGER:-P7D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Class action claim deadline tomorrow",
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545: CRLF line endings, fold lines longer than 75 octets.
  return lines
    .map((l) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join("\r\n ")))
    .join("\r\n");
}

export function AddToCalendar(props: { caseId: string; caseName: string; deadline: string; claimUrl: string | null }) {
  const [error, setError] = useState(false);

  function download() {
    try {
      const ics = buildIcs({ ...props, pageUrl: window.location.href });
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "claim-deadline.ics";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className="btn-secondary" onClick={download}>
        Add deadline to calendar
      </button>
      {error && <span role="alert" className="text-sm text-danger-fg">Couldn&apos;t create the calendar file.</span>}
    </span>
  );
}
