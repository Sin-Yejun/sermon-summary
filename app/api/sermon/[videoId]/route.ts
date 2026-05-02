import { NextResponse } from 'next/server';
import { deleteSermon, getSermon } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const sermon = getSermon(videoId);
  if (!sermon) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(sermon);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  deleteSermon(videoId);
  return NextResponse.json({ ok: true });
}
