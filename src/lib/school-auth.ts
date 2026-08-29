import { supabase } from '../supabaseClient';

// Founders can sign up with a personal email (the school gate doesn't apply to
// them). Add emails here as needed — existing accounts are unaffected either
// way, since the gate only runs on new sign-ups.
const FOUNDER_EMAILS = [
  'letsliinger@gmail.com',
  'ariveraaguasvivas@gmail.com',
];

// Academic top-level domains worldwide: .edu (US), .edu.xx (au, cn, sg, ph…),
// .ac.xx (uk, jp, nz, kr, in, za…). Covers the vast majority of universities
// without enumerating each one; country-TLD schools (e.g. Canada's .ca) are
// matched by the explicit `schools.domain` list instead.
const ACADEMIC_TLD = /\.edu$|\.edu\.[a-z]{2,3}$|\.ac\.[a-z]{2,3}$/;

export type SchoolResolution =
  | { status: 'founder' }                    // allow, keep free school choice
  | { status: 'known'; school: string }      // allow, auto-assign this school
  | { status: 'academic' }                   // verified student, pick school in onboarding
  | { status: 'rejected'; message: string }; // not a school email

// Decides whether an email may create an account and which school it maps to.
export async function resolveSchoolFromEmail(email: string): Promise<SchoolResolution> {
  const clean = email.trim().toLowerCase();
  const domain = clean.split('@')[1];
  if (!domain) return { status: 'rejected', message: 'Enter a valid email address.' };

  if (FOUNDER_EMAILS.includes(clean)) return { status: 'founder' };

  // Exact or subdomain match against the known-schools list
  // (e.g. student.ubc.ca matches ubc.ca).
  const { data } = await supabase.from('schools').select('name, domain').not('domain', 'is', null);
  const match = (data ?? []).find((s: any) => domain === s.domain || domain.endsWith(`.${s.domain}`));
  if (match) return { status: 'known', school: match.name };

  if (ACADEMIC_TLD.test(domain)) return { status: 'academic' };

  return {
    status: 'rejected',
    message: 'Use your school email to sign up (e.g. you@ucsc.edu). This keeps LetsLiinger students-only.',
  };
}
