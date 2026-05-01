export interface SermonMeta {
  sermonDate: string | null;
  channelName: string | null;
  title: string | null;
  bibleReference: string | null;
  preacher: string | null;
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})$/;
const CHANNEL_RE = /^(.+?)\s*주일설교$/;
const TITLE_REF_RE = /^(.+?)\s*\(([^()]+)\)\s*$/;
const PREACHER_RE = /^(.+?\s*목사)$/;

export function parseSermonMetadata(description: string): SermonMeta {
  const meta: SermonMeta = {
    sermonDate: null,
    channelName: null,
    title: null,
    bibleReference: null,
    preacher: null,
  };
  const lines = description
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

  for (const line of lines) {
    if (!meta.sermonDate) {
      const m = line.match(DATE_RE);
      if (m) {
        meta.sermonDate = m[1];
        continue;
      }
    }
    if (!meta.channelName) {
      const m = line.match(CHANNEL_RE);
      if (m) {
        meta.channelName = m[1].trim();
        continue;
      }
    }
    if (!meta.title) {
      const m = line.match(TITLE_REF_RE);
      if (m) {
        meta.title = m[1].trim();
        meta.bibleReference = m[2].trim();
        continue;
      }
    }
    if (!meta.preacher) {
      const m = line.match(PREACHER_RE);
      if (m) {
        meta.preacher = m[1].trim();
        continue;
      }
    }
  }
  return meta;
}
