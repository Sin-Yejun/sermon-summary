import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Church {
  id: string;
  name: string;
  shortName: string;
  playlistUrl: string;
}

interface ChurchesFile {
  churches: Church[];
}

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function defaultPath(): string {
  return (
    process.env.SERMON_PLAYLISTS_PATH ??
    path.join(process.cwd(), 'config', 'playlists.json')
  );
}

export function loadChurches(filePath: string = defaultPath()): Church[] {
  const raw = readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `playlists.json 파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as ChurchesFile).churches)
  ) {
    throw new Error('playlists.json에 churches 배열이 없습니다.');
  }
  const churches = (parsed as ChurchesFile).churches;
  const seen = new Set<string>();
  for (const c of churches) {
    if (!c.id || !ID_RE.test(c.id)) {
      throw new Error(`잘못된 church id: ${JSON.stringify(c.id)}`);
    }
    if (seen.has(c.id)) {
      throw new Error(`중복된 church id: ${c.id}`);
    }
    seen.add(c.id);
    if (!c.name || !c.shortName || !c.playlistUrl) {
      throw new Error(`church ${c.id} 항목이 비어있습니다.`);
    }
    if (!c.playlistUrl.includes('list=')) {
      throw new Error(
        `church ${c.id}의 playlistUrl에 list= 파라미터가 없습니다.`,
      );
    }
  }
  return churches;
}

export function findChurch(churches: Church[], id: string): Church | null {
  return churches.find((c) => c.id === id) ?? null;
}
