import { PublicProfile } from './follows';
import { supabase } from '../supabaseClient';

export type RsvpStatus = 'going' | 'waitlist';

export interface EventAttendance {
  capacity: number | null;   // null = unlimited
  headcount: number;         // total going, including guests
  goingRows: number;         // number of people marked going (rows, not headcount)
  waitlistCount: number;
  myStatus: RsvpStatus | null;
  myGuests: number;
  isFull: boolean;
}

// rsvp rows already fetched by a screen can be summarized without a round-trip.
export function summarizeRsvps(
  rows: { user_id: string; guest_count: number | null; status: string | null }[],
  capacity: number | null,
  myUserId: string | null
): EventAttendance {
  let headcount = 0, goingRows = 0, waitlistCount = 0;
  let myStatus: RsvpStatus | null = null, myGuests = 0;
  for (const r of rows) {
    const guests = r.guest_count || 0;
    if (r.status === 'waitlist') waitlistCount++;
    else { headcount += 1 + guests; goingRows++; }
    if (myUserId && r.user_id === myUserId) {
      myStatus = (r.status === 'waitlist' ? 'waitlist' : 'going');
      myGuests = guests;
    }
  }
  return { capacity, headcount, goingRows, waitlistCount, myStatus, myGuests, isFull: capacity != null && headcount >= capacity };
}

// RSVP (or update guest count). Returns the resulting status, or null on error.
export async function rsvpToEvent(eventId: string, guests = 0): Promise<RsvpStatus | null> {
  const { data, error } = await supabase.rpc('rsvp_to_event', { p_event: eventId, p_guests: guests });
  if (error) return null;
  return (data as RsvpStatus) ?? null;
}

// Cancel my RSVP; the server promotes the next waitlister(s) that now fit.
export async function cancelRsvp(eventId: string): Promise<void> {
  await supabase.rpc('cancel_rsvp', { p_event: eventId });
}

// ---- Co-hosts -----------------------------------------------------------
export async function getCoHosts(eventId: string): Promise<PublicProfile[]> {
  const { data: rows } = await supabase.from('event_cohosts').select('user_id').eq('event_id', eventId);
  const ids = (rows ?? []).map((r: any) => r.user_id);
  if (!ids.length) return [];
  const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, bio').in('id', ids);
  return (data ?? []) as PublicProfile[];
}

export async function addCoHost(eventId: string, userId: string, addedBy: string): Promise<string | null> {
  const { error } = await supabase.from('event_cohosts').insert({ event_id: eventId, user_id: userId, added_by: addedBy });
  return error ? error.message : null;
}

export async function removeCoHost(eventId: string, userId: string): Promise<void> {
  await supabase.from('event_cohosts').delete().eq('event_id', eventId).eq('user_id', userId);
}
