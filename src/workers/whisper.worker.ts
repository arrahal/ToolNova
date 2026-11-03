import {
  env,
  pipeline,
  LogitsProcessor,
  LogitsProcessorList,
  type AutomaticSpeechRecognitionPipeline,
  type AutomaticSpeechRecognitionOutput,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers';
import {
  splitAudioIntoSilenceAwareWindows,
  computeEtaSeconds,
  type WhisperLanguageChoice,
  type WhisperModelSize,
} from '../utils/videoAiEngine';

env.allowLocalModels = false;
env.useBrowserCache = true;

export interface WhisperWorkerTranscribeRequest {
  type: 'transcribe';
  jobId: number;
  pcmSamples: Float32Array;
  modelSize: WhisperModelSize;
  language: WhisperLanguageChoice;
}

export interface WhisperWorkerDisposeRequest {
  type: 'dispose';
}

export type WhisperWorkerIncomingMessage =
  | WhisperWorkerTranscribeRequest
  | WhisperWorkerDisposeRequest;

export interface RawWhisperSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export type WhisperWorkerOutgoingMessage =
  | {
      type: 'backend-selected';
      jobId: number;
      backend: 'webgpu' | 'wasm';
      fromCache: boolean;
    }
  | {
      type: 'model-progress';
      jobId: number;
      progressPct: number;
      file?: string;
      loadedBytes?: number;
      totalBytes?: number;
      fromCache: boolean;
    }
  | {
      type: 'detecting-language';
      jobId: number;
    }
  | {
      type: 'language-detected';
      jobId: number;
      languageCode: string;
    }
  | {
      type: 'transcribe-progress';
      jobId: number;
      progressRatio: number;
      etaSeconds: number | null;
      latestSegments: RawWhisperSegment[];
    }
  | {
      type: 'complete';
      jobId: number;
      segments: RawWhisperSegment[];
      detectedLanguage: string;
      backend: 'webgpu' | 'wasm';
      fromCache: boolean;
    }
  | {
      type: 'error';
      jobId: number;
      message: string;
    };

const MODEL_ID_MAP: Record<WhisperModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
};

let loadedModelKey: string | null = null;
let loadedBackend: 'webgpu' | 'wasm' = 'wasm';
let activeTranscriber: AutomaticSpeechRecognitionPipeline | null = null;

function postWorkerMsg(msg: WhisperWorkerOutgoingMessage): void {
  self.postMessage(msg);
}

/**
 * Checks WebGPU adapter support inside the Worker without requiring external types.
 */
