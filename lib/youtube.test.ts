import { describe, it, expect } from 'vitest';
import { extractVideoId, parseVtt, parseVttSegments } from './youtube';

describe('extractVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345',
      'dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/watch?list=PL12345&v=dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
    ],
  ])('extracts videoId from %s', (url, expected) => {
    expect(extractVideoId(url)).toBe(expected);
  });

  it.each([
    ['https://example.com/video', null],
    ['not a url', null],
    ['', null],
  ])('returns null for non-youtube %s', (url, expected) => {
    expect(extractVideoId(url)).toBe(expected);
  });
});

describe('parseVtt', () => {
  it('strips header, timestamps and html tags', () => {
    const vtt = `WEBVTT
Kind: captions
Language: ko

00:00:01.000 --> 00:00:03.000
안녕하세요 <c.colorE5E5E5>여러분</c>

00:00:03.000 --> 00:00:05.000
오늘 본문은 베드로전서 4장입니다`;

    expect(parseVtt(vtt)).toBe(
      '안녕하세요 여러분 오늘 본문은 베드로전서 4장입니다',
    );
  });

  it('deduplicates immediate repeated lines (autosub artifact)', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
청지기 정신

00:00:03.000 --> 00:00:05.000
청지기 정신

00:00:05.000 --> 00:00:07.000
이라는 것은`;

    expect(parseVtt(vtt)).toBe('청지기 정신 이라는 것은');
  });

  it('returns empty string for empty input', () => {
    expect(parseVtt('')).toBe('');
    expect(parseVtt('WEBVTT\n')).toBe('');
  });
});

describe('parseVttSegments', () => {
  it('returns timestamped segments with sequential idx', () => {
    const vtt = `WEBVTT

00:00:05.240 --> 00:00:08.000
첫 문장

00:01:30.500 --> 00:01:33.000
두 번째 문장`;

    const segs = parseVttSegments(vtt);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual({ idx: 0, ts: 5.24, text: '첫 문장' });
    expect(segs[1].idx).toBe(1);
    expect(segs[1].ts).toBeCloseTo(90.5, 2);
    expect(segs[1].text).toBe('두 번째 문장');
  });

  it('decodes html entities and strips speaker-change markers', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
&gt;&gt; 아멘

00:00:03.000 --> 00:00:05.000
&gt;&gt;&gt; 더 사랑하기를 원합니다.

00:00:05.000 --> 00:00:07.000
A &amp; B &lt;C&gt;`;

    const segs = parseVttSegments(vtt);
    expect(segs.map((s) => s.text)).toEqual([
      '아멘',
      '더 사랑하기를 원합니다.',
      'A & B <C>',
    ]);
  });

  it('skips immediate duplicates while preserving timestamps', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
청지기 정신

00:00:03.000 --> 00:00:05.000
청지기 정신

00:00:05.000 --> 00:00:07.000
이라는 것은`;

    const segs = parseVttSegments(vtt);
    expect(segs.map((s) => s.text)).toEqual(['청지기 정신', '이라는 것은']);
    expect(segs[0].ts).toBe(1);
    expect(segs[1].ts).toBe(5);
  });
});
