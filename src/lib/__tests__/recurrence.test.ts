import { buildOccurrences, MAX_OCCURRENCES } from '../recurrence';

describe('buildOccurrences', () => {
  it('returns just the first time when it does not repeat', () => {
    expect(buildOccurrences('2026-11-16T18:00:00', 'none', { mode: 'count', count: 5, until: null })).toEqual([
      '2026-11-16T18:00:00',
    ]);
  });

  it('repeats weekly a set number of times', () => {
    expect(buildOccurrences('2026-11-16T18:00:00', 'weekly', { mode: 'count', count: 3, until: null })).toEqual([
      '2026-11-16T18:00:00',
      '2026-11-23T18:00:00',
      '2026-11-30T18:00:00',
    ]);
  });

  it('skips weekends for weekdays', () => {
    // 2026-11-13 is a Friday
    expect(buildOccurrences('2026-11-13T09:00:00', 'weekdays', { mode: 'count', count: 3, until: null })).toEqual([
      '2026-11-13T09:00:00',
      '2026-11-16T09:00:00',
      '2026-11-17T09:00:00',
    ]);
  });

  it('stops on the last date, inclusive', () => {
    const out = buildOccurrences('2026-11-16T18:00:00', 'biweekly', {
      mode: 'until',
      count: 0,
      until: new Date(2026, 11, 28),
    });
    expect(out).toEqual(['2026-11-16T18:00:00', '2026-11-30T18:00:00', '2026-12-14T18:00:00', '2026-12-28T18:00:00']);
  });

  it('keeps the same day of month for monthly', () => {
    expect(buildOccurrences('2026-01-15T12:00:00', 'monthly', { mode: 'count', count: 3, until: null })).toEqual([
      '2026-01-15T12:00:00',
      '2026-02-15T12:00:00',
      '2026-03-15T12:00:00',
    ]);
  });

  it('caps very long series', () => {
    const out = buildOccurrences('2026-01-01T12:00:00', 'daily', { mode: 'until', count: 0, until: new Date(2030, 0, 1) });
    expect(out.length).toBe(MAX_OCCURRENCES);
  });
});
