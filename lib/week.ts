const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, day));
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

export function weekOfFor(dateStr: string): string | null {
  const d = parseIsoDate(dateStr);
  if (!d) return null;
  const dow = d.getUTCDay();
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - dow);
  return isoDate(sunday);
}
