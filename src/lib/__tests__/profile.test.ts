import { buildProfileUpdate, ProfileUpdateInput } from '../profile';

const baseInput: ProfileUpdateInput = {
  displayName: 'Ada',
  username: 'ada',
  bio: 'hi',
  university: 'Fake University',
  major: 'CS',
  minor: '',
  gradYear: '2028',
  avatarUrl: null,
  interests: [],
  extracurriculars: [],
};

describe('buildProfileUpdate', () => {
  it('uses the submitted university when the account is not school-locked', () => {
    const update = buildProfileUpdate(baseInput, {
      schoolLocked: false,
      lockedUniversity: 'Fake University',
    });

    expect(update.university).toBe('Fake University');
  });

  it('ignores a tampered university and keeps the verified school when locked', () => {
    const tampered: ProfileUpdateInput = { ...baseInput, university: 'Some Other School' };

    const update = buildProfileUpdate(tampered, {
      schoolLocked: true,
      lockedUniversity: 'Fake University',
    });

    expect(update.university).toBe('Fake University');
  });

  it('still trims/nulls the locked university like an unlocked one', () => {
    const update = buildProfileUpdate(baseInput, {
      schoolLocked: true,
      lockedUniversity: '  ',
    });

    expect(update.university).toBeNull();
  });
});
