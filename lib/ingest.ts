import { loadChurches, type Church, type ChurchPlaylist } from './playlists';
import { fetchPlaylistVideos } from './youtube';
import { createSermon, getSermon } from './db';
import { processSermon } from './worker';
import { errorMessage } from './format';

export interface IngestSermonResult {
  videoId: string;
  playlistSlug: string;
  status: 'picked' | 'skipped' | 'error';
  error?: string;
}

export interface IngestPlaylistError {
  playlistSlug: string;
  error: string;
}

export interface IngestChurchResult {
  churchId: string;
  picked: number;
  skipped: number;
  sermons: IngestSermonResult[];
  errors: IngestPlaylistError[];
}

async function ingestPlaylist(
  church: Church,
  playlist: ChurchPlaylist,
  result: IngestChurchResult,
): Promise<void> {
  let videos;
  try {
    const fetchLimit = playlist.titleIncludes ? 10 : 1;
    videos = await fetchPlaylistVideos(playlist.url, { limit: fetchLimit });
  } catch (e) {
    result.errors.push({
      playlistSlug: playlist.slug,
      error: errorMessage(e),
    });
    return;
  }
  const matched = playlist.titleIncludes
    ? videos.filter((v) => v.title.includes(playlist.titleIncludes!))
    : videos;
  if (matched.length === 0) return;

  const v = matched[0];
  if (getSermon(v.id)) {
    result.skipped++;
    result.sermons.push({
      videoId: v.id,
      playlistSlug: playlist.slug,
      status: 'skipped',
    });
    return;
  }
  try {
    createSermon(v.id, v.url, {
      playlistId: church.id,
      playlistSlug: playlist.slug,
    });
    await processSermon(v.id, v.url);
    result.picked++;
    result.sermons.push({
      videoId: v.id,
      playlistSlug: playlist.slug,
      status: 'picked',
    });
  } catch (e) {
    result.sermons.push({
      videoId: v.id,
      playlistSlug: playlist.slug,
      status: 'error',
      error: errorMessage(e),
    });
  }
}

export async function ingestChurch(
  church: Church,
): Promise<IngestChurchResult> {
  const result: IngestChurchResult = {
    churchId: church.id,
    picked: 0,
    skipped: 0,
    sermons: [],
    errors: [],
  };
  for (const playlist of church.playlists) {
    await ingestPlaylist(church, playlist, result);
  }
  return result;
}

export async function ingestAll(): Promise<IngestChurchResult[]> {
  const churches = loadChurches();
  const out: IngestChurchResult[] = [];
  for (const church of churches) {
    out.push(await ingestChurch(church));
  }
  return out;
}
