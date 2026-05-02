import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadChurches, findChurch } from './playlists';

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

describe('loadChurches', () => {
  it('parses valid config', () => {
    write({
      churches: [
        {
          id: 'bwmc',
          name: '분당우리교회',
          shortName: 'BWMC',
          playlistUrl: 'https://www.youtube.com/playlist?list=PLabc',
        },
      ],
    });
    const c = loadChurches(file);
    expect(c).toHaveLength(1);
    expect(c[0].id).toBe('bwmc');
  });

  it('rejects duplicate ids', () => {
    write({
      churches: [
        {
          id: 'a',
          name: 'A',
          shortName: 'A',
          playlistUrl: 'https://www.youtube.com/playlist?list=X',
        },
        {
          id: 'a',
          name: 'B',
          shortName: 'B',
          playlistUrl: 'https://www.youtube.com/playlist?list=Y',
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/중복/);
  });

  it('rejects invalid id', () => {
    write({
      churches: [
        {
          id: 'A B',
          name: 'A',
          shortName: 'A',
          playlistUrl: 'https://www.youtube.com/playlist?list=X',
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/잘못된/);
  });

  it('rejects missing list= param', () => {
    write({
      churches: [
        {
          id: 'a',
          name: 'A',
          shortName: 'A',
          playlistUrl: 'https://example.com/no-list',
        },
      ],
    });
    expect(() => loadChurches(file)).toThrow(/list=/);
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

describe('findChurch', () => {
  it('returns null when not found', () => {
    expect(findChurch([], 'x')).toBeNull();
  });
  it('returns the matching church', () => {
    const c: import('./playlists').Church = {
      id: 'a',
      name: 'A',
      shortName: 'A',
      playlistUrl: 'https://www.youtube.com/playlist?list=X',
    };
    expect(findChurch([c], 'a')).toBe(c);
  });
});
