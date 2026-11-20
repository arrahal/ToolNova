import React, { useState, useEffect, useRef } from 'react';
import { ToolItem } from '../../data/toolsData';
import {
  removeBackgroundSmartConnected,
  enhanceImageSmartDehazeAndColor,
} from '../../utils/mediaProcessors';
import {
  renderPassportIdPhotoSheet,
  renderImageWatermarkAndPrivacyStudio,
} from '../../utils/officeAndTextSuites';

export type RenderPdfPageFn = typeof import('../../utils/pdfAndGifEngine').renderPdfPageToCanvas;

export interface UseImageToolsProps {
  tool: ToolItem;
  renderPdfPageToCanvas: RenderPdfPageFn;
  onRecordHistory?: (toolTitle: string, detail: string) => void;
}

export function useImageTools({
  tool,
  renderPdfPageToCanvas,
  onRecordHistory,
}: UseImageToolsProps) {
  // ---------------- IMAGE STATE ----------------
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceImages, setSourceImages] = useState<HTMLCanvasElement[]>([]);
  const [isUsingSampleImage, setIsUsingSampleImage] = useState(false);
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

  // Initialize clean empty media state when tool opens or changes (no sample data)
  useEffect(() => {
    if (!tool) return;
    setIsUsingSampleImage(false);
    setSourceImages([]);
    setUploadedPdfForImage(null);
    setPdfImagePageNum(1);
    setPdfImageTotalPages(1);
    setCropZoom(100);
    setCropOffsetX(0);
    setCropOffsetY(0);
    setShowOriginalCompare(false);
    setBgRemoveEnabled(tool.id === 'background-remover');
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
  }, [tool, uploadedPdfForImage, pdfImagePageNum, renderPdfPageToCanvas]);

  // Render Image Studio Canvas whenever options change
  useEffect(() => {
    if (!tool || sourceImages.length === 0 || !imageCanvasRef.current) return;
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

  return {
    imageCanvasRef,
    sourceImages,
    setSourceImages,
    isUsingSampleImage,
    pdfImagePageNum,
    setPdfImagePageNum,
    pdfImageTotalPages,
    imgWidth,
    setImgWidth,
    imgHeight,
    setImgHeight,
    aspectPreset,
    cropZoom,
    setCropZoom,
    cropOffsetX,
    setCropOffsetX,
    cropOffsetY,
    setCropOffsetY,
    brightness,
    setBrightness,
    contrast,
    setContrast,
    saturation,
    setSaturation,
    sepia,
    setSepia,
    hueRotate,
    setHueRotate,
    sharpenStrength,
    setSharpenStrength,
    dehazeStrength,
    setDehazeStrength,
    colorHarmony,
    setColorHarmony,
    denoiseStrength,
    setDenoiseStrength,
    bgTolerance,
    setBgTolerance,
    bgEdgeFeather,
    setBgEdgeFeather,
    bgProtectSubject,
    setBgProtectSubject,
    bgReplacement,
    setBgReplacement,
    showOriginalCompare,
    setShowOriginalCompare,
    combineMode,
    setCombineMode,
    combineGap,
    setCombineGap,
    combineBgColor,
    setCombineBgColor,
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality,
    estimatedImgBytes,
    idPhotoSize,
    setIdPhotoSize,
    idPhotoBackdrop,
    setIdPhotoBackdrop,
    idPhotoLayout,
    setIdPhotoLayout,
    idPhotoCutGuides,
    setIdPhotoCutGuides,
    imgWatermarkText,
    setImgWatermarkText,
    imgWatermarkPattern,
    setImgWatermarkPattern,
    imgWatermarkOpacity,
    setImgWatermarkOpacity,
    imgPrivacyRedact,
    setImgPrivacyRedact,
    imgRedactY,
    setImgRedactY,
    imgRedactHeight,
    setImgRedactHeight,
    imgRedactMode,
    setImgRedactMode,
    handleImageOrPdfUpload,
    handleAspectPreset,
    handleDownloadImage,
  };
}
