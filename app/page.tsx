'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? '요청 실패');
      router.push(`/s/${data.videoId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">
        Sermon Summary
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        YouTube 설교 영상 URL을 붙여넣으면 구조화된 요약을 생성합니다.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="rounded-md border border-gray-300 px-4 py-3 text-base focus:border-black focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-black px-6 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {submitting ? '요청 중…' : '요약하기'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
