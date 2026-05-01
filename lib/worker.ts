import { fetchSubtitles, fetchVideoMetadata } from './youtube';
import { parseSermonMetadata } from './metadata';
import { summarizeSermon } from './summarize';
import { updateSermon } from './db';

const MIN_TRANSCRIPT_LENGTH = 500;

function ytDateToIso(d: string | undefined): string | null {
  if (!d || !/^\d{8}$/.test(d)) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export async function processSermon(
  videoId: string,
  url: string,
): Promise<void> {
  try {
    updateSermon(videoId, { status: 'fetching_metadata' });
    const ytMeta = await fetchVideoMetadata(url);
    const parsed = parseSermonMetadata(ytMeta.description);
    updateSermon(videoId, {
      title: parsed.title ?? ytMeta.title,
      channelName: parsed.channelName ?? ytMeta.channel,
      sermonDate: parsed.sermonDate,
      preacher: parsed.preacher,
      bibleReference: parsed.bibleReference,
      durationSeconds: ytMeta.duration,
      publishedAt: ytDateToIso(ytMeta.upload_date),
    });

    updateSermon(videoId, { status: 'transcribing' });
    const transcript = await fetchSubtitles(url);
    if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
      throw new Error('자막이 너무 짧거나 비정상입니다.');
    }
    updateSermon(videoId, { transcript });

    updateSermon(videoId, { status: 'summarizing' });
    const summaryMarkdown = await summarizeSermon({
      transcript,
      meta: {
        title: parsed.title ?? ytMeta.title,
        bibleReference: parsed.bibleReference,
        preacher: parsed.preacher,
        sermonDate: parsed.sermonDate,
      },
    });
    updateSermon(videoId, { summaryMarkdown, status: 'done' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    updateSermon(videoId, { status: 'failed', errorMessage: message });
  }
}
