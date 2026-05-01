import { describe, it, expect } from 'vitest';
import { extractVideoId } from './youtube';

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
