export const DEFAULT_MAX_MEDIA_FILE_MB = 500;
export const GIF_SIZE_WARNING_BYTES = 15 * 1024 * 1024; // 15 MB
export const UTF8_BOM = '\uFEFF';
export const UNICODE_RLM = '\u200F';

export type VideoTargetResolution = 'original' | '1080p' | '720p' | '480p';
export type VideoAudioBitrate = '192k' | '128k' | '96k' | '64k' | 'mute';
export type GifWidthOption = 240 | 320 | 480 | 640 | 'original';
export type GifLoopOption = 0 | -1 | 3;
export type WhisperModelSize = 'tiny' | 'base';
export type WhisperLanguageChoice = 'auto' | 'ar' | 'fr' | 'en' | 'es';
export type DictationLocale = 'ar-SA' | 'fr-FR' | 'en-US' | 'es-ES';
export type TranscriptExportFormat = 'srt' | 'vtt' | 'md' | 'txt' | 'docx';

export interface TranscriptSegment {
  id: string;
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
}

export interface FileSizeValidationResult {
  valid: boolean;
  actualBytes: number;
  actualMB: number;
  maxLimitMB: number;
  maxBytes: number;
}

export class JobCancelledError extends Error {
  constructor(message = 'Job cancelled by user') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

/**
 * Validates media file size against a configurable MB limit (default 500 MB).
 */
export function validateMediaFileSize(
  fileSizeBytes: number,
  maxLimitMB: number = DEFAULT_MAX_MEDIA_FILE_MB
): FileSizeValidationResult {
  const safeLimitMB = Number.isFinite(maxLimitMB) && maxLimitMB > 0 ? maxLimitMB : DEFAULT_MAX_MEDIA_FILE_MB;
  const maxBytes = Math.round(safeLimitMB * 1024 * 1024);
  const actualMB = fileSizeBytes / (1024 * 1024);
  return {
    valid: fileSizeBytes > 0 && fileSizeBytes <= maxBytes,
    actualBytes: fileSizeBytes,
    actualMB,
    maxLimitMB: safeLimitMB,
    maxBytes,
  };
}

export function formatBytesHuman(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDurationClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function makeEven(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

const RESOLUTION_SHORT_EDGE_MAP: Record<Exclude<VideoTargetResolution, 'original'>, number> = {
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
};

/**
 * Computes exact even output dimensions for H.264 yuv420p encoding,
 * preserving source aspect ratio for both landscape and portrait videos
 * without upscaling smaller videos.
 */
export function computeTargetVideoDimensions(
  sourceWidth: number,
  sourceHeight: number,
  resolution: VideoTargetResolution
): { width: number; height: number } {
  const srcW = Math.max(2, sourceWidth || 1280);
  const srcH = Math.max(2, sourceHeight || 720);

  if (resolution === 'original') {
    return { width: makeEven(srcW), height: makeEven(srcH) };
  }

  const targetShortEdge = RESOLUTION_SHORT_EDGE_MAP[resolution];
  const isLandscape = srcW >= srcH;
  const currentShortEdge = isLandscape ? srcH : srcW;

  if (currentShortEdge <= targetShortEdge) {
    return { width: makeEven(srcW), height: makeEven(srcH) };
  }

  const scaleFactor = targetShortEdge / currentShortEdge;
  return {
    width: makeEven(srcW * scaleFactor),
    height: makeEven(srcH * scaleFactor),
  };
}

/**
 * Builds FFmpeg scale filter string ensuring width and height are divisible by 2
 * (required by libx264 yuv420p).
 */
export function buildVideoScaleFilter(
  resolution: VideoTargetResolution,
  sourceWidth: number,
  sourceHeight: number
): string {
  if (sourceWidth > 0 && sourceHeight > 0) {
    const { width, height } = computeTargetVideoDimensions(sourceWidth, sourceHeight, resolution);
    return `scale=${width}:${height}:flags=bicubic`;
  }
  if (resolution === 'original') {
    return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  }
  const targetH = RESOLUTION_SHORT_EDGE_MAP[resolution];
  return `scale=-2:'min(${targetH},trunc(ih/2)*2)'`;
}

export interface VideoCompressionJobOptions {
  resolution: VideoTargetResolution;
  crf: number;
  audioBitrate: VideoAudioBitrate;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Builds real FFmpeg H.264 MP4 arguments playable in VLC, Chrome, Safari, and QuickTime.
 */
export function buildVideoCompressionArgs(
  inputFileName: string,
  outputFileName: string,
  opts: VideoCompressionJobOptions
): string[] {
  const clampedCrf = Math.max(18, Math.min(36, Math.round(opts.crf)));
  const scaleFilter = buildVideoScaleFilter(opts.resolution, opts.sourceWidth, opts.sourceHeight);

  const args: string[] = [
    '-i',
    inputFileName,
    '-vf',
    scaleFilter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(clampedCrf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  ];

  if (opts.audioBitrate === 'mute') {
    args.push('-an');
  } else {
    args.push('-c:a', 'aac', '-b:a', opts.audioBitrate);
  }

  args.push(outputFileName);
  return args;
}

const AUDIO_KBPS_MAP: Record<VideoAudioBitrate, number> = {
  '192k': 192,
  '128k': 128,
  '96k': 96,
  '64k': 64,
  mute: 0,
};

/**
 * Estimates target output size in bytes based on input bitrate, pixel ratio,
 * CRF exponential bitrate scaling (~6 CRF = half/double video bitrate), and audio bitrate.
 */
export function estimateCompressedSizeBytes(params: {
  inputSizeBytes: number;
  durationSec: number;
  sourceWidth: number;
  sourceHeight: number;
  resolution: VideoTargetResolution;
  crf: number;
  audioBitrate: VideoAudioBitrate;
}): { estimatedBytes: number; estimatedSavingsPct: number } {
  const { inputSizeBytes, durationSec, sourceWidth, sourceHeight, resolution, crf, audioBitrate } = params;
  if (inputSizeBytes <= 0 || durationSec <= 0) {
    return { estimatedBytes: 0, estimatedSavingsPct: 0 };
  }

  const srcW = Math.max(2, sourceWidth || 1280);
  const srcH = Math.max(2, sourceHeight || 720);
  const targetDims = computeTargetVideoDimensions(srcW, srcH, resolution);
  const pixelRatio = Math.min(1, (targetDims.width * targetDims.height) / (srcW * srcH));

  const audioKbps = AUDIO_KBPS_MAP[audioBitrate];
  const audioBytes = (durationSec * audioKbps * 1000) / 8;

  // Estimate baseline H.264 video bitrate at CRF 23 for target pixel count (~0.075 bits per pixel @ 25fps)
  const referenceBpsAtCrf23 = targetDims.width * targetDims.height * 25 * 0.072;
  const crfFactor = Math.pow(2, (23 - crf) / 6);
  const modelVideoBytes = (referenceBpsAtCrf23 * crfFactor * durationSec) / 8;

  // Blend model bitrate with scaled input video size so screen recordings (low motion) and action clips both stay realistic
  const estimatedSourceAudioBytes = Math.min(inputSizeBytes * 0.25, (durationSec * 128 * 1000) / 8);
  const sourceVideoBytes = Math.max(inputSizeBytes * 0.2, inputSizeBytes - estimatedSourceAudioBytes);
  const scaledSourceVideoBytes = sourceVideoBytes * Math.pow(pixelRatio, 0.85) * Math.pow(2, (22 - crf) / 6);

  const blendedVideoBytes = Math.min(modelVideoBytes, scaledSourceVideoBytes * 1.15);
  const containerOverhead = 1.015;
  const estimatedBytes = Math.max(
    16 * 1024,
    Math.round((blendedVideoBytes + audioBytes) * containerOverhead)
  );
  const savingsPct = ((inputSizeBytes - estimatedBytes) / inputSizeBytes) * 100;

  return {
    estimatedBytes,
    estimatedSavingsPct: Math.round(savingsPct * 10) / 10,
  };
}

/**
 * Computes exact GIF output dimensions preserving the source video's true aspect ratio.
 * Never forces 16:9.
 */
export function computeGifOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  widthOption: GifWidthOption
): { width: number; height: number } {
  const srcW = Math.max(16, sourceWidth || 640);
  const srcH = Math.max(16, sourceHeight || 360);

  if (widthOption === 'original') {
    return { width: Math.round(srcW), height: Math.round(srcH) };
  }

  const targetW = widthOption;
  const targetH = Math.max(16, Math.round((targetW * srcH) / srcW));
  return { width: targetW, height: targetH };
}

export interface VideoToGifJobOptions {
  trimStartSec: number;
  trimEndSec: number;
  fps: number;
  widthOption: GifWidthOption;
  loop: GifLoopOption;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Estimates animated GIF size prior to encoding so we can warn if likely > 15 MB.
 */
export function estimateGifSizeBytes(opts: VideoToGifJobOptions): number {
  const duration = Math.max(0, opts.trimEndSec - opts.trimStartSec);
  if (duration <= 0) return 0;
  const dims = computeGifOutputDimensions(opts.sourceWidth, opts.sourceHeight, opts.widthOption);
  const totalFrames = duration * opts.fps;
  // LZW 256-color palette GIF with Bayer dither averages ~0.32 bytes/pixel/frame
  return Math.round(dims.width * dims.height * totalFrames * 0.32);
}

/**
 * Builds FFmpeg arguments for Video to GIF with real start/end trimming,
 * preserved aspect ratio, custom palettegen + paletteuse, and loop control.
 */
export function buildVideoToGifArgs(
  inputFileName: string,
  outputFileName: string,
  opts: VideoToGifJobOptions
): string[] {
  const start = Math.max(0, opts.trimStartSec);
  const clipDuration = Math.max(0.1, opts.trimEndSec - start);
  const clampedFps = Math.max(1, Math.min(30, Math.round(opts.fps)));

  const scaleExpr =
    opts.widthOption === 'original'
      ? 'iw:ih:flags=lanczos'
      : `${opts.widthOption}:-1:flags=lanczos`;

  const filterComplex =
    `[0:v]fps=${clampedFps},scale=${scaleExpr},split[s0][s1];` +
    `[s0]palettegen=max_colors=256:stats_mode=diff[p];` +
    `[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;

  return [
    '-ss',
    start.toFixed(3),
    '-t',
    clipDuration.toFixed(3),
    '-i',
    inputFileName,
    '-lavfi',
    filterComplex,
    '-loop',
    String(opts.loop),
    outputFileName,
  ];
}

/**
 * Builds FFmpeg arguments to extract 16 kHz mono float32 PCM for Whisper ASR.
 */
export function buildAudioExtract16kMonoArgs(
  inputFileName: string,
  outputPcmFileName: string
): string[] {
  return [
    '-i',
    inputFileName,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'f32le',
    outputPcmFileName,
  ];
}

const FFMPEG_TIME_REGEX = /time=\s*(-?\d+):(\d{2}):(\d{2}(?:\.\d+)?)/;

/**
 * Parses `time=HH:MM:SS.xx` from FFmpeg stderr log lines into elapsed media seconds,
 * returning clamped [0, 1] progress against `expectedDurationSec`.
 */
export function parseFfmpegLogProgress(
  logMessage: string,
  expectedDurationSec: number
): { currentMediaSec: number; ratio: number } | null {
  if (!logMessage || expectedDurationSec <= 0) return null;
  const match = FFMPEG_TIME_REGEX.exec(logMessage);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || hours < 0) {
    return null;
  }
  const currentMediaSec = hours * 3600 + minutes * 60 + seconds;
  const ratio = Math.max(0, Math.min(1, currentMediaSec / expectedDurationSec));
  return { currentMediaSec, ratio };
}

/**
 * Computes smoothed ETA in seconds from job start timestamp and current [0, 1] progress ratio.
 */
export function computeEtaSeconds(elapsedMs: number, ratio: number): number | null {
  if (ratio <= 0.02 || ratio >= 1 || elapsedMs < 400) return null;
  const remainingMs = (elapsedMs * (1 - ratio)) / ratio;
  const sec = Math.ceil(remainingMs / 1000);
  return Number.isFinite(sec) && sec >= 0 ? sec : null;
}

/**
 * Splits a 16 kHz mono Float32Array into natural <=30s windows snapped to low-energy
 * pauses between 22s and 30s so spoken words are not cut mid-syllable.
 */
export function splitAudioIntoSilenceAwareWindows(
  samples: Float32Array,
  sampleRate = 16000,
  maxWindowSec = 29,
  minSearchSec = 22
): { startSample: number; endSample: number; startSec: number; endSec: number }[] {
  const totalSamples = samples.length;
  if (totalSamples === 0) return [];

  const maxWindowSamples = Math.floor(maxWindowSec * sampleRate);
  const minSearchSamples = Math.floor(minSearchSec * sampleRate);
  const frameSamples = Math.floor(0.1 * sampleRate); // 100 ms energy frame

  const windows: { startSample: number; endSample: number; startSec: number; endSec: number }[] = [];
  let cursor = 0;

  while (cursor < totalSamples) {
    const remaining = totalSamples - cursor;
    if (remaining <= maxWindowSamples) {
      windows.push({
        startSample: cursor,
        endSample: totalSamples,
        startSec: cursor / sampleRate,
        endSec: totalSamples / sampleRate,
      });
      break;
    }

    const searchStart = cursor + minSearchSamples;
    const searchEnd = cursor + maxWindowSamples;
    let bestSplit = searchEnd;
    let lowestRms = Number.POSITIVE_INFINITY;

    for (let pos = searchStart; pos + frameSamples <= searchEnd; pos += frameSamples) {
      let sumSq = 0;
      for (let i = pos; i < pos + frameSamples; i++) {
        const v = samples[i];
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / frameSamples);
      if (rms < lowestRms) {
        lowestRms = rms;
        bestSplit = pos + Math.floor(frameSamples / 2);
      }
    }

    windows.push({
      startSample: cursor,
      endSample: bestSplit,
      startSec: cursor / sampleRate,
      endSec: bestSplit / sampleRate,
    });
    cursor = bestSplit;
  }

  return windows;
}

/**
 * Detects Arabic / Hebrew / Persian / Urdu RTL script characters.
 */
export function containsArabicOrRtl(text: string): boolean {
  return /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * Formats seconds as SubRip `HH:MM:SS,mmm`.
 */
export function formatSrtTimestamp(sec: number): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  return (
    `${String(h).padStart(2, '0')}:` +
    `${String(m).padStart(2, '0')}:` +
    `${String(s).padStart(2, '0')},` +
    `${String(ms).padStart(3, '0')}`
  );
}

/**
 * Formats seconds as WebVTT `HH:MM:SS.mmm`.
 */
export function formatVttTimestamp(sec: number): string {
  return formatSrtTimestamp(sec).replace(',', '.');
}

function formatRtlAwareLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';
  if (containsArabicOrRtl(trimmed) && !trimmed.startsWith(UNICODE_RLM)) {
    return `${UNICODE_RLM}${trimmed}`;
  }
  return trimmed;
}

export function buildSrtContent(segments: TranscriptSegment[]): string {
  const blocks = segments
    .filter((s) => s.text.trim().length > 0)
    .map((seg, idx) => {
      const start = formatSrtTimestamp(seg.startSec);
      const end = formatSrtTimestamp(Math.max(seg.startSec + 0.2, seg.endSec));
      const lines = seg.text
        .split(/\r?\n/)
        .map(formatRtlAwareLine)
        .filter(Boolean)
        .join('\n');
      return `${idx + 1}\n${start} --> ${end}\n${lines}`;
    });
  return UTF8_BOM + blocks.join('\n\n') + (blocks.length > 0 ? '\n' : '');
}

export function buildVttContent(segments: TranscriptSegment[]): string {
  const blocks = segments
    .filter((s) => s.text.trim().length > 0)
    .map((seg, idx) => {
      const start = formatVttTimestamp(seg.startSec);
      const end = formatVttTimestamp(Math.max(seg.startSec + 0.2, seg.endSec));
      const lines = seg.text
        .split(/\r?\n/)
        .map(formatRtlAwareLine)
        .filter(Boolean)
        .join('\n');
      return `${idx + 1}\n${start} --> ${end}\n${lines}`;
    });
  return `${UTF8_BOM}WEBVTT\n\n${blocks.join('\n\n')}${blocks.length > 0 ? '\n' : ''}`;
}

export function buildMarkdownContent(
  segments: TranscriptSegment[],
  title: string
): string {
  const nonEmpty = segments.filter((s) => s.text.trim().length > 0);
  const rtlCount = nonEmpty.filter((s) => containsArabicOrRtl(s.text)).length;
  const isMajorityRtl = nonEmpty.length > 0 && rtlCount >= nonEmpty.length / 2;

  const lines = nonEmpty.map((seg) => {
    const range = `${formatVttTimestamp(seg.startSec)} → ${formatVttTimestamp(seg.endSec)}`;
    const text = formatRtlAwareLine(seg.text);
    const speakerPart = seg.speaker ? ` **(${seg.speaker})**` : '';
    return `- \`${range}\`${speakerPart}: ${text}`;
  });

  const body = `# ${title}\n\n${lines.join('\n')}\n`;
  if (isMajorityRtl) {
    return `${UTF8_BOM}<div dir="rtl">\n\n${body}\n</div>\n`;
  }
  return `${UTF8_BOM}${body}`;
}

export function buildPlainTextContent(segments: TranscriptSegment[]): string {
  const lines = segments
    .filter((s) => s.text.trim().length > 0)
    .map((seg) => {
      const range = `[${formatVttTimestamp(seg.startSec)} -> ${formatVttTimestamp(seg.endSec)}]`;
      const text = formatRtlAwareLine(seg.text);
      return seg.speaker ? `${range} ${seg.speaker}: ${text}` : `${range} ${text}`;
    });
  return `${UTF8_BOM}${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`;
}

/**
 * Exports transcript segments into a real .docx Word document with native bidirectional RTL
 * alignment and TextRun properties for Arabic content, or UTF-8 BOM text blobs for SRT/VTT/MD/TXT.
 */
export async function exportTranscriptBlob(
  segments: TranscriptSegment[],
  format: TranscriptExportFormat,
  title: string
): Promise<{ blob: Blob; extension: TranscriptExportFormat; mimeType: string }> {
  if (format === 'srt') {
    return {
      blob: new Blob([buildSrtContent(segments)], { type: 'application/x-subrip;charset=utf-8' }),
      extension: 'srt',
      mimeType: 'application/x-subrip',
    };
  }
  if (format === 'vtt') {
    return {
      blob: new Blob([buildVttContent(segments)], { type: 'text/vtt;charset=utf-8' }),
      extension: 'vtt',
      mimeType: 'text/vtt',
    };
  }
  if (format === 'md') {
    return {
      blob: new Blob([buildMarkdownContent(segments, title)], {
        type: 'text/markdown;charset=utf-8',
      }),
      extension: 'md',
      mimeType: 'text/markdown',
    };
  }
  if (format === 'txt') {
    return {
      blob: new Blob([buildPlainTextContent(segments)], {
        type: 'text/plain;charset=utf-8',
      }),
      extension: 'txt',
      mimeType: 'text/plain',
    };
  }

  // DOCX export with native RTL support
  const docx = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

  const nonEmpty = segments.filter((s) => s.text.trim().length > 0);
  const titleIsRtl = containsArabicOrRtl(title);

  const paragraphs = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      bidirectional: titleIsRtl,
      alignment: titleIsRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 280 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 32,
          font: 'Arial',
          rightToLeft: titleIsRtl,
        }),
      ],
    }),
    ...nonEmpty.map((seg) => {
      const isRtl = containsArabicOrRtl(seg.text);
      const timeLabel = `[${formatVttTimestamp(seg.startSec)} - ${formatVttTimestamp(seg.endSec)}] `;
      const speakerLabel = seg.speaker ? `${seg.speaker}: ` : '';

      return new Paragraph({
        bidirectional: isRtl,
        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { after: 180 },
        children: [
          new TextRun({
            text: timeLabel,
            bold: true,
            color: '64748B',
            size: 20,
            font: 'Consolas',
          }),
          ...(speakerLabel
            ? [
                new TextRun({
                  text: speakerLabel,
                  bold: true,
                  size: 22,
                  font: 'Arial',
                  rightToLeft: isRtl,
                }),
              ]
            : []),
          new TextRun({
            text: seg.text.trim(),
            size: 24,
            font: 'Arial',
            rightToLeft: isRtl,
          }),
        ],
      });
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const docxBlob = await Packer.toBlob(doc);
  return {
    blob: docxBlob,
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
