import React from 'react';
import { PartDefinition } from '../game/types';

interface PartThumbnailProps {
  part: PartDefinition;
  size?: number;
}

export const PartThumbnail: React.FC<PartThumbnailProps> = ({ part, size = 54 }) => {
  const { shapeType, bodyColor, accentColor } = part;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
      aria-hidden="true"
    >
      {/* Blueprint Grid Subtle Backdrop */}
      <rect x="2" y="2" width="60" height="60" rx="8" fill="#0B1220" stroke="#1E293B" strokeWidth="1.5" />
      <path d="M16 4v56M32 4v56M48 4v56M4 16h56M4 32h56M4 48h56" stroke="#162238" strokeWidth="0.75" />

      {shapeType === 'capsule' && (
        <g>
          <path d="M24 12 L40 12 L48 44 L16 44 Z" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <rect x="25" y="9" width="14" height="4" rx="1.5" fill={accentColor} />
          <rect x="16" y="44" width="32" height="5" rx="1" fill="#334155" />
          <circle cx="32" cy="27" r="4.5" fill="#0F172A" stroke={accentColor} strokeWidth="1.5" />
          <circle cx="32" cy="27" r="2.2" fill="#38BDF8" />
        </g>
      )}

      {shapeType === 'probe' && (
        <g>
          <polygon points="32,12 45,20 45,42 32,50 19,42 19,20" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <rect x="24" y="22" width="16" height="16" rx="2" fill="#1E293B" stroke={accentColor} strokeWidth="1.2" />
          <circle cx="32" cy="30" r="4" fill={accentColor} />
          <line x1="32" y1="6" x2="32" y2="12" stroke="#94A3B8" strokeWidth="2" />
          <circle cx="32" cy="6" r="2" fill={accentColor} />
        </g>
      )}

      {shapeType === 'tank' && (
        <g>
          <rect x="19" y="10" width="26" height="44" rx="3" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <rect x="19" y="16" width="26" height="6" fill={accentColor} />
          <rect x="19" y="42" width="26" height="4" fill="#334155" />
          <line x1="25" y1="10" x2="25" y2="54" stroke="rgba(15,23,42,0.18)" strokeWidth="2" />
          <line x1="39" y1="10" x2="39" y2="54" stroke="rgba(15,23,42,0.18)" strokeWidth="2" />
        </g>
      )}

      {shapeType === 'engine' && (
        <g>
          <rect x="22" y="10" width="20" height="12" rx="2" fill="#334155" stroke="#0F172A" strokeWidth="1.5" />
          <path d="M25 22 L39 22 L47 50 L17 50 Z" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <path d="M21 34 L43 34 M19 42 L45 42" stroke={accentColor} strokeWidth="1.8" />
          <ellipse cx="32" cy="50" rx="15" ry="3" fill="#0F172A" />
        </g>
      )}

      {shapeType === 'srb' && (
        <g>
          <path d="M24 14 L32 6 L40 14 L40 46 L24 46 Z" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <rect x="24" y="18" width="16" height="5" fill={accentColor} />
          <rect x="24" y="37" width="16" height="4" fill={accentColor} />
          <path d="M26 46 L38 46 L42 55 L22 55 Z" fill="#334155" stroke="#0F172A" strokeWidth="1.2" />
        </g>
      )}

      {shapeType === 'solar' && (
        <g>
          <rect x="8" y="22" width="48" height="20" rx="2" fill={bodyColor} stroke="#93C5FD" strokeWidth="1.5" />
          <line x1="20" y1="22" x2="20" y2="42" stroke="#60A5FA" strokeWidth="1.2" />
          <line x1="32" y1="22" x2="32" y2="42" stroke="#94A3B8" strokeWidth="2" />
          <line x1="44" y1="22" x2="44" y2="42" stroke="#60A5FA" strokeWidth="1.2" />
          <line x1="8" y1="32" x2="56" y2="32" stroke="#60A5FA" strokeWidth="1.2" />
        </g>
      )}

      {shapeType === 'dish' && (
        <g>
          <path d="M12 24 Q32 46 52 24" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <ellipse cx="32" cy="24" rx="20" ry="6" fill="#F8FAFC" stroke={accentColor} strokeWidth="1.5" />
          <line x1="32" y1="24" x2="32" y2="11" stroke="#334155" strokeWidth="2" />
          <circle cx="32" cy="11" r="3" fill={accentColor} />
          <rect x="27" y="38" width="10" height="14" rx="2" fill="#475569" />
        </g>
      )}

      {shapeType === 'instrument' && (
        <g>
          <rect x="16" y="18" width="32" height="28" rx="4" fill={bodyColor} stroke={accentColor} strokeWidth="1.8" />
          <circle cx="28" cy="32" r="7" fill="#0F172A" stroke={accentColor} strokeWidth="1.5" />
          <circle cx="28" cy="32" r="3" fill={accentColor} />
          <rect x="38" y="24" width="6" height="16" rx="1" fill="#94A3B8" />
          <line x1="22" y1="12" x2="22" y2="18" stroke="#CBD5E1" strokeWidth="2" />
          <line x1="42" y1="12" x2="42" y2="18" stroke="#CBD5E1" strokeWidth="2" />
        </g>
      )}

      {shapeType === 'decoupler' && (
        <g>
          <rect x="12" y="24" width="40" height="16" rx="2" fill={bodyColor} stroke="#0F172A" strokeWidth="1.5" />
          <rect x="12" y="29" width="40" height="6" fill={accentColor} />
          <path d="M20 20 L26 24 L14 24 Z M44 20 L50 24 L38 24 Z" fill="#FBBF24" />
        </g>
      )}

      {shapeType === 'heatshield' && (
        <g>
          <path d="M10 26 Q32 48 54 26 L54 32 Q32 54 10 32 Z" fill={bodyColor} stroke={accentColor} strokeWidth="1.5" />
          <ellipse cx="32" cy="26" rx="22" ry="5" fill="#92400E" stroke="#F59E0B" strokeWidth="1.2" />
        </g>
      )}

      {shapeType === 'legs' && (
        <g>
          <rect x="22" y="14" width="20" height="14" rx="2" fill={bodyColor} stroke="#0F172A" strokeWidth="1.2" />
          <line x1="24" y1="26" x2="12" y2="50" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round" />
          <line x1="40" y1="26" x2="52" y2="50" stroke={accentColor} strokeWidth="3.5" strokeLinecap="round" />
          <rect x="8" y="49" width="9" height="4" rx="1.5" fill="#CBD5E1" />
          <rect x="47" y="49" width="9" height="4" rx="1.5" fill="#CBD5E1" />
        </g>
      )}

      {shapeType === 'chute' && (
        <g>
          <path d="M14 28 C14 14 50 14 50 28 Z" fill={accentColor} stroke="#0F172A" strokeWidth="1.5" />
          <path d="M24 28 C24 16 40 16 40 28 Z" fill={bodyColor} />
          <line x1="16" y1="28" x2="32" y2="46" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="32" y1="28" x2="32" y2="46" stroke="#CBD5E1" strokeWidth="1.2" />
          <line x1="48" y1="28" x2="32" y2="46" stroke="#CBD5E1" strokeWidth="1.2" />
          <rect x="23" y="44" width="18" height="8" rx="2" fill="#334155" stroke="#94A3B8" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
};
