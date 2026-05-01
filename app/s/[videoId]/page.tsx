'use client';

import { use, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Sermon } from '@/lib/types';

const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  fetching_metadata: '영상 정보를 가져오는 중',
  transcribing: '자막을 가져오는 중',
  summarizing: '요약을 생성하는 중',
};

export default function SermonPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = use(params);
  const [sermon, setSermon] = useState<Sermon | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/sermon/${videoId}`);
        if (!res.ok) throw new Error('요약 정보를 불러오지 못했습니다.');
        const data: Sermon = await res.json();
        if (cancelled) return;
        setSermon(data);
        if (data.status !== 'done' && data.status !== 'failed') {
          timer = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [videoId]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-red-600">{error}</main>
    );
  }
  if (!sermon) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-gray-500">
        불러오는 중…
      </main>
    );
  }

  if (sermon.status !== 'done' && sermon.status !== 'failed') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-gray-700">
          {STATUS_LABELS[sermon.status] ?? sermon.status}…
        </p>
        <p className="mt-2 text-sm text-gray-400">
          처리에는 보통 30초 이내 소요됩니다.
        </p>
      </main>
    );
  }

  if (sermon.status === 'failed') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mb-4 text-xl font-semibold">처리 실패</h1>
        <p className="text-red-600">{sermon.errorMessage ?? '알 수 없는 오류'}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 rounded-lg border border-gray-200 p-6">
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">
          {sermon.title ?? '제목 미상'}
        </h1>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {sermon.bibleReference && (
            <>
              <dt className="text-gray-500">본문</dt>
              <dd>{sermon.bibleReference}</dd>
            </>
          )}
          {sermon.preacher && (
            <>
              <dt className="text-gray-500">설교자</dt>
              <dd>{sermon.preacher}</dd>
            </>
          )}
          {sermon.channelName && (
            <>
              <dt className="text-gray-500">교회</dt>
              <dd>{sermon.channelName}</dd>
            </>
          )}
          {sermon.sermonDate && (
            <>
              <dt className="text-gray-500">설교일</dt>
              <dd>{sermon.sermonDate}</dd>
            </>
          )}
        </dl>
        <a
          href={sermon.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm text-gray-600 underline"
        >
          원본 영상 ↗
        </a>
      </header>

      <article className="prose prose-neutral max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {sermon.summaryMarkdown ?? ''}
        </ReactMarkdown>
      </article>

      <footer className="mt-12 border-t border-gray-200 pt-4 text-xs text-gray-400">
        마지막 갱신: {sermon.updatedAt}
      </footer>
    </main>
  );
}
