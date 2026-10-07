import {
  Combine,
  Split,
  Minimize2,
  FileText,
  Presentation,
  Sheet,
  FileEdit,
  Image as ImageIcon,
  Stamp,
  RotateCw,
  Unlock,
  Lock,
  LayoutGrid,
  Hash,
  FileCode2,
  Crop,
  Layers,
  Palette,
  Sparkles,
  Eraser,
  RefreshCw,
  Scissors,
  Gauge,
  FileAudio,
  Volume2,
  Film,
  Clapperboard,
  Mic,
  LucideIcon,
} from 'lucide-react';

export type HubCategory =
  | 'all'
  | 'workflows'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'
  | 'convert'
  | 'security';

export type TileColor =
  | 'coral'
  | 'emerald'
  | 'blue'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'cyan';

export interface ToolItem {
  id: string;
  title: string;
  description: string;
  hub: 'pdf' | 'image' | 'audio' | 'video';
  hubLabel: string;
  subcategories: HubCategory[];
  icon: LucideIcon;
  tileColor: TileColor;
  engineTag: string;
  formats: string[];
  isNew?: boolean;
  badgeText?: string;
}

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  steps: string[];
  runsCount: number;
  estimatedSavedSec: number;
}

export const CATEGORY_TABS: { id: HubCategory; label: string; count?: number }[] = [
  { id: 'all', label: 'All' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'pdf', label: 'PDF Hub' },
  { id: 'image', label: 'Image Studio' },
  { id: 'audio', label: 'Audio Lab' },
  { id: 'video', label: 'Video & AI' },
  { id: 'convert', label: 'Convert & Export' },
  { id: 'security', label: 'Security & Optimize' },
];

