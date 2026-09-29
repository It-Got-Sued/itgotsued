// Adds a claim deadline to the iOS calendar using the system "new event" sheet,
// so the user reviews and saves it themselves.
import * as Calendar from 'expo-calendar/legacy';

import { parseIsoDate } from './format';

export async function addDeadlineToCalendar(opts: {
  caseName: string;
  deadline: string;
  claimUrl?: string | null;
}): Promise<'saved' | 'canceled'> {
  const day = parseIsoDate(opts.deadline);
  if (!day) throw new Error('Invalid deadline date');
  // All-day event on the deadline date (date-only ISO strings are UTC midnight).
  const start = new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const result = await Calendar.createEventInCalendarAsync({
    title: `Claim deadline: ${opts.caseName}`,
    startDate: start,
    endDate: end,
    allDay: true,
    url: opts.claimUrl ?? undefined,
    notes: opts.claimUrl
      ? `File on the official settlement site before the deadline: ${opts.claimUrl}`
      : 'Claim deadline for a class action settlement.',
    // Reminders at 9am three days before and 9am the day before.
    alarms: [{ relativeOffset: -60 * 24 * 3 + 60 * 9 }, { relativeOffset: -60 * 24 + 60 * 9 }],
  });
  return result.action === Calendar.CalendarDialogResultActions.saved ? 'saved' : 'canceled';
}
