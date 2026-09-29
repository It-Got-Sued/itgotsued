// Date helpers. Dates are formatted in UTC so date-only ISO strings don't shift a day.

export function parseIsoDate(iso: string): Date | null {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Whole days from today (UTC) until an ISO date; negative when past. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = Date.parse(iso.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(target)) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export function deadlineLabel(iso: string | null | undefined): string | null {
  const date = formatDate(iso);
  if (!date) return null;
  const days = daysUntil(iso);
  if (days === null) return `Deadline ${date}`;
  if (days < 0) return `Deadline passed ${date}`;
  if (days === 0) return `Deadline today (${date})`;
  if (days === 1) return `Deadline tomorrow (${date})`;
  return `Deadline ${date} · ${days} days left`;
}
