import React from 'react';
import { ToolItem, TileColor } from '../data/toolsData';

const TILE_BG_STYLES: Record<TileColor, string> = {
  coral:
    'bg-[#FFF0EC] text-[#F97316] dark:bg-[#2E1E1A] dark:text-[#FF8A3D]',
  emerald:
    'bg-[#ECFDF3] text-[#10B981] dark:bg-[#132A23] dark:text-[#34D399]',
  blue:
    'bg-[#EFF6FF] text-[#3B82F6] dark:bg-[#16243E] dark:text-[#60A5FA]',
  amber:
    'bg-[#FFFBEB] text-[#F59E0B] dark:bg-[#2D2315] dark:text-[#FBBF24]',
  violet:
    'bg-[#F5F3FF] text-[#8B5CF6] dark:bg-[#231B38] dark:text-[#A78BFA]',
  rose:
    'bg-[#FFF1F2] text-[#F43F5E] dark:bg-[#2F1622] dark:text-[#FB7185]',
  cyan:
    'bg-[#ECFEFF] text-[#06B6D4] dark:bg-[#122932] dark:text-[#22D3EE]',
};

const BADGE_TEXT_COLOR: Record<string, string> = {
  W: 'text-[#2563EB]',
  P: 'text-[#EA580C]',
  X: 'text-[#16A34A]',
  M: 'text-[#7C3AED]',
  JPG: 'text-[#D97706]',
  PDF: 'text-[#E11D48]',
  GIF: 'text-[#D97706]',
  WAV: 'text-[#0891B2]',
  SRT: 'text-[#7C3AED]',
};

/**
 * Renders bespoke, ultra-clear vector glyphs for every single ToolNova service
 * (matching the attached reference screenshots: Merge PDF dual-boxes with curved arrows,
 * Split PDF Y-fork arrows, Document + crisp white corner badge for Word/PPT/Excel/JPG, etc.)
 */
