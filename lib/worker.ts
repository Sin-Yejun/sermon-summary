import { fetchSubtitleSegments, fetchVideoMetadata } from './youtube';
import { transcribeFromUrl } from './transcribe';
import { parseSermonMetadata } from './metadata';
import { summarizeSermon } from './summarize';
import { generateVisualization } from './visualize';
import { getSermon, updateSermon } from './db';
import { weekOfFor } from './week';
import { findMetadataRules } from './playlists';
import { errorMessage } from './format';
import { addUsage, emptyUsage, formatUsage } from './pricing';
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

    const totalUsage = emptyUsage();

    updateSermon(videoId, { status: 'transcribing' });
    let segments: TranscriptSegment[];
    let transcriptSource: 'caption' | 'audio_stt' = 'caption';
    try {
      segments = await fetchSubtitleSegments(url);
    } catch (captionError) {
      console.warn(
        `[worker:${videoId}] caption fetch failed (${errorMessage(captionError)}), falling back to audio STT`,
      );
      const stt = await transcribeFromUrl(url);
      segments = stt.segments;
      addUsage(totalUsage, stt.usage);
      transcriptSource = 'audio_stt';
    }
    const transcript = segmentsToText(segments);
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      throw new Error('자막이 너무 짧거나 비정상입니다.');
    }
    updateSermon(videoId, {
      transcript,
      transcriptSegments: JSON.stringify(segments),
    });

    updateSermon(videoId, { status: 'summarizing' });
    const summary = await summarizeSermon({
      segments,
      meta: {
        title: parsed.title ?? ytMeta.title,
        bibleReference: parsed.bibleReference,
        preacher: parsed.preacher,
        sermonDate: parsed.sermonDate,
      },
    });
    addUsage(totalUsage, summary.usage);

    const doc = summary.doc;
    await Promise.all(
      doc.sections.flatMap((sec) =>
        sec.subsections.map(async (sub) => {
          const kind = sub.suggestedVisual;
          if (!kind || kind === 'none') {
            sub.visualization = null;
            return;
          }
          const { visualization, usage } = await generateVisualization({
            subsectionTitle: sub.title,
            bullets: sub.bullets,
            kind,
          });
          sub.visualization = visualization;
          addUsage(totalUsage, usage);
        }),
      ),
    );

    updateSermon(videoId, {
      summaryJson: JSON.stringify(doc),
      summaryTldr: doc.tldr?.trim() || null,
      status: 'done',
    });

    console.log(
      `[worker:${videoId}] source=${transcriptSource} ${formatUsage(totalUsage)}`,
    );
  } catch (e) {
    updateSermon(videoId, { status: 'failed', errorMessage: errorMessage(e) });
  }
}
