import {
  JobCancelledError,
  type TranscriptSegment,
  type WhisperLanguageChoice,
  type WhisperModelSize,
} from './videoAiEngine';
import type {
  RawWhisperSegment,
  WhisperWorkerIncomingMessage,
  WhisperWorkerOutgoingMessage,
} from '../workers/whisper.worker';

export interface WhisperProgressSnapshot {
  stage: 'downloading-model' | 'detecting-language' | 'transcribing';
  modelProgressPct: number;
  modelLoadedBytes?: number;
  modelTotalBytes?: number;
  fromCache: boolean;
  backend: 'webgpu' | 'wasm' | null;
  detectedLanguage: string | null;
  transcribeRatio: number;
  etaSeconds: number | null;
  streamingSegments?: TranscriptSegment[];
}

export interface WhisperTranscriptionResult {
  segments: TranscriptSegment[];
  detectedLanguage: string;
  backend: 'webgpu' | 'wasm';
  fromCache: boolean;
}

export interface WhisperJobHandle {
  promise: Promise<WhisperTranscriptionResult>;
  cancel: () => void;
}

let sharedWhisperWorker: Worker | null = null;
let whisperJobCounter = 0;

function getOrSpawnWhisperWorker(): Worker {
  if (!sharedWhisperWorker) {
    sharedWhisperWorker = new Worker(
      new URL('../workers/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return sharedWhisperWorker;
}

function toUiSegments(
  rawSegments: RawWhisperSegment[],
  defaultSpeaker: string
): TranscriptSegment[] {
  return rawSegments.map((seg, idx) => ({
    id: `seg-${idx}-${Math.round(seg.startSec * 100)}`,
    startSec: seg.startSec,
    endSec: seg.endSec,
    speaker: defaultSpeaker,
    text: seg.text,
  }));
}

/**
 * Runs Whisper speech-to-text inference inside a dedicated Web Worker on 16 kHz mono PCM samples.
 * Calling `cancel()` immediately terminates the Worker to halt WASM/WebGPU compute and free memory.
 */
export function transcribePcmWithWhisperWorker(params: {
  pcmSamples: Float32Array;
  modelSize: WhisperModelSize;
  language: WhisperLanguageChoice;
  defaultSpeakerLabel: string;
  onUpdate?: (snapshot: WhisperProgressSnapshot) => void;
}): WhisperJobHandle {
  const jobId = ++whisperJobCounter;
  const worker = getOrSpawnWhisperWorker();
  let isCancelled = false;

  const snapshot: WhisperProgressSnapshot = {
    stage: 'downloading-model',
    modelProgressPct: 0,
    fromCache: false,
    backend: null,
    detectedLanguage: params.language === 'auto' ? null : params.language,
    transcribeRatio: 0,
    etaSeconds: null,
  };

  let rejectFn: ((err: Error) => void) | null = null;
  let cleanupListeners: (() => void) | null = null;

  const cancel = () => {
    if (isCancelled) return;
    isCancelled = true;
    cleanupListeners?.();
    if (sharedWhisperWorker === worker) {
      sharedWhisperWorker.terminate();
      sharedWhisperWorker = null;
    } else {
      worker.terminate();
    }
    rejectFn?.(new JobCancelledError());
  };

  const promise = new Promise<WhisperTranscriptionResult>((resolve, reject) => {
    rejectFn = reject;

    const handleMessage = (event: MessageEvent<WhisperWorkerOutgoingMessage>) => {
      const msg = event.data;
      if (!msg || msg.jobId !== jobId || isCancelled) return;

      if (msg.type === 'backend-selected') {
        snapshot.backend = msg.backend;
        snapshot.fromCache = msg.fromCache;
        params.onUpdate?.({ ...snapshot });
        return;
      }

      if (msg.type === 'model-progress') {
        snapshot.stage = 'downloading-model';
        snapshot.modelProgressPct = msg.progressPct;
        snapshot.modelLoadedBytes = msg.loadedBytes;
        snapshot.modelTotalBytes = msg.totalBytes;
        snapshot.fromCache = msg.fromCache;
        params.onUpdate?.({ ...snapshot });
        return;
      }

      if (msg.type === 'detecting-language') {
        snapshot.stage = 'detecting-language';
        params.onUpdate?.({ ...snapshot });
        return;
      }

      if (msg.type === 'language-detected') {
        snapshot.detectedLanguage = msg.languageCode;
        params.onUpdate?.({ ...snapshot });
        return;
      }

      if (msg.type === 'transcribe-progress') {
        snapshot.stage = 'transcribing';
        snapshot.transcribeRatio = msg.progressRatio;
        snapshot.etaSeconds = msg.etaSeconds;
        snapshot.streamingSegments = toUiSegments(
          msg.latestSegments,
          params.defaultSpeakerLabel
        );
        params.onUpdate?.({ ...snapshot });
        return;
      }

      if (msg.type === 'complete') {
        cleanupListeners?.();
        const finalSegments = toUiSegments(msg.segments, params.defaultSpeakerLabel);
        resolve({
          segments: finalSegments,
          detectedLanguage: msg.detectedLanguage,
          backend: msg.backend,
          fromCache: msg.fromCache,
        });
        return;
      }

      if (msg.type === 'error') {
        cleanupListeners?.();
        reject(new Error(msg.message));
      }
    };

    const handleWorkerError = (errEvent: ErrorEvent) => {
      if (isCancelled) return;
      cleanupListeners?.();
      if (sharedWhisperWorker === worker) {
        sharedWhisperWorker.terminate();
        sharedWhisperWorker = null;
      }
      reject(new Error(errEvent.message || 'Whisper Worker runtime error'));
    };

    cleanupListeners = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleWorkerError);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleWorkerError);

    // Transfer ownership of a copied buffer to the Worker so main-thread memory can be GC'd immediately
    const transferredPcm = params.pcmSamples.slice();
    const request: WhisperWorkerIncomingMessage = {
      type: 'transcribe',
      jobId,
      pcmSamples: transferredPcm,
      modelSize: params.modelSize,
      language: params.language,
    };
    worker.postMessage(request, [transferredPcm.buffer]);
  });

  return { promise, cancel };
}

/**
 * Disposes Whisper ONNX sessions and terminates the Worker on workspace teardown if idle.
 */
export function disposeWhisperWorker(): void {
  if (!sharedWhisperWorker) return;
  try {
    const msg: WhisperWorkerIncomingMessage = { type: 'dispose' };
    sharedWhisperWorker.postMessage(msg);
    sharedWhisperWorker.terminate();
  } catch {
    // Ignore
  }
  sharedWhisperWorker = null;
}
