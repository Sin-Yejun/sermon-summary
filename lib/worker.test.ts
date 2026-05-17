import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./youtube', () => ({
  fetchVideoMetadata: vi.fn(),
  fetchSubtitleSegments: vi.fn(),
}));
vi.mock('./transcribe', () => ({
  transcribeFromUrl: vi.fn(),
}));
vi.mock('./summarize', () => ({
  summarizeSermon: vi.fn(),
}));

import { fetchVideoMetadata, fetchSubtitleSegments } from './youtube';
import { transcribeFromUrl } from './transcribe';
import { summarizeSermon } from './summarize';
import { processSermon } from './worker';
import { createDb, createSermon, getSermon } from './db';
import { emptyUsage } from './pricing';
import type { SummaryDoc, TranscriptSegment } from './types';

function makeSegments(n: number): TranscriptSegment[] {
  return Array.from({ length: n }, (_, i) => ({
    idx: i,
    ts: i * 5,
    text: '자막 본문이 길게 이어집니다',
  }));
}

const SUMMARY: SummaryDoc = {
  tldr: '핵심 요약',
  sections: [
    {
      id: '1',
      title: '도입',
      subsections: [
        {
          id: '1.1',
          title: '인생의 유한함',
          startTs: 5,
          bullets: [{ text: '인생은 짧다.', citations: [0] }],
        },
      ],
    },
  ],
};

describe('processSermon', () => {
  beforeEach(() => {
    process.env.SERMON_DB_PATH = ':memory:';
    createDb({ reset: true });
    vi.mocked(fetchVideoMetadata).mockReset();
    vi.mocked(fetchSubtitleSegments).mockReset();
    vi.mocked(transcribeFromUrl).mockReset();
    vi.mocked(summarizeSermon).mockReset();
  });

  it('runs pipeline and stores result', async () => {
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      id: 'abc12345678',
      title: '원본 제목',
      description: `2026-04-26
분당우리교회 주일설교
마지막 때와 청지기 정신 (베드로전서 4장 7-11절)
이찬수 목사`,
      duration: 3000,
      channel: '분당우리교회 BWMC',
      upload_date: '20260426',
    });
    vi.mocked(fetchSubtitleSegments).mockResolvedValue(makeSegments(60));
    vi.mocked(summarizeSermon).mockResolvedValue({
      doc: structuredClone(SUMMARY),
      usage: emptyUsage(),
    });

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    const s = getSermon('abc12345678');
    expect(s!.status).toBe('done');
    expect(s!.title).toBe('마지막 때와 청지기 정신');
    expect(s!.bibleReference).toBe('베드로전서 4장 7-11절');
    expect(s!.preacher).toBe('이찬수 목사');
    expect(s!.sermonDate).toBe('2026-04-26');
    expect(s!.channelName).toBe('분당우리교회');
    expect(s!.transcript).toMatch(/^자막 본문/);
    expect(s!.transcriptSegments).toMatch(/"idx":0/);
    expect(s!.summaryJson).toBeTruthy();
    expect(s!.summaryTldr).toBe('핵심 요약');
    const doc = JSON.parse(s!.summaryJson!) as SummaryDoc;
    expect(doc.sections[0].subsections[0].startTs).toBe(5);
    expect(s!.errorMessage).toBeNull();
  });

  it('falls back to audio STT when subtitles fetch throws', async () => {
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      id: 'abc12345678',
      title: 't',
      description: '',
      duration: 100,
      channel: 'c',
      upload_date: '20260426',
    });
    vi.mocked(fetchSubtitleSegments).mockRejectedValue(new Error('자막 없음'));
    vi.mocked(transcribeFromUrl).mockResolvedValue({
      segments: makeSegments(60),
      usage: emptyUsage(),
    });
    vi.mocked(summarizeSermon).mockResolvedValue({
      doc: structuredClone(SUMMARY),
      usage: emptyUsage(),
    });

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    expect(transcribeFromUrl).toHaveBeenCalledWith(
      'https://youtu.be/abc12345678',
    );
    const s = getSermon('abc12345678');
    expect(s!.status).toBe('done');
    expect(s!.transcript).toMatch(/^자막 본문/);
    expect(s!.errorMessage).toBeNull();
  });

  it('marks failed when both subtitles and audio STT throw', async () => {
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      id: 'abc12345678',
      title: 't',
      description: '',
      duration: 100,
      channel: 'c',
      upload_date: '20260426',
    });
    vi.mocked(fetchSubtitleSegments).mockRejectedValue(new Error('자막 없음'));
    vi.mocked(transcribeFromUrl).mockRejectedValue(new Error('오디오 추출 실패'));

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    const s = getSermon('abc12345678');
    expect(s!.status).toBe('failed');
    expect(s!.errorMessage).toBe('오디오 추출 실패');
  });

  it('marks failed when transcript too short', async () => {
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      id: 'abc12345678',
      title: 't',
      description: '',
      duration: 100,
      channel: 'c',
      upload_date: '20260426',
    });
    vi.mocked(fetchSubtitleSegments).mockResolvedValue([
      { idx: 0, ts: 0, text: '짧음' },
    ]);

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    const s = getSermon('abc12345678');
    expect(s!.status).toBe('failed');
    expect(s!.errorMessage).toMatch(/짧/);
  });
});
