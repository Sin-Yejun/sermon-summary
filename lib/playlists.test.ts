import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadChurches, findChurch, findPlaylist } from './playlists';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pl-'));
  file = path.join(dir, 'playlists.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(content: unknown): void {
  writeFileSync(file, JSON.stringify(content), 'utf8');
}

const VALID_URL = 'https://www.youtube.com/playlist?list=PLabc';

describe('loadChurches', () => {
  it('parses valid config', () => {
    write({
      churches: [
        {
          id: 'bwmc',
          name: '분당우리교회',
          shortName: 'BWMC',
          playlists: [{ slug: 'bwmc-main', url: VALID_URL }],
        },
      ],
    });
    const c = loadChurches(file);
    expect(c).toHaveLength(1);
    expect(c[0].id).toBe('bwmc');
    expect(c[0].playlists).toHaveLength(1);
    expect(c[0].playlists[0].slug).toBe('bwmc-main');
  });

  it('rejects duplicate church ids', () => {
    write({
      churches: [
        {
          id: 'a',
          name: 'A',
          shortName: 'A',
          playlists: [{ slug: 's1', url: VALID_URL }],
        },
        {
          id: 'a',
          name: 'B',
          shortName: 'B',
          playlists: [{ slug: 's2', url: VALID_URL }],
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/church id/);
  });

  it('rejects duplicate playlist slugs across churches', () => {
    write({
      churches: [
        {
          id: 'a',
          name: 'A',
          shortName: 'A',
          playlists: [{ slug: 'dup', url: VALID_URL }],
        },
        {
          id: 'b',
          name: 'B',
          shortName: 'B',
          playlists: [{ slug: 'dup', url: VALID_URL }],
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/playlist slug/);
  });

  it('rejects invalid church id', () => {
    write({
      churches: [
        {
          id: 'A B',
          name: 'A',
          shortName: 'A',
          playlists: [{ slug: 's', url: VALID_URL }],
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/church id/);
  });

  it('rejects invalid playlist slug', () => {
    write({
      churches: [
        {
          id: 'a',
          name: 'A',
          shortName: 'A',
          playlists: [{ slug: 'A B', url: VALID_URL }],
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/playlist slug/);
  });

  it('rejects missing list= param', () => {
    write({
      churches: [
        {
          id: 'a',
          name: 'A',
          shortName: 'A',
          playlists: [{ slug: 's', url: 'https://example.com/no-list' }],
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/list=/);
  });

  it('rejects empty playlists array', () => {
    write({
      churches: [
        { id: 'a', name: 'A', shortName: 'A', playlists: [] },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/playlists 배열/);
  });

  it('rejects malformed JSON', () => {
    writeFileSync(file, '{ not json', 'utf8');
    expect(() => loadChurches(file)).toThrow(/파싱/);
  });

  it('rejects missing churches array', () => {
    write({});
    expect(() => loadChurches(file)).toThrow(/churches/);
  });
});

describe('findChurch / findPlaylist', () => {
  const churches = [
    {
      id: 'a',
      name: 'A',
      shortName: 'A',
      playlists: [
        { slug: 'a-main', url: VALID_URL },
        { slug: 'a-youth', url: VALID_URL },
      ],
    },
  ];

  it('finds church by id', () => {
    expect(findChurch(churches, 'a')?.id).toBe('a');
    expect(findChurch(churches, 'x')).toBeNull();
  });

  it('finds playlist by slug across churches', () => {
    expect(findPlaylist(churches, 'a-youth')?.playlist.slug).toBe('a-youth');
    expect(findPlaylist(churches, 'missing')).toBeNull();
  });
});
