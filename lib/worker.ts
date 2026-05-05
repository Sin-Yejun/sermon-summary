import { fetchSubtitleSegments, fetchVideoMetadata } from './youtube';
import { parseSermonMetadata } from './metadata';
import { summarizeSermon } from './summarize';
import { getSermon, updateSermon } from './db';
import { weekOfFor } from './week';
import { findMetadataRules } from './playlists';
import { errorMessage } from './format';
import type { TranscriptSegment } from './types';

const MIN_TRANSCRIPT_LENGTH = 500;

function ytDateToIso(d: string | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function segmentsToText(segments: TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(' ');
}

export async function processSermon(
  videoId: string,
  url: string,
): Promise<void> {
  try {
    updateSermon(videoId, { status: 'fetching_metadata' });
    const ytMeta = await fetchVideoMetadata(url);
    const sermonRow = getSermon(videoId);
    const rules = findMetadataRules(
      sermonRow?.playlistId ?? null,
      sermonRow?.playlistSlug ?? null,
    );
    const parsed = parseSermonMetadata(
      {
        description: ytMeta.description,
        title: ytMeta.title,
        channel: ytMeta.channel,
      },
      rules,
    );
    const publishedAt = ytDateToIso(ytMeta.upload_date);
    const weekOf =
      weekOfFor(parsed.sermonDate ?? '') ?? weekOfFor(publishedAt ?? '');
    updateSermon(videoId, {
      title: parsed.title ?? ytMeta.title,
      channelName: parsed.channelName ?? ytMeta.channel,
      sermonDate: parsed.sermonDate,
      preacher: parsed.preacher,
      bibleReference: parsed.bibleReference,
      durationSeconds: ytMeta.duration,
      publishedAt,
      weekOf,
    });

    updateSermon(videoId, { status: 'transcribing' });
    const segments = await fetchSubtitleSegments(url);
    const transcript = segmentsToText(segments);
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      throw new Error('자막이 너무 짧거나 비정상입니다.');
    }
    updateSermon(videoId, {
      transcript,
      transcriptSegments: JSON.stringify(segments),
    });

    updateSermon(videoId, { status: 'summarizing' });
    const summaryDoc = await summarizeSermon({
      segments,
      meta: {
        title: parsed.title ?? ytMeta.title,
        bibleReference: parsed.bibleReference,
        preacher: parsed.preacher,
        sermonDate: parsed.sermonDate,
      },
    });

    updateSermon(videoId, {
      summaryJson: JSON.stringify(summaryDoc),
      summaryTldr: summaryDoc.tldr?.trim() || null,
      status: 'done',
    });
  } catch (e) {
    updateSermon(videoId, { status: 'failed', errorMessage: errorMessage(e) });
  }
}
