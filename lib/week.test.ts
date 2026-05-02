import { describe, it, expect } from 'vitest';
import { weekOfFor } from './week';

describe('weekOfFor', () => {
  it('snaps to the Sunday of the same week', () => {
    expect(weekOfFor('2026-04-26')).toBe('2026-04-26');
    expect(weekOfFor('2026-04-27')).toBe('2026-04-26');
    expect(weekOfFor('2026-05-02')).toBe('2026-04-26');
  });

  it('snaps to previous Sunday for Sat', () => {
    expect(weekOfFor('2026-05-02')).toBe('2026-04-26');
  });

  it('returns null on invalid input', () => {
    expect(weekOfFor('not-a-date')).toBeNull();
    expect(weekOfFor('')).toBeNull();
    expect(weekOfFor('2026-13-01')).toBeNull();
  });
});
