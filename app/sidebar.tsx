'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { WeekBucket } from '@/lib/db';

export default function Sidebar({ weeks }: { weeks: WeekBucket[] }) {
  const pathname = usePathname();
  const currentWeek = pathname.startsWith('/week/')
    ? decodeURIComponent(pathname.slice('/week/'.length))
    : null;

  return (
    <aside className="border-b border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="px-5 py-5">
        <Link
          href="/"
          className="block text-lg font-semibold tracking-tight"
        >
          Sermon Summary
        </Link>
        <p className="mt-1 text-xs text-gray-500">설교 요약 라이브러리</p>
      </div>

      <nav className="px-3 pb-4">
        <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          주차
        </h2>
        {weeks.length === 0 ? (
          <p className="px-2 text-xs text-gray-400">아직 없음</p>
        ) : (
          <ul className="space-y-0.5">
            {weeks.map((w) => {
              const active = currentWeek === w.weekOf;
              return (
                <li key={w.weekOf}>
                  <Link
                    href={`/week/${w.weekOf}`}
                    className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition ${
                      active
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="font-mono">{w.weekOf}</span>
                    <span
                      className={`text-xs ${
                        active ? 'text-gray-300' : 'text-gray-400'
                      }`}
                    >
                      {w.count}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      <div className="border-t border-gray-200 px-5 py-4">
        <Link
          href="/manual"
          className="text-xs text-gray-500 hover:underline"
        >
          수동 추가 →
        </Link>
      </div>
    </aside>
  );
}
