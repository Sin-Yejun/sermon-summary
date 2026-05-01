# Sermon Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page web tool that takes a YouTube sermon URL, extracts subtitles + metadata, and uses Gemini to produce a structured Korean summary displayed as a single-document page. Results are cached by `videoId`.

**Architecture:** Next.js 14 App Router monolith. URL → API → SQLite cache → fire-and-forget async pipeline (yt-dlp metadata → yt-dlp subtitles → Gemini summary) → DB persisted. Client polls a status endpoint at 1.5s intervals until `done`/`failed`.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · `react-markdown` + `remark-gfm` · `better-sqlite3` · `@google/genai` · `yt-dlp` (system binary, called via child_process) · Vitest · pnpm

**Spec:** [`docs/superpowers/specs/2026-05-01-sermon-summary-design.md`](../specs/2026-05-01-sermon-summary-design.md)

**Prerequisites (must already be installed on dev machine):**
- Node 20+
- pnpm 9+
- `yt-dlp` (`brew install yt-dlp`)
- `GEMINI_API_KEY` available

---

## Task 1: Scaffold Next.js project + dev tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.example`, `vitest.config.ts`

- [ ] **Step 1: Run create-next-app non-interactively**

Run from project root (`/Users/daneil/personal/sermon-summary`):

```bash
pnpm create next-app@latest . \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias "@/*" --use-pnpm
```

If the directory already contains files (`.omc`, `docs`, `.env`), confirm overwrite/merge interactively. Verify the resulting tree contains `app/`, `package.json`, `tsconfig.json`, `tailwind.config.ts`.

- [ ] **Step 2: Install runtime dependencies**

Run:

```bash
pnpm add better-sqlite3 @google/genai react-markdown remark-gfm
pnpm add -D @types/better-sqlite3 vitest @vitest/ui
```

- [ ] **Step 3: Add `.env.example`**

Create `.env.example`:

```
GEMINI_API_KEY=
SERMON_DB_PATH=./sermon-summary.db
```

- [ ] **Step 4: Add `vitest.config.ts`**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 5: Add scripts to `package.json`**

Open `package.json` and ensure `scripts` contains:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 6: Append to `.gitignore`**

Append the following block to `.gitignore`:

```
# local data
sermon-summary.db
sermon-summary.db-*
.env
```

- [ ] **Step 7: Verify dev server boots**

Run:

```bash
pnpm dev
```

Expected: server starts on `http://localhost:3000`, default Next page renders. Stop with Ctrl-C.

- [ ] **Step 8: Verify Vitest runs (zero tests OK)**

Run:

```bash
pnpm test
```

Expected: "No test files found" or exit 0. Both acceptable — confirms vitest is wired.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js + vitest"
```

---

## Task 2: Define types + DB module

**Files:**
- Create: `lib/types.ts`, `lib/db.ts`, `lib/db.test.ts`

- [ ] **Step 1: Write `lib/types.ts`**

Create `lib/types.ts`:

```ts
export type SermonStatus =
  | 'pending'
  | 'fetching_metadata'
  | 'transcribing'
  | 'summarizing'
  | 'done'
  | 'failed';

export interface Sermon {
  videoId: string;
  url: string;
  status: SermonStatus;
  errorMessage: string | null;
  title: string | null;
  channelName: string | null;
  publishedAt: string | null;
  sermonDate: string | null;
  preacher: string | null;
  bibleReference: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  summaryMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SermonUpdate = Partial<
  Omit<Sermon, 'videoId' | 'url' | 'createdAt'>
>;
```

- [ ] **Step 2: Write the failing test for `lib/db.ts`**

Create `lib/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, createSermon, getSermon, updateSermon } from './db';

