export type SermonStatus =
  | 'pending'
  | 'fetching_metadata'
  | 'transcribing'
  | 'summarizing'
  | 'done'
  | 'failed';

export interface TranscriptSegment {
  idx: number;
  ts: number;
  text: string;
}

export interface SummarySubBullet {
  text: string;
  citations: number[];
}

export interface SummaryBullet {
  text: string;
  citations: number[];
  subBullets?: SummarySubBullet[];
}

export interface SummarySubsection {
  id: string;
  title: string;
  startTs: number;
  bullets: SummaryBullet[];
}

export interface SummarySection {
  id: string;
  title: string;
  subsections: SummarySubsection[];
}

export interface SummaryDoc {
  tldr: string;
  sections: SummarySection[];
}

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
  transcriptSegments: string | null;
  summaryMarkdown: string | null;
  summaryJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SermonUpdate = Partial<
  Omit<Sermon, 'videoId' | 'url' | 'createdAt'>
>;
