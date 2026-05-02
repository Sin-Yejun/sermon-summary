import SermonCard from '@/app/sermon-card';
import type { Church } from '@/lib/playlists';
import type { Sermon } from '@/lib/types';

export default function WeekView({
  weekOf,
  sermons,
  churches,
}: {
  weekOf: string;
  sermons: Sermon[];
  churches: Church[];
}) {
  const byChurch = new Map<string, Sermon[]>();
  for (const s of sermons) {
    const key = s.playlistId ?? '__orphan__';
    if (!byChurch.has(key)) byChurch.set(key, []);
    byChurch.get(key)!.push(s);
  }
  const orphans = byChurch.get('__orphan__') ?? [];

  const showEmpty = churches.length === 0 && orphans.length === 0;

  return (
    <div className="px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {weekOf} 주차
      </h1>
      <p className="mb-8 text-sm text-gray-500">{sermons.length}개의 설교</p>

      {showEmpty ? (
        <p className="text-sm text-gray-500">
          config/playlists.json에 교회를 등록하면 여기 표시됩니다.
        </p>
      ) : (
        <div className="space-y-10">
          {churches.map((church) => {
            const list = byChurch.get(church.id) ?? [];
            return (
              <section key={church.id}>
                <h2 className="mb-3 flex items-baseline gap-2">
                  <span className="text-base font-semibold">{church.name}</span>
                  <span className="text-xs text-gray-400">
                    {church.shortName}
                  </span>
                </h2>
                {list.length === 0 ? (
                  <p className="px-1 text-xs text-gray-400">이번 주 미발표</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((s) => (
                      <SermonCard key={s.videoId} sermon={s} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {orphans.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-gray-500">
                기타 (재생목록 미연결)
              </h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {orphans.map((s) => (
                  <SermonCard key={s.videoId} sermon={s} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