export const TOOLS_DATA: ToolItem[] = [
  // ================= 1. PDF HUB =================
  {
    id: 'merge-pdf',
    title: 'Merge PDF',
    description:
      'Combine PDFs in the order you want with the easiest client-side PDF merger available.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf'],
    icon: Combine,
    tileColor: 'coral',
    engineTag: 'pdf-lib · Wasm',
    formats: ['PDF'],
  },
  {
    id: 'split-pdf',
    title: 'Split PDF',
    description:
      'Separate one page or a whole set for easy conversion into independent PDF files.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf'],
    icon: Split,
    tileColor: 'coral',
    engineTag: 'pdf-lib · Wasm',
    formats: ['PDF'],
  },
  {
    id: 'compress-pdf',
    title: 'Compress PDF',
    description:
      'Reduce file size while optimizing streams and embedded assets for maximal PDF quality.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'security'],
    icon: Minimize2,
    tileColor: 'emerald',
    engineTag: 'pdf-lib · Wasm',
    formats: ['PDF'],
  },
  {
    id: 'pdf-to-word',
    title: 'PDF to Word',
    description:
      'Easily convert your PDF files into easy to edit DOC and DOCX documents with preserved layout.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'convert'],
    icon: FileText,
    tileColor: 'blue',
    engineTag: 'DocEngine · Client',
    formats: ['PDF', 'DOCX'],
    badgeText: 'W',
  },
  {
    id: 'pdf-to-powerpoint',
    title: 'PDF to PowerPoint',
    description:
      'Turn your PDF files into easy to edit PPT and PPTX slideshows in seconds.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'convert'],
    icon: Presentation,
    tileColor: 'coral',
    engineTag: 'SlideParser · Client',
    formats: ['PDF', 'PPTX'],
    badgeText: 'P',
  },
  {
    id: 'pdf-to-excel',
    title: 'PDF to Excel',
    description:
      'Pull tabular data straight from PDFs into structured Excel spreadsheets and CSVs.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'convert'],
    icon: Sheet,
    tileColor: 'emerald',
    engineTag: 'TableExtract · Client',
    formats: ['PDF', 'XLSX', 'CSV'],
    badgeText: 'X',
  },
  {
    id: 'word-to-pdf',
    title: 'Word to PDF',
    description:
      'Make DOC, DOCX, TXT, and Markdown files easy to read by converting them to PDF.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'convert'],
    icon: FileText,
    tileColor: 'blue',
    engineTag: 'Mammoth + pdf-lib',
    formats: ['DOCX', 'TXT', 'PDF'],
    badgeText: 'W',
  },
  {
    id: 'jpg-to-pdf',
    title: 'JPG to PDF',
    description:
      'Convert JPG, PNG, and WebP images to PDF in seconds. Easily adjust orientation and margins.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'image', 'convert'],
    icon: ImageIcon,
    tileColor: 'amber',
    engineTag: 'pdf-lib · Raster',
    formats: ['JPG', 'PNG', 'PDF'],
  },
  {
    id: 'edit-pdf',
    title: 'Edit PDF',
    description:
      'Add text, callouts, shapes or freehand annotations to a PDF document directly in browser.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf'],
    icon: FileEdit,
    tileColor: 'violet',
    engineTag: 'pdf-lib · Canvas',
    formats: ['PDF'],
  },
  {
    id: 'watermark-pdf',
    title: 'Watermark',
    description:
      'Stamp an image or text over your PDF in seconds. Choose the typography, transparency and position.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'security'],
    icon: Stamp,
    tileColor: 'rose',
    engineTag: 'pdf-lib · Vector',
    formats: ['PDF'],
  },
  {
    id: 'rotate-pdf',
    title: 'Rotate PDF',
    description:
      'Rotate your PDFs the way you need them. You can even rotate multiple PDF pages at once!',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf'],
    icon: RotateCw,
    tileColor: 'violet',
    engineTag: 'pdf-lib · Instant',
    formats: ['PDF'],
  },
  {
    id: 'unlock-pdf',
    title: 'Unlock PDF',
    description:
      'Remove PDF password restrictions, giving you the freedom to use your authorized PDFs as you want.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'security'],
    icon: Unlock,
    tileColor: 'blue',
    engineTag: 'CryptoPDF · Local',
    formats: ['PDF'],
  },
  {
    id: 'protect-pdf',
    title: 'Protect PDF',
    description:
      'Protect PDF files with a strong password. Encrypt PDF documents locally to prevent unauthorized access.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'security'],
    icon: Lock,
    tileColor: 'blue',
    engineTag: 'AES-256 · Local',
    formats: ['PDF'],
  },
  {
    id: 'organize-pdf',
    title: 'Organize PDF',
    description:
      'Sort pages of your PDF file however you like. Delete PDF pages or insert blank pages at your convenience.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf'],
    icon: LayoutGrid,
    tileColor: 'coral',
    engineTag: 'pdf-lib · DOM',
    formats: ['PDF'],
  },
  {
    id: 'page-numbers-pdf',
    title: 'Page Numbers',
    description:
      'Add page numbers into PDFs with ease. Choose your header/footer positions, dimensions, and typography.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf'],
    icon: Hash,
    tileColor: 'violet',
    engineTag: 'pdf-lib · Typeset',
    formats: ['PDF'],
  },
  {
    id: 'pdf-to-markdown',
    title: 'PDF to Markdown',
    description:
      'Easily turn PDFs into clean Markdown files. Headings, tables, lists, and links preserved automatically.',
    hub: 'pdf',
    hubLabel: 'PDF Hub',
    subcategories: ['pdf', 'convert'],
    icon: FileCode2,
    tileColor: 'violet',
    engineTag: 'AST Parser · Local',
    formats: ['PDF', 'MD'],
    isNew: true,
  },

  // ================= 2. IMAGE STUDIO =================
  {
    id: 'image-resizer',
    title: 'Image Resizer & Cropper',
    description:
      'Change pixel dimensions, lock aspect ratios (16:9, 4:3, 1:1), and crop regions with sub-pixel accuracy.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['image', 'security'],
    icon: Crop,
    tileColor: 'amber',
    engineTag: 'HTML5 Canvas · 2D',
    formats: ['PNG', 'JPG', 'WebP'],
    isNew: true,
  },
  {
    id: 'combine-images',
    title: 'Combine / Merge Images',
    description:
      'Stitch multiple images together seamlessly into a horizontal strip, vertical strip, or custom grid.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['image'],
    icon: Layers,
    tileColor: 'coral',
    engineTag: 'HTML5 Canvas · Stitch',
    formats: ['PNG', 'JPG', 'WebP'],
    isNew: true,
  },
  {
    id: 'color-filter-lab',
    title: 'Color & Filter Lab',
    description:
      'Adjust brightness, contrast, saturation, exposure, and apply studio-grade artistic color filters.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['image'],
    icon: Palette,
    tileColor: 'violet',
    engineTag: 'WebGL / Canvas LUT',
    formats: ['PNG', 'JPG', 'WebP'],
  },
  {
    id: 'ai-image-enhancer',
    title: 'AI Image Enhancer',
    description:
      'Improve image quality, unblur edges, and upscale resolution with client-side sharpening kernels.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['image', 'security'],
    icon: Sparkles,
    tileColor: 'emerald',
    engineTag: 'Neural Sharpen · Wasm',
    formats: ['PNG', 'JPG', 'WebP'],
    isNew: true,
  },
  {
    id: 'background-remover',
    title: 'Background Remover',
    description:
      'Remove image backgrounds instantly in your browser and export clean transparent PNG cutouts.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['image'],
    icon: Eraser,
    tileColor: 'rose',
    engineTag: 'Alpha Matte · Client',
    formats: ['PNG', 'WebP'],
    isNew: true,
  },
  {
    id: 'format-converter',
    title: 'Format Converter',
    description:
      'Convert images between HEIC, WebP, PNG, and JPG in seconds with adjustable compression quality.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['image', 'convert'],
    icon: RefreshCw,
    tileColor: 'amber',
    engineTag: 'Codec Canvas · Local',
    formats: ['HEIC', 'WebP', 'PNG', 'JPG'],
  },
  {
    id: 'pdf-to-jpg',
    title: 'PDF to JPG',
    description:
      'Convert each PDF page into a high-DPI JPG or extract all embedded raster images from a PDF.',
    hub: 'image',
    hubLabel: 'Image Studio',
    subcategories: ['pdf', 'image', 'convert'],
    icon: ImageIcon,
    tileColor: 'amber',
    engineTag: 'Rasterizer · Local',
    formats: ['PDF', 'JPG', 'PNG'],
  },

  // ================= 3. AUDIO LAB =================
  {
    id: 'audio-trimmer',
    title: 'Audio Trimmer / Cutter',
    description:
      'Cut precise sections of audio tracks on an interactive waveform with fade-in and fade-out envelopes.',
    hub: 'audio',
    hubLabel: 'Audio Lab',
    subcategories: ['audio'],
    icon: Scissors,
    tileColor: 'cyan',
    engineTag: 'Web Audio · Wasm',
    formats: ['MP3', 'WAV', 'FLAC'],
    isNew: true,
  },
  {
    id: 'speed-pitch',
    title: 'Speed & Pitch Controller',
    description:
      'Alter tempo, playback speed (0.5x–2.0x), and pitch tone in semitones for podcasts or music practice.',
    hub: 'audio',
    hubLabel: 'Audio Lab',
    subcategories: ['audio'],
    icon: Gauge,
    tileColor: 'violet',
    engineTag: 'AudioContext · DSP',
    formats: ['MP3', 'WAV', 'OGG'],
  },
  {
    id: 'extract-audio',
    title: 'Extract Audio from Video',
    description:
      'Convert MP4, MOV, and WebM video containers into high-quality MP3 or uncompressed WAV audio tracks.',
    hub: 'audio',
    hubLabel: 'Audio Lab',
    subcategories: ['audio', 'video', 'convert'],
    icon: FileAudio,
    tileColor: 'blue',
    engineTag: 'FFmpeg.wasm · Demux',
    formats: ['MP4', 'MOV', 'MP3', 'WAV'],
    isNew: true,
  },
  {
    id: 'volume-booster',
    title: 'Volume Booster',
    description:
      'Increase sound gain up to +12 dB with an integrated soft-clipping brickwall limiter to prevent distortion.',
    hub: 'audio',
    hubLabel: 'Audio Lab',
    subcategories: ['audio', 'security'],
    icon: Volume2,
    tileColor: 'emerald',
    engineTag: 'GainDSP · Limiter',
    formats: ['MP3', 'WAV', 'M4A'],
  },

  // ================= 4. VIDEO & AI HUB =================
  {
    id: 'video-compressor',
    title: 'Video Compressor',
    description:
      'Reduce video file size up to 80% without losing visual clarity by tuning resolution and CRF bitrate.',
    hub: 'video',
    hubLabel: 'Video & AI',
    subcategories: ['video', 'security'],
    icon: Film,
    tileColor: 'emerald',
    engineTag: 'FFmpeg.wasm · H.264',
    formats: ['MP4', 'WebM', 'MOV'],
    isNew: true,
  },
  {
    id: 'video-to-gif',
    title: 'Video to GIF',
    description:
      'Turn video clips into lightweight, looping animated GIFs with custom frame rate and palette quantization.',
    hub: 'video',
    hubLabel: 'Video & AI',
    subcategories: ['video', 'convert'],
    icon: Clapperboard,
    tileColor: 'amber',
    engineTag: 'GIFEncoder · Canvas',
    formats: ['MP4', 'WebM', 'GIF'],
    isNew: true,
  },
  {
    id: 'speech-to-text',
    title: 'Speech to Text / Transcribe',
    description:
      'Auto-transcribe audio and video recordings into structured, timestamped text, Markdown, or SRT captions.',
    hub: 'video',
    hubLabel: 'Video & AI',
    subcategories: ['video', 'audio', 'convert'],
    icon: Mic,
    tileColor: 'violet',
    engineTag: 'Whisper Wasm · WebSpeech',
    formats: ['MP3', 'MP4', 'WAV', 'SRT'],
    isNew: true,
  },
];

export const INITIAL_WORKFLOWS: WorkflowPreset[] = [
  {
    id: 'wf-doc-publish',
    name: 'Client Report Publisher',
    description:
      'Merge multiple PDF sections, stamp a confidential watermark, and compress for email delivery.',
    steps: ['merge-pdf', 'watermark-pdf', 'compress-pdf'],
    runsCount: 142,
    estimatedSavedSec: 45,
  },
  {
    id: 'wf-ecommerce-product',
    name: 'E-Commerce Product Asset Prep',
    description:
      'Remove studio background, crop to 1:1 square aspect ratio, and convert to lightweight WebP.',
    steps: ['background-remover', 'image-resizer', 'format-converter'],
    runsCount: 89,
    estimatedSavedSec: 60,
  },
  {
    id: 'wf-podcast-master',
    name: 'Podcast Episode Quick-Master',
    description:
      'Extract audio track from raw video recording, trim intro silence, boost gain +4dB, and transcribe to SRT.',
    steps: ['extract-audio', 'audio-trimmer', 'volume-booster', 'speech-to-text'],
    runsCount: 64,
    estimatedSavedSec: 120,
  },
];
