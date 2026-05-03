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
  playlists: [
    {
      slug: 'bwmc-main',
      url: 'https://www.youtube.com/playlist?list=PLabc',
    },
  ],
};

const CHURCH_WITH_FILTER: Church = {
  id: 'bwmc',
  name: '분당우리교회',
  shortName: 'BWMC',
  playlists: [
    {
      slug: 'bwmc-main',
      url: 'https://www.youtube.com/playlist?list=PLmain',
    },
    {
      slug: 'bwmc-youth1',
      url: 'https://www.youtube.com/playlist?list=PLyouth',
      titleIncludes: '1청년부 연합',
    },
  ],
};

describe('ingestChurch', () => {
  beforeEach(() => {
    process.env.SERMON_DB_PATH = ':memory:';
    createDb({ reset: true });
    vi.mocked(fetchPlaylistVideos).mockReset();
    vi.mocked(processSermon).mockReset();
  });

  it('picks the most recent video when DB is empty', async () => {
    vi.mocked(fetchPlaylistVideos).mockResolvedValue([
      { id: 'aaaaaaaaaaa', title: 'A', url: 'https://youtu.be/aaaaaaaaaaa' },
      { id: 'bbbbbbbbbbb', title: 'B', url: 'https://youtu.be/bbbbbbbbbbb' },
    ]);
    vi.mocked(processSermon).mockResolvedValue();

    const r = await ingestChurch(CHURCH);
    expect(r.picked).toBe(1);
    expect(processSermon).toHaveBeenCalledTimes(1);
    expect(processSermon).toHaveBeenCalledWith(
      'aaaaaaaaaaa',
      'https://youtu.be/aaaaaaaaaaa',
    );
    expect(getSermon('aaaaaaaaaaa')?.playlistSlug).toBe('bwmc-main');
  });

  it('skips when the most recent video already exists (no fallback to older)', async () => {
    vi.mocked(fetchPlaylistVideos).mockResolvedValue([
      { id: 'aaaaaaaaaaa', title: 'A', url: 'https://youtu.be/aaaaaaaaaaa' },
      { id: 'bbbbbbbbbbb', title: 'B', url: 'https://youtu.be/bbbbbbbbbbb' },
    ]);
    vi.mocked(processSermon).mockResolvedValue();

    createSermon('aaaaaaaaaaa', 'https://youtu.be/aaaaaaaaaaa', {
      playlistId: 'bwmc',
      playlistSlug: 'bwmc-main',
    });

    const r = await ingestChurch(CHURCH);
    expect(r.picked).toBe(0);
    expect(r.skipped).toBe(1);
    expect(processSermon).not.toHaveBeenCalled();
  });

  it('considers each playlist independently with titleIncludes filter', async () => {
    vi.mocked(fetchPlaylistVideos)
      .mockResolvedValueOnce([
        { id: 'main1111111', title: '주일설교 A', url: 'https://x/main1' },
      ])
      .mockResolvedValueOnce([
        { id: 'youth111111', title: '2026-04-19 | 3청년부 | foo', url: 'https://x/youth1' },
        { id: 'youth222222', title: '2026-04-19 | 1청년부 연합 | bar', url: 'https://x/youth2' },
      ]);
    vi.mocked(processSermon).mockResolvedValue();

    const r = await ingestChurch(CHURCH_WITH_FILTER);
    expect(r.picked).toBe(2);
    expect(getSermon('main1111111')?.playlistSlug).toBe('bwmc-main');
    expect(getSermon('youth222222')?.playlistSlug).toBe('bwmc-youth1');
    expect(getSermon('youth111111')).toBeNull();
  });

  it('records playlist fetch error in errors array', async () => {
    vi.mocked(fetchPlaylistVideos).mockRejectedValue(new Error('rate limited'));

    const r = await ingestChurch(CHURCH);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].playlistSlug).toBe('bwmc-main');
    expect(r.errors[0].error).toMatch(/rate limited/);
    expect(r.sermons).toHaveLength(0);
    expect(processSermon).not.toHaveBeenCalled();
  });
});
