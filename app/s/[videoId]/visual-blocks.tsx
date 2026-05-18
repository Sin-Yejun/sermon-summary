import type {
  CompareVisualization,
  ConceptVisualization,
  TimelineVisualization,
} from '@/lib/types';

export function CompareCard({ data }: { data: CompareVisualization }) {
  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-gray-200">
      <figcaption className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
        {data.axis}
      </figcaption>
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x sm:divide-gray-200">
        <CompareColumn
          label={data.left.label}
          points={data.left.points}
          tone="emerald"
        />
        <CompareColumn
          label={data.right.label}
          points={data.right.points}
          tone="rose"
        />
      </div>
    </figure>
  );
}

function CompareColumn({
  label,
  points,
  tone,
}: {
  label: string;
  points: string[];
  tone: 'emerald' | 'rose';
}) {
  const labelClass =
    tone === 'emerald'
      ? 'text-emerald-700 bg-emerald-50/60'
      : 'text-rose-700 bg-rose-50/60';
  const dotClass = tone === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400';
  return (
    <div>
      <div className={`px-4 py-2 text-sm font-semibold ${labelClass}`}>
        {label}
      </div>
      <ul className="px-4 py-3 space-y-1.5 text-sm text-gray-800">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
              aria-hidden
            />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TimelineCard({ data }: { data: TimelineVisualization }) {
  return (
    <ol className="my-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50/30 px-4 py-4">
      {data.items.map((item, i) => (
        <li key={i} className="relative flex gap-3 pl-2">
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden />
            {i < data.items.length - 1 && (
              <span className="mt-1 w-px flex-1 bg-gray-300" aria-hidden />
            )}
          </div>
          <div className="flex-1 pb-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                {item.marker}
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {item.title}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">
              {item.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ConceptCard({ data }: { data: ConceptVisualization }) {
  return (
    <aside className="my-4 rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-white px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-indigo-600">
        핵심 개념
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-gray-900">
        {data.term}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-700">
        {data.definition}
      </p>
      {data.facets && data.facets.length > 0 && (
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {data.facets.map((f, i) => (
            <div key={i} className="contents">
              <dt className="text-gray-500">{f.label}</dt>
              <dd className="text-gray-800">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
