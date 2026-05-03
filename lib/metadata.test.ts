import { describe, it, expect } from 'vitest';
import { parseSermonMetadata } from './metadata';
import { DEFAULT_METADATA_RULES, type MetadataRules } from './playlists';

describe('parseSermonMetadata with DEFAULT_METADATA_RULES', () => {
  it('parses 분당우리교회 standard format', () => {
    const desc = `2026-04-26
분당우리교회 주일설교
마지막 때와 청지기 정신 (베드로전서 4장 7-11절)
이찬수 목사

#설교 #분당우리교회`;
    expect(
      parseSermonMetadata({ description: desc }, DEFAULT_METADATA_RULES),
    ).toEqual({
      sermonDate: '2026-04-26',
      channelName: '분당우리교회',
      title: '마지막 때와 청지기 정신',
      bibleReference: '베드로전서 4장 7-11절',
      preacher: '이찬수 목사',
    });
  });

  it('returns nulls when format does not match', () => {
    expect(
      parseSermonMetadata(
        { description: 'just some random video description' },
        DEFAULT_METADATA_RULES,
      ),
    ).toEqual({
      sermonDate: null,
      channelName: null,
      title: null,
      bibleReference: null,
      preacher: null,
    });
  });

  it('partially fills when only some lines match', () => {
    const parsed = parseSermonMetadata(
      { description: '2026-04-26\n어떤교회 주일설교' },
      DEFAULT_METADATA_RULES,
    );
    expect(parsed.sermonDate).toBe('2026-04-26');
    expect(parsed.channelName).toBe('어떤교회');
    expect(parsed.title).toBeNull();
  });
});

describe('parseSermonMetadata with custom rules', () => {
  const UHPC_RULES: MetadataRules = {
    sermonDate: {
      from: 'title',
      regex: '(\\d{4})\\.(\\d{2})\\.(\\d{2})',
      format: '$1-$2-$3',
    },
    channelName: { from: 'title', regex: '^\\[([^\\]]+)\\]' },
    title: { from: 'title', regex: '예배\\s*\\|\\s*(.+?)\\s*\\(' },
    bibleReference: { from: 'title', regex: '\\(([^()]+)\\)' },
    preacher: { from: 'title', regex: '\\|\\s*([^|]+목사)\\s*$' },
  };

  it('extracts UHPC fields from video title', () => {
    const m = parseSermonMetadata(
      {
        description: '아무 설명이나 들어와도 무관',
        title:
          '[울산화평교회] 2026.04.26. 주일 오전예배 | 마키아벨리로부터 리소르지멘토까지 (창세기 3:1~7) | 장지훈 목사',
      },
      UHPC_RULES,
    );
    expect(m).toEqual({
      sermonDate: '2026-04-26',
      channelName: '울산화평교회',
      title: '마키아벨리로부터 리소르지멘토까지',
      bibleReference: '창세기 3:1~7',
      preacher: '장지훈 목사',
    });
  });

  it('returns null fields when title does not match rules', () => {
    const m = parseSermonMetadata(
      { description: '', title: '제목 미상' },
      UHPC_RULES,
    );
    expect(m.sermonDate).toBeNull();
    expect(m.title).toBeNull();
  });

  it('returns all nulls when rules object is empty', () => {
    const m = parseSermonMetadata(
      { description: '2026-04-26\n분당우리교회 주일설교' },
      {},
    );
    expect(m.sermonDate).toBeNull();
    expect(m.channelName).toBeNull();
  });

  it('skips invalid regex without throwing', () => {
    const m = parseSermonMetadata(
      { description: 'hello', title: 'hi' },
      { title: { from: 'title', regex: '[invalid' } },
    );
    expect(m.title).toBeNull();
  });
});
