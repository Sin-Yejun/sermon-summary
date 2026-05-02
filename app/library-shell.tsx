import Sidebar from './sidebar';
import type { WeekBucket } from '@/lib/db';

export default function LibraryShell({
  weeks,
  children,
}: {
  weeks: WeekBucket[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 lg:grid-cols-[260px_1fr]">
      <Sidebar weeks={weeks} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
