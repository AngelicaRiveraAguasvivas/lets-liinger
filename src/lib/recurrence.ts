// Turns one event start time plus a repeat rule into every start time to post.
// Times are naive local "YYYY-MM-DDTHH:MM:SS" strings, same as events.event_time.

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';
export type EndMode = 'count' | 'until';

// Upper bound on how many rows one "repeat" can create, so a typo like
// "daily until 2030" can't flood the feed. 120 covers a full school year of
// weekly events or a quarter of daily ones.
export const MAX_OCCURRENCES = 120;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function naive(dt: Date, timePart: string) {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${timePart}`;
}

// Expand the first start time into every occurrence, stopping at either a
// count or a last date (inclusive), whichever the person picked.
export function buildOccurrences(
  firstIso: string,
  rec: Recurrence,
  end: { mode: EndMode; count: number; until: Date | null }
): string[] {
  if (rec === 'none') return [firstIso];
  const [datePart, timePart = '00:00:00'] = firstIso.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const first = new Date(y, m - 1, d);
  const untilMs = end.mode === 'until' && end.until
    ? new Date(end.until.getFullYear(), end.until.getMonth(), end.until.getDate()).getTime()
    : Infinity;
  const limit = end.mode === 'count' ? Math.min(MAX_OCCURRENCES, Math.max(1, end.count)) : MAX_OCCURRENCES;

  const out: string[] = [];
  const cursor = new Date(first);
  let monthStep = 0;
  // Safety valve on loop iterations (weekdays skips weekends).
  for (let guard = 0; out.length < limit && guard < 1000; guard++) {
    if (cursor.getTime() > untilMs) break;
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    if (!(rec === 'weekdays' && isWeekend)) out.push(naive(cursor, timePart));
    if (rec === 'daily' || rec === 'weekdays') cursor.setDate(cursor.getDate() + 1);
    else if (rec === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else if (rec === 'biweekly') cursor.setDate(cursor.getDate() + 14);
    else if (rec === 'monthly') {
      monthStep += 1;
      const next = new Date(first);
      next.setMonth(first.getMonth() + monthStep);
      cursor.setTime(next.getTime());
    }
  }
  return out;
}
