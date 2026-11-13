import { Linking, Platform, Share } from 'react-native';

import { supabase } from '../supabaseClient';

// ---- Saved / "Interested" (separate from a full RSVP) -------------------

export async function getSavedEventIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('event_saves').select('event_id').eq('user_id', userId);
  return new Set((data ?? []).map((r: any) => r.event_id));
}

export async function saveEvent(userId: string, eventId: string): Promise<void> {
  await supabase.from('event_saves').insert({ user_id: userId, event_id: eventId });
}

export async function unsaveEvent(userId: string, eventId: string): Promise<void> {
  await supabase.from('event_saves').delete().eq('user_id', userId).eq('event_id', eventId);
}

// ---- Add to phone calendar (Google Calendar template link) --------------
// Works on web and mobile browsers; opens a prefilled "new event" page.

function calDates(iso: string | null): { start: string; end: string } | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (x: Date) =>
    `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
  const end = new Date(d.getTime() + 2 * 60 * 60 * 1000); // default 2-hour block
  return { start: fmt(d), end: fmt(end) };
}

export function calendarUrl(opts: {
  title: string;
  details?: string | null;
  location?: string | null;
  eventTime: string | null;
}): string | null {
  const dates = calDates(opts.eventTime);
  if (!dates) return null;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${dates.start}/${dates.end}`,
  });
  if (opts.details) params.set('details', opts.details);
  if (opts.location) params.set('location', opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function addToCalendar(opts: {
  title: string;
  details?: string | null;
  location?: string | null;
  eventTime: string | null;
}): Promise<boolean> {
  const url = calendarUrl(opts);
  if (!url) return false;
  await Linking.openURL(url);
  return true;
}

// ---- Share an event ------------------------------------------------------
// Uses the Web Share API / native share sheet, with a clipboard fallback on
// desktop web. Returns 'shared' | 'copied' | 'unsupported'.

export function eventShareUrl(eventId: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/event-detail?id=${eventId}`;
  }
  return `https://letsliinger.app/event-detail?id=${eventId}`;
}

export async function shareEvent(eventId: string, title: string): Promise<'shared' | 'copied' | 'unsupported'> {
  const url = eventShareUrl(eventId);
  const message = `${title}: check it out on LetsLiinger`;

  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text: message, url });
        return 'shared';
      } catch {
        return 'shared'; // user dismissed the sheet
      }
    }
    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        return 'copied';
      } catch {
        return 'unsupported';
      }
    }
    return 'unsupported';
  }

  await Share.share({ message: `${message}\n${url}`, url, title });
  return 'shared';
}
