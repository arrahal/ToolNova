import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Upload,
  Download,
  Play,
  Square,
  Mic,
  Film,
  Volume2,
  Trash2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scissors,
  Cpu,
  HardDriveDownload,
  RefreshCw,
} from 'lucide-react';
import { ToolItem } from '../data/toolsData';
import { AppLanguage } from '../data/translations';
import { VIDEO_AI_STRINGS } from '../i18n/videoAiStrings';
import {
  DEFAULT_MAX_MEDIA_FILE_MB,
  GIF_SIZE_WARNING_BYTES,
  JobCancelledError,
  TranscriptExportFormat,
  TranscriptSegment,
  VideoAudioBitrate,
  VideoTargetResolution,
  GifLoopOption,
  GifWidthOption,
  WhisperLanguageChoice,
  WhisperModelSize,
  DictationLocale,
  computeGifOutputDimensions,
  computeTargetVideoDimensions,
  containsArabicOrRtl,
  estimateCompressedSizeBytes,
  estimateGifSizeBytes,
  exportTranscriptBlob,
  formatBytesHuman,
  formatDurationClock,
  formatVttTimestamp,
  validateMediaFileSize,
} from '../utils/videoAiEngine';
import {
  compressVideoWithFfmpeg,
  convertVideoToGifWithFfmpeg,
  extractAudio16kMonoWithFfmpeg,
} from '../utils/ffmpegClient';
import {
  disposeWhisperWorker,
  transcribePcmWithWhisperWorker,
} from '../utils/whisperClient';

interface VideoAiWorkspaceProps {
  tool: ToolItem;
  language: AppLanguage;
  onRecordHistory?: (toolTitle: string, detail: string) => void;
}

interface LoadedMediaMetadata {
  durationSec: number;
  width: number;
  height: number;
  isVideo: boolean;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionInstanceLike;

function getBrowserSpeechRecognition(): SpeechRecognitionConstructorLike | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function getInitialMaxLimitMb(): number {
  const envVal = Number(import.meta.env.VITE_MAX_VIDEO_FILE_MB);
  if (Number.isFinite(envVal) && envVal >= 10 && envVal <= 2048) {
    return Math.round(envVal);
  }
  return DEFAULT_MAX_MEDIA_FILE_MB;
}

export const VideoAiWorkspace: React.FC<VideoAiWorkspaceProps> = ({
  tool,
  language,
  onRecordHistory,
}) => {
  const t = VIDEO_AI_STRINGS[language] ?? VIDEO_AI_STRINGS.ar;
  const isRtl = language === 'ar';

  // ---------------- SHARED FILE & MEDIA STATE ----------------
  const [maxFileSizeMb, setMaxFileSizeMb] = useState<number>(getInitialMaxLimitMb);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [mediaMeta, setMediaMeta] = useState<LoadedMediaMetadata>({
    durationSec: 0,
    width: 0,
    height: 0,
    isVideo: true,
  });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Preview tab ('input' vs 'output')
  const [previewTab, setPreviewTab] = useState<'input' | 'output'>('input');

  // Output blob state (for video-compressor and video-to-gif)
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputDimensions, setOutputDimensions] = useState<{ width: number; height: number } | null>(
    null
  );

  // Job execution state
  const [isRunningJob, setIsRunningJob] = useState(false);
  const [jobStageLabel, setJobStageLabel] = useState<string>('');
  const [jobProgressRatio, setJobProgressRatio] = useState<number>(0);
  const [jobEtaSec, setJobEtaSec] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // ---------------- 1. VIDEO COMPRESSOR OPTIONS ----------------
  const [videoResolution, setVideoResolution] = useState<VideoTargetResolution>('720p');
  const [videoCrf, setVideoCrf] = useState<number>(24);
  const [audioBitrate, setAudioBitrate] = useState<VideoAudioBitrate>('128k');

  // ---------------- 2. VIDEO TO GIF OPTIONS ----------------
  const [gifTrimStart, setGifTrimStart] = useState<number>(0);
  const [gifTrimEnd, setGifTrimEnd] = useState<number>(5);
  const [gifFps, setGifFps] = useState<number>(12);
  const [gifWidth, setGifWidth] = useState<GifWidthOption>(480);
  const [gifLoop, setGifLoop] = useState<GifLoopOption>(0);
  const [playheadSec, setPlayheadSec] = useState<number>(0);

  // ---------------- 3. SPEECH TO TEXT STATE ----------------
  const [sttMode, setSttMode] = useState<'file' | 'mic'>('file');
  const [whisperModelSize, setWhisperModelSize] = useState<WhisperModelSize>('tiny');
  const [whisperLanguage, setWhisperLanguage] = useState<WhisperLanguageChoice>('auto');
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [activeBackend, setActiveBackend] = useState<'webgpu' | 'wasm' | null>(null);
  const [modelDownloadPct, setModelDownloadPct] = useState<number | null>(null);
  const [modelLoadedBytes, setModelLoadedBytes] = useState<number | undefined>(undefined);
  const [modelTotalBytes, setModelTotalBytes] = useState<number | undefined>(undefined);
  const [modelFromCache, setModelFromCache] = useState<boolean>(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [exportingDocx, setExportingDocx] = useState(false);

  // Live Microphone Dictation state
  const [dictationLocale, setDictationLocale] = useState<DictationLocale>(() => {
    if (language === 'fr') return 'fr-FR';
    if (language === 'en') return 'en-US';
    if (language === 'es') return 'es-ES';
    return 'ar-SA';
  });
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [interimMicText, setInterimMicText] = useState('');
  const speechRecognitionSupported = useMemo(() => Boolean(getBrowserSpeechRecognition()), []);

  // Refs for cleanup, cancellation, and media seeking
  const sourceUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  const activeCancelFnRef = useRef<(() => void) | null>(null);
  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const micRecognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const micSessionOriginMsRef = useRef<number>(0);
  const micUtteranceStartSecRef = useRef<number>(0);

  const revokeSourceUrl = useCallback(() => {
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = null;
    }
    setSourceUrl(null);
  }, []);

