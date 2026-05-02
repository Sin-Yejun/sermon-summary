import { listSermons } from '@/lib/db';
import SermonCard from './sermon-card';
import UrlForm from './url-form';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const sermons = listSermons();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight">
        Sermon Summary
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        YouTube 설교 영상 URL을 붙여넣으면 구조화된 요약을 생성합니다.
      </p>

      <section className="mb-12">
        <UrlForm />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">라이브러리</h2>
        {sermons.length === 0 ? (
          <p className="text-sm text-gray-500">
            아직 요약한 영상이 없어요. 위에서 URL을 붙여넣어 시작하세요.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sermons.map((s) => (
              <SermonCard key={s.videoId} sermon={s} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
