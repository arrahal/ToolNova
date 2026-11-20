import React from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Sliders,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { ToolItem } from '../../data/toolsData';
import { useImageTools, RenderPdfPageFn } from './useImageTools';

export interface ImageToolsProps {
  tool: ToolItem;
  renderPdfPageToCanvas: RenderPdfPageFn;
  onRecordHistory?: (toolTitle: string, detail: string) => void;
}

export const ImageTools: React.FC<ImageToolsProps> = ({
  tool,
  renderPdfPageToCanvas,
  onRecordHistory,
}) => {
  const {
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
    imgPrivacyRedact,
    setImgPrivacyRedact,
    imgRedactY,
    setImgRedactY,
    imgRedactMode,
    setImgRedactMode,
    handleImageOrPdfUpload,
    handleAspectPreset,
    handleDownloadImage,
  } = useImageTools({
    tool,
    renderPdfPageToCanvas,
    onRecordHistory,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
      {/* LEFT / MAIN STAGE (7 cols) */}
      <div className="lg:col-span-7 p-6 bg-slate-50/50 dark:bg-slate-950/50 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between">
        {/* IMAGE STUDIO STAGE */}
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
            </div>
          </div>

          {sourceImages.length === 0 ? (
            <div className="flex-1 min-h-[320px] rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mb-3 shadow-xs">
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                لا توجد صورة مفتوحة حالياً (Ready for Image)
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-sm">
                قم برفع صورة للبدء في المعالجة والتحسين والتحويل فوراً داخل متصفحك بأمان.
              </p>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-colors">
                <Plus className="w-4 h-4" />
                {tool.id === 'pdf-to-jpg' ? 'اختيار ملف PDF أو صورة' : 'اختيار صورة من جهازك'}
                <input
                  type="file"
                  accept={tool.id === 'pdf-to-jpg' ? '.pdf,image/*' : 'image/*'}
                  multiple={tool.id === 'combine-images'}
                  onChange={handleImageOrPdfUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex-1 min-h-[320px] rounded-xl border border-slate-200 dark:border-slate-800 bg-checkerboard flex items-center justify-center p-4 overflow-hidden">
              <canvas
                ref={imageCanvasRef}
                className="max-w-full max-h-[310px] object-contain rounded-lg shadow-md"
              />
            </div>
          )}

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

          {/* IMAGE STUDIO CONTROLS */}
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
        </div>

        {/* Bottom Primary Export CTA */}
        <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
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
        </div>
      </div>
    </div>
  );
};