async function probeWebGpuAvailable(): Promise<boolean> {
  try {
    const navWithGpu = self.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (!navWithGpu.gpu || typeof navWithGpu.gpu.requestAdapter !== 'function') {
      return false;
    }
    const adapter = await navWithGpu.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

/**
 * Checks Browser Cache Storage (`transformers-cache`) to see if ONNX weights for this model
 * were already downloaded in a prior session.
 */
async function isModelCachedInBrowser(modelRepoId: string): Promise<boolean> {
  try {
    if (typeof self.caches === 'undefined') return false;
    const cache = await self.caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some(
      (req) => req.url.includes(modelRepoId) && req.url.includes('decoder_model_merged')
    );
  } catch {
    return false;
  }
}

/**
 * LogitsProcessor restricting generation of the first token after `<|startoftranscript|>`
 * strictly to Whisper's language token IDs so real multilingual auto-detection works
 * accurately (instead of @huggingface/transformers' default English fallback).
 */
class AllowedLanguageTokensLogitsProcessor extends LogitsProcessor {
  private readonly allowedIds: Set<number>;

  constructor(allowedIds: number[]) {
    super();
    this.allowedIds = new Set(allowedIds);
  }

  override _call(_inputIds: bigint[][], logits: Tensor): Tensor {
    const data = logits.data as Float32Array;
    for (let i = 0; i < data.length; i++) {
      if (!this.allowedIds.has(i)) {
        data[i] = -Infinity;
      }
    }
    return logits;
  }
}

interface WhisperGenerationConfigShape {
  lang_to_id?: Record<string, number>;
  decoder_start_token_id?: number;
}

/**
 * Selects a representative <= 30s non-silent audio excerpt and predicts the spoken
 * language token from Whisper's encoder features.
 */
async function detectSpokenLanguage(
  transcriber: AutomaticSpeechRecognitionPipeline,
  pcmSamples: Float32Array
): Promise<string> {
  const genConfig = (
    transcriber.model as unknown as { generation_config?: WhisperGenerationConfigShape }
  ).generation_config;

  const langToId = genConfig?.lang_to_id;
  const sotTokenId = genConfig?.decoder_start_token_id;
  if (!langToId || typeof sotTokenId !== 'number') {
    return 'en';
  }

  const idToIsoCode = new Map<number, string>();
  const allowedIds: number[] = [];
  for (const [tokenStr, tokenId] of Object.entries(langToId)) {
    // Token format in Whisper generation_config is "<|ar|>", "<|fr|>", "<|en|>", etc.
    const cleaned = tokenStr.replace(/^<\|/, '').replace(/\|>$/, '').trim();
    if (cleaned && typeof tokenId === 'number') {
      idToIsoCode.set(tokenId, cleaned);
      allowedIds.push(tokenId);
    }
  }

  if (allowedIds.length === 0) {
    return 'en';
  }

  // Find first window with audible speech energy (up to 30s)
  const sampleRate = 16000;
  const maxSliceSamples = 30 * sampleRate;
  let startOffset = 0;
  const step = sampleRate; // 1s stride
  for (let offset = 0; offset + step < pcmSamples.length; offset += step) {
    let sumSq = 0;
    for (let i = offset; i < offset + step; i++) {
      sumSq += pcmSamples[i] * pcmSamples[i];
    }
    const rms = Math.sqrt(sumSq / step);
    if (rms > 0.008) {
      startOffset = Math.max(0, offset - Math.floor(sampleRate * 0.25));
      break;
    }
  }

  const probeSlice = pcmSamples.subarray(
    startOffset,
    Math.min(pcmSamples.length, startOffset + maxSliceSamples)
  );

  // Compute log-mel spectrogram input_features and generate exactly 1 language token
  const processorCall = transcriber.processor as unknown as (
    audio: Float32Array
  ) => Promise<{ input_features: Tensor }>;
  const { input_features } = await processorCall(probeSlice);

  const processorList = new LogitsProcessorList();
  processorList.push(new AllowedLanguageTokensLogitsProcessor(allowedIds));

  const modelGenerate = (
    transcriber.model as unknown as {
      generate: (opts: {
        inputs: Tensor;
        decoder_input_ids: number[][];
        logits_processor: LogitsProcessorList;
        max_new_tokens: number;
        return_timestamps: boolean;
      }) => Promise<Tensor>;
    }
  ).generate.bind(transcriber.model);

  const generatedIds = await modelGenerate({
    inputs: input_features,
    decoder_input_ids: [[sotTokenId]],
    logits_processor: processorList,
    max_new_tokens: 1,
    return_timestamps: false,
  });

  const tensorData = generatedIds.data;
  const lastToken = tensorData.length > 0 ? Number(tensorData[tensorData.length - 1]) : -1;
  return idToIsoCode.get(lastToken) ?? 'en';
}

async function getOrCreateTranscriber(
  modelSize: WhisperModelSize,
  jobId: number
): Promise<{
  transcriber: AutomaticSpeechRecognitionPipeline;
  backend: 'webgpu' | 'wasm';
  fromCache: boolean;
}> {
  const modelRepoId = MODEL_ID_MAP[modelSize];
  if (activeTranscriber && loadedModelKey === modelRepoId) {
    return {
      transcriber: activeTranscriber,
      backend: loadedBackend,
      fromCache: true,
    };
  }

  if (activeTranscriber) {
    try {
      await activeTranscriber.dispose();
    } catch {
      // Ignore disposal warnings
    }
    activeTranscriber = null;
    loadedModelKey = null;
  }

  const fromCache = await isModelCachedInBrowser(modelRepoId);
  const webGpuSupported = await probeWebGpuAvailable();

  const fileBytesMap = new Map<string, { loaded: number; total: number }>();

  const onProgress = (info: ProgressInfo) => {
    if (info.status === 'progress_total') {
      postWorkerMsg({
        type: 'model-progress',
        jobId,
        progressPct: Math.round(info.progress),
        loadedBytes: info.loaded,
        totalBytes: info.total,
        fromCache,
      });
      return;
    }

    if (info.status === 'progress') {
      fileBytesMap.set(info.file, { loaded: info.loaded, total: info.total });
      let sumLoaded = 0;
      let sumTotal = 0;
      for (const entry of fileBytesMap.values()) {
        sumLoaded += entry.loaded;
        sumTotal += entry.total;
      }
      const pct = sumTotal > 0 ? Math.round((sumLoaded / sumTotal) * 100) : Math.round(info.progress);
      postWorkerMsg({
        type: 'model-progress',
        jobId,
        progressPct: Math.max(0, Math.min(100, pct)),
        file: info.file,
        loadedBytes: sumLoaded,
        totalBytes: sumTotal,
        fromCache,
      });
    }
  };

  if (webGpuSupported) {
    try {
      const gpuPipeline = await pipeline('automatic-speech-recognition', modelRepoId, {
        device: 'webgpu',
        dtype: {
          encoder_model: 'fp32',
          decoder_model_merged: 'q4',
        },
        progress_callback: onProgress,
      });
      activeTranscriber = gpuPipeline;
      loadedModelKey = modelRepoId;
      loadedBackend = 'webgpu';
      return { transcriber: gpuPipeline, backend: 'webgpu', fromCache };
    } catch {
      // Automatic fallback to WASM if WebGPU session creation fails on driver limits
    }
  }

  const wasmPipeline = await pipeline('automatic-speech-recognition', modelRepoId, {
    device: 'wasm',
    dtype: {
      encoder_model: 'fp32',
      decoder_model_merged: 'q8',
    },
    progress_callback: onProgress,
  });

  activeTranscriber = wasmPipeline;
  loadedModelKey = modelRepoId;
  loadedBackend = 'wasm';
  return { transcriber: wasmPipeline, backend: 'wasm', fromCache };
}

async function handleTranscribeJob(req: WhisperWorkerTranscribeRequest): Promise<void> {
  const { jobId, pcmSamples, modelSize, language } = req;

  try {
    const { transcriber, backend, fromCache } = await getOrCreateTranscriber(modelSize, jobId);

    postWorkerMsg({
      type: 'backend-selected',
      jobId,
      backend,
      fromCache,
    });

    postWorkerMsg({
      type: 'model-progress',
      jobId,
      progressPct: 100,
      fromCache,
    });

    if (pcmSamples.length === 0) {
      postWorkerMsg({
        type: 'complete',
        jobId,
        segments: [],
        detectedLanguage: language === 'auto' ? 'en' : language,
        backend,
        fromCache,
      });
      return;
    }

    let resolvedLanguage: string = language;
    if (language === 'auto') {
      postWorkerMsg({ type: 'detecting-language', jobId });
      resolvedLanguage = await detectSpokenLanguage(transcriber, pcmSamples);
      postWorkerMsg({
        type: 'language-detected',
        jobId,
        languageCode: resolvedLanguage,
      });
    }

    const windows = splitAudioIntoSilenceAwareWindows(pcmSamples, 16000, 29, 22);
    const allSegments: RawWhisperSegment[] = [];
    const totalSamples = pcmSamples.length;
    const transcribeStartMs = performance.now();

    postWorkerMsg({
      type: 'transcribe-progress',
      jobId,
      progressRatio: 0.02,
      etaSeconds: null,
      latestSegments: [],
    });

    for (let wIdx = 0; wIdx < windows.length; wIdx++) {
      const win = windows[wIdx];
      const slice = pcmSamples.subarray(win.startSample, win.endSample);
      const windowDurationSec = win.endSec - win.startSec;

      const output = (await transcriber(slice, {
        language: resolvedLanguage,
        task: 'transcribe',
        return_timestamps: true,
      })) as AutomaticSpeechRecognitionOutput;

      if (Array.isArray(output.chunks) && output.chunks.length > 0) {
        for (const chunk of output.chunks) {
          const cleanText = chunk.text.trim();
          if (!cleanText) continue;
          const rawStart = typeof chunk.timestamp?.[0] === 'number' ? chunk.timestamp[0] : 0;
          const rawEnd =
            typeof chunk.timestamp?.[1] === 'number'
              ? chunk.timestamp[1]
              : Math.min(windowDurationSec, rawStart + Math.max(1.2, windowDurationSec));

          const absStart = Math.round((win.startSec + Math.max(0, rawStart)) * 100) / 100;
          const absEnd =
            Math.round(
              Math.max(absStart + 0.25, win.startSec + Math.min(windowDurationSec, rawEnd)) * 100
            ) / 100;

          allSegments.push({
            startSec: absStart,
            endSec: absEnd,
            text: cleanText,
          });
        }
      } else if (output.text && output.text.trim().length > 0) {
        allSegments.push({
          startSec: Math.round(win.startSec * 100) / 100,
          endSec: Math.round(win.endSec * 100) / 100,
          text: output.text.trim(),
        });
      }

      const ratio = Math.min(0.99, win.endSample / totalSamples);
      const elapsedMs = performance.now() - transcribeStartMs;
      postWorkerMsg({
        type: 'transcribe-progress',
        jobId,
        progressRatio: ratio,
        etaSeconds: computeEtaSeconds(elapsedMs, ratio),
        latestSegments: [...allSegments],
      });
    }

    postWorkerMsg({
      type: 'complete',
      jobId,
      segments: allSegments,
      detectedLanguage: resolvedLanguage,
      backend,
      fromCache,
    });
  } catch (err) {
    postWorkerMsg({
      type: 'error',
      jobId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

self.addEventListener('message', (event: MessageEvent<WhisperWorkerIncomingMessage>) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'dispose') {
    if (activeTranscriber) {
      activeTranscriber.dispose().catch(() => {});
      activeTranscriber = null;
      loadedModelKey = null;
    }
    return;
  }

  if (data.type === 'transcribe') {
    void handleTranscribeJob(data);
  }
});
