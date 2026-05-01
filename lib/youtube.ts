const ID = '[a-zA-Z0-9_-]{11}';

const PATTERNS: RegExp[] = [
  new RegExp(`youtube\\.com/watch\\?(?:.*&)?v=(${ID})`),
  new RegExp(`youtu\\.be/(${ID})`),
  new RegExp(`youtube\\.com/embed/(${ID})`),
  new RegExp(`youtube\\.com/shorts/(${ID})`),
];

export function extractVideoId(url: string): string | null {
  if (!url) return null;
  for (const re of PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}
