import Database from 'better-sqlite3';
import type { Sermon, SermonCardData, SermonUpdate } from './types';

let _db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sermons (
    videoId TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    errorMessage TEXT,
    playlistId TEXT,
    playlistSlug TEXT,
    weekOf TEXT,
    title TEXT,
    channelName TEXT,
    publishedAt TEXT,
    sermonDate TEXT,
    preacher TEXT,
    bibleReference TEXT,
    durationSeconds INTEGER,
    transcript TEXT,
    transcriptSegments TEXT,
    summaryJson TEXT,
    summaryTldr TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`;

const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_sermons_weekOf ON sermons(weekOf);
  CREATE INDEX IF NOT EXISTS idx_sermons_playlistId ON sermons(playlistId);
`;

export function createDb(opts: { reset?: boolean } = {}): Database.Database {
  if (_db && !opts.reset) return _db;
  if (_db) {
    _db.close();
    _db = null;
  }
  const path = process.env.SERMON_DB_PATH ?? './sermon-summary.db';
  _db = new Database(path);
  _db.pragma('journal_mode = WAL');
  _db.exec(SCHEMA);
  _db.exec(INDEXES);
  return _db;
}

function getDb(): Database.Database {
  return _db ?? createDb();
}

const COLUMNS = [
  'videoId',
  'url',
  'status',
  'errorMessage',
  'playlistId',
  'playlistSlug',
  'weekOf',
  'title',
  'channelName',
  'publishedAt',
  'sermonDate',
  'preacher',
  'bibleReference',
  'durationSeconds',
  'transcript',
  'transcriptSegments',
  'summaryJson',
  'summaryTldr',
  'createdAt',
  'updatedAt',
] as const;

const CARD_COLUMNS = [
  'videoId',
  'status',
  'playlistId',
  'weekOf',
  'title',
  'channelName',
  'preacher',
  'bibleReference',
  'sermonDate',
  'summaryTldr',
] as const;

export function getSermon(videoId: string): Sermon | null {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS.join(', ')} FROM sermons WHERE videoId = ?`)
    .get(videoId) as Sermon | undefined;
  return row ?? null;
}

export function listSermonCardsByWeek(weekOf: string): SermonCardData[] {
  return getDb()
    .prepare(
      `SELECT ${CARD_COLUMNS.join(', ')} FROM sermons
       WHERE weekOf = ?
       ORDER BY playlistId, createdAt DESC`,
    )
    .all(weekOf) as SermonCardData[];
}

export interface WeekBucket {
  weekOf: string;
  count: number;
}

export function listWeeks(): WeekBucket[] {
  return getDb()
    .prepare(
      `SELECT weekOf, COUNT(*) as count FROM sermons
       WHERE weekOf IS NOT NULL
       GROUP BY weekOf
       ORDER BY weekOf DESC`,
    )
    .all() as WeekBucket[];
}

export function deleteSermon(videoId: string): void {
  getDb().prepare(`DELETE FROM sermons WHERE videoId = ?`).run(videoId);
}

export function createSermon(
  videoId: string,
  url: string,
  opts: { playlistId?: string | null; playlistSlug?: string | null } = {},
): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sermons (videoId, url, status, playlistId, playlistSlug, createdAt, updatedAt)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    )
    .run(
      videoId,
      url,
      opts.playlistId ?? null,
      opts.playlistSlug ?? null,
      now,
      now,
    );
}

export function updateSermon(videoId: string, fields: SermonUpdate): void {
  const keys = Object.keys(fields) as (keyof SermonUpdate)[];
  if (keys.length === 0) return;
  const set = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k] ?? null);
  values.push(new Date().toISOString());
  getDb()
    .prepare(`UPDATE sermons SET ${set}, updatedAt = ? WHERE videoId = ?`)
    .run(...values, videoId);
}
