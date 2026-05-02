import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./youtube', () => ({
  fetchPlaylistVideos: vi.fn(),
}));
vi.mock('./worker', () => ({
  processSermon: vi.fn(),
}));

import { fetchPlaylistVideos } from './youtube';
import { processSermon } from './worker';
import { createDb, createSermon, getSermon } from './db';
import { ingestChurch } from './ingest';
import type { Church } from './playlists';

const CHURCH: Church = {
  id: 'bwmc',
  name: '분당우리교회',
  shortName: 'BWMC',
  playlistUrl: 'https://www.youtube.com/playlist?list=PLabc',
};

describe('ingestChurch', () => {
  beforeEach(() => {
    process.env.SERMON_DB_PATH = ':memory:';
    createDb({ reset: true });
    vi.mocked(fetchPlaylistVideos).mockReset();
    vi.mocked(processSermon).mockReset();
  });

  it('picks up to limit new videos and skips known ones', async () => {
    vi.mocked(fetchPlaylistVideos).mockResolvedValue([
      { id: 'aaaaaaaaaaa', title: 'A', url: 'https://youtu.be/aaaaaaaaaaa' },
      { id: 'bbbbbbbbbbb', title: 'B', url: 'https://youtu.be/bbbbbbbbbbb' },
      { id: 'ccccccccccc', title: 'C', url: 'https://youtu.be/ccccccccccc' },
    ]);
    vi.mocked(processSermon).mockResolvedValue();

    createSermon('bbbbbbbbbbb', 'https://youtu.be/bbbbbbbbbbb', {
      playlistId: 'bwmc',
    });

    const r = await ingestChurch(CHURCH, 5);
    expect(r.fetched).toBe(3);
    expect(r.picked).toBe(2);
    expect(r.skipped).toBe(1);
    expect(processSermon).toHaveBeenCalledTimes(2);
    expect(getSermon('aaaaaaaaaaa')?.playlistId).toBe('bwmc');
  });

  it('honors the limit', async () => {
    vi.mocked(fetchPlaylistVideos).mockResolvedValue([
      { id: 'aaaaaaaaaaa', title: 'A', url: 'https://youtu.be/aaaaaaaaaaa' },
      { id: 'bbbbbbbbbbb', title: 'B', url: 'https://youtu.be/bbbbbbbbbbb' },
      { id: 'ccccccccccc', title: 'C', url: 'https://youtu.be/ccccccccccc' },
    ]);
    vi.mocked(processSermon).mockResolvedValue();

    const r = await ingestChurch(CHURCH, 1);
    expect(r.picked).toBe(1);
    expect(processSermon).toHaveBeenCalledTimes(1);
    expect(processSermon).toHaveBeenCalledWith(
      'aaaaaaaaaaa',
      'https://youtu.be/aaaaaaaaaaa',
    );
  });

  it('records playlist fetch error', async () => {
    vi.mocked(fetchPlaylistVideos).mockRejectedValue(new Error('rate limited'));

    const r = await ingestChurch(CHURCH, 5);
    expect(r.error).toMatch(/rate limited/);
    expect(r.fetched).toBe(0);
    expect(processSermon).not.toHaveBeenCalled();
  });
});
