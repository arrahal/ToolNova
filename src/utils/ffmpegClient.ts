import type { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  JobCancelledError,
  VideoCompressionJobOptions,
  VideoToGifJobOptions,
  buildAudioExtract16kMonoArgs,
  buildVideoCompressionArgs,
  buildVideoToGifArgs,
  computeEtaSeconds,
  computeGifOutputDimensions,
  parseFfmpegLogProgress,
} from './videoAiEngine';

// Pinned single-thread @ffmpeg/core version (does NOT require SharedArrayBuffer or COOP/COEP)
export const PINNED_FFMPEG_CORE_VERSION = '0.12.10';
const PINNED_CORE_CDN_BASE = `https://unpkg.com/@ffmpeg/core@${PINNED_FFMPEG_CORE_VERSION}/dist/esm`;

export interface FfmpegProgressUpdate {
  stage: 'loading' | 'processing';
  progressRatio: number;
  etaSeconds: number | null;
  logLine?: string;
}

export interface FfmpegJobHandle<T> {
  promise: Promise<T>;
  cancel: () => void;
}

export interface VideoCompressionResult {
  blob: Blob;
  inputBytes: number;
  outputBytes: number;
  savedPercentage: number;
  durationMs: number;
}

export interface VideoToGifResult {
  blob: Blob;
  outputBytes: number;
  width: number;
  height: number;
  durationMs: number;
}

export interface ExtractedAudio16kResult {
  pcmSamples: Float32Array;
  durationSec: number;
}

let activeFfmpeg: FFmpeg | null = null;
let loadingFfmpegPromise: Promise<FFmpeg> | null = null;
let cachedCoreBlobUrl: string | null = null;
let cachedWasmBlobUrl: string | null = null;
let jobSequenceCounter = 0;

/**
 * Resolves single-thread @ffmpeg/core@0.12.10 JS and WASM into reusable Blob URLs.
 * Prefers local Vite-bundled @ffmpeg/core assets for fast offline-capable loading,
 * falling back to pinned unpkg @ffmpeg/core@0.12.10 URLs if needed.
 */
