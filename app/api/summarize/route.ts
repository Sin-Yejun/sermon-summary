import { NextResponse } from 'next/server';
import { extractVideoId } from '@/lib/youtube';
import { createSermon, getSermon, updateSermon } from '@/lib/db';
import { processSermon } from '@/lib/worker';
import type { Sermon } from '@/lib/types';

export const runtime = 'nodejs';

function isStale(s: Sermon): boolean {
  if (s.status === 'failed') return true;
  if (s.status !== 'done') return false;
  if (!s.summaryJson || !s.transcriptSegments) return true;
  if (/&(?:gt|lt|amp);/.test(s.transcriptSegments)) return true;
  if (!s.summaryJson.includes('coveredIdxRange') && !s.summaryJson.includes('startTs')) {
    return true;
  }
  return false;
}

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
  } else if (isStale(existing)) {
    updateSermon(videoId, { status: 'pending', errorMessage: null });
    void processSermon(videoId, url).catch((e) => {
      console.error('[worker]', videoId, e);
    });
  }

  return NextResponse.json({ videoId });
}
