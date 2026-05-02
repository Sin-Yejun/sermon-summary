import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

const TIMESTAMP_RE = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3}) -->/;
const HEADER_PREFIXES = ['WEBVTT', 'Kind:', 'Language:', 'NOTE'];

import type { TranscriptSegment } from './types';

function tsToSeconds(h: string, m: string, s: string, ms: string): number {
  return (
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
  );
}

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    (m) => ENTITY_MAP[m] ?? m,
  );
}

function cleanCaption(line: string): string {
  let s = line.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/^>+\s*/, '');
  return s.trim();
}

export function parseVttSegments(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let pendingTs: number | null = null;
  let lastText = '';
  for (const raw of vtt.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (HEADER_PREFIXES.some((p) => line.startsWith(p))) continue;
    const m = line.match(TIMESTAMP_RE);
    if (m) {
      pendingTs = tsToSeconds(m[1], m[2], m[3], m[4]);
      continue;
    }
    const cleaned = cleanCaption(line);
    if (!cleaned) continue;
    if (cleaned === lastText) continue;
    segments.push({
      idx: segments.length,
      ts: pendingTs ?? 0,
      text: cleaned,
    });
    lastText = cleaned;
  }
  return segments;
}

export function parseVtt(vtt: string): string {
  return parseVttSegments(vtt)
    .map((s) => s.text)
    .join(' ');
}

export interface YtDlpMetadata {
  id: string;
  title: string;
  description: string;
  duration: number;
  channel: string;
  upload_date: string; // YYYYMMDD
}

function runYtDlp(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { cwd });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`yt-dlp exited ${code}: ${stderr.trim()}`));
    });
  });
}

export async function fetchVideoMetadata(url: string): Promise<YtDlpMetadata> {
  const json = await runYtDlp(['--dump-json', '--skip-download', url]);
  return JSON.parse(json) as YtDlpMetadata;
}

export async function fetchSubtitleSegments(
  url: string,
): Promise<TranscriptSegment[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sermon-sub-'));
  try {
    await runYtDlp(
      [
        '--write-auto-sub',
        '--sub-lang',
        'ko',
        '--sub-format',
        'vtt',
        '--skip-download',
        '-o',
        '%(id)s',
        url,
      ],
      dir,
    );
    const files = await readdir(dir);
    const vttFile = files.find((f) => f.endsWith('.ko.vtt'));
    if (!vttFile) {
      throw new Error('이 영상에는 한국어 자막이 없어 요약할 수 없습니다.');
    }
    const vtt = await readFile(path.join(dir, vttFile), 'utf8');
    return parseVttSegments(vtt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fetchSubtitles(url: string): Promise<string> {
  const segments = await fetchSubtitleSegments(url);
  return segments.map((s) => s.text).join(' ');
}
