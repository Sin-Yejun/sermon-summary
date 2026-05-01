import { describe, it, expect } from 'vitest';
import { parseSermonMetadata } from './metadata';

describe('parseSermonMetadata', () => {
  it('parses 분당우리교회 standard format', () => {
    const desc = `2026-04-26
분당우리교회 주일설교
마지막 때와 청지기 정신 (베드로전서 4장 7-11절)
이찬수 목사

#설교 #분당우리교회`;
    expect(parseSermonMetadata(desc)).toEqual({
      sermonDate: '2026-04-26',
      channelName: '분당우리교회',
      title: '마지막 때와 청지기 정신',
      bibleReference: '베드로전서 4장 7-11절',
      preacher: '이찬수 목사',
    });
  });

  it('returns nulls when format does not match', () => {
    const desc = 'just some random video description';
    expect(parseSermonMetadata(desc)).toEqual({
      sermonDate: null,
      channelName: null,
      title: null,
      bibleReference: null,
      preacher: null,
    });
  });

  it('partially fills when only some lines match', () => {
    const desc = `2026-04-26
어떤교회 주일설교`;
    const parsed = parseSermonMetadata(desc);
    expect(parsed.sermonDate).toBe('2026-04-26');
    expect(parsed.channelName).toBe('어떤교회');
    expect(parsed.title).toBeNull();
  });
});
