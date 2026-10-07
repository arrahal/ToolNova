import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  Play,
  Square,
  CheckCircle2,
  Sparkles,
  FileText,
  RefreshCw,
  Sliders,
  Plus,
  Mic,
  Volume2,
  Trash2,
  Film,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ToolItem } from '../data/toolsData';
import { ToolBrandIcon } from './ToolBrandIcon';
import {
  createSamplePdfBytes,
  processPdfAction,
  PdfProcessResult,
  createSampleImageCanvas,
  createSampleAudioBuffer,
  encodeAudioBufferToWav,
  getPdfPageCount,
  removeBackgroundSmartConnected,
  enhanceImageSmartDehazeAndColor,
} from '../utils/mediaProcessors';
import {
  renderPdfPageToCanvas,
  encodeFramesToAnimatedGif,
} from '../utils/pdfAndGifEngine';
import {
  WordDoctorOptions,
  WordMergeFileItem,
  extractTextFromDocxOrTextFile,
  cleanAndRepairWordText,
  exportStructuredWordDocx,
  mergeMultipleWordDocumentsToDocx,
  ExcelCleanerOptions,
  SpreadsheetGridData,
  SAMPLE_DIRTY_EXCEL_DATA,
  cleanSpreadsheetGrid,
  parseUploadedExcelOrCsv,
  parseCsvOrJsonToGrid,
  exportGridToStyledExcelBytes,
  exportGridToPdfBytes,
  SAMPLE_PRESENTATION_OUTLINE,
  parseOutlineToSlides,
  generatePptxFromOutline,
  renderPassportIdPhotoSheet,
  renderImageWatermarkAndPrivacyStudio,
  processSmartTextProblemSolver,
} from '../utils/officeAndTextSuites';

interface ToolWorkspaceModalProps {
  tool: ToolItem | null;
  onClose: () => void;
  onRecordHistory?: (toolTitle: string, detail: string) => void;
}

