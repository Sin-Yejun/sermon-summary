/**
 * PoC 스모크: 유튜브 URL → 오디오 추출 → Gemini 전사 → TranscriptSegment[] 출력.
 *
 * 사용:
 *   pnpm tsx scripts/transcribe-smoke.ts <youtube-url>
 *
 * 필요:
 *   - yt-dlp, ffmpeg 시스템에 설치
 *   - GEMINI_API_KEY 환경변수
 */
import { transcribeFromUrl } from '../lib/transcribe';
import { formatUsage } from '../lib/pricing';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('usage: tsx scripts/transcribe-smoke.ts <youtube-url>');
    process.exit(1);
  }
  const t0 = Date.now();
  console.error(`[transcribe-smoke] URL: ${url}`);
  const { segments, usage } = await transcribeFromUrl(url);
  const elapsedMs = Date.now() - t0;
  console.error(
    `[transcribe-smoke] segments=${segments.length}, elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
  );
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    console.error(
      `[transcribe-smoke] first ts=${segments[0].ts}, last ts=${last.ts} (≈${Math.floor(last.ts / 60)}분)`,
    );
  }
  console.error(`[transcribe-smoke] cost: ${formatUsage(usage)}`);
  process.stdout.write(JSON.stringify(segments, null, 2) + '\n');
}

main().catch((e) => {
  console.error('[transcribe-smoke] FAIL:', e);
  process.exit(1);
});
