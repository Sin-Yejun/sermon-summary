'use client';

import { useEffect, useState } from 'react';
import SermonCard, { type Density } from '@/app/sermon-card';
import type { Church } from '@/lib/playlists';
import type { Sermon } from '@/lib/types';

const STORAGE_KEY = 'sermon:density';

const GRID_CLASS: Record<Density, string> = {
  comfortable: 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3',
  compact: 'grid grid-cols-2 gap-3 sm:grid-cols-3',
};

export default function WeekView({
  weekOf,
  sermons,
  churches,
}: {
  weekOf: string;
  sermons: Sermon[];
  churches: Church[];
}) {
  const [density, setDensity] = useState<Density>('compact');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'comfortable' || stored === 'compact') setDensity(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, density);
  }, [density]);

  const byChurch = new Map<string, Sermon[]>();
  for (const s of sermons) {
    const key = s.playlistId ?? '__orphan__';
    if (!byChurch.has(key)) byChurch.set(key, []);
    byChurch.get(key)!.push(s);
  }
  const orphans = byChurch.get('__orphan__') ?? [];

  const churchNameById = new Map(churches.map((c) => [c.id, c.name]));

  const showEmpty = churches.length === 0 && orphans.length === 0;
  const gridClass = GRID_CLASS[density];

  return (
    <div className="px-6 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">
            {weekOf} 주차
          </h1>
          <p className="text-sm text-gray-500">{sermons.length}개의 설교</p>
        </div>
        <div
          role="group"
          aria-label="보기 밀도"
          className="flex shrink-0 overflow-hidden rounded-md border border-gray-200 text-xs"
        >
          <button
            type="button"
            onClick={() => setDensity('compact')}
            aria-pressed={density === 'compact'}
            className={`px-3 py-1.5 transition ${
              density === 'compact'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            그리드 뷰
          </button>
          <button
            type="button"
            onClick={() => setDensity('comfortable')}
            aria-pressed={density === 'comfortable'}
            className={`border-l border-gray-200 px-3 py-1.5 transition ${
              density === 'comfortable'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            교회별 보기
          </button>
        </div>
      </div>

      {showEmpty ? (
        <p className="text-sm text-gray-500">
          config/playlists.json에 교회를 등록하면 여기 표시됩니다.
        </p>
      ) : density === 'compact' ? (
        <ul className={gridClass}>
          {sermons.map((s) => (
            <SermonCard
              key={s.videoId}
              sermon={s}
              density={density}
              churchName={
                s.playlistId ? churchNameById.get(s.playlistId) : undefined
              }
            />
          ))}
        </ul>
      ) : (
        <div className="space-y-10">
          {churches.map((church) => {
            const list = byChurch.get(church.id) ?? [];
            return (
              <section key={church.id}>
                <h2 className="mb-3 text-base font-semibold">{church.name}</h2>
                {list.length === 0 ? (
                  <p className="px-1 text-xs text-gray-400">이번 주 미발표</p>
                ) : (
                  <ul className={gridClass}>
                    {list.map((s) => (
                      <SermonCard
                        key={s.videoId}
                        sermon={s}
                        density={density}
                        churchName={church.name}
                      />
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
              <ul className={gridClass}>
                {orphans.map((s) => (
                  <SermonCard key={s.videoId} sermon={s} density={density} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