async function ensureCoreBlobUrls(): Promise<{ coreURL: string; wasmURL: string }> {
  if (cachedCoreBlobUrl && cachedWasmBlobUrl) {
    return { coreURL: cachedCoreBlobUrl, wasmURL: cachedWasmBlobUrl };
  }

  const { toBlobURL } = await import('@ffmpeg/util');

  try {
    const [coreAssetMod, wasmAssetMod] = await Promise.all([
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url'),
    ]);
    const [coreBlob, wasmBlob] = await Promise.all([
      toBlobURL(coreAssetMod.default, 'text/javascript'),
      toBlobURL(wasmAssetMod.default, 'application/wasm'),
    ]);
    cachedCoreBlobUrl = coreBlob;
    cachedWasmBlobUrl = wasmBlob;
    return { coreURL: coreBlob, wasmURL: wasmBlob };
  } catch {
    const [coreBlob, wasmBlob] = await Promise.all([
      toBlobURL(`${PINNED_CORE_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${PINNED_CORE_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);
    cachedCoreBlobUrl = coreBlob;
    cachedWasmBlobUrl = wasmBlob;
    return { coreURL: coreBlob, wasmURL: wasmBlob };
  }
}

async function getLoadedFfmpegInstance(): Promise<FFmpeg> {
  if (activeFfmpeg && activeFfmpeg.loaded) {
    return activeFfmpeg;
  }
  if (loadingFfmpegPromise) {
    return loadingFfmpegPromise;
  }

  loadingFfmpegPromise = (async () => {
    const [{ FFmpeg: FFmpegClass }, { coreURL, wasmURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      ensureCoreBlobUrls(),
    ]);
    const instance = new FFmpegClass();
    await instance.load({ coreURL, wasmURL });
    activeFfmpeg = instance;
    return instance;
  })();

  try {
    return await loadingFfmpegPromise;
  } finally {
    loadingFfmpegPromise = null;
  }
}

function getSafeExtension(fileName: string, fallbackExt: string): string {
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(fileName.trim());
  return match ? `.${match[1].toLowerCase()}` : fallbackExt;
}

interface FfmpegLogPayload {
  type: string;
  message: string;
}

interface FfmpegProgressPayload {
  progress: number;
  time: number;
}

interface InternalFfmpegExecParams<T> {
  file: File;
  fallbackInputExt: string;
  outputExt: string;
  expectedDurationSec: number;
  buildArgs: (inputPath: string, outputPath: string) => string[];
  transformOutput: (copiedBytes: Uint8Array<ArrayBuffer>, elapsedMs: number) => T;
  onProgress?: (update: FfmpegProgressUpdate) => void;
}

function executeFfmpegWorkerJob<T>(params: InternalFfmpegExecParams<T>): FfmpegJobHandle<T> {
  const jobId = ++jobSequenceCounter;
  const abortController = new AbortController();
  let isCancelled = false;
  let rejectCancelFn: ((err: Error) => void) | null = null;
  let boundFfmpeg: FFmpeg | null = null;

  const cancelPromise = new Promise<never>((_resolve, reject) => {
    rejectCancelFn = reject;
  });

  const cancel = () => {
    if (isCancelled) return;
    isCancelled = true;
    abortController.abort();
    if (boundFfmpeg) {
      try {
        boundFfmpeg.terminate();
      } catch {
        // Worker already terminated
      }
      if (activeFfmpeg === boundFfmpeg) {
        activeFfmpeg = null;
      }
    } else if (activeFfmpeg) {
      try {
        activeFfmpeg.terminate();
      } catch {
        // Ignore
      }
      activeFfmpeg = null;
    }
    loadingFfmpegPromise = null;
    rejectCancelFn?.(new JobCancelledError());
  };

  const workPromise = (async (): Promise<T> => {
    params.onProgress?.({
      stage: 'loading',
      progressRatio: 0,
      etaSeconds: null,
    });

    const [{ fetchFile }, ffmpeg] = await Promise.all([
      import('@ffmpeg/util'),
      getLoadedFfmpegInstance(),
    ]);

    if (isCancelled) {
      throw new JobCancelledError();
    }

    boundFfmpeg = ffmpeg;
    const inputExt = getSafeExtension(params.file.name, params.fallbackInputExt);
    const inputName = `in_${jobId}${inputExt}`;
    const outputName = `out_${jobId}${params.outputExt}`;
    const args = params.buildArgs(inputName, outputName);

    const startTimeMs = performance.now();
    let highestRatio = 0;
    const tailStderrLines: string[] = [];

    const onLog = ({ message }: FfmpegLogPayload) => {
      if (isCancelled) return;
      if (message) {
        tailStderrLines.push(message);
        if (tailStderrLines.length > 25) tailStderrLines.shift();
      }
      const parsed = parseFfmpegLogProgress(message, params.expectedDurationSec);
      if (parsed && parsed.ratio >= highestRatio) {
        highestRatio = parsed.ratio;
        const elapsedMs = performance.now() - startTimeMs;
        params.onProgress?.({
          stage: 'processing',
          progressRatio: highestRatio,
          etaSeconds: computeEtaSeconds(elapsedMs, highestRatio),
          logLine: message,
        });
      }
    };

    const onProgressEvent = ({ progress, time }: FfmpegProgressPayload) => {
      if (isCancelled) return;
      let candidateRatio: number | null = null;
      if (params.expectedDurationSec > 0 && Number.isFinite(time) && time > 0) {
        candidateRatio = Math.max(0, Math.min(0.99, time / 1_000_000 / params.expectedDurationSec));
      } else if (Number.isFinite(progress) && progress > 0) {
        candidateRatio = Math.max(0, Math.min(0.99, progress));
      }
      if (candidateRatio !== null && candidateRatio >= highestRatio) {
        highestRatio = candidateRatio;
        const elapsedMs = performance.now() - startTimeMs;
        params.onProgress?.({
          stage: 'processing',
          progressRatio: highestRatio,
          etaSeconds: computeEtaSeconds(elapsedMs, highestRatio),
        });
      }
    };

    ffmpeg.on('log', onLog);
    ffmpeg.on('progress', onProgressEvent);

    try {
      params.onProgress?.({
        stage: 'processing',
        progressRatio: 0.01,
        etaSeconds: null,
      });

      const inputData = await fetchFile(params.file);
      if (isCancelled) {
        throw new JobCancelledError();
      }

      await ffmpeg.writeFile(inputName, inputData, { signal: abortController.signal });
      const exitCode = await ffmpeg.exec(args, -1, { signal: abortController.signal });

      if (isCancelled) {
        throw new JobCancelledError();
      }

      if (exitCode !== 0) {
        const detail = tailStderrLines.slice(-4).join(' | ');
        throw new Error(`FFmpeg exited with code ${exitCode}${detail ? `: ${detail}` : ''}`);
      }

      const rawOutput = await ffmpeg.readFile(outputName, undefined, {
        signal: abortController.signal,
      });

      if (!(rawOutput instanceof Uint8Array) || rawOutput.byteLength === 0) {
        throw new Error('FFmpeg produced an empty output stream');
      }

      // Copy out of WASM MEMFS heap into a standalone ArrayBuffer before deleting virtual FS files
      const copiedBytes = new Uint8Array(rawOutput.byteLength);
      copiedBytes.set(rawOutput);
      const elapsedMs = performance.now() - startTimeMs;

      params.onProgress?.({
        stage: 'processing',
        progressRatio: 1,
        etaSeconds: 0,
      });

      return params.transformOutput(copiedBytes, elapsedMs);
    } catch (err) {
      if (isCancelled || abortController.signal.aborted || err instanceof JobCancelledError) {
        throw new JobCancelledError();
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      ffmpeg.off('log', onLog);
      ffmpeg.off('progress', onProgressEvent);
      if (!isCancelled && ffmpeg.loaded) {
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});
      }
    }
  })();

  const racedPromise = Promise.race([workPromise, cancelPromise]);
  // Prevent unhandled rejection if workPromise rejects slightly after cancelPromise already rejected
  workPromise.catch(() => {});

  return {
    promise: racedPromise,
    cancel,
  };
}

/**
 * Compresses an uploaded video file to H.264 MP4 inside the FFmpeg.wasm Web Worker.
 */
export function compressVideoWithFfmpeg(params: {
  file: File;
  durationSec: number;
  options: VideoCompressionJobOptions;
  onProgress?: (update: FfmpegProgressUpdate) => void;
}): FfmpegJobHandle<VideoCompressionResult> {
  const inputBytes = params.file.size;
  return executeFfmpegWorkerJob<VideoCompressionResult>({
    file: params.file,
    fallbackInputExt: '.mp4',
    outputExt: '.mp4',
    expectedDurationSec: params.durationSec,
    buildArgs: (inputPath, outputPath) =>
      buildVideoCompressionArgs(inputPath, outputPath, params.options),
    transformOutput: (copiedBytes, elapsedMs) => {
      const blob = new Blob([copiedBytes], { type: 'video/mp4' });
      const outputBytes = blob.size;
      const savedPercentage =
        inputBytes > 0 ? Math.round(((inputBytes - outputBytes) / inputBytes) * 1000) / 10 : 0;
      return {
        blob,
        inputBytes,
        outputBytes,
        savedPercentage,
        durationMs: elapsedMs,
      };
    },
    onProgress: params.onProgress,
  });
}

/**
 * Converts a trimmed video clip into a 256-color palette-optimized GIF inside the FFmpeg.wasm Web Worker,
 * preserving the original video's aspect ratio.
 */
export function convertVideoToGifWithFfmpeg(params: {
  file: File;
  options: VideoToGifJobOptions;
  onProgress?: (update: FfmpegProgressUpdate) => void;
}): FfmpegJobHandle<VideoToGifResult> {
  const clipDurationSec = Math.max(0.1, params.options.trimEndSec - params.options.trimStartSec);
  const dims = computeGifOutputDimensions(
    params.options.sourceWidth,
    params.options.sourceHeight,
    params.options.widthOption
  );

  return executeFfmpegWorkerJob<VideoToGifResult>({
    file: params.file,
    fallbackInputExt: '.mp4',
    outputExt: '.gif',
    expectedDurationSec: clipDurationSec,
    buildArgs: (inputPath, outputPath) =>
      buildVideoToGifArgs(inputPath, outputPath, params.options),
    transformOutput: (copiedBytes, elapsedMs) => {
      const blob = new Blob([copiedBytes], { type: 'image/gif' });
      return {
        blob,
        outputBytes: blob.size,
        width: dims.width,
        height: dims.height,
        durationMs: elapsedMs,
      };
    },
    onProgress: params.onProgress,
  });
}

/**
 * Extracts a 16 kHz mono Float32 PCM audio stream from any uploaded audio or video file
 * inside the FFmpeg.wasm Web Worker for Whisper transcription.
 */
export function extractAudio16kMonoWithFfmpeg(params: {
  file: File;
  expectedDurationSec: number;
  onProgress?: (update: FfmpegProgressUpdate) => void;
}): FfmpegJobHandle<ExtractedAudio16kResult> {
  return executeFfmpegWorkerJob<ExtractedAudio16kResult>({
    file: params.file,
    fallbackInputExt: '.mp4',
    outputExt: '.pcm',
    expectedDurationSec: params.expectedDurationSec,
    buildArgs: (inputPath, outputPath) => buildAudioExtract16kMonoArgs(inputPath, outputPath),
    transformOutput: (copiedBytes) => {
      const sampleCount = Math.floor(copiedBytes.byteLength / 4);
      const alignedBuffer = copiedBytes.buffer.slice(
        copiedBytes.byteOffset,
        copiedBytes.byteOffset + sampleCount * 4
      );
      const pcmSamples = new Float32Array(alignedBuffer);
      return {
        pcmSamples,
        durationSec: pcmSamples.length / 16000,
      };
    },
    onProgress: params.onProgress,
  });
}

/**
 * Explicitly terminates the FFmpeg Web Worker and releases cached Blob URLs if needed on full teardown.
 */
export function terminateFfmpegWorker(revokeCachedBlobs = false): void {
  if (activeFfmpeg) {
    try {
      activeFfmpeg.terminate();
    } catch {
      // Ignore
    }
    activeFfmpeg = null;
  }
  loadingFfmpegPromise = null;
  if (revokeCachedBlobs) {
    if (cachedCoreBlobUrl) {
      URL.revokeObjectURL(cachedCoreBlobUrl);
      cachedCoreBlobUrl = null;
    }
    if (cachedWasmBlobUrl) {
      URL.revokeObjectURL(cachedWasmBlobUrl);
      cachedWasmBlobUrl = null;
    }
  }
}
