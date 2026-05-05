import { listSermonCardsByWeek, listWeeks } from '@/lib/db';
import { loadChurches, type Church } from '@/lib/playlists';
import LibraryShell from '@/app/library-shell';
import WeekView from './week-view';

export const dynamic = 'force-dynamic';

export default async function WeekPage({
  params,
}: {
  params: Promise<{ weekOf: string }>;
}) {
  const { weekOf } = await params;
  const weeks = listWeeks();
  const sermons = listSermonCardsByWeek(weekOf);
  let churches: Church[] = [];
  try {
    churches = loadChurches();
  } catch (e) {
    console.error('[playlists]', e);
  }

  return (
    <LibraryShell weeks={weeks}>
      <WeekView weekOf={weekOf} sermons={sermons} churches={churches} />
    </LibraryShell>
  );
}