describe('db', () => {
  beforeEach(() => {
    process.env.SERMON_DB_PATH = ':memory:';
    createDb({ reset: true });
  });

  it('returns null for unknown videoId', () => {
    expect(getSermon('xxx')).toBeNull();
  });

  it('creates and reads a sermon', () => {
    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    const s = getSermon('abc12345678');
    expect(s).not.toBeNull();
    expect(s!.videoId).toBe('abc12345678');
    expect(s!.status).toBe('pending');
    expect(s!.summaryMarkdown).toBeNull();
  });

  it('updates fields atomically', () => {
    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    updateSermon('abc12345678', { status: 'summarizing', title: 'Test' });
    const s = getSermon('abc12345678');
    expect(s!.status).toBe('summarizing');
    expect(s!.title).toBe('Test');
  });

  it('rejects creating duplicate videoId', () => {
    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    expect(() => createSermon('abc12345678', 'https://x')).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm test lib/db.test.ts
```

Expected: FAIL — `db` module not found.

- [ ] **Step 4: Implement `lib/db.ts`**

Create `lib/db.ts`:

```ts
import Database from 'better-sqlite3';
import type { Sermon, SermonUpdate } from './types';

let _db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sermons (
    videoId TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    errorMessage TEXT,
    title TEXT,
    channelName TEXT,
    publishedAt TEXT,
    sermonDate TEXT,
    preacher TEXT,
    bibleReference TEXT,
    durationSeconds INTEGER,
    transcript TEXT,
    summaryMarkdown TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`;

export function createDb(opts: { reset?: boolean } = {}): Database.Database {
  if (_db && !opts.reset) return _db;
  if (_db) {
    _db.close();
    _db = null;
  }
  const path = process.env.SERMON_DB_PATH ?? './sermon-summary.db';
  _db = new Database(path);
  _db.pragma('journal_mode = WAL');
  _db.exec(SCHEMA);
  return _db;
}

function getDb(): Database.Database {
  return _db ?? createDb();
}

const COLUMNS = [
  'videoId',
  'url',
  'status',
  'errorMessage',
  'title',
  'channelName',
  'publishedAt',
  'sermonDate',
  'preacher',
  'bibleReference',
  'durationSeconds',
  'transcript',
  'summaryMarkdown',
  'createdAt',
  'updatedAt',
] as const;

export function getSermon(videoId: string): Sermon | null {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS.join(', ')} FROM sermons WHERE videoId = ?`)
    .get(videoId) as Sermon | undefined;
  return row ?? null;
}

export function createSermon(videoId: string, url: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sermons (videoId, url, status, createdAt, updatedAt)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .run(videoId, url, now, now);
}

export function updateSermon(videoId: string, fields: SermonUpdate): void {
  const keys = Object.keys(fields) as (keyof SermonUpdate)[];
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] ?? null);
  values.push(new Date().toISOString());
  getDb()
    .prepare(`UPDATE sermons SET ${set}, updatedAt = ? WHERE videoId = ?`)
    .run(...values, videoId);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
pnpm test lib/db.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/db.ts lib/db.test.ts
git commit -m "feat(db): sqlite store for sermon records"
```

---

## Task 3: `extractVideoId` utility

**Files:**
- Create: `lib/youtube.ts`, `lib/youtube.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/youtube.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/youtube.test.ts
```

Expected: FAIL — `extractVideoId` is not defined.

- [ ] **Step 3: Implement `extractVideoId`**

Create `lib/youtube.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
pnpm test lib/youtube.test.ts
```

Expected: all `extractVideoId` cases pass.

- [ ] **Step 5: Commit**

```bash
git add lib/youtube.ts lib/youtube.test.ts
git commit -m "feat(youtube): extractVideoId from various URL forms"
```

---

## Task 4: `parseVtt` — VTT subtitle to plain text

**Files:**
- Modify: `lib/youtube.ts`, `lib/youtube.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `lib/youtube.test.ts`:

```ts
import { parseVtt } from './youtube';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/youtube.test.ts
```

Expected: FAIL — `parseVtt` not defined.

- [ ] **Step 3: Implement `parseVtt`**

Append to `lib/youtube.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
pnpm test lib/youtube.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/youtube.ts lib/youtube.test.ts
git commit -m "feat(youtube): parseVtt strips headers, timestamps, dedupes lines"
```

---

## Task 5: yt-dlp wrappers — metadata + subtitles

**Files:**
- Modify: `lib/youtube.ts`

> Note: these functions shell out to `yt-dlp`. We do **not** unit-test them — we'll smoke-test in Task 11. Keep them thin.

- [ ] **Step 1: Add the metadata fetcher**

Append to `lib/youtube.ts`:

```ts
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
```

- [ ] **Step 2: Add the subtitle fetcher**

Append to `lib/youtube.ts`:

```ts
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
```

- [ ] **Step 3: Type-check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Re-run all unit tests (no regressions)**

Run:

```bash
pnpm test
```

Expected: all previous tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/youtube.ts
git commit -m "feat(youtube): yt-dlp wrappers for metadata and subtitles"
```

---

## Task 6: `parseSermonMetadata` — parse description block

**Files:**
- Create: `lib/metadata.ts`, `lib/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/metadata.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSermonMetadata } from './metadata';

describe('parseSermonMetadata', () => {
  it('parses 분당우리교회 standard format', () => {
    const desc = `2026-04-26
분당우리교회 주일설교
마지막 때와 청지기 정신 (베드로전서 4장 7-11절)
이찬수 목사

#설교 #분당우리교회`;
    expect(parseSermonMetadata(desc)).toEqual({
      sermonDate: '2026-04-26',
      channelName: '분당우리교회',
      title: '마지막 때와 청지기 정신',
      bibleReference: '베드로전서 4장 7-11절',
      preacher: '이찬수 목사',
    });
  });

  it('returns nulls when format does not match', () => {
    const desc = 'just some random video description';
    expect(parseSermonMetadata(desc)).toEqual({
      sermonDate: null,
      channelName: null,
      title: null,
      bibleReference: null,
      preacher: null,
    });
  });

  it('partially fills when only some lines match', () => {
    const desc = `2026-04-26
어떤교회 주일설교`;
    const parsed = parseSermonMetadata(desc);
    expect(parsed.sermonDate).toBe('2026-04-26');
    expect(parsed.channelName).toBe('어떤교회');
    expect(parsed.title).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/metadata.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parseSermonMetadata`**

Create `lib/metadata.ts`:

```ts
export interface SermonMeta {
  sermonDate: string | null;
  channelName: string | null;
  title: string | null;
  bibleReference: string | null;
  preacher: string | null;
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})$/;
const CHANNEL_RE = /^(.+?)\s*주일설교$/;
const TITLE_REF_RE = /^(.+?)\s*\(([^()]+)\)\s*$/;
const PREACHER_RE = /^(.+?\s*목사)$/;

export function parseSermonMetadata(description: string): SermonMeta {
  const meta: SermonMeta = {
    sermonDate: null,
    channelName: null,
    title: null,
    bibleReference: null,
    preacher: null,
  };
  const lines = description
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    if (!meta.sermonDate) {
      const m = line.match(DATE_RE);
      if (m) {
        meta.sermonDate = m[1];
        continue;
      }
    }
    if (!meta.channelName) {
      const m = line.match(CHANNEL_RE);
      if (m) {
        meta.channelName = m[1].trim();
        continue;
      }
    }
    if (!meta.title) {
      const m = line.match(TITLE_REF_RE);
      if (m) {
        meta.title = m[1].trim();
        meta.bibleReference = m[2].trim();
        continue;
      }
    }
    if (!meta.preacher) {
      const m = line.match(PREACHER_RE);
      if (m) {
        meta.preacher = m[1].trim();
        continue;
      }
    }
  }
  return meta;
}
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
pnpm test lib/metadata.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/metadata.ts lib/metadata.test.ts
git commit -m "feat(metadata): parse sermon description into structured fields"
```

---

## Task 7: `summarizeSermon` — Gemini call

**Files:**
- Create: `lib/summarize.ts`, `lib/summarize.test.ts`

- [ ] **Step 1: Write a failing test that mocks the Gemini SDK**

Create `lib/summarize.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: generateContentMock },
  })),
}));

