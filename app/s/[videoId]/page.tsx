'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, fmtTs } from '@/lib/format';
import type {
  Sermon,
  SummaryBullet,
  SummaryDoc,
  SummarySubsection,
  TranscriptSegment,
} from '@/lib/types';

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>,
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  getCurrentTime?: () => number;
  destroy?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기 중',
  fetching_metadata: '영상 정보를 가져오는 중',
  transcribing: '자막을 가져오는 중',
  summarizing: '요약을 생성하는 중',
};

function BackLink({ weekOf }: { weekOf?: string | null }) {
  const href = weekOf ? `/week/${weekOf}` : '/';
  const label = weekOf ? `← ${weekOf} 주차` : '← 홈';
  return (
    <Link
      href={href}
      className="inline-block text-sm text-gray-500 hover:text-gray-900 hover:underline"
    >
      {label}
    </Link>
  );
}

function StatusShell({
  weekOf,
  children,
}: {
  weekOf?: string | null;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <BackLink weekOf={weekOf} />
      <div className="mt-6">{children}</div>
    </main>
  );
}

interface SegmentGroup {
  ts: number;
  text: string;
  startIdx: number;
  endIdx: number;
}

function groupSegments(segs: TranscriptSegment[]): {
  groups: SegmentGroup[];
  idxToGroup: Map<number, number>;
} {
  const groups: SegmentGroup[] = [];
  const idxToGroup = new Map<number, number>();
  let cur: SegmentGroup | null = null;

  const flush = () => {
    if (!cur) return;
    for (let i = cur.startIdx; i <= cur.endIdx; i++) {
      idxToGroup.set(i, groups.length);
    }
    groups.push(cur);
    cur = null;
  };

  for (const s of segs) {
    if (!cur) {
      cur = { ts: s.ts, text: s.text, startIdx: s.idx, endIdx: s.idx };
    } else {
      cur.text = `${cur.text} ${s.text}`.trim();
      cur.endIdx = s.idx;
    }
    const endsSentence = /[.!?。！？]\s*$/.test(s.text);
    const tooLong = cur.text.length >= 90;
    if (endsSentence || tooLong) flush();
  }
  flush();
  return { groups, idxToGroup };
}

function loadYTApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[data-yt-api]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.dataset.ytApi = '1';
      document.head.appendChild(tag);
    }
  });
}

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
        if (!cancelled) setError(errorMessage(e));
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
      <StatusShell>
        <p className="text-red-600">{error}</p>
      </StatusShell>
    );
  }
  if (!sermon) {
    return (
      <StatusShell>
        <p className="text-gray-500">불러오는 중…</p>
      </StatusShell>
    );
  }
  if (sermon.status === 'failed') {
    return (
      <StatusShell weekOf={sermon.weekOf}>
        <h1 className="mb-4 text-xl font-semibold">처리 실패</h1>
        <p className="text-red-600">{sermon.errorMessage ?? '알 수 없는 오류'}</p>
      </StatusShell>
    );
  }
  if (sermon.status !== 'done') {
    return (
      <StatusShell weekOf={sermon.weekOf}>
        <p className="text-gray-700">
          {STATUS_LABELS[sermon.status] ?? sermon.status}…
        </p>
        <p className="mt-2 text-sm text-gray-400">
          처리에는 보통 1~2분 정도 소요됩니다.
        </p>
      </StatusShell>
    );
  }

  return <DoneView sermon={sermon} />;
}

