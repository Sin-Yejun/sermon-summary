import Database from 'better-sqlite3';
import type { Sermon, SermonUpdate } from './types';

let _db: Database.Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sermons (
    videoId TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    errorMessage TEXT,
    title TEXT,
    channelName TEXT,
    publishedAt TEXT,
    sermonDate TEXT,
    preacher TEXT,
    bibleReference TEXT,
    durationSeconds INTEGER,
    transcript TEXT,
    transcriptSegments TEXT,
    summaryMarkdown TEXT,
    summaryJson TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`;

const ADDED_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'transcriptSegments', ddl: 'ALTER TABLE sermons ADD COLUMN transcriptSegments TEXT' },
  { name: 'summaryJson', ddl: 'ALTER TABLE sermons ADD COLUMN summaryJson TEXT' },
];

function migrate(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(sermons)`).all() as Array<{
    name: string;
  }>;
  const have = new Set(cols.map((c) => c.name));
  for (const { name, ddl } of ADDED_COLUMNS) {
    if (!have.has(name)) db.exec(ddl);
  }
}

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
  migrate(_db);
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
  'title',
  'channelName',
  'publishedAt',
  'sermonDate',
  'preacher',
  'bibleReference',
  'durationSeconds',
  'transcript',
  'transcriptSegments',
  'summaryMarkdown',
  'summaryJson',
  'createdAt',
  'updatedAt',
] as const;

export function getSermon(videoId: string): Sermon | null {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS.join(', ')} FROM sermons WHERE videoId = ?`)
    .get(videoId) as Sermon | undefined;
  return row ?? null;
}

export function listSermons(): Sermon[] {
  return getDb()
    .prepare(
      `SELECT ${COLUMNS.join(', ')} FROM sermons ORDER BY createdAt DESC`,
    )
    .all() as Sermon[];
}

export function deleteSermon(videoId: string): void {
  getDb().prepare(`DELETE FROM sermons WHERE videoId = ?`).run(videoId);
}

export function createSermon(videoId: string, url: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO sermons (videoId, url, status, createdAt, updatedAt)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .run(videoId, url, now, now);
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
