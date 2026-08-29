import { queryBuilder } from './supabaseTestUtils';

jest.mock('../../supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../supabaseClient';
import { engagementScore, fetchCreatorInsights } from '../insights';

const mockFrom = supabase.from as jest.Mock;

describe('engagementScore', () => {
  it('weights rsvps highest, then comments, then likes', () => {
    expect(engagementScore(1, 0, 0)).toBe(3);
    expect(engagementScore(0, 1, 0)).toBe(1);
    expect(engagementScore(0, 0, 1)).toBe(2);
  });

  it('sums combined weights', () => {
    // 2 rsvps * 3 + 4 comments * 2 + 5 likes * 1 = 6 + 8 + 5 = 19
    expect(engagementScore(2, 5, 4)).toBe(19);
  });

  it('returns 0 for no activity', () => {
    expect(engagementScore(0, 0, 0)).toBe(0);
  });
});

describe('fetchCreatorInsights', () => {
  it('returns the empty summary when the creator has no events', async () => {
    mockFrom.mockReturnValueOnce(queryBuilder({ data: [] }));

    const result = await fetchCreatorInsights('creator-1');

    expect(result).toEqual({
      totalEvents: 0,
      totalRsvps: 0,
      totalLikes: 0,
      totalComments: 0,
      totalEngagement: 0,
      avgRsvps: 0,
      topEvent: null,
      events: [],
      byClub: [],
      byCategory: [],
      audience: { total: 0, schools: [], years: [], interests: [] },
    });
    // Should short-circuit and not query rsvps/likes/comments at all.
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('returns the empty summary when the events query returns null data', async () => {
    mockFrom.mockReturnValueOnce(queryBuilder({ data: null }));

    const result = await fetchCreatorInsights('creator-1');

    expect(result.totalEvents).toBe(0);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('aggregates totals, per-event stats, sorting, and the top event', async () => {
    mockFrom
      // events created by this user
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { id: 'e1', title: 'Low key hangout', event_time: '2026-08-10T18:00:00Z' },
            { id: 'e2', title: 'Big party', event_time: '2026-08-12T20:00:00Z' },
            { id: 'e3', title: 'No RSVPs yet', event_time: null },
          ],
        })
      )
      // rsvps for those events
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { event_id: 'e1' },
            { event_id: 'e2' },
            { event_id: 'e2' },
            { event_id: 'e2' },
          ],
        })
      )
      // likes for those events
      .mockReturnValueOnce(
        queryBuilder({
          data: [{ event_id: 'e1' }, { event_id: 'e1' }, { event_id: 'e2' }],
        })
      )
      // comments for those events
      .mockReturnValueOnce(queryBuilder({ data: [{ event_id: 'e2' }] }));

    const result = await fetchCreatorInsights('creator-1');

    expect(mockFrom).toHaveBeenCalledTimes(4);
    expect(result.totalEvents).toBe(3);
    expect(result.totalRsvps).toBe(4);
    expect(result.totalLikes).toBe(3);
    expect(result.totalComments).toBe(1);

    // e1: 1 rsvp*3 + 2 likes*1 + 0 comments*2 = 5
    // e2: 3 rsvps*3 + 1 like*1 + 1 comment*2 = 12
    // e3: 0
    expect(result.totalEngagement).toBe(17);
    expect(result.avgRsvps).toBe(1.3); // 4 / 3 rounded to 1 decimal

    // Sorted by engagement desc: e2 (12), e1 (5), e3 (0)
    expect(result.events.map((e) => e.id)).toEqual(['e2', 'e1', 'e3']);

    // Top event is picked by highest rsvp count, not engagement.
    expect(result.topEvent?.id).toBe('e2');
    expect(result.topEvent?.rsvps).toBe(3);
  });

  it('treats events with no rsvps/likes/comments as zeroed stats', async () => {
    mockFrom
      .mockReturnValueOnce(queryBuilder({ data: [{ id: 'e1', title: 'Quiet event', event_time: null }] }))
      .mockReturnValueOnce(queryBuilder({ data: null }))
      .mockReturnValueOnce(queryBuilder({ data: null }))
      .mockReturnValueOnce(queryBuilder({ data: null }));

    const result = await fetchCreatorInsights('creator-1');

    expect(result.events).toEqual([
      { id: 'e1', title: 'Quiet event', eventTime: null, host: null, category: null, rsvps: 0, likes: 0, comments: 0, engagement: 0 },
    ]);
    expect(result.topEvent).toEqual(result.events[0]);
    expect(result.avgRsvps).toBe(0);
  });
});
