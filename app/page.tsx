import { redirect } from 'next/navigation';
import { listWeeks } from '@/lib/db';
import LibraryShell from './library-shell';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const weeks = listWeeks();
  if (weeks.length > 0) {
    redirect(`/week/${weeks[0].weekOf}`);
  }
  return (
    <LibraryShell weeks={weeks}>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">
          아직 비어있어요
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            config/playlists.json
          </code>{' '}
          에 교회를 등록한 뒤{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            POST /api/ingest
          </code>{' '}
          를 호출하면 이번 주 설교가 채워집니다.
        </p>
      </div>
    </LibraryShell>
  );
}
