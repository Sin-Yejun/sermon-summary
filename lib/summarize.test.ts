import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: {
    models: { generateContent: typeof generateContentMock };
  }) {
    this.models = { generateContent: generateContentMock };
  }),
  Type: {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING',
    INTEGER: 'INTEGER',
    NUMBER: 'NUMBER',
  },
}));

import { summarizeSermon } from './summarize';
import type { TranscriptSegment } from './types';

function segs(): TranscriptSegment[] {
  return [
    { idx: 0, ts: 5, text: '안녕하세요.' },
    { idx: 1, ts: 12, text: '오늘 본문은 베드로전서 4장입니다.' },
    { idx: 2, ts: 20, text: '인생은 영원하지 않습니다.' },
    { idx: 3, ts: 28, text: '그러므로 청지기 정신이 필요합니다.' },
  ];
}

const OUTLINE_RESPONSE = {
  tldr: '이 설교는 청지기 정신에 대해 다룹니다.',
  sections: [
    {
      id: '1',
      title: '도입',
      subsections: [
        {
          id: '1.1',
          title: '인생의 유한함',
          coveredIdxRange: [0, 2],
          bullets: [{ text: '인생은 영원하지 않다.' }],
        },
      ],
    },
    {
      id: '2',
      title: '청지기 정신',
      subsections: [
        {
          id: '2.1',
          title: '맡기신 것을 관리',
          coveredIdxRange: [3, 3],
          bullets: [{ text: '청지기 정신이 필요하다.' }],
        },
      ],
    },
  ],
};

const CITATION_RESPONSES = [
  { bullets: [{ text: '인생은 영원하지 않다.', citations: [2] }] },
  { bullets: [{ text: '청지기 정신이 필요하다.', citations: [3] }] },
];

describe('summarizeSermon', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('runs two-stage pipeline and produces SummaryDoc with citations', async () => {
    generateContentMock
      .mockResolvedValueOnce({ text: JSON.stringify(OUTLINE_RESPONSE) })
      .mockResolvedValueOnce({ text: JSON.stringify(CITATION_RESPONSES[0]) })
      .mockResolvedValueOnce({ text: JSON.stringify(CITATION_RESPONSES[1]) });

    const doc = await summarizeSermon({
      segments: segs(),
      meta: {
        title: '테스트',
        preacher: null,
        sermonDate: null,
        bibleReference: null,
      },
    });

    expect(doc.tldr).toContain('청지기');
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].subsections[0].startTs).toBe(5);
    expect(doc.sections[0].subsections[0].bullets[0].citations).toEqual([2]);
    expect(doc.sections[1].subsections[0].startTs).toBe(28);
    expect(doc.sections[1].subsections[0].bullets[0].citations).toEqual([3]);

    expect(generateContentMock).toHaveBeenCalledTimes(3);
    const outlineCall = generateContentMock.mock.calls[0][0];
    expect(outlineCall.model).toBe('gemini-3.1-flash-lite-preview');
    expect(outlineCall.config.systemInstruction).toMatch(/구조와 핵심 추출/);
    expect(outlineCall.contents).toContain('[0] 00:05 안녕하세요.');

    const citationCall = generateContentMock.mock.calls[1][0];
    expect(citationCall.config.systemInstruction).toMatch(/인용 매칭/);
  });

  it('drops out-of-range citations defensively', async () => {
    const bad = {
      bullets: [{ text: '인생은 영원하지 않다.', citations: [99, 1, -1] }],
    };
    generateContentMock
      .mockResolvedValueOnce({ text: JSON.stringify(OUTLINE_RESPONSE) })
      .mockResolvedValueOnce({ text: JSON.stringify(bad) })
      .mockResolvedValueOnce({ text: JSON.stringify(CITATION_RESPONSES[1]) });

    const doc = await summarizeSermon({
      segments: segs(),
      meta: { title: null, preacher: null, sermonDate: null, bibleReference: null },
    });
    expect(doc.sections[0].subsections[0].bullets[0].citations).toEqual([1]);
  });

  it('throws if outline response is empty', async () => {
    generateContentMock.mockResolvedValueOnce({ text: '' });
    await expect(
      summarizeSermon({
        segments: segs(),
        meta: { title: null, preacher: null, sermonDate: null, bibleReference: null },
      }),
    ).rejects.toThrow(/empty/i);
  });

  it('throws on invalid JSON', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'not json' });
    await expect(
      summarizeSermon({
        segments: segs(),
        meta: { title: null, preacher: null, sermonDate: null, bibleReference: null },
      }),
    ).rejects.toThrow(/파싱/);
  });

  it('throws on empty segments', async () => {
    await expect(
      summarizeSermon({
        segments: [],
        meta: { title: null, preacher: null, sermonDate: null, bibleReference: null },
      }),
    ).rejects.toThrow(/세그먼트/);
  });
});
