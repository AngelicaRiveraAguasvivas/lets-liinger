import { supabase } from '../supabaseClient';

// Fire-and-forget: when a student sets their school, ask the backend to find
// (and validate) that school's public events calendar so its events start
// auto-importing. Safe to call repeatedly — the server only discovers once per
// school and no-ops if a feed already exists. Best-effort: never blocks or
// errors the onboarding flow if discovery is unavailable (e.g. no API key yet).
export function requestSchoolCalendar(school: string, domain?: string): void {
  const name = (school || '').trim();
  if (!name) return;
  supabase.functions
    .invoke('discover-calendar', { body: { school: name, domain: domain || null } })
    .catch(() => {});
}