import { summarizeSermon } from './summarize';

describe('summarizeSermon', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns markdown text from Gemini response', async () => {
    generateContentMock.mockResolvedValue({ text: '## 도입\n…요약…' });
    const md = await summarizeSermon({
      transcript: '안녕하세요. 오늘 본문은…',
      meta: { title: '테스트', preacher: null, sermonDate: null, bibleReference: null },
    });
    expect(md).toBe('## 도입\n…요약…');
    expect(generateContentMock).toHaveBeenCalledOnce();
    const args = generateContentMock.mock.calls[0][0];
    expect(args.model).toBe('gemini-3.1-flash-lite-preview');
    expect(args.config.systemInstruction).toMatch(/한국어 설교 요약/);
    expect(typeof args.contents).toBe('string');
    expect(args.contents).toContain('테스트');
    expect(args.contents).toContain('안녕하세요. 오늘 본문은…');
  });

  it('throws if Gemini returns empty text', async () => {
    generateContentMock.mockResolvedValue({ text: '' });
    await expect(
      summarizeSermon({
        transcript: 'x',
        meta: { title: null, preacher: null, sermonDate: null, bibleReference: null },
      }),
    ).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/summarize.test.ts
```

Expected: FAIL — `summarize` module not found.

- [ ] **Step 3: Implement `summarizeSermon`**

Create `lib/summarize.ts`:

```ts
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3.1-flash-lite-preview';

const SYSTEM_PROMPT = `당신은 한국어 설교 요약 전문 어시스턴트입니다.
주어진 자막 텍스트로부터 설교의 핵심 메시지를 충실히 정리하되,
원문에 없는 해석/적용/인사이트를 추가하지 않습니다.

규칙:
- 출력은 마크다운. 섹션은 ## (h2) 사용.
- 섹션 구성은 설교 흐름에 맞게 결정 (예: 도입 / 본론 / 적용 / 결론).
- 본문이 명확히 구조화되어 있으면 그 구조를 따라가고,
  그렇지 않으면 흐름을 살려 재구조화한다.
- 핵심 문장은 > 인용 블록으로.
- 성경 구절 인용은 정확히 보존.
- 출력 길이는 1500~3000 토큰 사이.
- 자막 오인식으로 보이는 부분은 자연스럽게 정정한다.
- 요약 외의 메타 코멘트(예: "이 요약은…")를 쓰지 않는다.`;

export interface SummarizeArgs {
  transcript: string;
  meta: {
    title: string | null;
    bibleReference: string | null;
    preacher: string | null;
    sermonDate: string | null;
  };
}

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export async function summarizeSermon(args: SummarizeArgs): Promise<string> {
  const { transcript, meta } = args;
  const userMessage = `메타데이터:
- 제목: ${meta.title ?? '미상'}
- 본문 구절: ${meta.bibleReference ?? '미상'}
- 설교자: ${meta.preacher ?? '미상'}
- 설교일: ${meta.sermonDate ?? '미상'}

자막:
${transcript}`;

  const response = await client().models.generateContent({
    model: MODEL,
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text ?? '';
  if (!text || text.trim().length < 200) {
    throw new Error('Gemini returned empty or too short summary');
  }
  return text;
}
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
pnpm test lib/summarize.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/summarize.ts lib/summarize.test.ts
git commit -m "feat(summarize): gemini-based sermon summarization"
```

---

## Task 8: `processSermon` — pipeline orchestrator

**Files:**
- Create: `lib/worker.ts`, `lib/worker.test.ts`

- [ ] **Step 1: Write the failing test (mocks all I/O)**

Create `lib/worker.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./youtube', () => ({
  fetchVideoMetadata: vi.fn(),
  fetchSubtitles: vi.fn(),
}));
vi.mock('./summarize', () => ({
  summarizeSermon: vi.fn(),
}));

import { fetchVideoMetadata, fetchSubtitles } from './youtube';
import { summarizeSermon } from './summarize';
import { processSermon } from './worker';
import { createDb, createSermon, getSermon } from './db';

describe('processSermon', () => {
  beforeEach(() => {
    process.env.SERMON_DB_PATH = ':memory:';
    createDb({ reset: true });
    vi.mocked(fetchVideoMetadata).mockReset();
    vi.mocked(fetchSubtitles).mockReset();
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
    vi.mocked(fetchSubtitles).mockResolvedValue('자막 본문 '.repeat(200));
    vi.mocked(summarizeSermon).mockResolvedValue('## 도입\n요약 내용입니다.');

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    const s = getSermon('abc12345678');
    expect(s!.status).toBe('done');
    expect(s!.title).toBe('마지막 때와 청지기 정신');
    expect(s!.bibleReference).toBe('베드로전서 4장 7-11절');
    expect(s!.preacher).toBe('이찬수 목사');
    expect(s!.sermonDate).toBe('2026-04-26');
    expect(s!.channelName).toBe('분당우리교회');
    expect(s!.summaryMarkdown).toContain('## 도입');
    expect(s!.transcript).toMatch(/^자막 본문/);
    expect(s!.errorMessage).toBeNull();
  });

  it('marks failed when subtitles fetch throws', async () => {
    vi.mocked(fetchVideoMetadata).mockResolvedValue({
      id: 'abc12345678',
      title: 't',
      description: '',
      duration: 100,
      channel: 'c',
      upload_date: '20260426',
    });
    vi.mocked(fetchSubtitles).mockRejectedValue(new Error('자막 없음'));

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    const s = getSermon('abc12345678');
    expect(s!.status).toBe('failed');
    expect(s!.errorMessage).toBe('자막 없음');
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
    vi.mocked(fetchSubtitles).mockResolvedValue('짧음');

    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    await processSermon('abc12345678', 'https://youtu.be/abc12345678');

    const s = getSermon('abc12345678');
    expect(s!.status).toBe('failed');
    expect(s!.errorMessage).toMatch(/짧/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test lib/worker.test.ts
```

Expected: FAIL — `worker` module not found.

- [ ] **Step 3: Implement `processSermon`**

Create `lib/worker.ts`:

```ts
import { fetchSubtitles, fetchVideoMetadata } from './youtube';
import { parseSermonMetadata } from './metadata';
import { summarizeSermon } from './summarize';
import { updateSermon } from './db';

const MIN_TRANSCRIPT_LENGTH = 500;

function ytDateToIso(d: string | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export async function processSermon(
  videoId: string,
  url: string,
): Promise<void> {
  try {
    updateSermon(videoId, { status: 'fetching_metadata' });
    const ytMeta = await fetchVideoMetadata(url);
    const parsed = parseSermonMetadata(ytMeta.description);
    updateSermon(videoId, {
      title: parsed.title ?? ytMeta.title,
      channelName: parsed.channelName ?? ytMeta.channel,
      sermonDate: parsed.sermonDate,
      preacher: parsed.preacher,
      bibleReference: parsed.bibleReference,
      durationSeconds: ytMeta.duration,
      publishedAt: ytDateToIso(ytMeta.upload_date),
    });

    updateSermon(videoId, { status: 'transcribing' });
    const transcript = await fetchSubtitles(url);
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      throw new Error('자막이 너무 짧거나 비정상입니다.');
    }
    updateSermon(videoId, { transcript });

    updateSermon(videoId, { status: 'summarizing' });
    const summaryMarkdown = await summarizeSermon({
      transcript,
      meta: {
        title: parsed.title ?? ytMeta.title,
        bibleReference: parsed.bibleReference,
        preacher: parsed.preacher,
        sermonDate: parsed.sermonDate,
      },
    });
    updateSermon(videoId, { summaryMarkdown, status: 'done' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    updateSermon(videoId, { status: 'failed', errorMessage: message });
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
pnpm test lib/worker.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full test suite**

Run:

```bash
pnpm test
```

Expected: all tests across the suite pass.

- [ ] **Step 6: Commit**

```bash
git add lib/worker.ts lib/worker.test.ts
git commit -m "feat(worker): processSermon pipeline orchestrator"
```

---

## Task 9: API routes

**Files:**
- Create: `app/api/summarize/route.ts`, `app/api/sermon/[videoId]/route.ts`

- [ ] **Step 1: Implement `/api/summarize` POST**

Create `app/api/summarize/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { extractVideoId } from '@/lib/youtube';
import { createSermon, getSermon } from '@/lib/db';
import { processSermon } from '@/lib/worker';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }
  const url = (body as { url?: unknown })?.url;
  if (typeof url !== 'string' || url.length === 0) {
    return NextResponse.json({ error: 'url 필드가 필요합니다.' }, { status: 400 });
  }
  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: '유효한 YouTube URL이 아닙니다.' },
      { status: 400 },
    );
  }

  const existing = getSermon(videoId);
  if (!existing) {
    createSermon(videoId, url);
    void processSermon(videoId, url).catch((e) => {
      console.error('[worker]', videoId, e);
    });
  }

  return NextResponse.json({ videoId });
}
```

- [ ] **Step 2: Implement `/api/sermon/[videoId]` GET**

Create `app/api/sermon/[videoId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getSermon } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { videoId: string } },
) {
  const sermon = getSermon(params.videoId);
  if (!sermon) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(sermon);
}
```

- [ ] **Step 3: Type-check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/api
git commit -m "feat(api): summarize + sermon GET endpoints"
```

---

## Task 10: Home page (URL input form)

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css` (Tailwind base already present from scaffold)

- [ ] **Step 1: Replace `app/page.tsx` with the input form**

Overwrite `app/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '요청 실패');
      router.push(`/s/${data.videoId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">
        Sermon Summary
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        YouTube 설교 영상 URL을 붙여넣으면 구조화된 요약을 생성합니다.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="rounded-md border border-gray-300 px-4 py-3 text-base focus:border-black focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-black px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? '요청 중…' : '요약하기'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Smoke test the home page**

Run:

```bash
pnpm dev
```

Open `http://localhost:3000`. Confirm: form renders, "요약하기" button visible, no console errors. Stop with Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): home page with url input"
```

---

## Task 11: Result page (polling + summary view)

**Files:**
- Create: `app/s/[videoId]/page.tsx`

- [ ] **Step 1: Implement the result page**

Create `app/s/[videoId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Sermon } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  fetching_metadata: '영상 정보를 가져오는 중',
  transcribing: '자막을 가져오는 중',
  summarizing: '요약을 생성하는 중',
};

export default function SermonPage({
  params,
}: {
  params: { videoId: string };
}) {
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/sermon/${params.videoId}`);
        if (!res.ok) throw new Error('요약 정보를 불러오지 못했습니다.');
        const data: Sermon = await res.json();
        if (cancelled) return;
        setSermon(data);
        if (data.status !== 'done' && data.status !== 'failed') {
          timer = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [params.videoId]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }
  if (!sermon) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-gray-500">
        불러오는 중…
      </main>
    );
  }

  if (sermon.status !== 'done' && sermon.status !== 'failed') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-gray-700">
          {STATUS_LABELS[sermon.status] ?? sermon.status}…
        </p>
        <p className="mt-2 text-sm text-gray-400">
          처리에는 보통 30초 이내 소요됩니다.
        </p>
      </main>
    );
  }

  if (sermon.status === 'failed') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-4 text-xl font-semibold">처리 실패</h1>
        <p className="text-red-600">{sermon.errorMessage ?? '알 수 없는 오류'}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 rounded-lg border border-gray-200 p-6">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">
          {sermon.title ?? '제목 미상'}
        </h1>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {sermon.bibleReference && (
            <>
              <dt className="text-gray-500">본문</dt>
              <dd>{sermon.bibleReference}</dd>
            </>
          )}
          {sermon.preacher && (
            <>
              <dt className="text-gray-500">설교자</dt>
              <dd>{sermon.preacher}</dd>
            </>
          )}
          {sermon.channelName && (
            <>
              <dt className="text-gray-500">교회</dt>
              <dd>{sermon.channelName}</dd>
            </>
          )}
          {sermon.sermonDate && (
            <>
              <dt className="text-gray-500">설교일</dt>
              <dd>{sermon.sermonDate}</dd>
            </>
          )}
        </dl>
        <a
          href={sermon.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm text-gray-600 underline"
        >
          원본 영상 ↗
        </a>
      </header>

      <article className="prose prose-neutral max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {sermon.summaryMarkdown ?? ''}
        </ReactMarkdown>
      </article>

      <footer className="mt-12 border-t border-gray-200 pt-4 text-xs text-gray-400">
        마지막 갱신: {sermon.updatedAt}
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Add Tailwind typography plugin**

Run:

```bash
pnpm add -D @tailwindcss/typography
```

Modify `tailwind.config.ts` — add `require('@tailwindcss/typography')` to the `plugins` array. Resulting plugins line:

```ts
plugins: [require('@tailwindcss/typography')],
```

- [ ] **Step 3: Type-check**

Run:

```bash
pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/s tailwind.config.ts package.json pnpm-lock.yaml
git commit -m "feat(ui): result page with polling + markdown render"
```

---

## Task 12: End-to-end smoke test + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Run end-to-end smoke test against a real sermon video**

Confirm `GEMINI_API_KEY` is set in `.env.local`:

```bash
cp .env.example .env.local
# edit .env.local to add the actual GEMINI_API_KEY
```

Run:

```bash
pnpm dev
```

In the browser:
1. Open `http://localhost:3000`
2. Paste a real 분당우리교회 sermon URL (e.g. one from the playlist `PLn3gC0zxOsmwrme5FuzqiY1FMpw6pGtiD`)
3. Submit
4. Confirm status transitions: `pending` → `fetching_metadata` → `transcribing` → `summarizing` → `done`
5. Confirm result page shows: title, bibleReference, preacher, sermonDate, channelName, original video link, structured markdown summary

Acceptance criteria:
- Status reaches `done` within ~60s
- Title parsed correctly
- Summary contains 3+ `##` sections
- Summary contains zero "이 요약은…" / "AI가 생성한…" meta-comments
- Re-submitting the same URL goes straight to the result (DB cache hit)

If any criterion fails, debug — don't paper over with a quick fix in this plan.

- [ ] **Step 2: Write `README.md`**

Create `README.md`:

````markdown
# Sermon Summary

YouTube 설교 영상 URL을 붙여넣으면 Gemini가 한국어 자막을 기반으로 구조화된 요약을 생성합니다.

## Requirements

- Node 20+
- pnpm 9+
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`)
- Gemini API key

## Setup

```bash
pnpm install
cp .env.example .env.local
# edit .env.local: set GEMINI_API_KEY
pnpm dev
```

Open <http://localhost:3000>.

## Tests

```bash
pnpm test
```

## How it works

1. URL submitted → `videoId` extracted
2. DB checked for cache hit
3. New record → async pipeline:
   - `yt-dlp --dump-json` for metadata
   - Description parsed for sermon-specific fields
   - `yt-dlp --write-auto-sub --sub-lang ko` for Korean auto-subtitles
   - VTT parsed to plain transcript
   - Gemini `gemini-3.1-flash-lite-preview` produces structured markdown summary
4. Client polls `/api/sermon/<videoId>` every 1.5s until `done`/`failed`
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with setup + how-it-works"
```

---

## Self-Review

After completing all tasks above, verify:

- [ ] **Spec coverage**:
  - §2 user flow → Task 9, 10, 11
  - §3 result page layout → Task 11
  - §4.1 frontend → Task 10, 11
  - §4.2 API → Task 9
  - §4.3 worker → Task 8
  - §4.4 DB → Task 2
  - §5 state machine → Task 8
  - §6 LLM prompt → Task 7
  - §7 metadata parsing → Task 6
  - §8 error handling → Task 8 (failure paths) + Task 9, 11 (UI display)
  - §9 testing → Tasks 2-8 (unit) + Task 12 (E2E)
  - §10 stack → Task 1
  - §11 directory structure → all tasks
- [ ] **No placeholders**: all tasks contain executable code/commands.
- [ ] **Type consistency**: `Sermon` shape and `SermonStatus` values consistent across `lib/types.ts`, `lib/db.ts`, `lib/worker.ts`, `app/s/[videoId]/page.tsx`.
- [ ] **Commands runnable**: every Run command is concrete (no placeholders like `<videoId>` in test commands).

---
