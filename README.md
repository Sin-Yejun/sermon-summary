# Sermon Summary

YouTube 설교 영상 URL을 붙여넣으면 Gemini가 한국어 자막을 기반으로 구조화된 요약을 생성합니다.

## Requirements

- Node 20+
- pnpm 10+
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
   - Description parsed for sermon-specific fields (date, 본문구절, 설교자, 교회)
   - `yt-dlp --write-auto-sub --sub-lang ko` for Korean auto-subtitles
   - VTT parsed to plain transcript
   - Gemini `gemini-3.1-flash-lite-preview` produces structured markdown summary
4. Client polls `/api/sermon/<videoId>` every 1.5s until `done`/`failed`

## Smoke test (manual)

After setup, with `yt-dlp` installed and `GEMINI_API_KEY` set:

1. Run `pnpm dev` and open <http://localhost:3000>
2. Paste a real 분당우리교회 sermon URL (e.g. from playlist `PLn3gC0zxOsmwrme5FuzqiY1FMpw6pGtiD`)
3. Submit. Status should transition: `pending` → `fetching_metadata` → `transcribing` → `summarizing` → `done`
4. Confirm result page shows: title, bibleReference, preacher, sermonDate, channelName, original video link, structured markdown summary
5. Re-submit the same URL → should jump straight to the result (DB cache hit)

Acceptance:
- Status reaches `done` within ~60s
- Title parsed correctly
- Summary contains 3+ `##` sections
- Summary contains zero "이 요약은…" / "AI가 생성한…" meta-comments
