import { NextResponse } from 'next/server';
import { ingestAll } from '@/lib/ingest';
import { errorMessage } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

function authorized(req: Request): boolean {
  const token = process.env.SERMON_INGEST_TOKEN;
  if (!token) return true;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${token}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const results = await ingestAll();
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