  const revokeOutputUrl = useCallback(() => {
    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
    }
    setOutputUrl(null);
    setOutputBlob(null);
    setOutputDimensions(null);
  }, []);

  const stopMicSession = useCallback(() => {
    if (micRecognitionRef.current) {
      try {
        micRecognitionRef.current.onend = null;
        micRecognitionRef.current.stop();
      } catch {
        // Ignore
      }
      micRecognitionRef.current = null;
    }
    setIsListeningMic(false);
    setInterimMicText('');
  }, []);

  // Reset workspace cleanly when switching between the 3 Video & AI tools
  useEffect(() => {
    activeCancelFnRef.current?.();
    activeCancelFnRef.current = null;
    stopMicSession();
    revokeSourceUrl();
    revokeOutputUrl();
    setSourceFile(null);
    setMediaMeta({ durationSec: 0, width: 0, height: 0, isVideo: true });
    setPreviewTab('input');
    setIsRunningJob(false);
    setJobProgressRatio(0);
    setJobEtaSec(null);
    setErrorMessage(null);
    setStatusBanner(null);
    setSegments([]);
    setDetectedLanguage(null);
    setModelDownloadPct(null);
  }, [tool.id, revokeSourceUrl, revokeOutputUrl, stopMicSession]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      activeCancelFnRef.current?.();
      activeCancelFnRef.current = null;
      stopMicSession();
      if (sourceUrlRef.current) {
        URL.revokeObjectURL(sourceUrlRef.current);
        sourceUrlRef.current = null;
      }
      if (outputUrlRef.current) {
        URL.revokeObjectURL(outputUrlRef.current);
        outputUrlRef.current = null;
      }
      disposeWhisperWorker();
    };
  }, [stopMicSession]);

  /**
   * Probes media metadata (duration, dimensions, video vs audio) via temporary off-DOM element.
   */
  const loadSelectedMediaFile = useCallback(
    (file: File) => {
      setErrorMessage(null);
      setStatusBanner(null);

      const validation = validateMediaFileSize(file.size, maxFileSizeMb);
      if (!validation.valid) {
        setErrorMessage(
          t.fileTooLargeError(validation.actualMB.toFixed(1), validation.maxLimitMB)
        );
        return;
      }

      activeCancelFnRef.current?.();
      revokeOutputUrl();
      revokeSourceUrl();

      const nextUrl = URL.createObjectURL(file);
      sourceUrlRef.current = nextUrl;

      const looksAudioOnly =
        file.type.startsWith('audio/') ||
        /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(file.name);

      const probeEl = document.createElement(looksAudioOnly ? 'audio' : 'video');
      probeEl.preload = 'metadata';

      probeEl.onloadedmetadata = () => {
        const dur = Number.isFinite(probeEl.duration) && probeEl.duration > 0 ? probeEl.duration : 0;
        const vidW = probeEl instanceof HTMLVideoElement ? probeEl.videoWidth : 0;
        const vidH = probeEl instanceof HTMLVideoElement ? probeEl.videoHeight : 0;
        const hasVideoFrames = vidW > 0 && vidH > 0;

        setSourceFile(file);
        setSourceUrl(nextUrl);
        setPreviewTab('input');
        setMediaMeta({
          durationSec: dur,
          width: vidW,
          height: vidH,
          isVideo: hasVideoFrames,
        });

        setGifTrimStart(0);
        setGifTrimEnd(dur > 0 ? Math.min(dur, Math.max(0.5, Math.min(6, dur))) : 5);
        setPlayheadSec(0);

        probeEl.removeAttribute('src');
        probeEl.load();
      };

      probeEl.onerror = () => {
        probeEl.removeAttribute('src');
        probeEl.load();
        revokeSourceUrl();
        setSourceFile(null);
        setErrorMessage(t.invalidMediaError);
      };

      probeEl.src = nextUrl;
    },
    [maxFileSizeMb, revokeOutputUrl, revokeSourceUrl, t]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadSelectedMediaFile(file);
    }
    e.target.value = '';
  };

  const handleDropFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadSelectedMediaFile(file);
    }
  };

  const handleClearFile = () => {
    activeCancelFnRef.current?.();
    revokeOutputUrl();
    revokeSourceUrl();
    setSourceFile(null);
    setMediaMeta({ durationSec: 0, width: 0, height: 0, isVideo: true });
    setErrorMessage(null);
    setStatusBanner(null);
  };

  const handleCancelActiveJob = () => {
    if (activeCancelFnRef.current) {
      activeCancelFnRef.current();
      activeCancelFnRef.current = null;
    }
    setIsRunningJob(false);
    setJobEtaSec(null);
    setStatusBanner(t.cancelledNotice);
  };

  // ---------------- COMPUTED ESTIMATES ----------------
  const compressionEstimate = useMemo(() => {
    if (!sourceFile || mediaMeta.durationSec <= 0) {
      return { estimatedBytes: 0, estimatedSavingsPct: 0 };
    }
    return estimateCompressedSizeBytes({
      inputSizeBytes: sourceFile.size,
      durationSec: mediaMeta.durationSec,
      sourceWidth: mediaMeta.width || 1280,
      sourceHeight: mediaMeta.height || 720,
      resolution: videoResolution,
      crf: videoCrf,
      audioBitrate,
    });
  }, [sourceFile, mediaMeta, videoResolution, videoCrf, audioBitrate]);

  const targetVideoDims = useMemo(() => {
    if (!mediaMeta.width || !mediaMeta.height) return null;
    return computeTargetVideoDimensions(mediaMeta.width, mediaMeta.height, videoResolution);
  }, [mediaMeta.width, mediaMeta.height, videoResolution]);

  const preservedGifDims = useMemo(() => {
    return computeGifOutputDimensions(
      mediaMeta.width || 640,
      mediaMeta.height || 360,
      gifWidth
    );
  }, [mediaMeta.width, mediaMeta.height, gifWidth]);

  const estimatedGifBytes = useMemo(() => {
    if (!sourceFile) return 0;
    return estimateGifSizeBytes({
      trimStartSec: gifTrimStart,
      trimEndSec: gifTrimEnd,
      fps: gifFps,
      widthOption: gifWidth,
      loop: gifLoop,
      sourceWidth: mediaMeta.width || 640,
      sourceHeight: mediaMeta.height || 360,
    });
  }, [sourceFile, gifTrimStart, gifTrimEnd, gifFps, gifWidth, gifLoop, mediaMeta.width, mediaMeta.height]);

  // ---------------- 1. RUN VIDEO COMPRESSOR ----------------
  const handleRunVideoCompression = async () => {
    if (!sourceFile || isRunningJob) return;
    setErrorMessage(null);
    setStatusBanner(null);
    revokeOutputUrl();

    setIsRunningJob(true);
    setJobStageLabel(t.ffmpegLoadStage);
    setJobProgressRatio(0);
    setJobEtaSec(null);

    const job = compressVideoWithFfmpeg({
      file: sourceFile,
      durationSec: mediaMeta.durationSec,
      options: {
        resolution: videoResolution,
        crf: videoCrf,
        audioBitrate,
        sourceWidth: mediaMeta.width,
        sourceHeight: mediaMeta.height,
      },
      onProgress: (upd) => {
        setJobStageLabel(upd.stage === 'loading' ? t.ffmpegLoadStage : t.processingStage);
        setJobProgressRatio(upd.progressRatio);
        setJobEtaSec(upd.etaSeconds);
      },
    });

    activeCancelFnRef.current = job.cancel;

    try {
      const res = await job.promise;
      activeCancelFnRef.current = null;
      const nextOutUrl = URL.createObjectURL(res.blob);
      outputUrlRef.current = nextOutUrl;
      setOutputBlob(res.blob);
      setOutputUrl(nextOutUrl);
      if (targetVideoDims) {
        setOutputDimensions(targetVideoDims);
      }
      setPreviewTab('output');
      const savedFormatted = res.savedPercentage.toFixed(1);
      setStatusBanner(
        t.compressionSuccessSummary(formatBytesHuman(res.outputBytes), savedFormatted)
      );
      onRecordHistory?.(
        tool.title,
        `H.264 MP4 (${videoResolution}, CRF ${videoCrf}) · ${formatBytesHuman(res.inputBytes)} → ${formatBytesHuman(res.outputBytes)}`
      );
    } catch (err) {
      activeCancelFnRef.current = null;
      if (err instanceof JobCancelledError) {
        setStatusBanner(t.cancelledNotice);
      } else {
        setErrorMessage(
          `${t.compressionFailedError}${err instanceof Error && err.message ? ` (${err.message})` : ''}`
        );
      }
    } finally {
      setIsRunningJob(false);
      setJobEtaSec(null);
    }
  };

  // ---------------- 2. RUN VIDEO TO GIF ----------------
  const handleRunVideoToGif = async () => {
    if (!sourceFile || isRunningJob) return;
    if (gifTrimEnd <= gifTrimStart + 0.05) {
      setErrorMessage(t.gifFailedError);
      return;
    }

    setErrorMessage(null);
    setStatusBanner(null);
    revokeOutputUrl();

    setIsRunningJob(true);
    setJobStageLabel(t.ffmpegLoadStage);
    setJobProgressRatio(0);
    setJobEtaSec(null);

    const job = convertVideoToGifWithFfmpeg({
      file: sourceFile,
      options: {
        trimStartSec: gifTrimStart,
        trimEndSec: gifTrimEnd,
        fps: gifFps,
        widthOption: gifWidth,
        loop: gifLoop,
        sourceWidth: mediaMeta.width || 640,
        sourceHeight: mediaMeta.height || 360,
      },
      onProgress: (upd) => {
        setJobStageLabel(upd.stage === 'loading' ? t.ffmpegLoadStage : t.convertingGifBtn);
        setJobProgressRatio(upd.progressRatio);
        setJobEtaSec(upd.etaSeconds);
      },
    });

    activeCancelFnRef.current = job.cancel;

    try {
      const res = await job.promise;
      activeCancelFnRef.current = null;
      const nextOutUrl = URL.createObjectURL(res.blob);
      outputUrlRef.current = nextOutUrl;
      setOutputBlob(res.blob);
      setOutputUrl(nextOutUrl);
      setOutputDimensions({ width: res.width, height: res.height });
      setPreviewTab('output');
      setStatusBanner(
        t.gifSuccessSummary(res.width, res.height, formatBytesHuman(res.outputBytes))
      );
      onRecordHistory?.(
        tool.title,
        `GIF ${res.width}×${res.height} @ ${gifFps}fps (${formatBytesHuman(res.outputBytes)})`
      );
    } catch (err) {
      activeCancelFnRef.current = null;
      if (err instanceof JobCancelledError) {
        setStatusBanner(t.cancelledNotice);
      } else {
        setErrorMessage(
          `${t.gifFailedError}${err instanceof Error && err.message ? ` (${err.message})` : ''}`
        );
      }
    } finally {
      setIsRunningJob(false);
      setJobEtaSec(null);
    }
  };

  const handleDownloadOutputAsset = () => {
    if (!outputBlob || !sourceFile) return;
    const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');
    const ext = tool.id === 'video-compressor' ? 'mp4' : 'gif';
    const dlUrl = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = `ToolNova_${baseName}_${tool.id === 'video-compressor' ? `${videoResolution}_CRF${videoCrf}` : `${preservedGifDims.width}w_${gifFps}fps`}.${ext}`;
    a.click();
    URL.revokeObjectURL(dlUrl);
  };

  // ---------------- SCRUBBER TRIM HELPERS ----------------
  const seekPlayerTo = (targetSec: number) => {
    const clamped = Math.max(0, Math.min(mediaMeta.durationSec || targetSec, targetSec));
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = clamped;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = clamped;
    }
    setPlayheadSec(clamped);
  };

  const handleTrimStartChange = (rawVal: number) => {
    const maxStart = Math.max(0, gifTrimEnd - 0.2);
    const nextStart = Math.max(0, Math.min(maxStart, Math.round(rawVal * 10) / 10));
    setGifTrimStart(nextStart);
    seekPlayerTo(nextStart);
  };

  const handleTrimEndChange = (rawVal: number) => {
    const upperBound = mediaMeta.durationSec > 0 ? mediaMeta.durationSec : Math.max(1, rawVal);
    const nextEnd = Math.max(gifTrimStart + 0.2, Math.min(upperBound, Math.round(rawVal * 10) / 10));
    setGifTrimEnd(nextEnd);
    seekPlayerTo(nextEnd);
  };

  // ---------------- 3A. RUN FILE SPEECH-TO-TEXT (FFMPEG + WHISPER) ----------------
  const handleRunFileTranscription = async () => {
    if (!sourceFile || isRunningJob) return;
    setErrorMessage(null);
    setStatusBanner(null);
    setDetectedLanguage(null);

    setIsRunningJob(true);
    setJobStageLabel(t.extractingAudioStage);
    setJobProgressRatio(0.02);
    setJobEtaSec(null);

    // Phase 1: Extract 16 kHz mono Float32 PCM using FFmpeg.wasm Worker
    const extractJob = extractAudio16kMonoWithFfmpeg({
      file: sourceFile,
      expectedDurationSec: mediaMeta.durationSec,
      onProgress: (upd) => {
        setJobStageLabel(upd.stage === 'loading' ? t.ffmpegLoadStage : t.extractingAudioStage);
        setJobProgressRatio(upd.progressRatio * 0.25);
        setJobEtaSec(upd.etaSeconds);
      },
    });

    activeCancelFnRef.current = extractJob.cancel;

    try {
      const { pcmSamples } = await extractJob.promise;

      // Phase 2: Transcribe 16kHz PCM with Whisper ONNX in dedicated Worker
      setJobStageLabel(t.transcribingStage);
      setJobProgressRatio(0.26);

      const whisperJob = transcribePcmWithWhisperWorker({
        pcmSamples,
        modelSize: whisperModelSize,
        language: whisperLanguage,
        defaultSpeakerLabel: t.speakerDefaultFile,
        onUpdate: (snap) => {
          if (snap.backend) {
            setActiveBackend(snap.backend);
          }
          setModelFromCache(snap.fromCache);
          if (snap.detectedLanguage) {
            setDetectedLanguage(snap.detectedLanguage);
          }

          if (snap.stage === 'downloading-model') {
            setModelDownloadPct(snap.modelProgressPct);
            setModelLoadedBytes(snap.modelLoadedBytes);
            setModelTotalBytes(snap.modelTotalBytes);
            setJobStageLabel(t.modelDownloadLabel);
            setJobProgressRatio(0.25 + (snap.modelProgressPct / 100) * 0.15);
          } else if (snap.stage === 'detecting-language') {
            setModelDownloadPct(100);
            setJobStageLabel(t.detectingLanguageStage);
            setJobProgressRatio(0.42);
          } else {
            setModelDownloadPct(100);
            setJobStageLabel(t.transcribingStage);
            setJobProgressRatio(0.42 + snap.transcribeRatio * 0.58);
            setJobEtaSec(snap.etaSeconds);
            if (snap.streamingSegments && snap.streamingSegments.length > 0) {
              setSegments(snap.streamingSegments);
            }
          }
        },
      });

      activeCancelFnRef.current = whisperJob.cancel;
      const result = await whisperJob.promise;
      activeCancelFnRef.current = null;

      setSegments(result.segments);
      setDetectedLanguage(result.detectedLanguage);
      setActiveBackend(result.backend);
      setModelFromCache(result.fromCache);
      setModelDownloadPct(100);
      setStatusBanner(
        result.fromCache ? t.modelLoadedFromCacheNotice : t.modelCachedReadyNotice
      );

      onRecordHistory?.(
        tool.title,
        `Whisper ${whisperModelSize} (${result.detectedLanguage.toUpperCase()}, ${result.backend}) · ${result.segments.length} segments`
      );
    } catch (err) {
      activeCancelFnRef.current = null;
      if (err instanceof JobCancelledError) {
        setStatusBanner(t.cancelledNotice);
      } else {
        setErrorMessage(
          `${t.transcriptionFailedError}${err instanceof Error && err.message ? ` (${err.message})` : ''}`
        );
      }
    } finally {
      setIsRunningJob(false);
      setJobEtaSec(null);
    }
  };

  // ---------------- 3B. LIVE MICROPHONE DICTATION (HONEST — NO FAKE TEXT) ----------------
  const handleToggleMicDictation = () => {
    setErrorMessage(null);
    const SpeechRecCtor = getBrowserSpeechRecognition();
    if (!SpeechRecCtor) {
      // Never insert fake text when SpeechRecognition is unavailable
      return;
    }

    if (isListeningMic) {
      stopMicSession();
      return;
    }

    try {
      const recognition = new SpeechRecCtor();
      recognition.lang = dictationLocale;
      recognition.continuous = true;
      recognition.interimResults = true;

      const sessionStartNow = performance.now();
      // Continue timeline after the last existing segment if any
      const baselineOffsetSec =
        segments.length > 0 ? Math.max(0, segments[segments.length - 1].endSec) : 0;
      micSessionOriginMsRef.current = sessionStartNow - baselineOffsetSec * 1000;
      micUtteranceStartSecRef.current = baselineOffsetSec;

      recognition.onspeechstart = () => {
        micUtteranceStartSecRef.current = Math.max(
          0,
          (performance.now() - micSessionOriginMsRef.current) / 1000
        );
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim() ?? '';
          if (!text) continue;

          if (res.isFinal) {
            const endSec = Math.max(
              0.4,
              (performance.now() - micSessionOriginMsRef.current) / 1000
            );
            const approxDuration = Math.max(1.0, text.split(/\s+/).length * 0.42);
            const startSec = Math.max(
              0,
              Math.min(
                micUtteranceStartSecRef.current || endSec - approxDuration,
                endSec - 0.3
              )
            );
            micUtteranceStartSecRef.current = endSec;

            setSegments((prev) => [
              ...prev,
              {
                id: `mic-${Date.now()}-${i}`,
                startSec: Math.round(startSec * 100) / 100,
                endSec: Math.round(endSec * 100) / 100,
                speaker: `${t.speakerDefaultMic} (${dictationLocale})`,
                text,
              },
            ]);
          } else {
            interim += `${text} `;
          }
        }
        setInterimMicText(interim.trim());
      };

      recognition.onerror = (ev: SpeechRecognitionErrorEventLike) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
          setErrorMessage(t.micPermissionError);
        }
        stopMicSession();
      };

      recognition.onend = () => {
        setIsListeningMic(false);
        setInterimMicText('');
        micRecognitionRef.current = null;
      };

      micRecognitionRef.current = recognition;
      setIsListeningMic(true);
      recognition.start();
    } catch {
      setErrorMessage(t.micPermissionError);
      stopMicSession();
    }
  };

  // ---------------- TRANSCRIPT SEGMENT EDITORS & EXPORTS ----------------
  const handleUpdateSegmentText = (id: string, nextText: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, text: nextText } : s)));
  };

  const handleUpdateSegmentSpeaker = (id: string, nextSpeaker: string) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, speaker: nextSpeaker } : s)));
  };

  const handleDeleteSegment = (id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddManualSegment = () => {
    const lastEnd = segments.length > 0 ? segments[segments.length - 1].endSec : playheadSec;
    const startSec = Math.round(lastEnd * 100) / 100;
    const endSec = Math.round((lastEnd + 3) * 100) / 100;
    setSegments((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        startSec,
        endSec,
        speaker: sttMode === 'mic' ? t.speakerDefaultMic : t.speakerDefaultFile,
        text: '',
      },
    ]);
  };

  const handleExportTranscript = async (format: TranscriptExportFormat) => {
    const nonEmpty = segments.filter((s) => s.text.trim().length > 0);
    if (nonEmpty.length === 0) {
      setErrorMessage(t.noSegmentsToExportError);
      return;
    }

    setErrorMessage(null);
    if (format === 'docx') setExportingDocx(true);

    try {
      const baseTitle = sourceFile
        ? `${t.transcriptTitleDoc} — ${sourceFile.name}`
        : t.transcriptTitleDoc;
      const { blob, extension } = await exportTranscriptBlob(nonEmpty, format, baseTitle);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeFileStem = sourceFile
        ? sourceFile.name.replace(/\.[^/.]+$/, '')
        : 'Transcript';
      a.href = url;
      a.download = `ToolNova_${safeFileStem}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      onRecordHistory?.(
        tool.title,
        `Exported ${nonEmpty.length} segments as .${extension.toUpperCase()}`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (format === 'docx') setExportingDocx(false);
    }
  };

  const fileAcceptAttr =
    tool.id === 'speech-to-text'
      ? 'audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.opus,.mp4,.webm,.mov,.mkv'
      : 'video/*,.mp4,.webm,.mov,.mkv,.avi';

  const actualGifOver15Mb =
    tool.id === 'video-to-gif' && outputBlob !== null && outputBlob.size > GIF_SIZE_WARNING_BYTES;
  const estimateGifOver15Mb =
    tool.id === 'video-to-gif' && outputBlob === null && estimatedGifBytes > GIF_SIZE_WARNING_BYTES;

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]"
    >
      {/* ================= MAIN STAGE (7 COLUMNS) ================= */}
      <div className="lg:col-span-7 p-5 sm:p-6 bg-slate-50/50 dark:bg-slate-950/50 border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-slate-800 flex flex-col gap-4">
        {/* Privacy & Local Processing Note */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>{t.localPrivacyNote}</span>
          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
            {t.maxSizeLimitLabel}: {maxFileSizeMb} MB
          </span>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200"
          >
            <XCircle className="w-4 h-4 text-[#e5322d] shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Status / Completion Notice */}
        {statusBanner && !errorMessage && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/70 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{statusBanner}</div>
          </div>
        )}

        {/* SPEECH-TO-TEXT MODE SWITCHER */}
        {tool.id === 'speech-to-text' && (
          <div
            role="tablist"
            aria-label={tool.title}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sttMode === 'file'}
              onClick={() => {
                stopMicSession();
                setSttMode('file');
              }}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e5322d] ${
                sttMode === 'file'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-[#e5322d]" />
              <span>{t.modeFileTab}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sttMode === 'mic'}
              onClick={() => setSttMode('mic')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e5322d] ${
                sttMode === 'mic'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-[#e5322d]" />
              <span>{t.modeMicTab}</span>
            </button>
          </div>
        )}

        {/* FILE DROPZONE OR MEDIA PLAYER (for video tools + speech-to-text file mode) */}
        {(tool.id !== 'speech-to-text' || sttMode === 'file') && (
          <>
            {!sourceFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDropFile}
                className={`flex-1 min-h-[260px] rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center text-center transition-colors ${
                  isDraggingOver
                    ? 'border-[#e5322d] bg-red-50/50 dark:bg-red-950/20'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/70'
                }`}
              >
                {tool.id === 'speech-to-text' ? (
                  <Volume2 className="w-11 h-11 text-slate-400 dark:text-slate-500 mb-3" />
                ) : (
                  <Film className="w-11 h-11 text-slate-400 dark:text-slate-500 mb-3" />
                )}
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1.5">
                  {tool.id === 'speech-to-text' ? t.dropMediaPromptTitle : t.dropVideoPromptTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-4 leading-relaxed">
                  {tool.id === 'speech-to-text' ? t.dropMediaPromptDesc : t.dropVideoPromptDesc}
                </p>
                <label className="min-h-[42px] cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#e5322d] hover:bg-red-700 text-white shadow-xs transition-colors focus-within:ring-2 focus-within:ring-[#e5322d] focus-within:ring-offset-2">
                  <Upload className="w-4 h-4" />
                  <span>
                    {tool.id === 'speech-to-text' ? t.uploadMediaBtn : t.uploadVideoBtn}
                  </span>
                  <input
                    type="file"
                    accept={fileAcceptAttr}
                    onChange={handleFileInputChange}
                    className="sr-only"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                {/* File Metadata Bar + Replace / Remove */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {sourceFile.name}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {formatBytesHuman(sourceFile.size)}
                      {mediaMeta.durationSec > 0
                        ? ` · ${formatDurationClock(mediaMeta.durationSec)}`
                        : ''}
                      {mediaMeta.width > 0 && mediaMeta.height > 0
                        ? ` · ${mediaMeta.width}×${mediaMeta.height}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="min-h-[36px] cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-within:ring-2 focus-within:ring-[#e5322d]">
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {tool.id === 'speech-to-text' ? t.changeMediaBtn : t.changeVideoBtn}
                      </span>
                      <input
                        type="file"
                        accept={fileAcceptAttr}
                        onChange={handleFileInputChange}
                        disabled={isRunningJob}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleClearFile}
                      disabled={isRunningJob}
                      aria-label={t.clearFileBtn}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#e5322d] hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Source vs Output Toggle Tabs (when output exists) */}
                {outputUrl && tool.id !== 'speech-to-text' && (
                  <div className="inline-flex rounded-lg p-1 bg-slate-200/70 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setPreviewTab('input')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        previewTab === 'input'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {t.previewInputTab}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewTab('output')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        previewTab === 'output'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {t.previewOutputTab}
                    </button>
                  </div>
                )}

                {/* Media Viewport */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden flex items-center justify-center min-h-[210px] max-h-[340px]">
                  {previewTab === 'output' && outputUrl && tool.id === 'video-to-gif' ? (
                    <img
                      src={outputUrl}
                      alt={sourceFile.name}
                      className="max-h-[330px] w-auto object-contain"
                    />
                  ) : previewTab === 'output' && outputUrl && tool.id === 'video-compressor' ? (
                    <video
                      key={outputUrl}
                      src={outputUrl}
                      controls
                      playsInline
                      className="max-h-[330px] w-full object-contain"
                    />
                  ) : mediaMeta.isVideo && sourceUrl ? (
                    <video
                      ref={videoPlayerRef}
                      key={sourceUrl}
                      src={sourceUrl}
                      controls
                      playsInline
                      onTimeUpdate={(e) => setPlayheadSec(e.currentTarget.currentTime)}
                      className="max-h-[330px] w-full object-contain"
                    />
                  ) : sourceUrl ? (
                    <div className="w-full p-6 flex flex-col items-center gap-3">
                      <Volume2 className="w-9 h-9 text-slate-400" />
                      <audio
                        ref={audioPlayerRef}
                        key={sourceUrl}
                        src={sourceUrl}
                        controls
                        onTimeUpdate={(e) => setPlayheadSec(e.currentTarget.currentTime)}
                        className="w-full max-w-md"
                      />
                    </div>
                  ) : null}
                </div>

                {/* VIDEO-TO-GIF INTERACTIVE SCRUBBER TRIM PANEL */}
                {tool.id === 'video-to-gif' && mediaMeta.durationSec > 0 && (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Scissors className="w-3.5 h-3.5 text-[#e5322d]" />
                        <span>{t.trimRangeLabel}</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {t.selectedClipDurationLabel(
                          Math.max(0, gifTrimEnd - gifTrimStart).toFixed(1)
                        )}
                      </span>
                    </div>

                    {/* Visual Range Highlight Bar */}
                    <div className="relative h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 bg-[#e5322d]"
                        style={{
                          left: `${Math.min(100, (gifTrimStart / mediaMeta.durationSec) * 100)}%`,
                          width: `${Math.max(
                            1,
                            Math.min(
                              100,
                              ((gifTrimEnd - gifTrimStart) / mediaMeta.durationSec) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                          <label htmlFor="gif-trim-start">{t.trimStartLabel}</label>
                          <span className="font-mono tabular-nums">
                            {gifTrimStart.toFixed(1)}s
                          </span>
                        </div>
                        <input
                          id="gif-trim-start"
                          type="range"
                          min={0}
                          max={Math.max(0.2, mediaMeta.durationSec - 0.2)}
                          step={0.1}
                          value={gifTrimStart}
                          onChange={(e) => handleTrimStartChange(Number(e.target.value))}
                          className="w-full accent-[#e5322d]"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={Math.max(0, gifTrimEnd - 0.2)}
                            step={0.1}
                            value={gifTrimStart}
                            aria-label={t.trimStartLabel}
                            onChange={(e) => handleTrimStartChange(Number(e.target.value))}
                            className="w-20 px-2 py-1 rounded-md text-xs font-mono tabular-nums border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleTrimStartChange(playheadSec)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {t.setStartFromPlayheadBtn}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                          <label htmlFor="gif-trim-end">{t.trimEndLabel}</label>
                          <span className="font-mono tabular-nums">
                            {gifTrimEnd.toFixed(1)}s
                          </span>
                        </div>
                        <input
                          id="gif-trim-end"
                          type="range"
                          min={0.2}
                          max={mediaMeta.durationSec}
                          step={0.1}
                          value={gifTrimEnd}
                          onChange={(e) => handleTrimEndChange(Number(e.target.value))}
                          className="w-full accent-[#e5322d]"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={gifTrimStart + 0.2}
                            max={mediaMeta.durationSec}
                            step={0.1}
                            value={gifTrimEnd}
                            aria-label={t.trimEndLabel}
                            onChange={(e) => handleTrimEndChange(Number(e.target.value))}
                            className="w-20 px-2 py-1 rounded-md text-xs font-mono tabular-nums border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleTrimEndChange(playheadSec)}
                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            {t.setEndFromPlayheadBtn}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* INPUT VS OUTPUT SIZE SUMMARY (Video Compressor & Video to GIF) */}
                {outputBlob && tool.id !== 'speech-to-text' && (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 mb-0.5">
                        {t.inputSizeLabel}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatBytesHuman(sourceFile.size)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 dark:text-slate-400 mb-0.5">
                        {t.outputSizeLabel}
                      </div>
                      <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatBytesHuman(outputBlob.size)}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="text-slate-500 dark:text-slate-400 mb-0.5">
                        {tool.id === 'video-compressor' ? 'Δ' : t.dimensionsLabel}
                      </div>
                      {tool.id === 'video-compressor' ? (
                        (() => {
                          const savedPct =
                            ((sourceFile.size - outputBlob.size) / sourceFile.size) * 100;
                          return savedPct >= 0 ? (
                            <div className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                              {t.savedPercentageLabel(savedPct.toFixed(1))}
                            </div>
                          ) : (
                            <div className="font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                              {t.sizeIncreasedNotice(Math.abs(savedPct).toFixed(1))}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                          {outputDimensions
                            ? `${outputDimensions.width}×${outputDimensions.height} px`
                            : `${preservedGifDims.width}×${preservedGifDims.height} px`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* GIF > 15MB WARNINGS */}
                {(actualGifOver15Mb || estimateGifOver15Mb) && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      {actualGifOver15Mb && outputBlob
                        ? t.gifOver15MbWarning((outputBlob.size / (1024 * 1024)).toFixed(2))
                        : t.gifLargeEstimateWarning(
                            (estimatedGifBytes / (1024 * 1024)).toFixed(1)
                          )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* LIVE MICROPHONE MODE PANEL (Honest browser support check, zero fake text) */}
        {tool.id === 'speech-to-text' && sttMode === 'mic' && (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            {!speechRecognitionSupported ? (
              <div
                role="alert"
                className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{t.micUnsupportedTitle}</span>
                </div>
                <p className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed">
                  {t.micUnsupportedDesc}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <select
                    value={dictationLocale}
                    aria-label={t.whisperLanguageLabel}
                    onChange={(e) => setDictationLocale(e.target.value as DictationLocale)}
                    disabled={isListeningMic}
                    className="min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="ar-SA">{t.langArabic}</option>
                    <option value="fr-FR">{t.langFrench}</option>
                    <option value="en-US">{t.langEnglish}</option>
                    <option value="es-ES">{t.langSpanish}</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleToggleMicDictation}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                    isListeningMic
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'bg-[#e5322d] hover:bg-red-700 text-white'
                  }`}
                >
                  {isListeningMic ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>{t.micStopBtn}</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>{t.micStartBtn}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {isListeningMic && (
              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div className="font-semibold text-[#e5322d]">{t.micListeningStatus}</div>
                {interimMicText && (
                  <p
                    dir={containsArabicOrRtl(interimMicText) ? 'rtl' : 'ltr'}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 italic"
                  >
                    {interimMicText}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SPEECH-TO-TEXT TIMESTAMPED SEGMENTS EDITOR */}
        {tool.id === 'speech-to-text' && (
          <div className="flex-1 flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[230px]">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <span>{t.segmentsCountLabel(segments.length)}</span>
                {detectedLanguage && sttMode === 'file' && (
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    · {t.detectedLanguageLabel(detectedLanguage)}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleAddManualSegment}
                className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t.addSegmentBtn}</span>
              </button>
            </div>

            <div className="flex-1 p-3.5 space-y-2.5 overflow-y-auto max-h-[310px]">
              {segments.length === 0 ? (
                <div className="h-full min-h-[160px] flex items-center justify-center text-center px-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                    {sttMode === 'file' ? t.emptyTranscriptFileHint : t.emptyTranscriptMicHint}
                  </p>
                </div>
              ) : (
                segments.map((seg) => {
                  const segIsRtl = containsArabicOrRtl(seg.text);
                  const timeDisplay = `${formatVttTimestamp(seg.startSec)} → ${formatVttTimestamp(seg.endSec)}`;
                  return (
                    <div
                      key={seg.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => seekPlayerTo(seg.startSec)}
                          aria-label={t.seekToSegmentAria(formatVttTimestamp(seg.startSec))}
                          className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-semibold text-[#e5322d] hover:underline cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>{timeDisplay}</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={seg.speaker}
                            onChange={(e) => handleUpdateSegmentSpeaker(seg.id, e.target.value)}
                            aria-label={t.speakerDefaultFile}
                            className="w-28 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteSegment(seg.id)}
                            aria-label={t.deleteSegmentAria}
                            className="p-1 rounded-md text-slate-400 hover:text-[#e5322d] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={2}
                        dir={segIsRtl ? 'rtl' : 'ltr'}
                        value={seg.text}
                        placeholder={t.segmentTextPlaceholder}
                        onChange={(e) => handleUpdateSegmentText(seg.id, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs leading-relaxed bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-[#e5322d] resize-y"
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* LIVE PROGRESS, ETA & CANCEL BAR */}
        {isRunningJob && (
          <div
            role="region"
            aria-live="polite"
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-[#e5322d] animate-spin shrink-0" />
                <span>{jobStageLabel}</span>
              </span>
              <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                {Math.round(jobProgressRatio * 100)}%
              </span>
            </div>

            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#e5322d] transition-all duration-200"
                style={{ width: `${Math.max(2, Math.round(jobProgressRatio * 100))}%` }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {jobEtaSec !== null
                  ? t.etaLabel(formatDurationClock(jobEtaSec))
                  : t.etaCalculating}
              </span>
              <button
                type="button"
                onClick={handleCancelActiveJob}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 transition-colors cursor-pointer"
              >
                {t.cancelBtn}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= CONTROLS & EXPORT SIDEBAR (5 COLUMNS) ================= */}
      <div className="lg:col-span-5 p-5 sm:p-6 bg-white dark:bg-slate-900 flex flex-col justify-between gap-6">
        <div className="space-y-5">
          {/* ---------------- 1. VIDEO COMPRESSOR CONTROLS ---------------- */}
          {tool.id === 'video-compressor' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  {t.resolutionLabel}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['original', '1080p', '720p', '480p'] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      disabled={isRunningJob}
                      onClick={() => setVideoResolution(res)}
                      className={`min-h-[40px] py-2 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        videoResolution === res
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {res === 'original' ? t.resolutionOriginal : res}
                    </button>
                  ))}
                </div>
                {targetVideoDims && (
                  <p className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {t.dimensionsLabel}: {targetVideoDims.width}×{targetVideoDims.height} px · H.264 (yuv420p)
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label
                    htmlFor="video-crf-slider"
                    className="font-bold text-slate-800 dark:text-slate-200"
                  >
                    {t.crfLabel}
                  </label>
                  <span className="font-mono font-bold tabular-nums text-[#e5322d]">
                    CRF {videoCrf}
                  </span>
                </div>
                <input
                  id="video-crf-slider"
                  type="range"
                  min={18}
                  max={36}
                  step={1}
                  disabled={isRunningJob}
                  value={videoCrf}
                  onChange={(e) => setVideoCrf(Number(e.target.value))}
                  className="w-full accent-[#e5322d]"
                />
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  <span>{t.crfHintHighQuality}</span>
                  <span>{t.crfHintBalanced}</span>
                  <span>{t.crfHintMaxCompression}</span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="video-audio-bitrate"
                  className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2"
                >
                  {t.audioBitrateLabel}
                </label>
                <select
                  id="video-audio-bitrate"
                  value={audioBitrate}
                  disabled={isRunningJob}
                  onChange={(e) => setAudioBitrate(e.target.value as VideoAudioBitrate)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="192k">192 kbps AAC</option>
                  <option value="128k">128 kbps AAC</option>
                  <option value="96k">96 kbps AAC</option>
                  <option value="64k">64 kbps AAC</option>
                  <option value="mute">{t.audioMuteOption}</option>
                </select>
              </div>

              {/* Live Target Size Estimate */}
              {sourceFile && compressionEstimate.estimatedBytes > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t.estimatedTargetSizeLabel}
                    </div>
                    <div className="text-sm font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      ~{formatBytesHuman(compressionEstimate.estimatedBytes)}
                    </div>
                  </div>
                  {compressionEstimate.estimatedSavingsPct > 0 && (
                    <span className="text-xs font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {t.estimatedSavingsLabel(
                        compressionEstimate.estimatedSavingsPct.toFixed(0)
                      )}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {/* ---------------- 2. VIDEO TO GIF CONTROLS ---------------- */}
          {tool.id === 'video-to-gif' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  {t.gifFpsLabel}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[8, 10, 12, 15, 20, 24].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      disabled={isRunningJob}
                      onClick={() => setGifFps(fps)}
                      className={`min-h-[40px] py-2 px-2.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                        gifFps === fps
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                  {t.gifWidthLabel}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([240, 320, 480, 640, 'original'] as const).map((wOpt) => (
                    <button
                      key={String(wOpt)}
                      type="button"
                      disabled={isRunningJob}
                      onClick={() => setGifWidth(wOpt)}
                      className={`min-h-[40px] py-2 px-2.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        gifWidth === wOpt
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {wOpt === 'original' ? t.gifWidthOriginal : `${wOpt}px`}
                    </button>
                  ))}
                </div>
                {sourceFile && (
                  <p className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {t.preservedAspectLabel(preservedGifDims.width, preservedGifDims.height)}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="gif-loop-select"
                  className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2"
                >
                  {t.gifLoopLabel}
                </label>
                <select
                  id="gif-loop-select"
                  value={gifLoop}
                  disabled={isRunningJob}
                  onChange={(e) => setGifLoop(Number(e.target.value) as GifLoopOption)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value={0}>{t.gifLoopInfinite}</option>
                  <option value={-1}>{t.gifLoopOnce}</option>
                  <option value={3}>{t.gifLoopThreeTimes}</option>
                </select>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.paletteNotice}
              </p>
            </>
          )}

          {/* ---------------- 3. SPEECH TO TEXT CONTROLS ---------------- */}
          {tool.id === 'speech-to-text' && (
            <>
              {sttMode === 'file' && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="whisper-model-select"
                      className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2"
                    >
                      {t.whisperModelLabel}
                    </label>
                    <select
                      id="whisper-model-select"
                      value={whisperModelSize}
                      disabled={isRunningJob}
                      onChange={(e) => setWhisperModelSize(e.target.value as WhisperModelSize)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="tiny">{t.whisperTinyLabel}</option>
                      <option value="base">{t.whisperBaseLabel}</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="whisper-lang-select"
                      className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2"
                    >
                      {t.whisperLanguageLabel}
                    </label>
                    <select
                      id="whisper-lang-select"
                      value={whisperLanguage}
                      disabled={isRunningJob}
                      onChange={(e) =>
                        setWhisperLanguage(e.target.value as WhisperLanguageChoice)
                      }
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="auto">{t.langAutoDetect}</option>
                      <option value="ar">{t.langArabic}</option>
                      <option value="fr">{t.langFrench}</option>
                      <option value="en">{t.langEnglish}</option>
                      <option value="es">{t.langSpanish}</option>
                    </select>
                  </div>

                  {/* Runtime Backend & Model Download / Cache Progress */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Cpu className="w-3.5 h-3.5 text-[#e5322d]" />
                        <span>
                          {activeBackend === 'webgpu'
                            ? t.backendBadgeWebGpu
                            : t.backendBadgeWasm}
                        </span>
                      </span>
                      {modelDownloadPct !== null && (
                        <span className="font-mono tabular-nums">
                          {modelDownloadPct}%
                          {modelLoadedBytes && modelTotalBytes
                            ? ` (${formatBytesHuman(modelLoadedBytes)} / ${formatBytesHuman(modelTotalBytes)})`
                            : ''}
                        </span>
                      )}
                    </div>

                    {modelDownloadPct !== null && (
                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-[#e5322d] transition-all duration-200"
                          style={{ width: `${modelDownloadPct}%` }}
                        />
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed flex items-start gap-1.5">
                      <HardDriveDownload className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                      <span>
                        {modelFromCache
                          ? t.modelLoadedFromCacheNotice
                          : t.modelCachedReadyNotice}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Export Transcript Buttons (SRT / VTT / MD / TXT / DOCX) */}
              <div className="pt-1 space-y-2.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  {t.exportSectionLabel}
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 gap-2">
                  {(['srt', 'vtt', 'md', 'txt', 'docx'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      disabled={segments.length === 0 || exportingDocx}
                      onClick={() => void handleExportTranscript(fmt)}
                      className="min-h-[40px] py-2 px-2.5 rounded-xl text-xs font-mono font-bold border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-white disabled:opacity-40 text-slate-900 dark:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#e5322d]" />
                      <span>.{fmt.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Configurable Max Upload Size Limit */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="max-file-limit-input"
                className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
              >
                {t.maxLimitConfigLabel}
              </label>
              <input
                id="max-file-limit-input"
                type="number"
                min={10}
                max={2048}
                step={50}
                disabled={isRunningJob}
                value={maxFileSizeMb}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val > 0) {
                    setMaxFileSizeMb(Math.min(2048, Math.max(10, Math.round(val))));
                  }
                }}
                className="w-24 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-mono tabular-nums border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-center"
              />
            </div>
          </div>
        </div>

        {/* ---------------- PRIMARY FOOTER ACTIONS ---------------- */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          {tool.id === 'video-compressor' && (
            <>
              <button
                type="button"
                disabled={!sourceFile || isRunningJob}
                onClick={() => void handleRunVideoCompression()}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#e5322d] hover:bg-red-700 disabled:opacity-45 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                {isRunningJob ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t.compressingBtn}</span>
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" />
                    <span>{t.compressActionBtn}</span>
                  </>
                )}
              </button>

              {outputBlob && (
                <button
                  type="button"
                  onClick={handleDownloadOutputAsset}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.downloadMp4Btn}</span>
                </button>
              )}
            </>
          )}

          {tool.id === 'video-to-gif' && (
            <>
              <button
                type="button"
                disabled={!sourceFile || isRunningJob}
                onClick={() => void handleRunVideoToGif()}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#e5322d] hover:bg-red-700 disabled:opacity-45 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                {isRunningJob ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t.convertingGifBtn}</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>{t.convertGifActionBtn}</span>
                  </>
                )}
              </button>

              {outputBlob && (
                <button
                  type="button"
                  onClick={handleDownloadOutputAsset}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.downloadGifBtn}</span>
                </button>
              )}
            </>
          )}

          {tool.id === 'speech-to-text' && sttMode === 'file' && (
            <button
              type="button"
              disabled={!sourceFile || isRunningJob}
              onClick={() => void handleRunFileTranscription()}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#e5322d] hover:bg-red-700 disabled:opacity-45 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              {isRunningJob ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{t.transcribingInProgressBtn}</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>{t.startTranscriptionBtn}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
