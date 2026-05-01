export type SermonStatus =
  | 'pending'
  | 'fetching_metadata'
  | 'transcribing'
  | 'summarizing'
  | 'done'
  | 'failed';

export interface Sermon {
  videoId: string;
  url: string;
  status: SermonStatus;
  errorMessage: string | null;
  title: string | null;
  channelName: string | null;
  publishedAt: string | null;
  sermonDate: string | null;
  preacher: string | null;
  bibleReference: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  summaryMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SermonUpdate = Partial<
  Omit<Sermon, 'videoId' | 'url' | 'createdAt'>
>;