export const ToolBrandIcon: React.FC<{
  tool: ToolItem;
  size?: 'md' | 'lg';
}> = ({ tool, size = 'md' }) => {
  const tileStyle = TILE_BG_STYLES[tool.tileColor];
  const boxClass =
    size === 'lg' ? 'w-11 h-11 rounded-xl' : 'w-10 h-10 rounded-[11px]';
  const svgClass = size === 'lg' ? 'w-6 h-6' : 'w-[22px] h-[22px]';

  const renderCustomSvg = () => {
    switch (tool.id) {
      // 1. MERGE PDF — Exact match to Image 3: two squares with stippled center & curved arrows joining
      case 'merge-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            {/* Top-left page square */}
            <rect x="3" y="3" width="8" height="8" rx="1.8" />
            <circle cx="6" cy="6" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="8" cy="6" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="6" cy="8" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none" />
            {/* Bottom-right page square */}
            <rect x="13" y="13" width="8" height="8" rx="1.8" />
            <circle cx="16" cy="16" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="18" cy="16" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="16" cy="18" r="0.6" fill="currentColor" stroke="none" />
            <circle cx="18" cy="18" r="0.6" fill="currentColor" stroke="none" />
            {/* Bottom-left curved arrow pointing right */}
            <path d="M4.5 14.5v2a2.5 2.5 0 0 0 2.5 2.5h3" />
            <path d="m8 16.5 2.5 2.5-2.5 2.5" />
            {/* Top-right curved trails */}
            <path d="M14.5 4.5c1.5 1.8 1.5 4.2 0 6" />
            <path d="M18.5 4.5c1.5 1.8 1.5 4.2 0 6" />
          </svg>
        );

      // 2. SPLIT PDF — Exact match to Image 2: diverging Y-split arrows
      case 'split-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M12 20v-7.5L5.5 6" />
            <path d="M5.5 11V6h5" />
            <path d="m14.5 10 4-4" />
            <path d="M13.5 6h5v5" />
          </svg>
        );

      // 3. COMPRESS PDF — 4 inward-pointing corner compression arrows
      case 'compress-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M4 14h6v6" />
            <path d="m3 21 7-7" />
            <path d="M20 10h-6V4" />
            <path d="m21 3-7 7" />
            <path d="M14 14h6v6" />
            <path d="m21 21-7-7" />
            <path d="M10 10H4V4" />
            <path d="m3 3 7 7" />
          </svg>
        );

      // 4. DOCUMENT CONVERSIONS — Exact match to Image 1: clean folded document page with horizontal lines
      case 'pdf-to-word':
      case 'word-to-pdf':
      case 'pdf-to-powerpoint':
      case 'pdf-to-excel':
      case 'pdf-to-markdown':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5L14.5 3z" />
            <polyline points="14 3 14 8 19 8" />
            <line x1="8.5" y1="10.5" x2="11" y2="10.5" />
            <line x1="8.5" y1="14" x2="15.5" y2="14" />
            <line x1="8.5" y1="17" x2="14.5" y2="17" />
          </svg>
        );

      // 5. JPG TO PDF / PDF TO JPG — Picture frame with sun & mountain landscape
      case 'jpg-to-pdf':
      case 'pdf-to-jpg':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m20.5 15-4.5-4.5L6 20.5" />
          </svg>
        );

      // 6. EDIT PDF — Document with diagonal pencil annotation
      case 'edit-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
            <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        );

      // 7. WATERMARK PDF — Official stamp icon
      case 'watermark-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M5 21h14" />
            <path d="M19 17v-2a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2h14Z" />
            <path d="M10 13V8.5a2.5 2.5 0 1 1 5 0V13" />
          </svg>
        );

      // 8. ROTATE PDF — Page inside circular rotation arrow
      case 'rotate-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <rect x="9" y="8.5" width="6" height="7" rx="1" />
          </svg>
        );

      // 9. UNLOCK PDF — Open shackle security lock
      case 'unlock-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect width="16" height="11" x="4" y="11" rx="2" ry="2" />
            <path d="M8 11V7a4 4 0 0 1 7.8-1" />
            <circle cx="12" cy="16.5" r="1" fill="currentColor" />
          </svg>
        );

      // 10. PROTECT PDF — Closed shackle shield lock
      case 'protect-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect width="16" height="11" x="4" y="11" rx="2" ry="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            <circle cx="12" cy="16.5" r="1" fill="currentColor" />
          </svg>
        );

      // 11. ORGANIZE PDF — 2x2 page sorter grid with swap arrow
      case 'organize-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect width="7" height="7" x="3" y="3" rx="1.5" />
            <rect width="7" height="7" x="14" y="3" rx="1.5" />
            <rect width="7" height="7" x="14" y="14" rx="1.5" />
            <rect width="7" height="7" x="3" y="14" rx="1.5" />
          </svg>
        );

      // 12. PAGE NUMBERS — Document with #123 badge
      case 'page-numbers-pdf':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <line x1="4" x2="20" y1="9" y2="9" />
            <line x1="4" x2="20" y1="15" y2="15" />
            <line x1="10" x2="8" y1="3" y2="21" />
            <line x1="16" x2="14" y1="3" y2="21" />
          </svg>
        );

      // 13. IMAGE RESIZER & CROPPER — Precision crop frame
      case 'image-resizer':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M6 2v14a2 2 0 0 0 2 2h14" />
            <path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
        );

      // 14. COMBINE IMAGES — Stacked collage panels
      case 'combine-images':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect width="18" height="18" x="3" y="3" rx="2.5" />
            <line x1="3" x2="21" y1="12" y2="12" />
            <line x1="12" x2="12" y1="12" y2="21" />
          </svg>
        );

      // 15. COLOR & FILTER LAB — Artist color palette
      case 'color-filter-lab':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
        );

      // 16. AI IMAGE ENHANCER — Sparkle magic stars
      case 'ai-image-enhancer':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
            <path d="M5 3v4" />
            <path d="M3 5h4" />
          </svg>
        );

      // 17. BACKGROUND REMOVER — Subject cutout over checkerboard
      case 'background-remover':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect x="3" y="3" width="18" height="18" rx="2.5" strokeDasharray="3 3" />
            <circle cx="12" cy="10" r="3" />
            <path d="M7 19c1.2-2.6 3-4 5-4s3.8 1.4 5 4" />
          </svg>
        );

      // 18. FORMAT CONVERTER — Sync conversion arrows
      case 'format-converter':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        );

      // 19. AUDIO TRIMMER — Waveform + scissors cut
      case 'audio-trimmer':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <circle cx="6" cy="6" r="3" />
            <path d="M8.12 8.12 12 12" />
            <path d="M20 4 8.12 15.88" />
            <circle cx="6" cy="18" r="3" />
            <path d="M14.8 14.8 20 20" />
          </svg>
        );

      // 20. SPEED & PITCH — Precision studio gauge
      case 'speed-pitch':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="m12 14 4-4" />
            <path d="M3.34 19a10 10 0 1 1 17.32 0" />
          </svg>
        );

      // 21. EXTRACT AUDIO — Musical note wave
      case 'extract-audio':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        );

      // 22. VOLUME BOOSTER — Speaker with high gain waves
      case 'volume-booster':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        );

      // 23. VIDEO COMPRESSOR — Film frame with play triangle
      case 'video-compressor':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <rect width="18" height="18" x="3" y="3" rx="2.5" />
            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
          </svg>
        );

      // 24. VIDEO TO GIF — Clapperboard frame
      case 'video-to-gif':
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
            <path d="m6.2 5.3 3.1 3.9" />
            <path d="m12.4 3.4 3.1 4" />
            <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
        );

      // 25. SPEECH TO TEXT — Studio Condenser Microphone
      case 'speech-to-text':
      default:
        return (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={svgClass}
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        );
    }
  };

  // Determine corner badge label if applicable (matching Screenshot #1 with white rounded square badge)
  const badge =
    tool.badgeText ||
    (tool.id === 'pdf-to-markdown'
      ? 'M'
      : tool.id === 'jpg-to-pdf'
      ? 'PDF'
      : tool.id === 'pdf-to-jpg'
      ? 'JPG'
      : tool.id === 'video-to-gif'
      ? 'GIF'
      : tool.id === 'extract-audio'
      ? 'WAV'
      : tool.id === 'speech-to-text'
      ? 'SRT'
      : undefined);

  const badgeColorClass = badge
    ? BADGE_TEXT_COLOR[badge] || 'text-slate-900'
    : '';

  return (
    <div
      className={`relative ${boxClass} flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${tileStyle}`}
    >
      {renderCustomSvg()}
      {badge && (
        <span
          className={`absolute -bottom-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-[5px] bg-white dark:bg-white shadow-sm border border-slate-200/90 dark:border-slate-300 ${badgeColorClass} text-[9px] font-extrabold flex items-center justify-center font-sans tracking-tight leading-none`}
        >
          {badge}
        </span>
      )}
    </div>
  );
};