function DoneView({ sermon }: { sermon: Sermon }) {
  const summaryDoc = useMemo<SummaryDoc | null>(() => {
    if (!sermon.summaryJson) return null;
    try {
      return JSON.parse(sermon.summaryJson) as SummaryDoc;
    } catch {
      return null;
    }
  }, [sermon.summaryJson]);

  const segments = useMemo<TranscriptSegment[]>(() => {
    if (!sermon.transcriptSegments) return [];
    try {
      return JSON.parse(sermon.transcriptSegments) as TranscriptSegment[];
    } catch {
      return [];
    }
  }, [sermon.transcriptSegments]);

  const groups = useMemo(() => groupSegments(segments).groups, [segments]);

  const playerRef = useRef<YTPlayer | null>(null);
  const playerElRef = useRef<HTMLDivElement | null>(null);
  const transcriptPanelRef = useRef<HTMLDivElement | null>(null);
  const groupRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [highlightGroup, setHighlightGroup] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    loadYTApi().then(() => {
      if (!mounted || !playerElRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(playerElRef.current, {
        videoId: sermon.videoId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
      });
    });
    return () => {
      mounted = false;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [sermon.videoId]);

  const seekTo = useCallback((ts: number) => {
    const p = playerRef.current;
    if (p?.seekTo) {
      p.seekTo(ts, true);
      p.playVideo?.();
    }
  }, []);

  const scrollToGroup = useCallback((gi: number) => {
    setHighlightGroup(gi);
    const el = groupRefs.current.get(gi);
    const panel = transcriptPanelRef.current;
    if (el && panel) {
      const top = el.offsetTop - panel.clientHeight / 3;
      panel.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  const jumpToGroup = useCallback(
    (gi: number) => {
      const g = groups[gi];
      if (!g) return;
      seekTo(g.ts);
      scrollToGroup(gi);
    },
    [groups, seekTo, scrollToGroup],
  );

  const jumpToTimestamp = useCallback(
    (ts: number) => {
      seekTo(ts);
      let gi = -1;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].ts <= ts) gi = i;
        else break;
      }
      if (gi >= 0) scrollToGroup(gi);
    },
    [groups, seekTo, scrollToGroup],
  );

  useEffect(() => {
    if (groups.length === 0) return;
    let lastCt = -1;
    const id = setInterval(() => {
      const p = playerRef.current;
      const ct = p?.getCurrentTime?.();
      if (typeof ct !== 'number' || Number.isNaN(ct)) return;
      if (ct === lastCt) return;
      lastCt = ct;
      let gi = -1;
      for (let i = 0; i < groups.length; i++) {
        if (groups[i].ts <= ct) gi = i;
        else break;
      }
      if (gi < 0) return;
      setHighlightGroup((prev) => (prev === gi ? prev : gi));
      const el = groupRefs.current.get(gi);
      const panel = transcriptPanelRef.current;
      if (!el || !panel) return;
      const relTop = el.offsetTop - panel.scrollTop;
      if (relTop > panel.clientHeight * 0.6 || relTop < 0) {
        panel.scrollTo({
          top: el.offsetTop - panel.clientHeight / 3,
          behavior: 'smooth',
        });
      }
    }, 500);
    return () => clearInterval(id);
  }, [groups]);

  return (
    <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 pt-6 pb-24 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <div className="mb-3">
          <BackLink weekOf={sermon.weekOf} />
        </div>
        <SermonHeader sermon={sermon} />

        <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-black aspect-video">
          <div ref={playerElRef} className="h-full w-full" />
        </div>

        {summaryDoc ? (
          <SummaryView doc={summaryDoc} onSeek={jumpToTimestamp} />
        ) : (
          <p className="text-sm text-gray-500">요약 데이터가 없습니다.</p>
        )}
      </div>

      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <TranscriptPanel
          panelRef={transcriptPanelRef}
          groupRefs={groupRefs}
          groups={groups}
          highlightGroup={highlightGroup}
          onClick={jumpToGroup}
        />
      </aside>
    </main>
  );
}

function SermonHeader({ sermon }: { sermon: Sermon }) {
  return (
    <header className="mb-6 rounded-lg border border-gray-200 p-5">
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
  );
}

function SummaryView({
  doc,
  onSeek,
}: {
  doc: SummaryDoc;
  onSeek: (ts: number) => void;
}) {
  return (
    <article className="space-y-10">
      {doc.tldr && (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <p className="text-sm leading-relaxed text-gray-800">{doc.tldr}</p>
        </section>
      )}

      <nav className="rounded-lg border border-gray-200 p-5">
        <h2 className="mb-3 text-base font-semibold">목차</h2>
        <ul className="space-y-1 text-sm text-gray-600">
          {doc.sections.map((sec) => (
            <li key={sec.id}>
              <a href={`#sec-${sec.id}`} className="hover:underline">
                {sec.id}. {sec.title}
              </a>
              {sec.subsections.length > 0 && (
                <ul className="ml-4 mt-1 space-y-1">
                  {sec.subsections.map((sub) => (
                    <li key={sub.id}>
                      <a
                        href={`#sub-${sub.id}`}
                        className="text-gray-500 hover:underline"
                      >
                        {sub.id}. {sub.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {doc.sections.map((sec) => (
        <section
          key={sec.id}
          id={`sec-${sec.id}`}
          className="scroll-mt-4 space-y-6"
        >
          <h2 className="text-xl font-semibold">
            {sec.id}. {sec.title}
          </h2>
          {sec.subsections.map((sub) => (
            <Subsection key={sub.id} sub={sub} onSeek={onSeek} />
          ))}
        </section>
      ))}
    </article>
  );
}

function Subsection({
  sub,
  onSeek,
}: {
  sub: SummarySubsection;
  onSeek: (ts: number) => void;
}) {
  return (
    <div id={`sub-${sub.id}`} className="scroll-mt-4">
      <h3 className="mb-2 flex items-baseline gap-2 text-lg font-semibold">
        <span>
          {sub.id}. {sub.title}
        </span>
        <button
          type="button"
          onClick={() => onSeek(sub.startTs)}
          className="font-mono text-xs font-normal text-blue-600 hover:underline"
          aria-label={`${fmtTs(sub.startTs)}로 이동`}
        >
          {fmtTs(sub.startTs)}
        </button>
      </h3>
      <ul className="space-y-2 text-sm leading-relaxed">
        {sub.bullets.map((b, i) => (
          <BulletItem key={i} bullet={b} />
        ))}
      </ul>
    </div>
  );
}

function BulletItem({ bullet }: { bullet: SummaryBullet }) {
  return (
    <li className="ml-5 list-disc pl-1">
      <span className="font-medium text-gray-900">{bullet.text}</span>
      {bullet.subBullets && bullet.subBullets.length > 0 && (
        <ul className="mt-1 space-y-1">
          {bullet.subBullets.map((sb, i) => (
            <li key={i} className="ml-5 list-disc pl-1">
              <span className="text-gray-700">{sb.text}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function TranscriptPanel({
  panelRef,
  groupRefs,
  groups,
  highlightGroup,
  onClick,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  groupRefs: React.RefObject<Map<number, HTMLButtonElement>>;
  groups: SegmentGroup[];
  highlightGroup: number | null;
  onClick: (gi: number) => void;
}) {
  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold">
        스크립트
      </div>
      <div ref={panelRef} className="flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-xs text-gray-400">스크립트가 없습니다.</p>
        ) : (
          <ul className="space-y-0.5">
            {groups.map((g, gi) => (
              <li key={gi}>
                <button
                  ref={(el) => {
                    if (el) groupRefs.current?.set(gi, el);
                    else groupRefs.current?.delete(gi);
                  }}
                  type="button"
                  onClick={() => onClick(gi)}
                  className={`flex w-full gap-3 rounded px-2 py-2 text-left text-sm leading-relaxed transition ${
                    highlightGroup === gi
                      ? 'bg-blue-50 text-blue-900'
                      : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <span className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-gray-400">
                    {fmtTs(g.ts)}
                  </span>
                  <span className="flex-1">{g.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
