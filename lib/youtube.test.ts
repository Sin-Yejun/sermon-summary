import { describe, it, expect } from 'vitest';
import { extractVideoId, parseVtt } from './youtube';

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
