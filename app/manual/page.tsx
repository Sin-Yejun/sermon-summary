import Link from 'next/link';
import UrlForm from '../url-form';

export const dynamic = 'force-dynamic';

export default function ManualPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="inline-block text-sm text-gray-500 hover:underline"
      >
        ← 홈
      </Link>
      <h1 className="mb-2 mt-4 text-2xl font-semibold tracking-tight">
        수동 추가
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        등록된 재생목록에 없는 설교를 직접 추가합니다.
      </p>
      <UrlForm />
    </main>
  );
}
