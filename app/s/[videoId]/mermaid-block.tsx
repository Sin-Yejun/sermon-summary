'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { errorMessage } from '@/lib/format';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'strict',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", sans-serif',
        themeVariables: {
          primaryColor: '#eff6ff',
          primaryTextColor: '#111827',
          primaryBorderColor: '#93c5fd',
          lineColor: '#9ca3af',
          fontSize: '13px',
        },
      });
      return m;
    });
  }
  return mermaidPromise;
}

export function MermaidBlock({ source }: { source: string }) {
  const rawId = useId();
  const id = `m-${rawId.replace(/:/g, '')}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadMermaid()
      .then(async (mermaid) => {
        const ok = await mermaid.parse(source, { suppressErrors: true });
        if (ok === false) {
          throw new Error('잘못된 다이어그램 문법');
        }
        return mermaid.render(id, source);
      })
      .then((rendered) => {
        if (cancelled || !rendered || !containerRef.current) return;
        containerRef.current.innerHTML = rendered.svg;
      })
      .catch((e) => {
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (cancelled) return;
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        다이어그램 렌더 실패: {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-3 flex justify-center overflow-x-auto rounded-md border border-gray-200 bg-gray-50/40 px-3 py-4"
    />
  );
}
