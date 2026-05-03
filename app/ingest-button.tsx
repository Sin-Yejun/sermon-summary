'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage } from '@/lib/format';

export default function IngestButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ingest', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? '실패');
      }
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? '가져오는 중…' : '지금 가져오기'}
      </button>
      {error && (
        <p className="mt-2 break-all text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
