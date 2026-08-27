import { supabase } from '../supabaseClient';

export interface School {
  id: string;
  name: string;
}

export async function fetchSchools(): Promise<School[]> {
  const { data } = await supabase.from('schools').select('id, name').order('name');
  return (data as School[]) ?? [];
}

// Add a school to the shared list (if new); returns the existing row on conflict.
export async function addSchool(name: string): Promise<School | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.from('schools').insert({ name: trimmed }).select('id, name').single();
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase.from('schools').select('id, name').ilike('name', trimmed).maybeSingle();
      return (existing as School) ?? null;
    }
    return null;
  }
  return data as School;
}
