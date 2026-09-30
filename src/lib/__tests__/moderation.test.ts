import { queryBuilder } from './supabaseTestUtils';

jest.mock('../../supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../supabaseClient';
import {
  blockUser,
  getBlockedIds,
  getMyBlockedIds,
  reportEvent,
  reportUser,
  unblockUser,
} from '../moderation';

const mockFrom = supabase.from as jest.Mock;

describe('getBlockedIds', () => {
  it('returns ids in either direction, deduplicated', async () => {
    mockFrom.mockReturnValueOnce(
      queryBuilder({
        data: [
          { blocker_id: 'me', blocked_id: 'a' }, // I blocked a
          { blocker_id: 'b', blocked_id: 'me' }, // b blocked me
          { blocker_id: 'me', blocked_id: 'a' }, // duplicate row
        ],
      })
    );

    const ids = await getBlockedIds('me');

    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set when there is no data', async () => {
    mockFrom.mockReturnValueOnce(queryBuilder({ data: null }));

    const ids = await getBlockedIds('me');

    expect(ids).toEqual(new Set());
  });

  it('queries both directions via .or()', async () => {
    const builder = queryBuilder({ data: [] });
    mockFrom.mockReturnValueOnce(builder);

    await getBlockedIds('me');

    expect(builder.or).toHaveBeenCalledWith('blocker_id.eq.me,blocked_id.eq.me');
  });
});

describe('getMyBlockedIds', () => {
  it('returns only ids I actively blocked', async () => {
    const builder = queryBuilder({ data: [{ blocked_id: 'a' }, { blocked_id: 'c' }] });
    mockFrom.mockReturnValueOnce(builder);

    const ids = await getMyBlockedIds('me');

    expect(ids).toEqual(new Set(['a', 'c']));
    expect(builder.eq).toHaveBeenCalledWith('blocker_id', 'me');
  });

  it('returns an empty set when there is no data', async () => {
    mockFrom.mockReturnValueOnce(queryBuilder({ data: null }));

    expect(await getMyBlockedIds('me')).toEqual(new Set());
  });
});

describe('blockUser', () => {
  it('inserts the block and severs the follow relationship in both directions', async () => {
    const insertBuilder = queryBuilder({ data: null });
    const deleteBuilder = queryBuilder({ data: null });
    mockFrom.mockReturnValueOnce(insertBuilder).mockReturnValueOnce(deleteBuilder);

    await blockUser('me', 'them');

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'blocks');
    expect(insertBuilder.insert).toHaveBeenCalledWith({ blocker_id: 'me', blocked_id: 'them' });

    expect(mockFrom).toHaveBeenNthCalledWith(2, 'follows');
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.or).toHaveBeenCalledWith(
      'and(follower_id.eq.me,following_id.eq.them),and(follower_id.eq.them,following_id.eq.me)'
    );
  });
});

describe('unblockUser', () => {
  it('deletes the specific block row', async () => {
    const builder = queryBuilder({ data: null });
    mockFrom.mockReturnValueOnce(builder);

    await unblockUser('me', 'them');

    expect(mockFrom).toHaveBeenCalledWith('blocks');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'blocker_id', 'me');
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'blocked_id', 'them');
  });
});

describe('reportUser', () => {
  it('inserts a report targeting a user', async () => {
    const builder = queryBuilder({ data: null });
    mockFrom.mockReturnValueOnce(builder);

    await reportUser('reporter', 'target', 'spam', 'they keep spamming');

    expect(mockFrom).toHaveBeenCalledWith('reports');
    expect(builder.insert).toHaveBeenCalledWith({
      reporter_id: 'reporter',
      target_user_id: 'target',
      category: 'spam',
      detail: 'they keep spamming',
      reason: 'they keep spamming',
    });
  });
});

describe('reportEvent', () => {
  it('inserts a report targeting an event', async () => {
    const builder = queryBuilder({ data: null });
    mockFrom.mockReturnValueOnce(builder);

    await reportEvent('reporter', 'event-1', 'spam');

    expect(mockFrom).toHaveBeenCalledWith('reports');
    expect(builder.insert).toHaveBeenCalledWith({
      reporter_id: 'reporter',
      target_event_id: 'event-1',
      category: 'spam',
      detail: null,
      reason: 'spam',
    });
  });
});
