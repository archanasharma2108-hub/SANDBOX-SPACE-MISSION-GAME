import React, { useRef } from 'react';
import { AttitudeCommand, normalizeAngle360 } from '../game/physics';

interface AttitudeDialProps {
  angleDeg: number;
  progradeAngleDeg?: number | null;
  onSetAngle: (deg: number) => void;
  onCommandAttitude?: (cmd: AttitudeCommand) => void;
}

export const AttitudeDial: React.FC<AttitudeDialProps> = ({
  angleDeg,
  progradeAngleDeg = null,
  onSetAngle,
  onCommandAttitude
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = cy - clientY; // +Y up
    const deg = Math.round(normalizeAngle360((Math.atan2(dx, dy) * 180) / Math.PI));
    if (onCommandAttitude) {
      onCommandAttitude({ type: 'angle', angleDeg: deg });
    } else {
      onSetAngle(deg);
    }
  };

  const displayAngle = ((Math.round(angleDeg) % 360) + 360) % 360;
  const retrogradeAngleDeg =
    progradeAngleDeg !== null ? normalizeAngle360(progradeAngleDeg + 180) : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          360° Navball Axis
        </div>
        <svg
          ref={svgRef}
          width="104"
          height="104"
          viewBox="0 0 108 108"
          className="cursor-crosshair select-none touch-none"
          onPointerDown={(e) => {
            draggingRef.current = true;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) {
              updateFromPointer(e.clientX, e.clientY);
            }
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
        >
          <defs>
            <clipPath id="navball-clip">
              <circle cx="54" cy="54" r="39" />
            </clipPath>
          </defs>

          {/* Outer Compass Ring */}
          <circle cx="54" cy="54" r="49" fill="#0B111E" stroke="#334155" strokeWidth="2" />

          {/* Artificial Horizon Sphere (sky top / ground bottom) */}
          <g clipPath="url(#navball-clip)">
            <g transform={`translate(54, 54) rotate(${-angleDeg})`}>
              <rect x="-50" y="-50" width="100" height="50" fill="#0369A1" opacity="0.48" />
              <rect x="-50" y="0" width="100" height="50" fill="#78350F" opacity="0.52" />
              <line x1="-50" y1="0" x2="50" y2="0" stroke="#E2E8F0" strokeWidth="1.2" opacity="0.85" />
              <line x1="-14" y1="-16" x2="14" y2="-16" stroke="#93C5FD" strokeWidth="1" opacity="0.65" />
              <line x1="-14" y1="16" x2="14" y2="16" stroke="#FDBA74" strokeWidth="1" opacity="0.65" />
            </g>
          </g>

          <circle cx="54" cy="54" r="39" fill="none" stroke="#1E293B" strokeWidth="1.5" />

          {/* Cardinal compass ticks */}
          <text x="54" y="13" textAnchor="middle" fill="#38BDF8" fontSize="8" fontFamily="monospace">
            0°
          </text>
          <text x="96" y="57" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="monospace">
            90°
          </text>
          <text x="54" y="102" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="monospace">
            180°
          </text>
          <text x="13" y="57" textAnchor="middle" fill="#94A3B8" fontSize="8" fontFamily="monospace">
            270°
          </text>

          {/* Prograde & Retrograde Orbital Markers on Navball Ring */}
          {progradeAngleDeg !== null && (
            <g transform={`translate(54, 54) rotate(${progradeAngleDeg})`}>
              <circle cx="0" cy="-35" r="4" fill="#10B981" stroke="#052E16" strokeWidth="1" />
            </g>
          )}
          {retrogradeAngleDeg !== null && (
            <g transform={`translate(54, 54) rotate(${retrogradeAngleDeg})`}>
              <circle cx="0" cy="-35" r="4" fill="#F43F5E" stroke="#4C0519" strokeWidth="1" />
            </g>
          )}

          {/* Rotating Rocket Pointer */}
          <g transform={`translate(54, 54) rotate(${angleDeg})`}>
            <line x1="0" y1="16" x2="0" y2="-30" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
            <polygon points="0,-37 5,-24 -5,-24" fill="#F59E0B" />
            <circle cx="0" cy="0" r="4.5" fill="#06B6D4" />
          </g>
        </svg>
      </div>

      {/* Precision Attitude & SAS Snap Controls */}
      <div className="flex flex-col gap-1.5 text-[11px] font-mono">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onCommandAttitude
                ? onCommandAttitude({ type: 'step', deltaDeg: -15 })
                : onSetAngle(normalizeAngle360(angleDeg - 15))
            }
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            -15°
          </button>
          <span className="w-11 text-center text-cyan-300 font-bold tabular-nums">
            {displayAngle}°
          </span>
          <button
            type="button"
            onClick={() =>
              onCommandAttitude
                ? onCommandAttitude({ type: 'step', deltaDeg: 15 })
                : onSetAngle(normalizeAngle360(angleDeg + 15))
            }
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            +15°
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onCommandAttitude ? onCommandAttitude({ type: 'up' }) : onSetAngle(0)
            }
            title="Align Vertical (0°)"
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px]"
          >
            0° UP
          </button>
          <button
            type="button"
            disabled={progradeAngleDeg === null}
            onClick={() => {
              if (progradeAngleDeg === null) return;
              if (onCommandAttitude) onCommandAttitude({ type: 'prograde' });
              else onSetAngle(Math.round(progradeAngleDeg));
            }}
            title="Align Prograde (Accelerate)"
            className={`px-2 py-1 rounded text-[10px] ${
              progradeAngleDeg !== null
                ? 'bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            PRO
          </button>
          <button
            type="button"
            disabled={retrogradeAngleDeg === null}
            onClick={() => {
              if (retrogradeAngleDeg === null) return;
              if (onCommandAttitude) onCommandAttitude({ type: 'retrograde' });
              else onSetAngle(Math.round(retrogradeAngleDeg));
            }}
            title="Align Retrograde (Brake / Land)"
            className={`px-2 py-1 rounded text-[10px] ${
              retrogradeAngleDeg !== null
                ? 'bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40'
                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
            }`}
          >
            RET
          </button>
        </div>
      </div>
    </div>
  );
};
