import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { errorMessage } from './format';

export interface MetadataRule {
  from?: 'description' | 'title' | 'channel';
  regex: string;
  group?: number;
  format?: string;
  flags?: string;
}

export interface MetadataRules {
  title?: MetadataRule;
  bibleReference?: MetadataRule;
  preacher?: MetadataRule;
  sermonDate?: MetadataRule;
  channelName?: MetadataRule;
}

export interface ChurchPlaylist {
  slug: string;
  url: string;
  titleIncludes?: string;
  metadata?: MetadataRules;
}

export interface Church {
  id: string;
  name: string;
  shortName: string;
  playlists: ChurchPlaylist[];
  metadata?: MetadataRules;
}

interface ChurchesFile {
  churches: Church[];
}

export interface ResolvedPlaylist {
  church: Church;
  playlist: ChurchPlaylist;
}

export const DEFAULT_METADATA_RULES: MetadataRules = {
  sermonDate: { regex: '^(\\d{4}-\\d{2}-\\d{2})$' },
  channelName: { regex: '^(.+?)\\s*주일설교$' },
  title: { regex: '^(.+?)\\s*\\(([^()]+)\\)\\s*$' },
  bibleReference: { regex: '^(.+?)\\s*\\(([^()]+)\\)\\s*$', group: 2 },
  preacher: { regex: '^(.+?\\s*목사)$' },
};

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function defaultPath(): string {
  return (
    process.env.SERMON_PLAYLISTS_PATH ??
    path.join(process.cwd(), 'config', 'playlists.json')
  );
}

const cache = new Map<string, { mtimeMs: number; churches: Church[] }>();

export function clearChurchesCache(): void {
  cache.clear();
}

export function loadChurches(filePath: string = defaultPath()): Church[] {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(filePath).mtimeMs;
  } catch (e) {
    throw new Error(`playlists.json 읽기 실패: ${errorMessage(e)}`);
  }
  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.churches;

  const raw = readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`playlists.json 파싱 실패: ${errorMessage(e)}`);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as ChurchesFile).churches)
  ) {
    throw new Error('playlists.json에 churches 배열이 없습니다.');
  }
  const churches = (parsed as ChurchesFile).churches;
  validate(churches);
  cache.set(filePath, { mtimeMs, churches });
  return churches;
}

function validate(churches: Church[]): void {
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const c of churches) {
    if (!c.id || !ID_RE.test(c.id)) {
      throw new Error(`잘못된 church id: ${JSON.stringify(c.id)}`);
    }
    if (seenIds.has(c.id)) throw new Error(`중복된 church id: ${c.id}`);
    seenIds.add(c.id);
    if (!c.name || !c.shortName) {
      throw new Error(`church ${c.id}의 name/shortName이 비어있습니다.`);
    }
    if (!Array.isArray(c.playlists) || c.playlists.length === 0) {
      throw new Error(`church ${c.id}에 playlists 배열이 없습니다.`);
    }
    for (const p of c.playlists) {
      if (!p.slug || !ID_RE.test(p.slug)) {
        throw new Error(`잘못된 playlist slug: ${JSON.stringify(p.slug)}`);
      }
      if (seenSlugs.has(p.slug)) {
        throw new Error(`중복된 playlist slug: ${p.slug}`);
      }
      seenSlugs.add(p.slug);
      if (!p.url || !p.url.includes('list=')) {
        throw new Error(
          `playlist ${p.slug}의 url에 list= 파라미터가 없습니다.`,
        );
      }
    }
  }
}

export function findChurch(churches: Church[], id: string): Church | null {
  return churches.find((c) => c.id === id) ?? null;
}

export function findPlaylist(
  churches: Church[],
  slug: string,
): ResolvedPlaylist | null {
  for (const c of churches) {
    const p = c.playlists.find((pl) => pl.slug === slug);
    if (p) return { church: c, playlist: p };
  }
  return null;
}

export function findMetadataRules(
  playlistId: string | null,
  playlistSlug: string | null,
): MetadataRules {
  if (!playlistId && !playlistSlug) return DEFAULT_METADATA_RULES;
  let churches: Church[];
  try {
    churches = loadChurches();
  } catch {
    return DEFAULT_METADATA_RULES;
  }
  if (playlistSlug) {
    const r = findPlaylist(churches, playlistSlug);
    if (r) return r.playlist.metadata ?? r.church.metadata ?? DEFAULT_METADATA_RULES;
  }
  if (playlistId) {
    const c = findChurch(churches, playlistId);
    if (c) return c.metadata ?? DEFAULT_METADATA_RULES;
  }
  return DEFAULT_METADATA_RULES;
}
