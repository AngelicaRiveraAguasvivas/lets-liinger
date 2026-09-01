export interface ProfileUpdateInput {
  displayName: string;
  username: string;
  bio: string;
  university: string;
  major: string;
  minor: string;
  gradYear: string;
  avatarUrl: string | null;
  interests: string[];
  extracurriculars: { name: string; role: string }[];
}

export interface ProfileUpdateOptions {
  // True for students verified via school email (see school-auth.ts). When
  // locked, `lockedUniversity` is written regardless of `input.university`,
  // so a stale/tampered client value can never overwrite the verified school.
  schoolLocked: boolean;
  lockedUniversity: string;
}

export function buildProfileUpdate(input: ProfileUpdateInput, opts: ProfileUpdateOptions) {
  const university = opts.schoolLocked ? opts.lockedUniversity : input.university;
  return {
    display_name: input.displayName.trim(),
    username: input.username.trim().toLowerCase().replace(/\s+/g, '_'),
    bio: input.bio.trim(),
    university: university.trim() || null,
    major: input.major.trim() || null,
    minor: input.minor.trim() || null,
    grad_year: input.gradYear.trim() || null,
    cohort: null,
    avatar_url: input.avatarUrl,
    interests: input.interests,
    extracurriculars: input.extracurriculars,
  };
}
