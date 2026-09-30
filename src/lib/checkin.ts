import { supabase } from '../supabaseClient';

// Who is already checked in. For a host this returns everyone; for a plain
// attendee, RLS narrows it to just their own row (so they can see their status).
export async function getCheckedInIds(eventId: string): Promise<Set<string>> {
  const { data } = await supabase.from('event_checkins').select('user_id').eq('event_id', eventId);
  return new Set((data ?? []).map((r: any) => r.user_id));
}

// Host/co-host only (enforced server-side). Returns true on success.
export async function checkIn(eventId: string, userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('check_in', { p_event: eventId, p_user: userId });
  return !error;
}

export async function undoCheckIn(eventId: string, userId: string): Promise<void> {
  await supabase.rpc('undo_check_in', { p_event: eventId, p_user: userId });
}

// The payload encoded in an attendee's QR pass. Tagged so we ignore unrelated
// QR codes the camera might see.
export function passPayload(eventId: string, userId: string): string {
  return JSON.stringify({ t: 'llci', e: eventId, u: userId });
}

export function parsePass(data: string): { e: string; u: string } | null {
  try {
    const p = JSON.parse(data);
    if (p && p.t === 'llci' && typeof p.e === 'string' && typeof p.u === 'string') {
      return { e: p.e, u: p.u };
    }
  } catch {
    // not one of our passes
  }
  return null;
}