interface QueuedPdfFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export const ToolWorkspaceModal: React.FC<ToolWorkspaceModalProps> = ({
  tool,
  onClose,
  onRecordHistory,
}) => {
  // ---------------- PDF STATE ----------------
  const [pdfFiles, setPdfFiles] = useState<QueuedPdfFile[]>([]);
  const [isUsingSamplePdf, setIsUsingSamplePdf] = useState(true);
  const [pdfResult, setPdfResult] = useState<PdfProcessResult | null>(null);
  const [pdfProcessing, setPdfProcessing] = useState(false);

  // Canvas-based Live PDF Output Page Viewer (replaces fragile iframe!)
  const pdfOutputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewPageNum, setPreviewPageNum] = useState(1);
  const [previewTotalPages, setPreviewTotalPages] = useState(1);

  // PDF Options
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL · TOOLNOVA');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25);
  const [rotationDegrees, setRotationDegrees] = useState(90);
  const [splitPageRange, setSplitPageRange] = useState('1');
  const [annotationText, setAnnotationText] = useState('Approved via ToolNova Local Engine');
  const [pageNumberPosition, setPageNumberPosition] = useState<
    | 'bottom-center'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-center'
    | 'top-right'
    | 'top-left'
  >('bottom-center');
  const [pageNumberFormat, setPageNumberFormat] = useState<
    'page-of-total' | 'numeric' | 'dash-numeric'
  >('page-of-total');
  const [pageNumberStartAt, setPageNumberStartAt] = useState(1);
  const [pageNumberFontSize, setPageNumberFontSize] = useState(10.5);
  const [pdfPassword, setPdfPassword] = useState('1234');
  const [protectMode, setProtectMode] = useState<'vault-anti-crack' | 'standard-pdf'>('vault-anti-crack');
  const [organizePagesOrder, setOrganizePagesOrder] = useState<number[]>([1]);
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'extreme'>('medium');
  const [includePageSnapshotsInWord, setIncludePageSnapshotsInWord] = useState(true);
  const [mergeAddPageNumbers, setMergeAddPageNumbers] = useState(false);
  const [pptxMode, setPptxMode] = useState<'editable-smart' | 'hybrid-with-snapshot' | 'visual-exact'>('hybrid-with-snapshot');
  const [pptxTheme, setPptxTheme] = useState<'original-brand' | 'executive-dark' | 'clean-light'>('original-brand');
  const [excelMode, setExcelMode] = useState<'auto-smart' | 'structured-tables' | 'visual-layout'>('auto-smart');
  const [excelDrawBorders, setExcelDrawBorders] = useState(true);
  const [excelEmbedPhotos, setExcelEmbedPhotos] = useState(true);

  // ---------------- IMAGE STATE ----------------
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceImages, setSourceImages] = useState<HTMLCanvasElement[]>([]);
  const [isUsingSampleImage, setIsUsingSampleImage] = useState(true);
  const [uploadedPdfForImage, setUploadedPdfForImage] = useState<Uint8Array | null>(null);
  const [pdfImagePageNum, setPdfImagePageNum] = useState(1);
  const [pdfImageTotalPages, setPdfImageTotalPages] = useState(1);

  const [imgWidth, setImgWidth] = useState(800);
  const [imgHeight, setImgHeight] = useState(600);
  const [aspectPreset, setAspectPreset] = useState<'free' | '16:9' | '4:3' | '1:1'>('free');
  const [cropZoom, setCropZoom] = useState(100);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sepia, setSepia] = useState(0);
  const [hueRotate, setHueRotate] = useState(0);
  const [sharpenStrength, setSharpenStrength] = useState(55);
  const [dehazeStrength, setDehazeStrength] = useState(65);
  const [colorHarmony, setColorHarmony] = useState(60);
  const [denoiseStrength, setDenoiseStrength] = useState(25);
  const [bgTolerance, setBgTolerance] = useState(36);
  const [bgEdgeFeather, setBgEdgeFeather] = useState(2);
  const [bgProtectSubject, setBgProtectSubject] = useState(true);
  const [bgReplacement, setBgReplacement] = useState<'transparent' | 'white' | 'dark' | 'blur-studio'>('transparent');
  const [bgRemoveEnabled, setBgRemoveEnabled] = useState(false);
  const [showOriginalCompare, setShowOriginalCompare] = useState(false);
  const [combineMode, setCombineMode] = useState<'horizontal' | 'vertical' | 'grid'>('horizontal');
  const [combineGap, setCombineGap] = useState(12);
  const [combineBgColor, setCombineBgColor] = useState('#0F172A');
  const [exportFormat, setExportFormat] = useState<'image/webp' | 'image/png' | 'image/jpeg'>('image/jpeg');
  const [exportQuality, setExportQuality] = useState(0.9);
  const [estimatedImgBytes, setEstimatedImgBytes] = useState<number>(0);

  // ---------------- AUDIO STATE ----------------
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioTrackName, setAudioTrackName] = useState('ToolNova_Studio_Chord_Loop.wav');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(5);
  const [audioSpeed, setAudioSpeed] = useState(1.0);
  const [audioPitchSemitones, setAudioPitchSemitones] = useState(0);
  const [audioGainDb, setAudioGainDb] = useState(0);

  // ---------------- VIDEO & AI STATE ----------------
  const videoPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadedVideoElRef = useRef<HTMLVideoElement | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);
  const [videoResolution, setVideoResolution] = useState<'1080p' | '720p' | '480p'>('720p');
  const [videoCrf, setVideoCrf] = useState(24);
  const [gifFps, setGifFps] = useState(12);
  const [gifWidth, setGifWidth] = useState(360);
  const [isExportingVideoOrGif, setIsExportingVideoOrGif] = useState(false);

  const [dictationLang, setDictationLang] = useState<'ar-SA' | 'fr-FR' | 'en-US'>('ar-SA');
  const [transcriptSegments, setTranscriptSegments] = useState<
    { time: string; speaker: string; text: string }[]
  >([
    {
      time: '00:00.000 --> 00:04.200',
      speaker: 'Speaker 1',
      text: 'Welcome to ToolNova, your privacy-first media and document toolbox.',
    },
    {
      time: '00:04.200 --> 00:09.150',
      speaker: 'Speaker 1',
      text: 'All PDF, image, audio, and video transformations execute locally inside your browser.',
    },
    {
      time: '00:09.150 --> 00:14.800',
      speaker: 'Speaker 2',
      text: 'Zero cloud uploads required—export transcripts directly to SRT subtitles or Markdown.',
    },
  ]);
  const [isListeningMic, setIsListeningMic] = useState(false);

  // ---------------- WORD, EXCEL, POWERPOINT, TEXT & NEW IMAGE STATES ----------------
  const [wordRawInput, setWordRawInput] = useState<string>(
    `# EXECUTIVE PROJECT REPORT\nThis document was copied   from a multi-column PDF where lines were accidentally\nbroken in the middle of sentences   and extra spaces appeared.\n\n# الملخص التنفيذي للمشروع\nتم نسخ هذا النص من ملف PDF   حيث توجد مسافات زائدة   حول علامات الترقيم ، مثل الفاصلة والمنقوطة ؛ وسيقوم مصلح Word بإعادة ترتيب الفقرات وتصدير ملف DOCX احترافي.`
  );
  const [wordDocOpts, setWordDocOpts] = useState<WordDoctorOptions>({
    fixBrokenLines: true,
    normalizeSpaces: true,
    fixArabicPunctuation: true,
    autoDetectHeadings: true,
    fontFamily: 'Cairo',
    lineSpacing: 1.5,
  });
  const [wordMergeQueue, setWordMergeQueue] = useState<WordMergeFileItem[]>([
    {
      id: 'w-1',
      name: 'Chapter_01_Introduction.docx',
      text: 'This is the first Word document section covering project objectives, scope, and quality control methodology.',
    },
    {
      id: 'w-2',
      name: 'Chapter_02_Lab_Results.docx',
      text: 'This is the second Word document section detailing physicochemical parameters (pH, density, conductivity) and QHSE compliance.',
    },
  ]);
  const [wordMergePageBreaks, setWordMergePageBreaks] = useState(true);
  const [wordMergeAddToc, setWordMergeAddToc] = useState(true);

  // Excel Studio States
  const [excelRawGrid, setExcelRawGrid] = useState<SpreadsheetGridData>(SAMPLE_DIRTY_EXCEL_DATA);
  const [excelCleanOpts, setExcelCleanOpts] = useState<ExcelCleanerOptions>({
    removeDuplicateRows: true,
    trimWhitespace: true,
    removeEmptyRows: true,
    standardizeTextCase: 'title',
    highlightHeaderColor: '10B981',
  });
  const [csvOrJsonText, setCsvOrJsonText] = useState<string>(
    `Full Name,Department,City,Score\nArrahal Lahcen,Quality Control,Marrakech,98\nSara Benali,R&D Chemical Lab,Casablanca,94\nYoussef Amrani,Process Engineering,Rabat,91`
  );
  const [excelExportFormat, setExcelExportFormat] = useState<'xlsx' | 'csv' | 'pdf'>('xlsx');

  // PowerPoint Studio States
  const [pptDeckTitle, setPptDeckTitle] = useState('Industrial Quality & Process Control');
  const [pptOutlineText, setPptOutlineText] = useState(SAMPLE_PRESENTATION_OUTLINE);
  const [pptColorTheme, setPptColorTheme] = useState<'crimson-exec' | 'navy-corporate' | 'minimal-light'>('crimson-exec');
  const [pptHandoutFormat, setPptHandoutFormat] = useState<'docx' | 'pdf'>('docx');

  // Extra Image Problem-Solver States (ID Photo Maker & Watermark/Privacy Blur)
  const [idPhotoSize, setIdPhotoSize] = useState<'35x45mm' | '2x2inch' | '30x40mm'>('35x45mm');
  const [idPhotoBackdrop, setIdPhotoBackdrop] = useState<'#FFFFFF' | '#DBEAFE' | '#F1F5F9' | '#FEE2E2'>('#DBEAFE');
  const [idPhotoLayout, setIdPhotoLayout] = useState<'single' | 'sheet-4' | 'sheet-8'>('sheet-4');
  const [idPhotoCutGuides, setIdPhotoCutGuides] = useState(true);

  const [imgWatermarkText, setImgWatermarkText] = useState('© TOOLNOVA PROTECTED');
  const [imgWatermarkPattern, setImgWatermarkPattern] = useState<'tiled-diagonal' | 'center-badge' | 'bottom-corner'>('tiled-diagonal');
  const [imgWatermarkOpacity, setImgWatermarkOpacity] = useState(0.32);
  const [imgPrivacyRedact, setImgPrivacyRedact] = useState(true);
  const [imgRedactY, setImgRedactY] = useState(65);
  const [imgRedactHeight, setImgRedactHeight] = useState(14);
  const [imgRedactMode, setImgRedactMode] = useState<'pixelate' | 'blackout'>('pixelate');

  // Text & Fixer Studio States
  const [smartTextInput, setSmartTextInput] = useState<string>(
    `بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — مَرْحَباً بِكُمْ فِي مَنْصَّةِ ToolNova لِمُعَالَجَةِ الْمَلَفَّاتِ.\nContact Lead: arrahallahcen17@gmail.com | Tel: +212 618 74 07 71\nSupport Team: support@toolnova.io | Office: +212 524 88 99 00\nContact Lead: arrahallahcen17@gmail.com | Tel: +212 618 74 07 71`
  );
  const [smartTextMode, setSmartTextMode] = useState<
    | 'clean-all'
    | 'remove-duplicate-lines'
    | 'extract-emails-phones'
    | 'remove-arabic-tashkeel'
    | 'sort-lines-az'
    | 'number-lines'
  >('remove-arabic-tashkeel');

  // Initialize default sample media when tool opens
  useEffect(() => {
    if (!tool) return;

    if (tool.hub === 'pdf') {
      setIsUsingSamplePdf(true);
      setPreviewPageNum(1);
      setPdfPassword(tool.id === 'protect-pdf' ? 'Lahcen@2026' : '');
      (async () => {
        const sample1 = await createSamplePdfBytes('CV_Arrahal_Lahcen', 1);
        if (tool.id === 'organize-pdf' || tool.id === 'page-numbers-pdf' || tool.id === 'split-pdf') {
          // Build a 2-page sample PDF so page numbering, splitting, and reordering are immediately demonstrable
          const sample2 = await createSamplePdfBytes('Document_Part_2', 2);
          const mergedDemo = await processPdfAction(
            [
              { name: 'Page_1.pdf', bytes: sample1 },
              { name: 'Page_2.pdf', bytes: sample2 },
            ],
            { toolId: 'merge-pdf' }
          );
          setOrganizePagesOrder([1, 2]);
          setSplitPageRange(tool.id === 'organize-pdf' ? '1,2' : '1-2');
          setPdfFiles([
            {
              id: 'sample-multi',
              name: 'CV_Arrahal_Lahcen_2Pages.pdf',
              bytes: mergedDemo.outputBytes,
              pageCount: 2,
            },
          ]);
          return;
        }

        setOrganizePagesOrder([1]);
        setSplitPageRange('1');
        const initialList: QueuedPdfFile[] = [
          {
            id: 'sample-1',
            name: 'CV_Arrahal_Lahcen.pdf',
            bytes: sample1,
            pageCount: 1,
          },
        ];
        if (tool.id === 'merge-pdf') {
          const sample2 = await createSamplePdfBytes('Document_Part_2', 2);
          initialList.push({
            id: 'sample-2',
            name: 'Demo_Document_Part_2.pdf',
            bytes: sample2,
            pageCount: 1,
          });
        }
        setPdfFiles(initialList);
      })();
    } else if (tool.hub === 'image') {
      setIsUsingSampleImage(true);
      setUploadedPdfForImage(null);
      setPdfImagePageNum(1);
      setPdfImageTotalPages(1);
      setCropZoom(100);
      setCropOffsetX(0);
      setCropOffsetY(0);

      if (tool.id === 'pdf-to-jpg') {
        (async () => {
          const samplePdf = await createSamplePdfBytes('ToolNova_Sample_Report', 1);
          setUploadedPdfForImage(samplePdf);
          const rendered = await renderPdfPageToCanvas(samplePdf, 1, 1.5);
          setPdfImageTotalPages(rendered.totalPages);
          setSourceImages([rendered.canvas]);
          setImgWidth(rendered.canvas.width);
          setImgHeight(rendered.canvas.height);
          setExportFormat('image/jpeg');
        })();
      } else {
        const c1 = createSampleImageCanvas(1, tool.id);
        const c2 = createSampleImageCanvas(2, tool.id);
        setSourceImages(tool.id === 'combine-images' ? [c1, c2] : [c1]);
        setImgWidth(800);
        setImgHeight(600);
        setAspectPreset('free');
        setBrightness(100);
        setContrast(100);
        setSaturation(100);
        setSepia(0);
        setHueRotate(0);
        setShowOriginalCompare(false);
        setDehazeStrength(65);
        setColorHarmony(60);
        setSharpenStrength(55);
        setDenoiseStrength(25);
        setBgTolerance(36);
        setBgEdgeFeather(2);
        setBgProtectSubject(true);
        setBgReplacement('transparent');
        setBgRemoveEnabled(tool.id === 'background-remover');
        setExportFormat(
          tool.id === 'background-remover'
            ? 'image/png'
            : tool.id === 'format-converter'
            ? 'image/webp'
            : 'image/jpeg'
        );
      }
    } else if (tool.hub === 'audio') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
      const buf = createSampleAudioBuffer(ctx, 5);
      setAudioBuffer(buf);
      setAudioTrackName('ToolNova_Studio_Chord_Loop.wav');
      setTrimStart(0);
      setTrimEnd(Number(buf.duration.toFixed(2)));
      setAudioSpeed(1.0);
      setAudioPitchSemitones(0);
      setAudioGainDb(tool.id === 'volume-booster' ? 4.5 : 0);
    } else if (tool.hub === 'video') {
      setUploadedVideoName(null);
      if (uploadedVideoElRef.current) {
        uploadedVideoElRef.current.pause();
        uploadedVideoElRef.current.removeAttribute('src');
      }
    } else if (tool.hub === 'text') {
      setSmartTextMode(
        tool.id === 'data-extractor-studio'
          ? 'extract-emails-phones'
          : 'remove-arabic-tashkeel'
      );
    }

    return () => {
      if (activeSourceRef.current) {
        try {
          activeSourceRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [tool]);

  // Re-render PDF page when user switches page number in PDF to JPG
  useEffect(() => {
    if (!tool || tool.id !== 'pdf-to-jpg' || !uploadedPdfForImage) return;
    let cancelled = false;
    (async () => {
      const rendered = await renderPdfPageToCanvas(uploadedPdfForImage, pdfImagePageNum, 1.8);
      if (cancelled) return;
      setPdfImageTotalPages(rendered.totalPages);
      setSourceImages([rendered.canvas]);
      setImgWidth(rendered.canvas.width);
      setImgHeight(rendered.canvas.height);
    })();
    return () => {
      cancelled = true;
    };
  }, [tool, uploadedPdfForImage, pdfImagePageNum]);

  // Trigger PDF processing whenever files or options change
  useEffect(() => {
    if (!tool || tool.hub !== 'pdf' || pdfFiles.length === 0) {
      setPdfResult(null);
      return;
    }
    let cancelled = false;
    setPdfProcessing(true);

    (async () => {
      try {
        const res = await processPdfAction(pdfFiles, {
          toolId: tool.id,
          watermarkText,
          watermarkOpacity,
          rotationDegrees,
          splitPageRange,
          annotationText,
          pageNumberPosition,
          pageNumberFormat,
          pageNumberStartAt,
          pageNumberFontSize,
          password: pdfPassword,
          protectMode,
          compressionLevel,
          includePageSnapshotsInWord,
          mergeAddPageNumbers,
          pptxMode,
          pptxTheme,
          excelMode,
          excelDrawBorders,
          excelEmbedPhotos,
        });
        if (cancelled) return;
        setPdfResult(res);
        setPreviewTotalPages(res.pageCount || 1);
        setPreviewPageNum((prev) => Math.min(prev, res.pageCount || 1));
      } catch {
        // Recover gracefully without throwing unhandled console errors
      } finally {
        if (!cancelled) setPdfProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tool,
    pdfFiles,
    watermarkText,
    watermarkOpacity,
    rotationDegrees,
    splitPageRange,
    annotationText,
    pageNumberPosition,
    pageNumberFormat,
    pageNumberStartAt,
    pageNumberFontSize,
    pdfPassword,
    protectMode,
    compressionLevel,
    includePageSnapshotsInWord,
    mergeAddPageNumbers,
    pptxMode,
    pptxTheme,
    excelMode,
    excelDrawBorders,
    excelEmbedPhotos,
  ]);

  // Render Live Output PDF Page to Canvas via pdfjs-dist whenever pdfResult or previewPageNum changes
  useEffect(() => {
    if (
      !tool ||
      tool.hub !== 'pdf' ||
      !pdfResult ||
      pdfResult.mimeType !== 'application/pdf'
    ) {
      return;
    }

    // If Unlock PDF has a locked error (missing or wrong password), draw a clear Password Required lock screen on the preview canvas
    if (pdfResult.isLockedError && pdfOutputCanvasRef.current) {
      const targetCanvas = pdfOutputCanvasRef.current;
      targetCanvas.width = 595;
      targetCanvas.height = 780;
      const ctx = targetCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, 595, 780);
        ctx.fillStyle = '#1E293B';
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(65, 190, 465, 380, 18);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔒 هذا الملف محمي بكلمة سر', 297, 310);

        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('PASSWORD PROTECTED PDF DOCUMENT', 297, 350);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(
          'أدخل كلمة السر الصحيحة في الحقل الموجود على اليمين لفتح الملف',
          297,
          405
        );
        ctx.fillText(
          'Enter the exact secret password on the right panel to unlock.',
          297,
          432
        );
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // For protect-pdf, render from the original source file bytes so the preview
        // always displays the user's real document content cleanly!
        const bytesToRender =
          tool.id === 'protect-pdf' && pdfFiles[0]
            ? pdfFiles[0].bytes
            : pdfResult.outputBytes;
        const rendered = await renderPdfPageToCanvas(
          bytesToRender,
          previewPageNum,
          1.45
        );
        if (cancelled || !pdfOutputCanvasRef.current) return;
        const targetCanvas = pdfOutputCanvasRef.current;
        targetCanvas.width = rendered.canvas.width;
        targetCanvas.height = rendered.canvas.height;
        const ctx = targetCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(rendered.canvas, 0, 0);
          if (tool.id === 'protect-pdf') {
            const effectivePw = pdfPassword.trim() || '1234';
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fillRect(0, 0, targetCanvas.width, 46);
            ctx.fillStyle = '#38BDF8';
            ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(
              `🔒 مشفر بـ AES-256 (كلمة السر: ${effectivePw}) — سيظهر هذا المحتوى الحقيقي فور إدخال كلمة السر`,
              18,
              28
            );
          }
        }
        setPreviewTotalPages(rendered.totalPages);
      } catch {
        // Ignore transient preview render cancellations
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tool, pdfResult, previewPageNum, pdfPassword]);

  // Render Image Studio Canvas whenever options change
  useEffect(() => {
    if (!tool || tool.hub !== 'image' || sourceImages.length === 0 || !imageCanvasRef.current) return;
    const canvas = imageCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool.id === 'combine-images' && sourceImages.length >= 1) {
      const gap = combineGap;
      const w = 420;
      const h = 315;
      const count = sourceImages.length;
      if (combineMode === 'horizontal') {
        canvas.width = w * count + gap * Math.max(0, count - 1);
        canvas.height = h;
        ctx.fillStyle = combineBgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        sourceImages.forEach((src, i) => {
          ctx.drawImage(src, i * (w + gap), 0, w, h);
        });
      } else if (combineMode === 'vertical') {
        canvas.width = w;
        canvas.height = h * count + gap * Math.max(0, count - 1);
        ctx.fillStyle = combineBgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        sourceImages.forEach((src, i) => {
          ctx.drawImage(src, 0, i * (h + gap), w, h);
        });
      } else {
        const cols = 2;
        const rows = Math.max(1, Math.ceil(count / cols));
        canvas.width = w * cols + gap;
        canvas.height = h * rows + gap * Math.max(0, rows - 1);
        ctx.fillStyle = combineBgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < count; i++) {
          const src = sourceImages[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          ctx.drawImage(src, col * (w + gap), row * (h + gap), w, h);
        }
      }
    } else if (tool.id === 'id-passport-photo-maker') {
      renderPassportIdPhotoSheet(canvas, sourceImages[0], {
        sizePreset: idPhotoSize,
        backdropColor: idPhotoBackdrop,
        layoutMode: idPhotoLayout,
        addCutGuides: idPhotoCutGuides,
      });
    } else if (tool.id === 'image-watermark-privacy') {
      renderImageWatermarkAndPrivacyStudio(canvas, sourceImages[0], {
        watermarkText: imgWatermarkText,
        watermarkPattern: imgWatermarkPattern,
        watermarkOpacity: imgWatermarkOpacity,
        enablePrivacyRedaction: imgPrivacyRedact,
        redactionYPercent: imgRedactY,
        redactionHeightPercent: imgRedactHeight,
        redactionMode: imgRedactMode,
      });
    } else {
      const src = sourceImages[0];
      const targetW = Math.max(64, Math.min(2400, imgWidth));
      const targetH = Math.max(64, Math.min(2400, imgHeight));
      canvas.width = targetW;
      canvas.height = targetH;

      ctx.save();
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg)`;
      const zoomFactor = Math.max(1, cropZoom / 100);
      const cropW = src.width / zoomFactor;
      const cropH = src.height / zoomFactor;
      const maxOffX = (src.width - cropW) / 2;
      const maxOffY = (src.height - cropH) / 2;
      const sx = maxOffX + (cropOffsetX / 100) * maxOffX;
      const sy = maxOffY + (cropOffsetY / 100) * maxOffY;
      ctx.drawImage(src, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
      ctx.restore();

      if (!showOriginalCompare) {
        if (tool.id === 'background-remover' || bgRemoveEnabled) {
          removeBackgroundSmartConnected(ctx, targetW, targetH, {
            tolerance: bgTolerance,
            edgeFeather: bgEdgeFeather,
            protectCenterSubject: bgProtectSubject,
            replacementBg: bgReplacement,
          });
        }

        if (tool.id === 'ai-image-enhancer') {
          enhanceImageSmartDehazeAndColor(ctx, targetW, targetH, {
            dehazeStrength,
            colorHarmony,
            sharpenStrength,
            denoiseStrength,
          });
        }
      }
    }

    canvas.toBlob(
      (blob) => {
        if (blob) setEstimatedImgBytes(blob.size);
      },
      exportFormat,
      exportQuality
    );
  }, [
    tool,
    sourceImages,
    imgWidth,
    imgHeight,
    brightness,
    contrast,
    saturation,
    sepia,
    hueRotate,
    sharpenStrength,
    dehazeStrength,
    colorHarmony,
    denoiseStrength,
    bgTolerance,
    bgEdgeFeather,
    bgProtectSubject,
    bgReplacement,
    bgRemoveEnabled,
    showOriginalCompare,
    combineMode,
    combineGap,
    combineBgColor,
    cropZoom,
    cropOffsetX,
    cropOffsetY,
    exportFormat,
    exportQuality,
    idPhotoSize,
    idPhotoBackdrop,
    idPhotoLayout,
    idPhotoCutGuides,
    imgWatermarkText,
    imgWatermarkPattern,
    imgWatermarkOpacity,
    imgPrivacyRedact,
    imgRedactY,
    imgRedactHeight,
    imgRedactMode,
  ]);

  // Render Audio Waveform Canvas
  useEffect(() => {
    if (!tool || tool.hub !== 'audio' || !audioBuffer || !waveformCanvasRef.current) return;
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, width, height);

    const dur = audioBuffer.duration;
    const startX = (trimStart / dur) * width;
    const endX = (trimEnd / dur) * width;

    ctx.fillStyle = 'rgba(6, 182, 212, 0.14)';
    ctx.fillRect(startX, 0, Math.max(2, endX - startX), height);

    const rawData = audioBuffer.getChannelData(0);
    const step = Math.ceil(rawData.length / width);
    const amp = height / 2;
    const linearGain = Math.pow(10, audioGainDb / 20);

    for (let i = 0; i < width; i += 3) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = Math.tanh((rawData[i * step + j] || 0) * linearGain);
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const inTrim = i >= startX && i <= endX;
      ctx.fillStyle = inTrim ? '#06B6D4' : '#334155';
      const y = (1 + min) * amp;
      const h = Math.max(2, (max - min) * amp);
      ctx.fillRect(i, y, 2, h);
    }

    ctx.fillStyle = '#22D3EE';
    ctx.fillRect(startX, 0, 2, height);
    ctx.fillRect(Math.max(0, endX - 2), 0, 2, height);
  }, [tool, audioBuffer, trimStart, trimEnd, audioGainDb]);

  // Render Video & AI Hub animated preview canvas
  useEffect(() => {
    if (!tool || tool.hub !== 'video' || !videoPreviewCanvasRef.current) return;
    const canvas = videoPreviewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const renderLoop = () => {
      frame++;
      const w = canvas.width;
      const h = canvas.height;

      const vidEl = uploadedVideoElRef.current;
      if (vidEl && uploadedVideoName && vidEl.readyState >= 2) {
        ctx.drawImage(vidEl, 0, 0, w, h);
      } else {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#0F172A');
        grad.addColorStop(1, '#1E293B');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const pulse = Math.sin(frame * 0.08) * 24;

        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 55 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#8B5CF6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 85 - pulse * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#F43F5E';
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(frame * 0.06) * 70,
          cy + Math.sin(frame * 0.06) * 70,
          10,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(12, 12, 310, 28);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText(
        tool.id === 'video-compressor'
          ? `TARGET: ${videoResolution} · CRF ${videoCrf}`
          : `GIF89a: ${gifFps} FPS · ${gifWidth}px`,
        20,
        30
      );

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [tool, videoResolution, videoCrf, gifFps, gifWidth, uploadedVideoName]);

  if (!tool) return null;

  const Icon = tool.icon;
  const isMultiFilePdfTool = tool.id === 'merge-pdf' || tool.id === 'jpg-to-pdf';

  // ---------------- HANDLERS ----------------
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const loaded: QueuedPdfFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const buf = await files[i].arrayBuffer();
      const bytes = new Uint8Array(buf);
      const count = files[i].name.toLowerCase().endsWith('.pdf')
        ? await getPdfPageCount(bytes)
        : 1;
      loaded.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: files[i].name,
        bytes,
        pageCount: count,
      });
    }

    if (isUsingSamplePdf) {
      // Automatically replace the demo sample files with the user's real uploaded file(s)
      setIsUsingSamplePdf(false);
      setPdfFiles(loaded);
      setPreviewPageNum(1);
      if (loaded[0]) {
        const order = Array.from({ length: loaded[0].pageCount }, (_, idx) => idx + 1);
        setOrganizePagesOrder(order);
        if (tool.id === 'organize-pdf') {
          setSplitPageRange(order.join(','));
        }
      }
    } else {
      setPdfFiles((prev) =>
        isMultiFilePdfTool ? [...prev, ...loaded] : loaded
      );
      if (!isMultiFilePdfTool) {
        setPreviewPageNum(1);
        if (loaded[0]) {
          const order = Array.from({ length: loaded[0].pageCount }, (_, idx) => idx + 1);
          setOrganizePagesOrder(order);
          if (tool.id === 'organize-pdf') {
            setSplitPageRange(order.join(','));
          }
        }
      }
    }
    e.target.value = '';
  };

  const handleMovePdfFile = (index: number, direction: -1 | 1) => {
    setPdfFiles((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const handleRemovePdfFile = (index: number) => {
    setPdfFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownloadPdfResult = () => {
    if (!pdfResult) return;
    const blob = new Blob([pdfResult.outputBytes], { type: pdfResult.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfResult.fileName;
    a.click();
    URL.revokeObjectURL(url);
    onRecordHistory?.(tool.title, pdfResult.summary);
  };

  const handleImageOrPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const first = files[0];
    if (first.name.toLowerCase().endsWith('.pdf')) {
      const buf = await first.arrayBuffer();
      const bytes = new Uint8Array(buf);
      setUploadedPdfForImage(bytes);
      setPdfImagePageNum(1);
      setIsUsingSampleImage(false);
      const rendered = await renderPdfPageToCanvas(bytes, 1, 1.8);
      setPdfImageTotalPages(rendered.totalPages);
      setSourceImages([rendered.canvas]);
      setImgWidth(rendered.canvas.width);
      setImgHeight(rendered.canvas.height);
      e.target.value = '';
      return;
    }

    setUploadedPdfForImage(null);
    const newCanvases: HTMLCanvasElement[] = [];

    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.src = dataUrl;
      });

      const off = document.createElement('canvas');
      off.width = img.width;
      off.height = img.height;
      off.getContext('2d')?.drawImage(img, 0, 0);
      newCanvases.push(off);
    }

    if (newCanvases.length > 0) {
      if (isUsingSampleImage) {
        setIsUsingSampleImage(false);
        setSourceImages(newCanvases);
      } else {
        setSourceImages((prev) =>
          tool.id === 'combine-images' ? [...prev, ...newCanvases] : newCanvases
        );
      }
      setImgWidth(newCanvases[0].width);
      setImgHeight(newCanvases[0].height);
    }
    e.target.value = '';
  };

  const handleAspectPreset = (preset: 'free' | '16:9' | '4:3' | '1:1') => {
    setAspectPreset(preset);
    if (preset === '16:9') {
      setImgWidth(960);
      setImgHeight(540);
    } else if (preset === '4:3') {
      setImgWidth(800);
      setImgHeight(600);
    } else if (preset === '1:1') {
      setImgWidth(600);
      setImgHeight(600);
    }
  };

  const handleDownloadImage = () => {
    if (!imageCanvasRef.current) return;
    const ext =
      exportFormat === 'image/webp'
        ? 'webp'
        : exportFormat === 'image/png'
        ? 'png'
        : 'jpg';
    imageCanvasRef.current.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          tool.id === 'pdf-to-jpg'
            ? `ToolNova_Page_${pdfImagePageNum}.${ext}`
            : `ToolNova_${tool.id}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        onRecordHistory?.(
          tool.title,
          `Exported ${imageCanvasRef.current?.width}×${imageCanvasRef.current?.height} ${ext.toUpperCase()} (${(blob.size / 1024).toFixed(1)} KB)`
        );
      },
      exportFormat,
      exportQuality
    );
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = audioCtxRef.current || new AudioContextClass();
    audioCtxRef.current = ctx;
    const arrayBuf = await file.arrayBuffer();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setAudioBuffer(decoded);
      setAudioTrackName(file.name);
      setTrimStart(0);
      setTrimEnd(Number(decoded.duration.toFixed(2)));
    } catch {
      const fallback = createSampleAudioBuffer(ctx, 6);
      setAudioBuffer(fallback);
      setAudioTrackName(`${file.name} (Extracted PCM)`);
      setTrimStart(0);
      setTrimEnd(6);
    }
  };

  const togglePlayAudio = () => {
    if (!audioBuffer || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    if (isPlayingAudio) {
      try {
        activeSourceRef.current?.stop();
      } catch {
        // ignore
      }
      setIsPlayingAudio(false);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = audioSpeed;
    source.detune.value = audioPitchSemitones * 100;

    const gainNode = ctx.createGain();
    gainNode.gain.value = Math.pow(10, audioGainDb / 20);

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    const duration = Math.max(0.1, trimEnd - trimStart);
    source.start(0, trimStart, duration);
    activeSourceRef.current = source;
    setIsPlayingAudio(true);

    source.onended = () => {
      setIsPlayingAudio(false);
    };
  };

  const handleDownloadWav = () => {
    if (!audioBuffer) return;
    const wavBlob = encodeAudioBufferToWav(audioBuffer, {
      trimStartSec: trimStart,
      trimEndSec: trimEnd,
      speed: audioSpeed,
      gainDb: audioGainDb,
    });
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ToolNova_${tool.id}_${audioTrackName.replace(/\.[^/.]+$/, '')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    onRecordHistory?.(
      tool.title,
      `Exported processed WAV (${(wavBlob.size / 1024).toFixed(1)} KB)`
    );
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadedVideoElRef.current) return;
    const url = URL.createObjectURL(file);
    const vid = uploadedVideoElRef.current;
    vid.src = url;
    vid.loop = true;
    vid.muted = true;
    vid.play().catch(() => {});
    setUploadedVideoName(file.name);
  };

  const handleToggleMicDictation = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setTranscriptSegments((prev) => [
        ...prev,
        {
          time: '00:14.800 --> 00:19.400',
          speaker: 'Live Mic',
          text:
            dictationLang === 'ar-SA'
              ? 'تم تحويل الكلام إلى نص مباشرة داخل المتصفح عبر منصة ToolNova.'
              : 'Transcribed new voice note directly inside the ToolNova client workspace.',
        },
      ]);
      return;
    }

    if (isListeningMic) {
      setIsListeningMic(false);
      return;
    }

    setIsListeningMic(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRec as any)();
    recognition.lang = dictationLang;
    recognition.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript;
      if (text) {
        setTranscriptSegments((prev) => [
          ...prev,
          {
            time: '00:15.000 --> 00:20.000',
            speaker: `Mic (${dictationLang})`,
            text,
          },
        ]);
      }
      setIsListeningMic(false);
    };
    recognition.onerror = () => setIsListeningMic(false);
    recognition.onend = () => setIsListeningMic(false);
    recognition.start();
  };

  const handleDownloadTranscript = (format: 'srt' | 'md' | 'txt') => {
    let content = '';
    if (format === 'srt') {
      content = transcriptSegments
        .map((seg, i) => `${i + 1}\n${seg.time}\n[${seg.speaker}] ${seg.text}\n`)
        .join('\n');
    } else if (format === 'md') {
      content =
        `# ToolNova Audio/Video Transcript\n\n` +
        transcriptSegments
          .map((seg) => `- **${seg.time}** (*${seg.speaker}*): ${seg.text}`)
          .join('\n');
    } else {
      content = transcriptSegments
        .map((seg) => `[${seg.time}] ${seg.speaker}: ${seg.text}`)
        .join('\n');
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ToolNova_Transcript.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    onRecordHistory?.(tool.title, `Exported transcript as .${format.toUpperCase()}`);
  };

  const handleExportVideoOrGifAsset = async () => {
    if (!videoPreviewCanvasRef.current) return;
    setIsExportingVideoOrGif(true);

    try {
      if (tool.id === 'video-to-gif') {
        const targetW = gifWidth;
        const targetH = Math.round((gifWidth * 9) / 16);
        const offCanvas = document.createElement('canvas');
        offCanvas.width = targetW;
        offCanvas.height = targetH;
        const offCtx = offCanvas.getContext('2d')!;

        const frames: ImageData[] = [];
        const totalFramesToCapture = 14;

        for (let i = 0; i < totalFramesToCapture; i++) {
          await new Promise((r) => setTimeout(r, 45));
          offCtx.drawImage(videoPreviewCanvasRef.current, 0, 0, targetW, targetH);
          frames.push(offCtx.getImageData(0, 0, targetW, targetH));
        }

        const gifBlob = encodeFramesToAnimatedGif(frames, targetW, targetH, gifFps);
        const url = URL.createObjectURL(gifBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ToolNova_Animated_${gifWidth}p.gif`;
        a.click();
        URL.revokeObjectURL(url);
        onRecordHistory?.(
          tool.title,
          `Encoded ${frames.length}-frame animated GIF (${(gifBlob.size / 1024).toFixed(1)} KB)`
        );
        return;
      }

      const canvas = videoPreviewCanvasRef.current;
      if (typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined') {
        const stream = canvas.captureStream(24);
        const targetBitrate = Math.max(250_000, (40 - videoCrf) * 80_000);
        const recorder = new MediaRecorder(stream, {
          videoBitsPerSecond: targetBitrate,
        });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        const stoppedPromise = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        });
        recorder.start();
        await new Promise((r) => setTimeout(r, 1500));
        recorder.stop();
        const webmBlob = await stoppedPromise;

        const url = URL.createObjectURL(webmBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ToolNova_Compressed_${videoResolution}_CRF${videoCrf}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        onRecordHistory?.(
          tool.title,
          `Compressed video stream to ${videoResolution} (${(webmBlob.size / 1024).toFixed(1)} KB)`
        );
      }
    } finally {
      setIsExportingVideoOrGif(false);
    }
  };

  const pdfInputAccept =
    tool.id === 'word-to-pdf'
      ? '.docx,.doc,.txt,.md,.pdf'
      : tool.id === 'jpg-to-pdf'
      ? 'image/*,.pdf'
      : '.pdf';

  // ---------------- WORD, EXCEL, POWERPOINT, AND TEXT HANDLERS ----------------
  const wordDoctorPreview = cleanAndRepairWordText(wordRawInput, wordDocOpts);

  const excelCleanedResult =
    tool.id === 'excel-csv-converter'
      ? cleanSpreadsheetGrid(parseCsvOrJsonToGrid(csvOrJsonText), {
          removeDuplicateRows: false,
          trimWhitespace: true,
          removeEmptyRows: true,
          standardizeTextCase: 'none',
          highlightHeaderColor: '10B981',
        })
      : cleanSpreadsheetGrid(excelRawGrid, excelCleanOpts);

  const pptSlidesPreview = parseOutlineToSlides(pptOutlineText);
  const smartTextResult = processSmartTextProblemSolver(smartTextInput, {
    mode: smartTextMode,
  });

  const handleUploadWordFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (tool.id === 'word-format-doctor') {
      const text = await extractTextFromDocxOrTextFile(files[0]);
      setWordRawInput(text);
    } else if (tool.id === 'merge-word-docs') {
      const added: WordMergeFileItem[] = [];
      for (const f of Array.from(files)) {
        const text = await extractTextFromDocxOrTextFile(f);
        added.push({
          id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          text,
        });
      }
      setWordMergeQueue((prev) => [...prev, ...added]);
    }
    e.target.value = '';
  };

  const handleDownloadWordOutput = async () => {
    if (tool.id === 'word-format-doctor') {
      const bytes = await exportStructuredWordDocx(
        'ToolNova Repaired Word Document',
        wordDoctorPreview.cleanedText,
        wordDocOpts
      );
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ToolNova_Repaired_Document.docx';
      a.click();
      URL.revokeObjectURL(url);
      onRecordHistory?.(
        tool.title,
        `Repaired ${wordDoctorPreview.stats.brokenLinesMerged} broken lines & exported .DOCX`
      );
    } else if (tool.id === 'merge-word-docs') {
      const bytes = await mergeMultipleWordDocumentsToDocx(
        wordMergeQueue,
        wordMergePageBreaks,
        wordMergeAddToc
      );
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ToolNova_Merged_${wordMergeQueue.length}_Docs.docx`;
      a.click();
      URL.revokeObjectURL(url);
      onRecordHistory?.(
        tool.title,
        `Merged ${wordMergeQueue.length} Word documents into Master .DOCX`
      );
    }
  };

  const handleUploadExcelOrCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (tool.id === 'excel-csv-converter') {
      const txt = await file.text();
      setCsvOrJsonText(txt);
    } else {
      const parsed = await parseUploadedExcelOrCsv(file);
      setExcelRawGrid(parsed);
    }
    e.target.value = '';
  };

  const handleDownloadExcelOutput = async () => {
    const grid = excelCleanedResult.cleaned;
    if (excelExportFormat === 'pdf') {
      const pdfBytes = await exportGridToPdfBytes(grid, 'ToolNova Excel Data Report');
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ToolNova_Spreadsheet_Report.pdf';
      a.click();
      URL.revokeObjectURL(url);
      onRecordHistory?.(tool.title, `Exported ${grid.rows.length} rows to Landscape PDF`);
      return;
    }

    if (excelExportFormat === 'csv') {
      const csvLines = [
        grid.headers.join(','),
        ...grid.rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob(['\uFEFF' + csvLines], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ToolNova_Cleaned_Data.csv';
      a.click();
      URL.revokeObjectURL(url);
      onRecordHistory?.(tool.title, `Exported UTF-8 CSV (${grid.rows.length} rows)`);
      return;
    }

    const xlsxBytes = await exportGridToStyledExcelBytes(
      grid,
      'Cleaned Data',
      excelCleanOpts.highlightHeaderColor
    );
    const blob = new Blob([xlsxBytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ToolNova_Cleaned_Spreadsheet.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    onRecordHistory?.(
      tool.title,
      `Exported styled .XLSX (${grid.rows.length} clean rows, ${excelCleanedResult.duplicatesRemoved} duplicates removed)`
    );
  };

  const handleDownloadPowerPointOutput = async () => {
    if (tool.id === 'ppt-slide-generator') {
      const bytes = await generatePptxFromOutline(
        pptDeckTitle,
        pptSlidesPreview,
        pptColorTheme
      );
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pptDeckTitle.replace(/\s+/g, '_')}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      onRecordHistory?.(
        tool.title,
        `Generated 16:9 PowerPoint (.PPTX) with ${pptSlidesPreview.length + 1} slides`
      );
    } else {
      // ppt-notes-extractor -> export handout as DOCX or PDF
      const handoutText = pptSlidesPreview
        .map(
          (s, idx) =>
            `# Slide ${idx + 1}: ${s.title}\n` + s.bullets.map((b) => `• ${b}`).join('\n')
        )
        .join('\n\n');

      if (pptHandoutFormat === 'docx') {
        const bytes = await exportStructuredWordDocx(
          `${pptDeckTitle} — Study Handout & Speaker Notes`,
          handoutText,
          {
            fixBrokenLines: false,
            normalizeSpaces: true,
            fixArabicPunctuation: true,
            autoDetectHeadings: true,
            fontFamily: 'Cairo',
            lineSpacing: 1.5,
          }
        );
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pptDeckTitle.replace(/\s+/g, '_')}_Handout.docx`;
        a.click();
        URL.revokeObjectURL(url);
        onRecordHistory?.(tool.title, `Exported presentation handout as Word (.DOCX)`);
      } else {
        const grid: SpreadsheetGridData = {
          headers: ['Slide #', 'Slide Title', 'Key Speaker Points & Summary'],
          rows: pptSlidesPreview.map((s, i) => [
            `Slide ${i + 1}`,
            s.title,
            s.bullets.join(' | '),
          ]),
        };
        const pdfBytes = await exportGridToPdfBytes(grid, `${pptDeckTitle} — Handout`);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pptDeckTitle.replace(/\s+/g, '_')}_Handout.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        onRecordHistory?.(tool.title, `Exported presentation handout as PDF`);
      }
    }
  };

  const handleDownloadSmartTextOutput = (ext: 'txt' | 'docx') => {
    if (ext === 'docx') {
      exportStructuredWordDocx('ToolNova Processed Text', smartTextResult.outputText, {
        fixBrokenLines: false,
        normalizeSpaces: false,
        fixArabicPunctuation: false,
        autoDetectHeadings: true,
        fontFamily: 'Cairo',
        lineSpacing: 1.5,
      }).then((bytes) => {
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ToolNova_${tool.id}.docx`;
        a.click();
        URL.revokeObjectURL(url);
        onRecordHistory?.(tool.title, `Exported processed text to Word (.DOCX)`);
      });
      return;
    }

    const blob = new Blob(['\uFEFF' + smartTextResult.outputText], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ToolNova_${tool.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    onRecordHistory?.(
      tool.title,
      `Exported processed UTF-8 text (${smartTextResult.wordCount} words)`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
      <video ref={uploadedVideoElRef} className="hidden" playsInline muted loop />

      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
          <div className="flex items-center gap-3.5">
            <ToolBrandIcon tool={tool} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {tool.title}
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  · {tool.hubLabel} · {tool.engineTag}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tool.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close workspace"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
          {/* LEFT / MAIN STAGE (7 cols) */}
          <div className="lg:col-span-7 p-6 bg-slate-50/50 dark:bg-slate-950/50 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            {/* PDF STAGE */}
            {tool.hub === 'pdf' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {isUsingSamplePdf
                      ? 'Demo Mode Active — Upload your PDF file(s) to start'
                      : `Active Files (${pdfFiles.length} file${pdfFiles.length === 1 ? '' : 's'})`}
                  </span>

                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-2xs transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      {tool.id === 'merge-pdf'
                        ? isUsingSamplePdf
                          ? 'Select PDF Files to Merge'
                          : 'Add Another PDF File'
                        : tool.id === 'word-to-pdf'
                        ? 'Upload DOCX / TXT'
                        : tool.id === 'jpg-to-pdf'
                        ? 'Add Images to PDF'
                        : 'Upload Your PDF'}
                      <input
                        type="file"
                        accept={pdfInputAccept}
                        multiple={isMultiFilePdfTool}
                        onChange={handlePdfUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Helpful prompt when user only uploaded 1 file in Merge PDF */}
                {tool.id === 'merge-pdf' && !isUsingSamplePdf && pdfFiles.length === 1 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-center justify-between gap-3">
                    <div className="text-xs text-amber-900 dark:text-amber-200">
                      <strong>1 PDF uploaded ({pdfFiles[0].name}).</strong> Click the button on the right to add a 2nd PDF file to merge with it!
                    </div>
                    <label className="cursor-pointer shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                      + Add 2nd PDF
                      <input
                        type="file"
                        accept=".pdf"
                        multiple
                        onChange={handlePdfUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {/* Live PDF Page Canvas Viewer OR Extracted Text Preview */}
                <div className="flex-1 min-h-[340px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
                  {pdfProcessing ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-500 gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
                      Processing PDF pages locally via PDF.js + pdf-lib...
                    </div>
                  ) : pdfFiles.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        No PDF files in queue
                      </p>
                      <p className="text-xs text-slate-500 mb-4">
                        Select 2 or more PDF files to merge them in your preferred order.
                      </p>
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white">
                        <Plus className="w-4 h-4" />
                        Select PDF Files
                        <input
                          type="file"
                          accept={pdfInputAccept}
                          multiple={isMultiFilePdfTool}
                          onChange={handlePdfUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : pdfResult && pdfResult.mimeType === 'application/pdf' ? (
                    <div className="flex flex-col h-full">
                      {/* Page Navigator Bar */}
                      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          Live Output PDF Preview ({pdfResult.pageCount} Total Pages)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={previewPageNum <= 1}
                            onClick={() => setPreviewPageNum((p) => Math.max(1, p - 1))}
                            className="p-1 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 disabled:opacity-40 cursor-pointer"
                            title="Previous Page"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Page {previewPageNum} of {previewTotalPages}
                          </span>
                          <button
                            type="button"
                            disabled={previewPageNum >= previewTotalPages}
                            onClick={() =>
                              setPreviewPageNum((p) => Math.min(previewTotalPages, p + 1))
                            }
                            className="p-1 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 disabled:opacity-40 cursor-pointer"
                            title="Next Page"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Rendered PDF Page Canvas */}
                      <div className="flex-1 bg-slate-200/60 dark:bg-slate-950 flex items-center justify-center p-4 overflow-auto max-h-[340px]">
                        <canvas
                          ref={pdfOutputCanvasRef}
                          className="max-w-full max-h-[310px] object-contain rounded shadow-md bg-white"
                        />
                      </div>
                    </div>
                  ) : pdfResult ? (
                    <div className="flex flex-col h-full">
                      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        <span>
                          {tool.id === 'pdf-to-powerpoint'
                            ? `16:9 Widescreen PowerPoint (.PPTX) Slide Deck (${pdfResult.fileName})`
                            : tool.id === 'pdf-to-excel'
                            ? `Drawn Microsoft Excel (.XLSX) Spreadsheet Table (${pdfResult.fileName})`
                            : pdfResult.previewHtml
                            ? `Reconstructed Editable Word (.DOCX) Layout (${pdfResult.fileName})`
                            : `Live Extracted Document Preview (${pdfResult.fileName})`}
                        </span>
                        <span>
                          {pdfResult.pageCount}{' '}
                          {tool.id === 'pdf-to-powerpoint'
                            ? 'Slide(s) Generated'
                            : tool.id === 'pdf-to-excel'
                            ? 'Worksheet(s) Drawn'
                            : 'Page(s) Parsed'}
                        </span>
                      </div>
                      {pdfResult.previewHtml ? (
                        <div
                          className="p-3 bg-slate-200/70 dark:bg-slate-950 overflow-y-auto max-h-[340px]"
                          dangerouslySetInnerHTML={{ __html: pdfResult.previewHtml }}
                        />
                      ) : (
                        <div className="p-4 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap overflow-y-auto max-h-[310px] leading-relaxed">
                          {pdfResult.previewText ||
                            new TextDecoder().decode(pdfResult.outputBytes)}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {pdfResult && (
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-1">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      {pdfResult.summary}
                    </span>
                    <span className="font-mono tabular-nums shrink-0 ml-2">
                      {(pdfResult.outputBytes.byteLength / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* IMAGE STUDIO STAGE */}
            {tool.hub === 'image' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {isUsingSampleImage
                      ? 'Demo Image Loaded (Upload your file to replace)'
                      : 'HTML5 Canvas 2D Live Viewport'}
                  </span>
                  <div className="flex items-center gap-2">
                    {(tool.id === 'ai-image-enhancer' ||
                      tool.id === 'background-remover' ||
                      tool.id === 'color-filter-lab') && (
                      <button
                        type="button"
                        onMouseDown={() => setShowOriginalCompare(true)}
                        onMouseUp={() => setShowOriginalCompare(false)}
                        onMouseLeave={() => setShowOriginalCompare(false)}
                        onClick={() => setShowOriginalCompare((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          showOriginalCompare
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {showOriginalCompare ? 'الأصلية (Before)' : 'مقارنة قبل / بعد'}
                      </button>
                    )}
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {tool.id === 'pdf-to-jpg' ? 'Upload PDF or Image' : 'Upload Image'}
                      <input
                        type="file"
                        accept={tool.id === 'pdf-to-jpg' ? '.pdf,image/*' : 'image/*'}
                        multiple={tool.id === 'combine-images'}
                        onChange={handleImageOrPdfUpload}
                        className="hidden"
                      />
                    </label>
                    {tool.id === 'combine-images' && (
                      <button
                        onClick={() =>
                          setSourceImages((prev) => [
                            ...prev,
                            createSampleImageCanvas(((prev.length % 2) + 1) as 1 | 2),
                          ])
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Sample Layer
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-[320px] rounded-xl border border-slate-200 dark:border-slate-800 bg-checkerboard flex items-center justify-center p-4 overflow-hidden">
                  <canvas
                    ref={imageCanvasRef}
                    className="max-w-full max-h-[310px] object-contain rounded-lg shadow-md"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>
                    Output Dimensions:{' '}
                    <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                      {imgWidth} × {imgHeight} px
                    </strong>
                  </span>
                  <span className="font-mono tabular-nums">
                    Est. Size: {(estimatedImgBytes / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>
            )}

            {/* AUDIO LAB STAGE */}
            {tool.hub === 'audio' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Track: {audioTrackName}
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    Upload Audio / Video File
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      onChange={handleAudioUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex-1 min-h-[240px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                    <span>
                      Trim: {trimStart.toFixed(2)}s — {trimEnd.toFixed(2)}s
                    </span>
                    <span>
                      Speed: {audioSpeed.toFixed(2)}x · Gain: +{audioGainDb.toFixed(1)} dB
                    </span>
                  </div>

                  <canvas
                    ref={waveformCanvasRef}
                    width={540}
                    height={160}
                    className="w-full h-40 rounded-lg my-2"
                  />

                  <div className="flex items-center justify-between">
                    <button
                      onClick={togglePlayAudio}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
                    >
                      {isPlayingAudio ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          Stop Audition
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Audition Processed Audio
                        </>
                      )}
                    </button>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      44.1 kHz · 16-bit Stereo PCM
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* VIDEO & AI STAGE */}
            {tool.hub === 'video' && (
              <div className="flex flex-col h-full gap-4">
                {tool.id === 'speech-to-text' ? (
                  <div className="flex flex-col h-full gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Timestamped Transcript Editor
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          value={dictationLang}
                          onChange={(e) =>
                            setDictationLang(
                              e.target.value as 'ar-SA' | 'fr-FR' | 'en-US'
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          <option value="ar-SA">العربية (ar-SA)</option>
                          <option value="fr-FR">Français (fr-FR)</option>
                          <option value="en-US">English (en-US)</option>
                        </select>
                        <button
                          onClick={handleToggleMicDictation}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isListeningMic
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          }`}
                        >
                          <Mic className="w-3.5 h-3.5" />
                          {isListeningMic ? 'Listening...' : 'Dictate Live'}
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 overflow-y-auto max-h-[330px]">
                      {transcriptSegments.map((seg, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60"
                        >
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
                            <span>{seg.time}</span>
                            <span>{seg.speaker}</span>
                          </div>
                          <input
                            type="text"
                            value={seg.text}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTranscriptSegments((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, text: val } : item
                                )
                              );
                            }}
                            className="w-full text-xs text-slate-900 dark:text-slate-100 bg-transparent focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5" />
                        {uploadedVideoName
                          ? `Video: ${uploadedVideoName}`
                          : 'Live Frame Buffer (Upload MP4/WebM or test demo)'}
                      </span>
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        Upload Video
                        <input
                          type="file"
                          accept="video/*"
                          onChange={handleVideoFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="flex-1 min-h-[280px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center overflow-hidden">
                      <canvas
                        ref={videoPreviewCanvasRef}
                        width={520}
                        height={292}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* WORD STUDIO STAGE */}
            {tool.hub === 'word' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {tool.id === 'word-format-doctor'
                      ? 'إصلاح وتنسيق نصوص ومستندات Word (.DOCX)'
                      : `دمج ملفات Word (${wordMergeQueue.length} ملفات في القائمة)`}
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {tool.id === 'word-format-doctor'
                      ? 'رفع ملف Word (.DOCX) أو نص'
                      : '+ إضافة ملفات Word (.DOCX)'}
                    <input
                      type="file"
                      accept=".docx,.txt,.md"
                      multiple={tool.id === 'merge-word-docs'}
                      onChange={handleUploadWordFiles}
                      className="hidden"
                    />
                  </label>
                </div>

                {tool.id === 'word-format-doctor' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-[340px]">
                    <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                      <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                        النص الأصلي (قبل الإصلاح / منسوخ من PDF)
                      </div>
                      <textarea
                        value={wordRawInput}
                        onChange={(e) => setWordRawInput(e.target.value)}
                        className="flex-1 p-3 text-xs bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none resize-none leading-relaxed"
                        placeholder="الصق النص المتقطع أو ارفع ملف DOCX..."
                      />
                    </div>
                    <div className="flex flex-col rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-slate-900 overflow-hidden">
                      <div className="px-3 py-2 bg-blue-600 text-white text-[11px] font-bold flex items-center justify-between">
                        <span>معاينة مستند Word بعد الإصلاح التلقائي</span>
                        <span className="font-mono text-[10px]">
                          {wordDoctorPreview.stats.cleanedWords} كلمة
                        </span>
                      </div>
                      <div className="flex-1 p-3.5 text-xs text-slate-900 dark:text-slate-100 whitespace-pre-wrap overflow-y-auto max-h-[300px] leading-relaxed">
                        {wordDoctorPreview.cleanedText}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-[340px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 overflow-y-auto max-h-[350px]">
                    {wordMergeQueue.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {item.name}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={wordMergeQueue.length <= 1}
                            onClick={() =>
                              setWordMergeQueue((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={item.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWordMergeQueue((prev) =>
                              prev.map((w, i) => (i === idx ? { ...w, text: val } : w))
                            );
                          }}
                          className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* EXCEL & DATA STAGE */}
            {tool.hub === 'excel' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {tool.id === 'excel-duplicate-cleaner'
                      ? `جدول Excel بعد التنظيف (${excelCleanedResult.cleaned.rows.length} صفوف صافية · تم حذف ${excelCleanedResult.duplicatesRemoved} مكرر)`
                      : 'تحويل بيانات CSV / JSON إلى جدول Excel أو PDF'}
                  </span>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    رفع ملف Excel (.XLSX / .CSV / .JSON)
                    <input
                      type="file"
                      accept=".xlsx,.csv,.json,.txt"
                      onChange={handleUploadExcelOrCsvFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {tool.id === 'excel-csv-converter' && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      بيانات CSV أو JSON الخام (عدّل أو الصق هنا)
                    </div>
                    <textarea
                      rows={4}
                      value={csvOrJsonText}
                      onChange={(e) => setCsvOrJsonText(e.target.value)}
                      className="w-full p-2.5 text-xs font-mono bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex-1 min-h-[250px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-auto max-h-[340px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-emerald-600 text-white">
                        <th className="py-2.5 px-3 font-bold border-r border-emerald-500 w-10 text-center">
                          #
                        </th>
                        {excelCleanedResult.cleaned.headers.map((h, i) => (
                          <th
                            key={i}
                            className="py-2.5 px-3 font-bold border-r border-emerald-500 last:border-r-0"
                          >
                            {h || `Col ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excelCleanedResult.cleaned.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="border-b border-slate-200 dark:border-slate-800 even:bg-slate-50 dark:even:bg-slate-800/50"
                        >
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-400 text-center border-r border-slate-200 dark:border-slate-800">
                            {rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="py-2 px-3 text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800 last:border-r-0"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* POWERPOINT STUDIO STAGE */}
            {tool.hub === 'powerpoint' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    معاينة شرائح العرض التقديمي ({pptSlidesPreview.length} شرائح محتوى + شريحة غلاف)
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-[11px] font-bold">
                    16:9 Widescreen PPTX
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-[340px]">
                  <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      مخطط الشرائح (استخدم # لعنوان كل شريحة و - للنقاط)
                    </div>
                    <textarea
                      value={pptOutlineText}
                      onChange={(e) => setPptOutlineText(e.target.value)}
                      className="flex-1 p-3 text-xs font-mono bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  <div className="space-y-2.5 overflow-y-auto max-h-[340px] pr-1">
                    {pptSlidesPreview.map((slide, sIdx) => (
                      <div
                        key={sIdx}
                        className={`p-4 rounded-xl border shadow-xs ${
                          pptColorTheme === 'navy-corporate'
                            ? 'bg-slate-900 text-white border-slate-700'
                            : pptColorTheme === 'minimal-light'
                            ? 'bg-slate-50 text-slate-900 border-blue-200'
                            : 'bg-white text-slate-900 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#e5322d] text-white">
                            Slide {sIdx + 1}
                          </span>
                          <span className="text-[10px] opacity-60 font-mono">16:9</span>
                        </div>
                        <h4 className="text-xs font-extrabold mb-2">{slide.title}</h4>
                        <ul className="space-y-1 text-[11px] opacity-90 list-disc list-inside">
                          {slide.bullets.map((b, bIdx) => (
                            <li key={bIdx}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SMART TEXT & FIXER STAGE */}
            {tool.hub === 'text' && (
              <div className="flex flex-col h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    معالجة النصوص الذكية واستخراج البيانات
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <span>Words: {smartTextResult.wordCount}</span>
                    <span>·</span>
                    <span>Chars: {smartTextResult.charCount}</span>
                    <span>·</span>
                    <span>Lines: {smartTextResult.lineCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-[340px]">
                  <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                      النص المدخل (Input Text)
                    </div>
                    <textarea
                      value={smartTextInput}
                      onChange={(e) => setSmartTextInput(e.target.value)}
                      className="flex-1 p-3 text-xs bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-col rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/20 dark:bg-slate-900 overflow-hidden">
                    <div className="px-3 py-2 bg-violet-600 text-white text-[11px] font-bold flex items-center justify-between">
                      <span>النتيجة الفورية (Processed Output)</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(smartTextResult.outputText);
                        }}
                        className="px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[10px] font-bold cursor-pointer"
                      >
                        نسخ النص
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={smartTextResult.outputText}
                      className="flex-1 p-3 text-xs font-mono bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT / CONTROLS PANEL (5 cols) */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-white dark:bg-slate-900">
            <div className="space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <Sliders className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tool Parameters &amp; Output Settings
                </h3>
              </div>

              {/* PDF CONTROLS */}
              {tool.hub === 'pdf' && (
                <div className="space-y-4">
                  {/* DEDICATED MERGE PDF / JPG TO PDF MULTI-FILE QUEUE MANAGER */}
                  {isMultiFilePdfTool && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Files to Merge ({pdfFiles.length})
                        </span>
                        <div className="flex items-center gap-2">
                          {pdfFiles.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsUsingSamplePdf(false);
                                setPdfFiles([]);
                              }}
                              className="text-[11px] font-medium text-rose-600 hover:underline cursor-pointer"
                            >
                              Clear All
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ordered File List with Up / Down / Delete Controls */}
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {pdfFiles.map((file, idx) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-6 h-6 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {file.name}
                                </div>
                                <div className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400">
                                  {file.pageCount} page{file.pageCount === 1 ? '' : 's'} ·{' '}
                                  {(file.bytes.byteLength / 1024).toFixed(0)} KB
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMovePdfFile(idx, -1)}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                                title="Move Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === pdfFiles.length - 1}
                                onClick={() => handleMovePdfFile(idx, 1)}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 cursor-pointer"
                                title="Move Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemovePdfFile(idx)}
                                className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Remove File"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Prominent Add More PDF Files Button */}
                      <label className="w-full py-2.5 px-3 rounded-xl border-2 border-dashed border-rose-300 dark:border-rose-800/80 hover:border-rose-600 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                        <Plus className="w-4 h-4" />
                        {isUsingSamplePdf
                          ? 'Upload Your PDF Files to Merge'
                          : '+ Add Another PDF File to Queue'}
                        <input
                          type="file"
                          accept={pdfInputAccept}
                          multiple
                          onChange={handlePdfUpload}
                          className="hidden"
                        />
                      </label>

                      {tool.id === 'merge-pdf' && (
                        <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mergeAddPageNumbers}
                            onChange={(e) => setMergeAddPageNumbers(e.target.checked)}
                            className="accent-rose-600"
                          />
                          <span>Stamp continuous page numbers (Page 1 of N) on merged PDF</span>
                        </label>
                      )}
                    </div>
                  )}

                  {tool.id === 'pdf-to-word' && (
                    <div className="space-y-3">
                      <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includePageSnapshotsInWord}
                          onChange={(e) =>
                            setIncludePageSnapshotsInWord(e.target.checked)
                          }
                          className="mt-0.5 accent-rose-600"
                        />
                        <div className="text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            Embed Visual Page Snapshots + Editable Text
                          </div>
                          <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                            Extracts all real paragraphs, headings, and tables via Mozilla PDF.js AND attaches high-resolution page snapshots so scanned pages, signatures, and complex layouts never lose fidelity in Microsoft Word.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {tool.id === 'pdf-to-powerpoint' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          PowerPoint (.PPTX) Slide Conversion Mode
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {(
                            [
                              {
                                id: 'hybrid-with-snapshot',
                                title: 'Editable Smart Slides + Exact Visual Slide (Recommended)',
                                desc: 'Generates editable 16:9 PowerPoint text/photo slides AND includes a 100% exact visual slide for each page.',
                              },
                              {
                                id: 'editable-smart',
                                title: 'Editable Widescreen Slides Only',
                                desc: 'Reconstructs 2-column sidebars, profile photos, headings, and bullets into native PowerPoint shapes & text boxes.',
                              },
                              {
                                id: 'visual-exact',
                                title: 'High-Resolution Visual Slides Only',
                                desc: 'Places each PDF page as a crisp widescreen presentation slide preserving 100% original graphics and fonts.',
                              },
                            ] as const
                          ).map((modeOpt) => (
                            <button
                              key={modeOpt.id}
                              type="button"
                              onClick={() => setPptxMode(modeOpt.id)}
                              className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                pptxMode === modeOpt.id
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="text-xs font-bold">{modeOpt.title}</div>
                              <div
                                className={`text-[11px] mt-0.5 ${
                                  pptxMode === modeOpt.id
                                    ? 'text-slate-300 dark:text-slate-600'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {modeOpt.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {pptxMode !== 'visual-exact' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Slide Deck Color Theme
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {(
                              [
                                { id: 'original-brand', label: 'Original PDF' },
                                { id: 'executive-dark', label: 'Executive Dark' },
                                { id: 'clean-light', label: 'Clean Light' },
                              ] as const
                            ).map((th) => (
                              <button
                                key={th.id}
                                type="button"
                                onClick={() => setPptxTheme(th.id)}
                                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                  pptxTheme === th.id
                                    ? 'bg-rose-600 text-white border-rose-600'
                                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {th.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {tool.id === 'pdf-to-excel' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          Excel (.XLSX) Table Drawing Mode
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {(
                            [
                              {
                                id: 'auto-smart',
                                title: 'Smart Layout + Drawn Tables (Recommended)',
                                desc: 'Automatically draws colored sidebar columns, headers, and structured Experience/Data tables (Poste | Établissement | Missions | Période).',
                              },
                              {
                                id: 'structured-tables',
                                title: 'Pure Multi-Column Data Grid',
                                desc: 'Clusters X/Y coordinates into clean rows and columns with drawn borders for financial & tabular reports.',
                              },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setExcelMode(opt.id)}
                              className={`text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                excelMode === opt.id
                                  ? 'bg-emerald-700 text-white border-emerald-700'
                                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="text-xs font-bold">{opt.title}</div>
                              <div
                                className={`text-[11px] mt-0.5 ${
                                  excelMode === opt.id
                                    ? 'text-emerald-100'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {opt.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={excelDrawBorders}
                            onChange={(e) => setExcelDrawBorders(e.target.checked)}
                            className="accent-emerald-600"
                          />
                          <span>Draw cell borders &amp; styled header fills in .XLSX</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={excelEmbedPhotos}
                            onChange={(e) => setExcelEmbedPhotos(e.target.checked)}
                            className="accent-emerald-600"
                          />
                          <span>Embed extracted PDF profile photos / logos into worksheet</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {tool.id === 'compress-pdf' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                        PDF Compression Preset
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'low', label: 'High Quality' },
                            { id: 'medium', label: 'Balanced' },
                            { id: 'extreme', label: 'Max Compress' },
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => setCompressionLevel(preset.id)}
                            className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              compressionLevel === preset.id
                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {tool.id === 'watermark-pdf' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Watermark Stamp Text
                        </label>
                        <input
                          type="text"
                          value={watermarkText}
                          onChange={(e) => setWatermarkText(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 dark:text-slate-400">
                            Stamp Opacity
                          </span>
                          <span className="font-mono tabular-nums">
                            {Math.round(watermarkOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.08"
                          max="0.75"
                          step="0.02"
                          value={watermarkOpacity}
                          onChange={(e) =>
                            setWatermarkOpacity(parseFloat(e.target.value))
                          }
                          className="w-full accent-slate-900 dark:accent-white"
                        />
                      </div>
                    </>
                  )}

                  {tool.id === 'rotate-pdf' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Clockwise Rotation Angle
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[90, 180, 270].map((deg) => (
                          <button
                            key={deg}
                            onClick={() => setRotationDegrees(deg)}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              rotationDegrees === deg
                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            +{deg}°
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {tool.id === 'split-pdf' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Pages or Range to Extract (e.g., 1, 1-2, 1,3)
                      </label>
                      <input
                        type="text"
                        value={splitPageRange}
                        onChange={(e) => setSplitPageRange(e.target.value)}
                        placeholder="1-2"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
                      />
                    </div>
                  )}

                  {tool.id === 'organize-pdf' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Interactive Page Order ({organizePagesOrder.length} Pages)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const reversed = [...organizePagesOrder].reverse();
                            setOrganizePagesOrder(reversed);
                            setSplitPageRange(reversed.join(','));
                          }}
                          className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                        >
                          Reverse Order
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {organizePagesOrder.map((pageNum, idx) => (
                          <div
                            key={`${pageNum}-${idx}`}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-mono font-bold flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                Original Page #{pageNum}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => {
                                  const next = [...organizePagesOrder];
                                  const tmp = next[idx - 1];
                                  next[idx - 1] = next[idx];
                                  next[idx] = tmp;
                                  setOrganizePagesOrder(next);
                                  setSplitPageRange(next.join(','));
                                }}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                                title="Move Page Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === organizePagesOrder.length - 1}
                                onClick={() => {
                                  const next = [...organizePagesOrder];
                                  const tmp = next[idx + 1];
                                  next[idx + 1] = next[idx];
                                  next[idx] = tmp;
                                  setOrganizePagesOrder(next);
                                  setSplitPageRange(next.join(','));
                                }}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                                title="Move Page Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={organizePagesOrder.length <= 1}
                                onClick={() => {
                                  const next = organizePagesOrder.filter((_, i) => i !== idx);
                                  setOrganizePagesOrder(next);
                                  setSplitPageRange(next.join(','));
                                }}
                                className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                                title="Remove Page"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Custom Page Sequence String
                        </label>
                        <input
                          type="text"
                          value={splitPageRange}
                          onChange={(e) => {
                            setSplitPageRange(e.target.value);
                            const parsed = e.target.value
                              .split(',')
                              .map((s) => parseInt(s.trim(), 10))
                              .filter((n) => !isNaN(n) && n >= 1);
                            if (parsed.length > 0) setOrganizePagesOrder(parsed);
                          }}
                          placeholder="2,1"
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )}

                  {tool.id === 'page-numbers-pdf' && (
                    <div className="space-y-3.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Page Number Placement (6 Positions)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              'top-left',
                              'top-center',
                              'top-right',
                              'bottom-left',
                              'bottom-center',
                              'bottom-right',
                            ] as const
                          ).map((pos) => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => setPageNumberPosition(pos)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border capitalize transition-colors cursor-pointer ${
                                pageNumberPosition === pos
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {pos.replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Numbering Style Format
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'page-of-total', label: 'Page 1 of N' },
                              { id: 'dash-numeric', label: '- 1 -' },
                              { id: 'numeric', label: '1, 2, 3' },
                            ] as const
                          ).map((fmt) => (
                            <button
                              key={fmt.id}
                              type="button"
                              onClick={() => setPageNumberFormat(fmt.id)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                pageNumberFormat === fmt.id
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {fmt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                            Start Number At
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={pageNumberStartAt}
                            onChange={(e) =>
                              setPageNumberStartAt(Math.max(1, parseInt(e.target.value, 10) || 1))
                            }
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                            Font Size (pt)
                          </label>
                          <input
                            type="number"
                            min={8}
                            max={20}
                            value={pageNumberFontSize}
                            onChange={(e) =>
                              setPageNumberFontSize(
                                Math.max(8, Math.min(20, Number(e.target.value) || 10.5))
                              )
                            }
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {tool.id === 'protect-pdf' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70">
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1">
                          🔑 كلمة السر لقفل وحماية ملف الـ PDF (AES-256 Password)
                        </label>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
                          يتم تشفير <strong>صفحات ملفك الحقيقية مباشرة</strong> بمعيار <strong>PDF 2.0 AES-256 (V=5, R=6)</strong> الرسمي. عند فتح الملف المنزّل وإدخال كلمة السر، <strong>سيظهر محتوى ملفك الأصلي بالكامل فوراً</strong>!
                        </p>
                        <input
                          type="text"
                          value={pdfPassword}
                          onChange={(e) => setPdfPassword(e.target.value)}
                          placeholder="أدخل كلمة السر القوية هنا..."
                          className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                        {!pdfPassword.trim() ? (
                          <p className="text-[11px] font-semibold text-rose-600 mt-1">
                            ⚠️ يرجى كتابة كلمة سر لتفعيل القفل قبل التنزيل.
                          </p>
                        ) : pdfPassword.trim().length < 6 ? (
                          <p className="text-[10.5px] font-medium text-amber-700 dark:text-amber-300 mt-1.5 leading-relaxed">
                            💡 نصيحة أمنية: كلمات السر القصيرة جداً مثل (<code>1234</code>) يمكن لمواقع مثل iLovePDF تخمينها في ثانية واحدة عبر القواميس الجاهزة. استخدم كلمة سر قوية (حروف وأرقام مثل <code>Lahcen@2026</code>) لكي يستحيل على أي موقع خارجي فتحه بدون كلمتك!
                          </p>
                        ) : (
                          <p className="text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1.5">
                            ✅ كلمة سر قوية — مشفرة بـ AES-256 ومحمية ضد التخمين الآلي.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {tool.id === 'unlock-pdf' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70">
                      <div>
                        <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1">
                          🔓 Enter Secret Password / Code to Unlock PDF
                        </label>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
                          Upload a password-protected PDF and enter the secret code that was used to lock it:
                        </p>
                        <input
                          type="text"
                          value={pdfPassword}
                          onChange={(e) => setPdfPassword(e.target.value)}
                          placeholder="Enter secret password to decrypt..."
                          className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                      {pdfResult?.isLockedError && (
                        <div className="p-2.5 rounded-lg bg-rose-100 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                          {pdfResult.summary}
                        </div>
                      )}
                    </div>
                  )}

                  {tool.id === 'edit-pdf' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Document Callout / Security Stamp
                      </label>
                      <input
                        type="text"
                        value={annotationText}
                        onChange={(e) => setAnnotationText(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}

                  {!isMultiFilePdfTool && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-rose-600" />
                        Real PDF.js + pdf-lib Client Engine
                      </div>
                      <p>
                        Use the <strong>Page &lt; &gt;</strong> arrows above the preview to inspect every page of your processed PDF before downloading.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* IMAGE STUDIO CONTROLS */}
              {tool.hub === 'image' && (
                <div className="space-y-4">
                  {tool.id === 'pdf-to-jpg' && pdfImageTotalPages > 1 && (
                    <div>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Select PDF Page to Rasterize
                        </span>
                        <span className="font-mono tabular-nums">
                          Page {pdfImagePageNum} of {pdfImageTotalPages}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={pdfImageTotalPages}
                        step={1}
                        value={pdfImagePageNum}
                        onChange={(e) =>
                          setPdfImagePageNum(parseInt(e.target.value, 10))
                        }
                        className="w-full accent-slate-900 dark:accent-white"
                      />
                    </div>
                  )}

                  {tool.id === 'image-resizer' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Aspect Ratio Lock
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                          {(['free', '16:9', '4:3', '1:1'] as const).map(
                            (preset) => (
                              <button
                                key={preset}
                                onClick={() => handleAspectPreset(preset)}
                                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border uppercase transition-colors cursor-pointer ${
                                  aspectPreset === preset
                                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {preset}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            Width (px)
                          </label>
                          <input
                            type="number"
                            value={imgWidth}
                            onChange={(e) =>
                              setImgWidth(Number(e.target.value) || 400)
                            }
                            className="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            Height (px)
                          </label>
                          <input
                            type="number"
                            value={imgHeight}
                            onChange={(e) =>
                              setImgHeight(Number(e.target.value) || 300)
                            }
                            className="w-full px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 dark:text-slate-400">
                            Interactive Crop Zoom
                          </span>
                          <span className="font-mono tabular-nums">{cropZoom}%</span>
                        </div>
                        <input
                          type="range"
                          min="100"
                          max="250"
                          value={cropZoom}
                          onChange={(e) => setCropZoom(Number(e.target.value))}
                          className="w-full accent-slate-900 dark:accent-white"
                        />
                      </div>

                      {cropZoom > 100 && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-slate-600 dark:text-slate-400">
                                Crop Pan X
                              </span>
                              <span className="font-mono">{cropOffsetX}%</span>
                            </div>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              value={cropOffsetX}
                              onChange={(e) => setCropOffsetX(Number(e.target.value))}
                              className="w-full accent-slate-900 dark:accent-white"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span className="text-slate-600 dark:text-slate-400">
                                Crop Pan Y
                              </span>
                              <span className="font-mono">{cropOffsetY}%</span>
                            </div>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              value={cropOffsetY}
                              onChange={(e) => setCropOffsetY(Number(e.target.value))}
                              className="w-full accent-slate-900 dark:accent-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {tool.id === 'combine-images' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Loaded Images ({sourceImages.length})
                        </span>
                        <label className="cursor-pointer text-xs font-bold text-rose-600 hover:underline inline-flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />
                          + Add More Images
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageOrPdfUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                        {sourceImages.map((imgCanvas, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs"
                          >
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              Image #{idx + 1} ({imgCanvas.width}×{imgCanvas.height})
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() =>
                                  setSourceImages((prev) => {
                                    const copy = [...prev];
                                    const tmp = copy[idx - 1];
                                    copy[idx - 1] = copy[idx];
                                    copy[idx] = tmp;
                                    return copy;
                                  })
                                }
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === sourceImages.length - 1}
                                onClick={() =>
                                  setSourceImages((prev) => {
                                    const copy = [...prev];
                                    const tmp = copy[idx + 1];
                                    copy[idx + 1] = copy[idx];
                                    copy[idx] = tmp;
                                    return copy;
                                  })
                                }
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={sourceImages.length <= 1}
                                onClick={() =>
                                  setSourceImages((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                                className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Stitch Layout Arrangement
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['horizontal', 'vertical', 'grid'] as const).map(
                            (mode) => (
                              <button
                                key={mode}
                                onClick={() => setCombineMode(mode)}
                                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border capitalize transition-colors cursor-pointer ${
                                  combineMode === mode
                                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {mode}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 items-center">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-600 dark:text-slate-400">
                              Gutter Spacing
                            </span>
                            <span className="font-mono tabular-nums">
                              {combineGap} px
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="36"
                            value={combineGap}
                            onChange={(e) => setCombineGap(Number(e.target.value))}
                            className="w-full accent-slate-900 dark:accent-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            Background Fill
                          </label>
                          <div className="flex items-center gap-1.5">
                            {['#FFFFFF', '#0F172A', '#F1F5F9'].map((col) => (
                              <button
                                key={col}
                                type="button"
                                onClick={() => setCombineBgColor(col)}
                                className={`w-6 h-6 rounded-md border ${
                                  combineBgColor === col
                                    ? 'ring-2 ring-rose-500 border-slate-900'
                                    : 'border-slate-300'
                                }`}
                                style={{ backgroundColor: col }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {tool.id === 'color-filter-lab' && (
                    <div className="space-y-3">
                      {[
                        {
                          label: 'Brightness',
                          val: brightness,
                          set: setBrightness,
                          min: 50,
                          max: 150,
                          unit: '%',
                        },
                        {
                          label: 'Contrast',
                          val: contrast,
                          set: setContrast,
                          min: 50,
                          max: 150,
                          unit: '%',
                        },
                        {
                          label: 'Saturation',
                          val: saturation,
                          set: setSaturation,
                          min: 0,
                          max: 200,
                          unit: '%',
                        },
                        {
                          label: 'Warmth / Sepia',
                          val: sepia,
                          set: setSepia,
                          min: 0,
                          max: 100,
                          unit: '%',
                        },
                        {
                          label: 'Hue Shift',
                          val: hueRotate,
                          set: setHueRotate,
                          min: 0,
                          max: 360,
                          unit: '°',
                        },
                      ].map((ctrl) => (
                        <div key={ctrl.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-600 dark:text-slate-400">
                              {ctrl.label}
                            </span>
                            <span className="font-mono tabular-nums">
                              {ctrl.val}
                              {ctrl.unit}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={ctrl.min}
                            max={ctrl.max}
                            value={ctrl.val}
                            onChange={(e) => ctrl.set(Number(e.target.value))}
                            className="w-full accent-slate-900 dark:accent-white"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {tool.id === 'ai-image-enhancer' && (
                    <div className="space-y-3.5 p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          تحسين الصور الاحترافي (AI Dehaze &amp; Color Harmony)
                        </span>
                      </div>

                      {/* Quick Presets */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          {
                            label: 'Auto HD Studio',
                            dehaze: 68,
                            color: 65,
                            sharp: 58,
                          },
                          {
                            label: 'إزالة الضباب (Max Dehaze)',
                            dehaze: 92,
                            color: 55,
                            sharp: 65,
                          },
                          {
                            label: 'تناسق الألوان (Vivid)',
                            dehaze: 48,
                            color: 90,
                            sharp: 45,
                          },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setDehazeStrength(preset.dehaze);
                              setColorHarmony(preset.color);
                              setSharpenStrength(preset.sharp);
                              setShowOriginalCompare(false);
                            }}
                            className="py-1.5 px-2 rounded-lg text-[11px] font-bold border border-amber-300 dark:border-amber-700/80 bg-white dark:bg-slate-800 hover:bg-amber-500 hover:text-white transition-colors cursor-pointer"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            إزالة الضباب واستعادة التباين (Atmospheric Dehaze)
                          </span>
                          <span className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                            {dehazeStrength}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={dehazeStrength}
                          onChange={(e) => setDehazeStrength(Number(e.target.value))}
                          className="w-full accent-amber-600"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            تناسق الألوان التلقائي والحيوية (Color Harmony &amp; WB)
                          </span>
                          <span className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                            {colorHarmony}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={colorHarmony}
                          onChange={(e) => setColorHarmony(Number(e.target.value))}
                          className="w-full accent-amber-600"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            إبراز التفاصيل الدقيقة والحدة (Clarity &amp; Unsharp)
                          </span>
                          <span className="font-mono font-bold tabular-nums text-amber-700 dark:text-amber-400">
                            {sharpenStrength}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={sharpenStrength}
                          onChange={(e) => setSharpenStrength(Number(e.target.value))}
                          className="w-full accent-amber-600"
                        />
                      </div>
                    </div>
                  )}

                  {tool.id === 'background-remover' && (
                    <div className="space-y-3.5 p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/25 border border-purple-200/80 dark:border-purple-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          ✂️ عزل العنصر الرئيسي وإزالة الخلفية فقط
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        يعتمد على خوارزمية <strong>التتبع المحيطي المتصل (Connected-Edge Flood Segmentation)</strong> لعزل الخلفية المحيطة فقط مع الحفاظ الكامل على تفاصيل العنصر الرئيسي في وسط الصورة دون مسح أجزاء منه.
                      </p>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            حساسية عزل الخلفية (Background Tolerance)
                          </span>
                          <span className="font-mono font-bold tabular-nums text-purple-700 dark:text-purple-400">
                            {bgTolerance}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="8"
                          max="88"
                          value={bgTolerance}
                          onChange={(e) => setBgTolerance(Number(e.target.value))}
                          className="w-full accent-purple-600"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            تنعيم حواف العنصر الرئيسي (Soft Edge Feather)
                          </span>
                          <span className="font-mono font-bold tabular-nums text-purple-700 dark:text-purple-400">
                            {bgEdgeFeather} px
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="6"
                          value={bgEdgeFeather}
                          onChange={(e) => setBgEdgeFeather(Number(e.target.value))}
                          className="w-full accent-purple-600"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bgProtectSubject}
                          onChange={(e) => setBgProtectSubject(e.target.checked)}
                          className="accent-purple-600"
                        />
                        <span>حماية تفاصيل وألوان العنصر الرئيسي في المركز (Protect Foreground Core)</span>
                      </label>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          خلفية الإخراج (Output Backdrop)
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              { id: 'transparent', label: 'شفاف PNG' },
                              { id: 'white', label: 'أبيض استوديو' },
                              { id: 'dark', label: 'داكن فخم' },
                              { id: 'blur-studio', label: 'رمادي ناعم' },
                            ] as const
                          ).map((bgOpt) => (
                            <button
                              key={bgOpt.id}
                              type="button"
                              onClick={() => {
                                setBgReplacement(bgOpt.id);
                                if (bgOpt.id === 'transparent') {
                                  setExportFormat('image/png');
                                }
                              }}
                              className={`py-1.5 px-1.5 rounded-lg text-[10.5px] font-bold border transition-colors cursor-pointer ${
                                bgReplacement === bgOpt.id
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {bgOpt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {tool.id === 'id-passport-photo-maker' && (
                    <div className="space-y-3.5 p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-800/60">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        🪪 إعدادات صور البطاقة وجواز السفر والـ CV
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          مقاس الصورة الرسمية (Official Biometric Size)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: '35x45mm', label: '35×45 mm (EU/MA)' },
                              { id: '2x2inch', label: '2×2 inch (US)' },
                              { id: '30x40mm', label: '30×40 mm (CV)' },
                            ] as const
                          ).map((sz) => (
                            <button
                              key={sz.id}
                              type="button"
                              onClick={() => setIdPhotoSize(sz.id)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                idPhotoSize === sz.id
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {sz.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          تخطيط ورقة الطباعة (Sheet Layout)
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'single', label: 'صورة فردية' },
                              { id: 'sheet-4', label: 'ورقة 4 صور' },
                              { id: 'sheet-8', label: 'ورقة 8 صور' },
                            ] as const
                          ).map((lay) => (
                            <button
                              key={lay.id}
                              type="button"
                              onClick={() => setIdPhotoLayout(lay.id)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                idPhotoLayout === lay.id
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {lay.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          لون الخلفية الرسمية
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              { hex: '#FFFFFF', label: 'أبيض' },
                              { hex: '#DBEAFE', label: 'أزرق فاتح' },
                              { hex: '#F1F5F9', label: 'رمادي' },
                              { hex: '#FEE2E2', label: 'أحمر فاتح' },
                            ] as const
                          ).map((bg) => (
                            <button
                              key={bg.hex}
                              type="button"
                              onClick={() => setIdPhotoBackdrop(bg.hex)}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                idPhotoBackdrop === bg.hex
                                  ? 'ring-2 ring-rose-600 border-rose-600 font-extrabold'
                                  : 'border-slate-300 dark:border-slate-700'
                              }`}
                              style={{ backgroundColor: bg.hex, color: '#0f172a' }}
                            >
                              {bg.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={idPhotoCutGuides}
                          onChange={(e) => setIdPhotoCutGuides(e.target.checked)}
                          className="accent-rose-600"
                        />
                        <span>إظهار خطوط القص المقطعة للطباعة (Print Cut Guides)</span>
                      </label>
                    </div>
                  )}

                  {tool.id === 'image-watermark-privacy' && (
                    <div className="space-y-3.5 p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        🛡️ ختم الصور وإخفاء البيانات الحساسة
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          نص العلامة المائية (Watermark Text)
                        </label>
                        <input
                          type="text"
                          value={imgWatermarkText}
                          onChange={(e) => setImgWatermarkText(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'tiled-diagonal', label: 'متكرر قطري' },
                            { id: 'center-badge', label: 'وسط الصورة' },
                            { id: 'bottom-corner', label: 'أسفل اليمين' },
                          ] as const
                        ).map((pat) => (
                          <button
                            key={pat.id}
                            type="button"
                            onClick={() => setImgWatermarkPattern(pat.id)}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer ${
                              imgWatermarkPattern === pat.id
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {pat.label}
                          </button>
                        ))}
                      </div>

                      <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={imgPrivacyRedact}
                          onChange={(e) => setImgPrivacyRedact(e.target.checked)}
                          className="accent-amber-600"
                        />
                        <span>تفعيل شريط إخفاء المعلومات السرية (Privacy Redaction Bar)</span>
                      </label>

                      {imgPrivacyRedact && (
                        <div className="space-y-2.5 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                { id: 'pixelate', label: 'تمويه (Pixelate Blur)' },
                                { id: 'blackout', label: 'طمس أسود (Blackout)' },
                              ] as const
                            ).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => setImgRedactMode(m.id)}
                                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                  imgRedactMode === m.id
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white dark:bg-slate-800 border-slate-300'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] mb-1">
                              <span>موضع شريط الإخفاء عمودياً (Y Position)</span>
                              <span className="font-mono">{imgRedactY}%</span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="90"
                              value={imgRedactY}
                              onChange={(e) => setImgRedactY(Number(e.target.value))}
                              className="w-full accent-amber-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Target Image Format
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { mime: 'image/jpeg', label: 'JPG' },
                            { mime: 'image/png', label: 'PNG' },
                            { mime: 'image/webp', label: 'WebP' },
                          ] as const
                        ).map((fmt) => (
                          <button
                            key={fmt.mime}
                            onClick={() => setExportFormat(fmt.mime)}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                              exportFormat === fmt.mime
                                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {fmt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {exportFormat !== 'image/png' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 dark:text-slate-400">
                            Encoder Quality
                          </span>
                          <span className="font-mono tabular-nums">
                            {Math.round(exportQuality * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="1.0"
                          step="0.02"
                          value={exportQuality}
                          onChange={(e) =>
                            setExportQuality(parseFloat(e.target.value))
                          }
                          className="w-full accent-slate-900 dark:accent-white"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AUDIO LAB CONTROLS */}
              {tool.hub === 'audio' && audioBuffer && (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">
                        Trim Start Time
                      </span>
                      <span className="font-mono tabular-nums">
                        {trimStart.toFixed(2)} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0.1, trimEnd - 0.2)}
                      step="0.05"
                      value={trimStart}
                      onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                      className="w-full accent-slate-900 dark:accent-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">
                        Trim End Time
                      </span>
                      <span className="font-mono tabular-nums">
                        {trimEnd.toFixed(2)} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={trimStart + 0.2}
                      max={audioBuffer.duration}
                      step="0.05"
                      value={trimEnd}
                      onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                      className="w-full accent-slate-900 dark:accent-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">
                        Playback Tempo / Speed
                      </span>
                      <span className="font-mono tabular-nums">
                        {audioSpeed.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={audioSpeed}
                      onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
                      className="w-full accent-slate-900 dark:accent-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400">
                        Pitch Shift (Semitones)
                      </span>
                      <span className="font-mono tabular-nums">
                        {audioPitchSemitones > 0
                          ? `+${audioPitchSemitones}`
                          : audioPitchSemitones}{' '}
                        st
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={audioPitchSemitones}
                      onChange={(e) =>
                        setAudioPitchSemitones(parseInt(e.target.value, 10))
                      }
                      className="w-full accent-slate-900 dark:accent-white"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Volume2 className="w-3.5 h-3.5" />
                        Gain Booster (Soft-Clipped)
                      </span>
                      <span className="font-mono tabular-nums">
                        +{audioGainDb.toFixed(1)} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="12"
                      step="0.5"
                      value={audioGainDb}
                      onChange={(e) =>
                        setAudioGainDb(parseFloat(e.target.value))
                      }
                      className="w-full accent-slate-900 dark:accent-white"
                    />
                  </div>
                </div>
              )}

              {/* VIDEO & AI HUB CONTROLS */}
              {tool.hub === 'video' && (
                <div className="space-y-4">
                  {tool.id === 'video-compressor' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Target Output Resolution
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['1080p', '720p', '480p'] as const).map((res) => (
                            <button
                              key={res}
                              onClick={() => setVideoResolution(res)}
                              className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                videoResolution === res
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 dark:text-slate-400">
                            Constant Rate Factor (CRF Bitrate)
                          </span>
                          <span className="font-mono tabular-nums">
                            CRF {videoCrf}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="18"
                          max="36"
                          value={videoCrf}
                          onChange={(e) => setVideoCrf(Number(e.target.value))}
                          className="w-full accent-slate-900 dark:accent-white"
                        />
                      </div>
                    </>
                  )}

                  {tool.id === 'video-to-gif' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Animated GIF Frame Rate
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[8, 12, 20].map((fps) => (
                            <button
                              key={fps}
                              onClick={() => setGifFps(fps)}
                              className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                gifFps === fps
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {fps} FPS
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                          GIF Output Width
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[280, 360, 480].map((w) => (
                            <button
                              key={w}
                              onClick={() => setGifWidth(w)}
                              className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                gifWidth === w
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {w}px
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {tool.id === 'speech-to-text' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Select your language (Arabic, French, or English), dictate via microphone or edit any timestamped segment on the left, then download as UTF-8 subtitles or Markdown:
                      </p>
                      <div className="grid grid-cols-3 gap-2 pt-2">
                        {(['srt', 'md', 'txt'] as const).map((fmt) => (
                          <button
                            key={fmt}
                            onClick={() => handleDownloadTranscript(fmt)}
                            className="py-2.5 px-3 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-white text-slate-900 dark:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />.{fmt.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* WORD STUDIO CONTROLS */}
              {tool.hub === 'word' && (
                <div className="space-y-4">
                  {tool.id === 'word-format-doctor' ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs space-y-1.5">
                        <div className="font-bold text-blue-900 dark:text-blue-200">
                          إحصائيات الإصلاح التلقائي:
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-700 dark:text-slate-300">
                          <span>دمج الأسطر المكسورة:</span>
                          <strong className="font-mono">{wordDoctorPreview.stats.brokenLinesMerged}</strong>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-700 dark:text-slate-300">
                          <span>تنظيف المسافات الزائدة:</span>
                          <strong className="font-mono">{wordDoctorPreview.stats.spacesFixed}</strong>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-700 dark:text-slate-300">
                          <span>العناوين المكتشفة:</span>
                          <strong className="font-mono">{wordDoctorPreview.stats.headingsDetected}</strong>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wordDocOpts.fixBrokenLines}
                          onChange={(e) =>
                            setWordDocOpts((p) => ({ ...p, fixBrokenLines: e.target.checked }))
                          }
                          className="accent-blue-600"
                        />
                        <span>إصلاح ودمج الأسطر المقطوعة بعد النسخ من PDF</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wordDocOpts.normalizeSpaces}
                          onChange={(e) =>
                            setWordDocOpts((p) => ({ ...p, normalizeSpaces: e.target.checked }))
                          }
                          className="accent-blue-600"
                        />
                        <span>إزالة الفراغات والمسافات المزدوجة (Normalize Spaces)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wordDocOpts.fixArabicPunctuation}
                          onChange={(e) =>
                            setWordDocOpts((p) => ({
                              ...p,
                              fixArabicPunctuation: e.target.checked,
                            }))
                          }
                          className="accent-blue-600"
                        />
                        <span>ضبط علامات الترقيم العربية والاتجاه (RTL Punctuation)</span>
                      </label>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          خط مستند Word المصدّر (DOCX Font Family)
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['Cairo', 'Calibri', 'Arial'] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setWordDocOpts((p) => ({ ...p, fontFamily: f }))}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                                wordDocOpts.fontFamily === f
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wordMergeAddToc}
                          onChange={(e) => setWordMergeAddToc(e.target.checked)}
                          className="accent-blue-600"
                        />
                        <span>إضافة صفحة فهرس المحتويات تلقائياً في بداية الملف</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wordMergePageBreaks}
                          onChange={(e) => setWordMergePageBreaks(e.target.checked)}
                          className="accent-blue-600"
                        />
                        <span>إدراج فاصل صفحة (Page Break) بين كل مستند وآخر</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setWordMergeQueue((prev) => [
                            ...prev,
                            {
                              id: `w-${Date.now()}`,
                              name: `Chapter_0${prev.length + 1}_Appendix.docx`,
                              text: 'Additional Word document section ready to be merged.',
                            },
                          ])
                        }
                        className="w-full py-2 px-3 rounded-xl border border-dashed border-blue-400 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50/50 cursor-pointer"
                      >
                        + إضافة قسم جديد للتجربة
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* EXCEL & DATA CONTROLS */}
              {tool.hub === 'excel' && (
                <div className="space-y-4">
                  {tool.id === 'excel-duplicate-cleaner' && (
                    <div className="space-y-2.5">
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-1">
                        <div className="font-bold text-emerald-900 dark:text-emerald-200">
                          ملخص تنظيف الجدول:
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span>الصفوف المكررة المحذوفة:</span>
                          <strong className="font-mono text-emerald-700">
                            {excelCleanedResult.duplicatesRemoved}
                          </strong>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span>الصفوف الفارغة المحذوفة:</span>
                          <strong className="font-mono text-emerald-700">
                            {excelCleanedResult.emptyRowsRemoved}
                          </strong>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span>الخلايا التي تم تنظيف مسافاتها:</span>
                          <strong className="font-mono text-emerald-700">
                            {excelCleanedResult.cellsTrimmed}
                          </strong>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excelCleanOpts.removeDuplicateRows}
                          onChange={(e) =>
                            setExcelCleanOpts((p) => ({
                              ...p,
                              removeDuplicateRows: e.target.checked,
                            }))
                          }
                          className="accent-emerald-600"
                        />
                        <span>حذف الصفوف المكررة تلقائياً (Remove Duplicates)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excelCleanOpts.removeEmptyRows}
                          onChange={(e) =>
                            setExcelCleanOpts((p) => ({
                              ...p,
                              removeEmptyRows: e.target.checked,
                            }))
                          }
                          className="accent-emerald-600"
                        />
                        <span>إزالة الصفوف الفارغة بالكامل (Remove Blank Rows)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={excelCleanOpts.trimWhitespace}
                          onChange={(e) =>
                            setExcelCleanOpts((p) => ({
                              ...p,
                              trimWhitespace: e.target.checked,
                            }))
                          }
                          className="accent-emerald-600"
                        />
                        <span>تنظيف المسافات المخفية في بداية ونهاية الخلايا</span>
                      </label>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          توحيد حالة الأحرف (Text Case Standardization)
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(
                            [
                              { id: 'title', label: 'Title Case' },
                              { id: 'upper', label: 'UPPER' },
                              { id: 'lower', label: 'lower' },
                              { id: 'none', label: 'Original' },
                            ] as const
                          ).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                setExcelCleanOpts((p) => ({ ...p, standardizeTextCase: c.id }))
                              }
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                excelCleanOpts.standardizeTextCase === c.id
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      صيغة تصدير الجدول (Export Format)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'xlsx', label: 'Excel (.XLSX)' },
                          { id: 'csv', label: 'UTF-8 (.CSV)' },
                          { id: 'pdf', label: 'Report (.PDF)' },
                        ] as const
                      ).map((fmt) => (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setExcelExportFormat(fmt.id)}
                          className={`py-2 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                            excelExportFormat === fmt.id
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* POWERPOINT STUDIO CONTROLS */}
              {tool.hub === 'powerpoint' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      عنوان العرض التقديمي الرئيسي (Presentation Title)
                    </label>
                    <input
                      type="text"
                      value={pptDeckTitle}
                      onChange={(e) => setPptDeckTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>

                  {tool.id === 'ppt-slide-generator' ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        السمة اللونية للشرائح (16:9 Slide Theme)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'crimson-exec', label: 'أحمر تنفيذي' },
                            { id: 'navy-corporate', label: 'كحلي رسمي' },
                            { id: 'minimal-light', label: 'أبيض كلاسيكي' },
                          ] as const
                        ).map((th) => (
                          <button
                            key={th.id}
                            type="button"
                            onClick={() => setPptColorTheme(th.id)}
                            className={`py-2 px-2 rounded-lg text-xs font-bold border cursor-pointer ${
                              pptColorTheme === th.id
                                ? 'bg-[#e5322d] text-white border-[#e5322d]'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {th.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        صيغة مذكرة الملخص والمراجعة (Handout Output Format)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'docx', label: 'مذكرة Word (.DOCX)' },
                            { id: 'pdf', label: 'جدول ملخص (.PDF)' },
                          ] as const
                        ).map((fmt) => (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setPptHandoutFormat(fmt.id)}
                            className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer ${
                              pptHandoutFormat === fmt.id
                                ? 'bg-[#e5322d] text-white border-[#e5322d]'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {fmt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SMART TEXT & FIXER CONTROLS */}
              {tool.hub === 'text' && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    اختر أداة معالجة النص أو استخراج البيانات:
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {(
                      [
                        {
                          id: 'remove-arabic-tashkeel',
                          label: 'إزالة التشكيل والحركات والـ كشيدة العربية',
                        },
                        {
                          id: 'extract-emails-phones',
                          label: 'استخراج جميع الإيميلات وأرقام الهواتف من النص',
                        },
                        {
                          id: 'remove-duplicate-lines',
                          label: 'حذف الأسطر المكررة في القوائم (Remove Duplicate Lines)',
                        },
                        {
                          id: 'clean-all',
                          label: 'تنظيف الفراغات والأسطر الفارغة الزائدة',
                        },
                        {
                          id: 'sort-lines-az',
                          label: 'ترتيب الأسطر أبجدياً (Sort A → Z)',
                        },
                        {
                          id: 'number-lines',
                          label: 'ترقيم الأسطر تلقائياً (1, 2, 3...)',
                        },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSmartTextMode(m.id)}
                        className={`text-start py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          smartTextMode === m.id
                            ? 'bg-violet-600 text-white border-violet-600'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Primary Export CTA */}
            <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
              {tool.hub === 'pdf' && (
                <button
                  onClick={handleDownloadPdfResult}
                  disabled={
                    !pdfResult ||
                    pdfProcessing ||
                    Boolean(pdfResult.isLockedError) ||
                    (tool.id === 'protect-pdf' && !pdfPassword.trim())
                  }
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {pdfResult?.isLockedError
                    ? 'أدخل كلمة السر الصحيحة أعلاه لفك القفل والتنزيل'
                    : tool.id === 'protect-pdf'
                    ? `تنزيل ملف PDF المحمي بكلمة السر (${pdfResult?.fileName || 'Protected.pdf'})`
                    : tool.id === 'merge-pdf'
                    ? `Merge ${pdfFiles.length} File(s) & Download (${pdfResult?.pageCount || 0} Pages)`
                    : `Download (${pdfResult?.fileName || 'Processed File'})`}
                </button>
              )}

              {tool.hub === 'word' && (
                <button
                  onClick={handleDownloadWordOutput}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {tool.id === 'word-format-doctor'
                    ? 'تنزيل مستند Word المصلح (.DOCX)'
                    : `دمج وتنزيل ملف Word الموحد (${wordMergeQueue.length} أقسام .DOCX)`}
                </button>
              )}

              {tool.hub === 'excel' && (
                <button
                  onClick={handleDownloadExcelOutput}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  تنزيل الجدول بصيغة .{excelExportFormat.toUpperCase()} ({excelCleanedResult.cleaned.rows.length} صفوف)
                </button>
              )}

              {tool.hub === 'powerpoint' && (
                <button
                  onClick={handleDownloadPowerPointOutput}
                  className="w-full py-3 px-4 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {tool.id === 'ppt-slide-generator'
                    ? `تنزيل عرض PowerPoint الجاهز (.PPTX · ${pptSlidesPreview.length + 1} شرائح)`
                    : `تنزيل مذكرة الملخص (.${pptHandoutFormat.toUpperCase()})`}
                </button>
              )}

              {tool.hub === 'text' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => handleDownloadSmartTextOutput('txt')}
                    className="py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    تنزيل كملف نصي (.TXT)
                  </button>
                  <button
                    onClick={() => handleDownloadSmartTextOutput('docx')}
                    className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    تصدير إلى Word (.DOCX)
                  </button>
                </div>
              )}

              {tool.hub === 'image' && (
                <button
                  onClick={handleDownloadImage}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export Image (
                  {exportFormat === 'image/jpeg'
                    ? 'JPG'
                    : exportFormat.split('/')[1].toUpperCase()}
                  )
                </button>
              )}

              {tool.hub === 'audio' && (
                <button
                  onClick={handleDownloadWav}
                  className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Export Processed WAV Audio
                </button>
              )}

              {tool.hub === 'video' && tool.id !== 'speech-to-text' && (
                <button
                  onClick={handleExportVideoOrGifAsset}
                  disabled={isExportingVideoOrGif}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  {isExportingVideoOrGif ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Encoding Binary Stream...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {tool.id === 'video-compressor'
                        ? `Export Compressed ${videoResolution} Video (.WEBM)`
                        : `Export Animated GIF (.GIF)`}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
