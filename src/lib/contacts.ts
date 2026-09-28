import { PublicProfile } from './follows';
import { supabase } from '../supabaseClient';

// Normalize a phone number to a comparable form so two people typing the same
// number (with/without spaces, dashes, country code) still match. Digits only;
// a bare 10-digit US number gets a leading "1". Keep this identical everywhere
// numbers are stored or looked up, or matching silently fails.
export function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 7) return null; // too short to be a real number
  if (digits.length === 10) return `1${digits}`; // assume US if no country code
  return digits;
}

// The current user's saved number (or null). Only ever readable by its owner
// (RLS), and never exposed on the public profile.
export async function getMyPhone(userId: string): Promise<string | null> {
  const { data } = await supabase.from('user_phones').select('phone').eq('user_id', userId).maybeSingle();
  return (data as any)?.phone ?? null;
}

// Save / update / clear the current user's number. Passing an empty string
// removes it. Returns an error message on failure, or null on success.
export async function setMyPhone(userId: string, raw: string): Promise<string | null> {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    const { error } = await supabase.from('user_phones').delete().eq('user_id', userId);
    return error ? error.message : null;
  }
  const normalized = normalizePhone(trimmed);
  if (!normalized) return 'That doesn’t look like a valid phone number.';
  const { error } = await supabase
    .from('user_phones')
    .upsert({ user_id: userId, phone: normalized, updated_at: new Date().toISOString() });
  return error ? error.message : null;
}

// Given a list of raw numbers (e.g. from a phone's contacts on native), return
// the profiles of users who opted in with a matching number. Never returns
// anyone's actual number. Web can't read the contact book, so this is wired up
// for the future native build; today it also powers "is my number matched?".
export async function findProfilesByPhones(rawNumbers: string[]): Promise<PublicProfile[]> {
  const normalized = Array.from(
    new Set(rawNumbers.map(normalizePhone).filter((n): n is string => !!n))
  );
  if (normalized.length === 0) return [];
  const { data, error } = await supabase.rpc('find_profiles_by_phones', { numbers: normalized });
  if (error || !data) return [];
  return data as PublicProfile[];
}
