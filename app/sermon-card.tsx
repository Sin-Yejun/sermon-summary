'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SermonCardData } from '@/lib/types';

export type Density = 'comfortable' | 'compact';

const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  fetching_metadata: '영상 정보 가져오는 중',
  transcribing: '자막 가져오는 중',
  summarizing: '요약 생성 중',
  failed: '실패',
};

export default function SermonCard({
  sermon,
  density = 'comfortable',
  churchName,
}: {
  sermon: SermonCardData;
  density?: Density;
  churchName?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const isDone = sermon.status === 'done';
  const statusLabel = isDone
    ? null
    : STATUS_LABELS[sermon.status] ?? sermon.status;
  const compact = density === 'compact';
  const tldr = compact ? null : sermon.summaryTldr?.trim() || null;

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`"${sermon.title ?? sermon.videoId}" 를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/sermon/${sermon.videoId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('삭제 실패');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <li className="relative">
      <Link
        href={`/s/${sermon.videoId}`}
        className="group block overflow-hidden rounded-lg border border-gray-200 transition hover:border-gray-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${sermon.videoId}/mqdefault.jpg`}
          alt=""
          className="aspect-video w-full bg-gray-100 object-cover"
        />
        <div className={compact ? 'p-2' : 'p-3'}>
          <h3
            className={`mb-1 line-clamp-2 font-semibold leading-snug ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {sermon.title ?? '제목 미상'}
          </h3>
          {!compact && sermon.bibleReference && (
            <p className="mb-1 line-clamp-1 text-xs font-medium text-gray-700">
              {sermon.bibleReference}
            </p>
          )}
          <dl className="text-xs text-gray-500">
            {!compact && sermon.preacher && (
              <dd className="line-clamp-1">{sermon.preacher}</dd>
            )}
            {churchName && <dd className="line-clamp-1">{churchName}</dd>}
            {sermon.sermonDate && <dd>{sermon.sermonDate}</dd>}
          </dl>
          {tldr && (
            <p className="mt-2 line-clamp-3 border-t border-gray-100 pt-2 text-xs leading-relaxed text-gray-600">
              {tldr}
            </p>
          )}
          {statusLabel && (
            <p
              className={`mt-2 text-xs ${
                sermon.status === 'failed' ? 'text-red-600' : 'text-blue-600'
              }`}
            >
              {statusLabel}…
            </p>
          )}
        </div>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="삭제"
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm font-medium text-white opacity-0 transition hover:bg-black/80 group-focus-within:opacity-100 disabled:opacity-50 [li:hover_&]:opacity-100"
      >
        {deleting ? '…' : '×'}
      </button>
    </li>
  );
}
