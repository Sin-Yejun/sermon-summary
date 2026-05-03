import type { MetadataRule, MetadataRules } from './playlists';

export interface SermonMeta {
  sermonDate: string | null;
  channelName: string | null;
  title: string | null;
  bibleReference: string | null;
  preacher: string | null;
}

export interface SermonMetaInput {
  description: string;
  title?: string;
  channel?: string;
}

const FIELD_KEYS = [
  'title',
  'bibleReference',
  'preacher',
  'sermonDate',
  'channelName',
] as const;

const DEFAULT_FLAGS = 'm';

function pickSource(
  input: SermonMetaInput,
  from: MetadataRule['from'],
): string {
  if (from === 'title') return input.title ?? '';
  if (from === 'channel') return input.channel ?? '';
  return input.description;
}

function applyRule(
  input: SermonMetaInput,
  rule: MetadataRule,
): string | null {
  const source = pickSource(input, rule.from);
  if (!source) return null;
  let regex: RegExp;
  try {
    regex = new RegExp(rule.regex, rule.flags ?? DEFAULT_FLAGS);
  } catch {
    return null;
  }
  const m = source.match(regex);
  if (!m) return null;
  const value = rule.format
    ? m[0].replace(regex, rule.format).trim()
    : (m[rule.group ?? 1] ?? '').trim();
  return value || null;
}

export function parseSermonMetadata(
  input: SermonMetaInput,
  rules: MetadataRules,
): SermonMeta {
  const meta: SermonMeta = {
    sermonDate: null,
    channelName: null,
    title: null,
    bibleReference: null,
    preacher: null,
  };
  for (const key of FIELD_KEYS) {
    const rule = rules[key];
    if (rule) meta[key] = applyRule(input, rule);
  }
  return meta;
}
