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

const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}\.\d{3} -->/;
const HEADER_PREFIXES = ['WEBVTT', 'Kind:', 'Language:', 'NOTE'];

export function parseVtt(vtt: string): string {
  const out: string[] = [];
  let last = '';
  for (const raw of vtt.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (HEADER_PREFIXES.some((p) => line.startsWith(p))) continue;
    if (TIMESTAMP_RE.test(line)) continue;
    const cleaned = line.replace(/<[^>]+>/g, '').trim();
    if (!cleaned) continue;
    if (cleaned === last) continue;
    out.push(cleaned);
    last = cleaned;
  }
  return out.join(' ');
}
