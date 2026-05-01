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

export async function fetchSubtitles(url: string): Promise<string> {
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
    return parseVtt(vtt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
