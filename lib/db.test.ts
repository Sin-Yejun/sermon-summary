import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, createSermon, getSermon, updateSermon } from './db';

describe('db', () => {
  beforeEach(() => {
    process.env.SERMON_DB_PATH = ':memory:';
    createDb({ reset: true });
  });

  it('returns null for unknown videoId', () => {
    expect(getSermon('xxx')).toBeNull();
  });

  it('creates and reads a sermon', () => {
    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    const s = getSermon('abc12345678');
    expect(s).not.toBeNull();
    expect(s!.videoId).toBe('abc12345678');
    expect(s!.status).toBe('pending');
    expect(s!.summaryMarkdown).toBeNull();
  });

  it('updates fields atomically', () => {
    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    updateSermon('abc12345678', { status: 'summarizing', title: 'Test' });
    const s = getSermon('abc12345678');
    expect(s!.status).toBe('summarizing');
    expect(s!.title).toBe('Test');
  });

  it('rejects creating duplicate videoId', () => {
    createSermon('abc12345678', 'https://youtu.be/abc12345678');
    expect(() => createSermon('abc12345678', 'https://x')).toThrow();
  });
});
