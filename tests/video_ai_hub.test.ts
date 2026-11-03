/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import JSZip from 'jszip';
import {
  DEFAULT_MAX_MEDIA_FILE_MB,
  GIF_SIZE_WARNING_BYTES,
  UNICODE_RLM,
  UTF8_BOM,
  buildAudioExtract16kMonoArgs,
  buildVideoCompressionArgs,
  buildVideoToGifArgs,
  computeEtaSeconds,
  computeGifOutputDimensions,
  computeTargetVideoDimensions,
  containsArabicOrRtl,
  estimateCompressedSizeBytes,
  estimateGifSizeBytes,
  exportTranscriptBlob,
  formatSrtTimestamp,
  formatVttTimestamp,
  parseFfmpegLogProgress,
  splitAudioIntoSilenceAwareWindows,
  validateMediaFileSize,
  type TranscriptSegment,
} from '../src/utils/videoAiEngine';
import { VIDEO_AI_STRINGS } from '../src/i18n/videoAiStrings';
import { TOOLS_DATA } from '../src/data/toolsData';
import { getLocalizedTool } from '../src/data/translations';
import { VideoAiWorkspace } from '../src/components/VideoAiWorkspace';

function readBlobAsTextRaw(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      // Verify UTF-8 BOM bytes EF BB BF directly before decoding
      const hasBomBytes =
        bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      const decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
      resolve(hasBomBytes ? decoded : decoded.replace(/^\uFEFF/, ''));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Video & AI Hub — Real Engine, RTL Exports, Size Guards & Honest Mic Fallback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('1. Configurable File Size Guard (Default 500 MB)', () => {
    it('accepts files up to 500 MB by default and rejects larger or empty files', () => {
      expect(DEFAULT_MAX_MEDIA_FILE_MB).toBe(500);

      const ok120Mb = validateMediaFileSize(120 * 1024 * 1024);
      expect(ok120Mb.valid).toBe(true);
      expect(ok120Mb.maxLimitMB).toBe(500);

      const exact500Mb = validateMediaFileSize(500 * 1024 * 1024);
      expect(exact500Mb.valid).toBe(true);

      const over500Mb = validateMediaFileSize(501 * 1024 * 1024);
      expect(over500Mb.valid).toBe(false);
      expect(over500Mb.actualMB).toBeCloseTo(501, 1);

      const customLimitReject = validateMediaFileSize(120 * 1024 * 1024, 100);
      expect(customLimitReject.valid).toBe(false);
      expect(customLimitReject.maxLimitMB).toBe(100);

      expect(validateMediaFileSize(0).valid).toBe(false);
    });
  });

  describe('2. Video Compressor — H.264 MP4 Args, Aspect-Preserving Even Dimensions & Estimates', () => {
    it('computes even dimensions preserving landscape and portrait aspect ratios without upscaling', () => {
      // 1080p landscape -> 720p
      expect(computeTargetVideoDimensions(1920, 1080, '720p')).toEqual({
        width: 1280,
        height: 720,
      });

      // Vertical 9:16 portrait 1080x1920 -> 480p short edge
      expect(computeTargetVideoDimensions(1080, 1920, '480p')).toEqual({
        width: 480,
        height: 852,
      });

      // Does not upscale a 640x360 clip when 1080p is selected
      expect(computeTargetVideoDimensions(640, 360, '1080p')).toEqual({
        width: 640,
        height: 360,
      });

      // Forces odd source dimensions to even numbers for yuv420p compatibility
      const oddOriginal = computeTargetVideoDimensions(853, 481, 'original');
      expect(oddOriginal.width % 2).toBe(0);
      expect(oddOriginal.height % 2).toBe(0);
    });

    it('builds playable H.264 MP4 FFmpeg args with CRF, faststart, and audio bitrate or mute', () => {
      const withAudio = buildVideoCompressionArgs('in_1.mp4', 'out_1.mp4', {
        resolution: '720p',
        crf: 26,
        audioBitrate: '128k',
        sourceWidth: 1920,
        sourceHeight: 1080,
      });

      expect(withAudio).toContain('libx264');
      expect(withAudio).toContain('yuv420p');
      expect(withAudio).toContain('+faststart');
      expect(withAudio).toContain('26');
      expect(withAudio).toContain('aac');
      expect(withAudio).toContain('128k');
      expect(withAudio[withAudio.length - 1]).toBe('out_1.mp4');

      const muted = buildVideoCompressionArgs('in_2.mov', 'out_2.mp4', {
        resolution: '480p',
        crf: 30,
        audioBitrate: 'mute',
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      expect(muted).toContain('-an');
      expect(muted).not.toContain('aac');
    });

    it('produces monotonically smaller target size estimates as CRF increases or resolution drops', () => {
      const baseParams = {
        inputSizeBytes: 80 * 1024 * 1024,
        durationSec: 120,
        sourceWidth: 1920,
        sourceHeight: 1080,
        resolution: '1080p' as const,
        crf: 20,
        audioBitrate: '192k' as const,
      };

      const highQuality = estimateCompressedSizeBytes(baseParams);
      const higherCrf = estimateCompressedSizeBytes({ ...baseParams, crf: 28 });
      const lowerRes = estimateCompressedSizeBytes({
        ...baseParams,
        crf: 28,
        resolution: '480p',
        audioBitrate: '64k',
      });

      expect(highQuality.estimatedBytes).toBeGreaterThan(higherCrf.estimatedBytes);
      expect(higherCrf.estimatedBytes).toBeGreaterThan(lowerRes.estimatedBytes);
    });
  });

  describe('3. Video to GIF — True Aspect Ratio, Trimming, Palettegen/Paletteuse & 15 MB Threshold', () => {
    it('preserves portrait, square, and ultrawide aspect ratios instead of forcing 16:9', () => {
      // Portrait 9:16 (1080x1920) at width 320 -> 320x569 (NOT 320x180!)
      const portrait = computeGifOutputDimensions(1080, 1920, 320);
      expect(portrait).toEqual({ width: 320, height: 569 });

      // Square 1:1 (1000x1000) at width 480 -> 480x480
      expect(computeGifOutputDimensions(1000, 1000, 480)).toEqual({ width: 480, height: 480 });

      // Original dimensions preserved
      expect(computeGifOutputDimensions(720, 900, 'original')).toEqual({
        width: 720,
        height: 900,
      });
    });

    it('builds two-stage palettegen + paletteuse lavfi filter with exact start/duration trim and loop', () => {
      const args = buildVideoToGifArgs('clip.mp4', 'anim.gif', {
        trimStartSec: 12.5,
        trimEndSec: 17.0,
        fps: 15,
        widthOption: 480,
        loop: 0,
        sourceWidth: 1080,
        sourceHeight: 1920,
      });

      expect(args.slice(0, 4)).toEqual(['-ss', '12.500', '-t', '4.500']);
      const lavfiIdx = args.indexOf('-lavfi');
      expect(lavfiIdx).toBeGreaterThan(-1);
      expect(args[lavfiIdx + 1]).toContain('fps=15,scale=480:-1:flags=lanczos');
      expect(args[lavfiIdx + 1]).toContain('palettegen=');
      expect(args[lavfiIdx + 1]).toContain('paletteuse=');
      expect(args).toContain('-loop');
      expect(args[args.indexOf('-loop') + 1]).toBe('0');
    });

    it('flags GIF estimates exceeding 15 MB', () => {
      const hugeEstimate = estimateGifSizeBytes({
        trimStartSec: 0,
        trimEndSec: 45,
        fps: 24,
        widthOption: 'original',
        loop: 0,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      expect(hugeEstimate).toBeGreaterThan(GIF_SIZE_WARNING_BYTES);
    });
  });

  describe('4. FFmpeg Progress/ETA Parser & Whisper Silence-Aware Windowing', () => {
    it('parses FFmpeg stderr time=HH:MM:SS.ms lines and calculates ETA', () => {
      const line = 'frame= 1800 fps= 45 q=29.0 size=    2048kB time=00:01:00.00 bitrate= 279.6kbits/s speed=1.5x';
      const parsed = parseFfmpegLogProgress(line, 120);
      expect(parsed).not.toBeNull();
      expect(parsed!.currentMediaSec).toBe(60);
      expect(parsed!.ratio).toBeCloseTo(0.5, 3);

      const eta = computeEtaSeconds(4000, 0.5);
      expect(eta).toBe(4);
    });

    it('builds 16 kHz mono f32le PCM extraction arguments for Whisper', () => {
      const args = buildAudioExtract16kMonoArgs('lecture.mp4', 'audio.pcm');
      expect(args).toEqual([
        '-i',
        'lecture.mp4',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'f32le',
        'audio.pcm',
      ]);
    });

    it('splits a 75-second 16kHz audio buffer at silent pauses without dropping samples', () => {
      const sampleRate = 16000;
      const totalSamples = 75 * sampleRate;
      const pcm = new Float32Array(totalSamples);
      // Fill with simulated speech energy except a quiet pause around 25.0s–25.4s and 51.0s–51.4s
      for (let i = 0; i < totalSamples; i++) {
        const sec = i / sampleRate;
        const inPause = (sec >= 25.0 && sec <= 25.4) || (sec >= 51.0 && sec <= 51.4);
        pcm[i] = inPause ? 0.0001 : Math.sin(i * 0.1) * 0.25;
      }

      const windows = splitAudioIntoSilenceAwareWindows(pcm, sampleRate, 29, 22);
      expect(windows.length).toBe(3);
      expect(windows[0].startSample).toBe(0);
      // First split snaps into the 25.0s–25.4s silence window
      expect(windows[0].endSec).toBeGreaterThanOrEqual(25.0);
      expect(windows[0].endSec).toBeLessThanOrEqual(25.5);
      expect(windows[1].startSample).toBe(windows[0].endSample);
      expect(windows[2].endSample).toBe(totalSamples);
    });
  });

  describe('5. Speech-to-Text Exports — UTF-8 BOM & Arabic RTL in SRT, VTT, MD, TXT, DOCX', () => {
    const sampleArabicAndEnglishSegments: TranscriptSegment[] = [
      {
        id: 's1',
        startSec: 0.5,
        endSec: 4.25,
        speaker: 'المتحدث',
        text: 'مرحباً بكم في منصة ToolNova لمعالجة الوسائط محلياً.',
      },
      {
        id: 's2',
        startSec: 4.5,
        endSec: 8.0,
        speaker: 'Speaker',
        text: 'Local WebAssembly processing keeps every file private.',
      },
    ];

    it('formats SRT and VTT timestamps accurately', () => {
      expect(formatSrtTimestamp(65.432)).toBe('00:01:05,432');
      expect(formatVttTimestamp(3661.05)).toBe('01:01:01.050');
      expect(containsArabicOrRtl('مرحباً')).toBe(true);
      expect(containsArabicOrRtl('Hello world')).toBe(false);
    });

    it('exports SRT, VTT, MD, and TXT with UTF-8 BOM and Unicode RLM on Arabic lines', async () => {
      for (const fmt of ['srt', 'vtt', 'md', 'txt'] as const) {
        const { blob, extension } = await exportTranscriptBlob(
          sampleArabicAndEnglishSegments,
          fmt,
          'تفريغ تجريبي'
        );
        expect(extension).toBe(fmt);
        const rawText = await readBlobAsTextRaw(blob);
        expect(rawText.startsWith(UTF8_BOM)).toBe(true);
        expect(rawText).toContain(`${UNICODE_RLM}مرحباً بكم في منصة ToolNova`);
      }
    });

    it('exports a valid DOCX archive with native Word bidirectional (<w:bidi/> & <w:rtl/>) tags for Arabic', async () => {
      const { blob, extension } = await exportTranscriptBlob(
        sampleArabicAndEnglishSegments,
        'docx',
        'تفريغ نصي عربي'
      );
      expect(extension).toBe('docx');

      const arrayBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });

      const zip = await JSZip.loadAsync(arrayBuf);
      const docXmlFile = zip.file('word/document.xml');
      expect(docXmlFile).not.toBeNull();
      const docXml = await docXmlFile!.async('string');
      expect(docXml).toContain('مرحباً بكم في منصة ToolNova');
      expect(docXml).toContain('w:bidi');
      expect(docXml).toContain('w:rtl');
    });
  });

  describe('6. Localization (ar/fr/en/es) & Honest Unsupported SpeechRecognition UI', () => {
    it('provides complete translations across ar, fr, en, es for all 3 Video & AI tools', () => {
      const langs = ['ar', 'fr', 'en', 'es'] as const;
      const videoTools = TOOLS_DATA.filter((t) => t.hub === 'video');
      expect(videoTools.map((t) => t.id)).toEqual([
        'video-compressor',
        'video-to-gif',
        'speech-to-text',
      ]);

      for (const lang of langs) {
        expect(VIDEO_AI_STRINGS[lang].compressActionBtn.length).toBeGreaterThan(3);
        expect(VIDEO_AI_STRINGS[lang].convertGifActionBtn.length).toBeGreaterThan(3);
        expect(VIDEO_AI_STRINGS[lang].micUnsupportedTitle.length).toBeGreaterThan(5);
        for (const tool of videoTools) {
          const localized = getLocalizedTool(tool, lang);
          expect(localized.title.length).toBeGreaterThan(2);
          expect(localized.description.length).toBeGreaterThan(5);
        }
      }
    });

    it('shows an honest unsupported message and inserts zero fake segments when SpeechRecognition is missing', async () => {
      const speechTool = TOOLS_DATA.find((t) => t.id === 'speech-to-text')!;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(React.createElement(VideoAiWorkspace, { tool: speechTool, language: 'ar' }));
      });

      // Switch to Live Microphone tab
      const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
      expect(tabs.length).toBe(2);

      await act(async () => {
        (tabs[1] as HTMLButtonElement).click();
      });

      // Verify honest alert banner is displayed and segment count remains (0)
      const alerts = Array.from(container.querySelectorAll('[role="alert"]'));
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].textContent).toContain(VIDEO_AI_STRINGS.ar.micUnsupportedTitle);
      expect(container.textContent).toContain(VIDEO_AI_STRINGS.ar.segmentsCountLabel(0));
      expect(container.querySelectorAll('textarea').length).toBe(0);

      await act(async () => {
        root.unmount();
      });
    });
  });
});
