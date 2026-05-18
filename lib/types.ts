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

export type VisualKind =
  | 'none'
  | 'flowchart'
  | 'mindmap'
  | 'compare'
  | 'timeline'
  | 'concept';

export interface MermaidVisualization {
  kind: 'mermaid';
  diagram: 'flowchart' | 'mindmap';
  source: string;
}

export interface CompareVisualization {
  kind: 'compare';
  axis: string;
  left: { label: string; points: string[] };
  right: { label: string; points: string[] };
}

export interface TimelineVisualization {
  kind: 'timeline';
  items: { marker: string; title: string; description: string }[];
}

export interface ConceptVisualization {
  kind: 'concept';
  term: string;
  definition: string;
  facets?: { label: string; value: string }[];
}

export type Visualization =
  | MermaidVisualization
  | CompareVisualization
  | TimelineVisualization
  | ConceptVisualization;

export interface SummarySubsection {
  id: string;
  title: string;
  startTs: number;
  bullets: SummaryBullet[];
  suggestedVisual?: VisualKind;
  visualization?: Visualization | null;
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
  playlistId: string | null;
  playlistSlug: string | null;
  weekOf: string | null;
  title: string | null;
  channelName: string | null;
  publishedAt: string | null;
  sermonDate: string | null;
  preacher: string | null;
  bibleReference: string | null;
  durationSeconds: number | null;
  transcript: string | null;
  transcriptSegments: string | null;
  summaryJson: string | null;
  summaryTldr: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SermonUpdate = Partial<
  Omit<Sermon, 'videoId' | 'url' | 'createdAt'>
>;

export type SermonCardData = Pick<
  Sermon,
  | 'videoId'
  | 'status'
  | 'playlistId'
  | 'weekOf'
  | 'title'
  | 'channelName'
  | 'preacher'
  | 'bibleReference'
  | 'sermonDate'
  | 'summaryTldr'
>;
