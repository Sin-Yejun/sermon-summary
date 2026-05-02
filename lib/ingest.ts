import { loadChurches, type Church } from './playlists';
import { fetchPlaylistVideos } from './youtube';
import { createSermon, getSermon } from './db';
import { processSermon } from './worker';

const DEFAULT_LIMIT_PER_CHURCH = 4;

export interface IngestSermonResult {
  videoId: string;
  status: 'picked' | 'skipped' | 'error';
  error?: string;
}

export interface IngestChurchResult {
  churchId: string;
  fetched: number;
  picked: number;
  skipped: number;
  sermons: IngestSermonResult[];
  error?: string;
}

export async function ingestChurch(
  church: Church,
  limit: number = DEFAULT_LIMIT_PER_CHURCH,
): Promise<IngestChurchResult> {
  const result: IngestChurchResult = {
    churchId: church.id,
    fetched: 0,
    picked: 0,
    skipped: 0,
    sermons: [],
  };
  let videos;
  try {
    videos = await fetchPlaylistVideos(church.playlistUrl);
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }
  result.fetched = videos.length;

  for (const v of videos) {
    if (result.picked >= limit) break;
    if (getSermon(v.id)) {
      result.skipped++;
      result.sermons.push({ videoId: v.id, status: 'skipped' });
      continue;
    }
    try {
      createSermon(v.id, v.url, { playlistId: church.id });
      await processSermon(v.id, v.url);
      result.picked++;
      result.sermons.push({ videoId: v.id, status: 'picked' });
    } catch (e) {
      result.sermons.push({
        videoId: v.id,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}

export async function ingestAll(
  opts: { limit?: number } = {},
): Promise<IngestChurchResult[]> {
  const churches = loadChurches();
  const out: IngestChurchResult[] = [];
  for (const church of churches) {
    out.push(await ingestChurch(church, opts.limit));
  }
  return out;
}
