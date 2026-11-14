import React, { useEffect, useRef, useState } from 'react';
import {
  getBodyConfig,
  getMoonEarthState,
  getPlanetHeliocentricState,
  PLANETS
} from '../game/planets';
import {
  computeTransferPlan,
  getShipTargetDistanceAndEta,
  predictTrajectory
} from '../game/physics';
import { FlightState, MissionDefinition, PlanetId, TrajectoryPrediction } from '../game/types';
import {
  ArrowDownToLine,
  Compass,
  FastForward,
  Orbit,
  Rocket,
  Sparkles,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface OrbitalMap2DProps {
  flightState: FlightState;
  mission: MissionDefinition;
  trajectory: TrajectoryPrediction;
  parts?: import('../game/types').PlacedPart[];
  onExecuteTransfer: (targetOverride?: PlanetId) => void;
  onDeorbitBurn?: () => void;
  onToggleAutoWarp?: () => void;
}

export const OrbitalMap2D: React.FC<OrbitalMap2DProps> = ({
  flightState,
  mission,
  trajectory,
  parts = [],
  onExecuteTransfer,
  onDeorbitBurn,
  onToggleAutoWarp
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mapScope, setMapScope] = useState<'local' | 'solar'>('local');
  const [zoom, setZoom] = useState<number>(1.0);

  // Auto-switch to Solar view when entering Heliocentric space or departing toward Mars/Venus
  const prevTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const tKey = `${flightState.soiBody}:${flightState.activeManeuver?.targetBody ?? ''}`;
    if (tKey !== prevTargetRef.current) {
      if (
        flightState.soiBody === 'sun' ||
        flightState.activeManeuver?.targetBody === 'mars' ||
        flightState.activeManeuver?.targetBody === 'venus'
      ) {
        setMapScope('solar');
      } else if (
        flightState.soiBody === 'moon' ||
        flightState.activeManeuver?.targetBody === 'moon'
      ) {
        setMapScope('local');
      }
      prevTargetRef.current = tKey;
    }
  }, [flightState.soiBody, flightState.activeManeuver?.targetBody]);

  const planet = getBodyConfig(flightState.soiBody);
  const inSpace =
    flightState.soiBody === 'sun' ||
    flightState.altitudeMeters >= planet.atmosphereHeightMeters ||
    flightState.orbitAchieved;
  const hasAnyFuel =
    flightState.remainingFuelKg > 25 || flightState.currentStage < flightState.maxStage;

  const hasMoonWaypoint =
    flightState.missionRoute.includes('moon') &&
    flightState.missionRoute.indexOf('moon') < flightState.missionRoute.indexOf(mission.targetBody);
  const nextHopBody: PlanetId =
    flightState.soiBody === 'earth' && hasMoonWaypoint ? 'moon' : mission.targetBody;

  const canTransferNow =
    !flightState.activeManeuver &&
    flightState.soiBody !== 'sun' &&
    flightState.soiBody !== mission.targetBody &&
    inSpace &&
    hasAnyFuel;

  const canDeorbitAtTarget =
    !flightState.activeManeuver &&
    flightState.soiBody === mission.targetBody &&
    (mission.objectiveType === 'soft_landing' ||
      mission.objectiveType === 'sample_return' ||
      mission.objectiveType === 'impact') &&
    flightState.altitudeMeters > 25_000 &&
    flightState.phase !== 'landed' &&
    flightState.phase !== 'crashed' &&
    flightState.phase !== 'mission_complete';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 900;
    const height = canvas.clientHeight || 600;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Deep space background
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    // Subtle orbital coordinate grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < width; gx += 60) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 0; gy < height; gy += 60) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    const cx = width / 2;
    const cy = height / 2;

    if (mapScope === 'local' && flightState.soiBody !== 'sun') {
      const localPlanet = getBodyConfig(flightState.soiBody);
      const basePxRadius = Math.min(width, height) * 0.21 * zoom;
      const pxPerMeter = basePxRadius / localPlanet.radiusMeters;

      // Target Entry Orbit Ring
      if (mission.targetBody === flightState.soiBody && mission.targetOrbitKm.max > 5) {
        const targetR = (localPlanet.radiusMeters + mission.transferWindow.entryOrbitKm * 1000) * pxPerMeter;
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, targetR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#34D399';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText(
          `TARGET ORBIT ${mission.transferWindow.entryOrbitKm} km`,
          cx + targetR * 0.72,
          cy - targetR * 0.72
        );
        ctx.restore();
      }

      // Atmosphere Boundary Ring (Where Atmosphere Ends!)
      if (localPlanet.atmosphereHeightMeters > 0) {
        const atmoR = (localPlanet.radiusMeters + localPlanet.atmosphereHeightMeters) * pxPerMeter;
        const atmoGrad = ctx.createRadialGradient(cx, cy, basePxRadius, cx, cy, atmoR);
        atmoGrad.addColorStop(0, `${localPlanet.atmosphereColorHex}44`);
        atmoGrad.addColorStop(1, `${localPlanet.atmosphereColorHex}08`);
        ctx.fillStyle = atmoGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, atmoR, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = localPlanet.atmosphereColorHex;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, atmoR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Planet Surface Disc
      const surfGrad = ctx.createRadialGradient(
        cx - basePxRadius * 0.3,
        cy - basePxRadius * 0.3,
        basePxRadius * 0.2,
        cx,
        cy,
        basePxRadius
      );
      surfGrad.addColorStop(0, localPlanet.surfaceTintHex);
      surfGrad.addColorStop(1, localPlanet.colorHex);
      ctx.fillStyle = surfGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, basePxRadius, 0, Math.PI * 2);
      ctx.fill();

      if (localPlanet.atmosphereHeightMeters > 0) {
        const atmoR = (localPlanet.radiusMeters + localPlanet.atmosphereHeightMeters) * pxPerMeter;
        ctx.save();
        ctx.fillStyle = localPlanet.atmosphereColorHex;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(
          `ATMOSPHERE ENDS ${(localPlanet.atmosphereHeightMeters / 1000).toFixed(0)} km`,
          cx - atmoR * 0.78,
          cy - atmoR * 0.74
        );
        ctx.restore();
      }

      // Rotation meridian lines
      const spinAngle =
        (flightState.missionElapsedSec / (localPlanet.rotationPeriodHours * 3600)) * Math.PI * 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = spinAngle + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * basePxRadius, cy - Math.sin(a) * basePxRadius);
        ctx.stroke();
      }

      const rocketScreenX = cx + flightState.posX * pxPerMeter;
      const rocketScreenY = cy - flightState.posY * pxPerMeter;

      // Real Moon position & SOI circle when viewing Earth local SOI
      if (flightState.soiBody === 'earth') {
        const moon = PLANETS.moon;
        const moonState = getMoonEarthState(flightState.missionElapsedSec);
        const moonOrbitPx = moon.orbitRadiusSimMeters * pxPerMeter;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.beginPath();
        ctx.arc(cx, cy, moonOrbitPx, 0, Math.PI * 2);
        ctx.stroke();

        const mx = cx + moonState.x * pxPerMeter;
        const my = cy - moonState.y * pxPerMeter;

        // Draw Moon's real SOI boundary
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.beginPath();
        ctx.arc(mx, my, moon.soiRadiusMeters * pxPerMeter, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#CBD5E1';
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(5, moon.radiusMeters * pxPerMeter), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText('MOON', mx + 10, my + 4);
      }

      // 0% Coast Trajectory (ballistic path from real velocity & position)
      const coastTraj = predictTrajectory(flightState, 0, 120);
      if (coastTraj.points.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        coastTraj.points.forEach((pt, idx) => {
          const sx = cx + pt.x * pxPerMeter;
          const sy = cy - pt.y * pxPerMeter;
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Active Throttle (0% to 100%) Predicted Trajectory
      if (trajectory.points.length > 1) {
        ctx.strokeStyle = flightState.throttle > 0.05 && flightState.ignited ? '#F59E0B' : '#22D3EE';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        let apPt = trajectory.points[0];
        let pePt = trajectory.points[0];
        trajectory.points.forEach((pt, idx) => {
          if (pt.altitudeMeters > apPt.altitudeMeters) apPt = pt;
          if (pt.altitudeMeters < pePt.altitudeMeters) pePt = pt;
          const sx = cx + pt.x * pxPerMeter;
          const sy = cy - pt.y * pxPerMeter;
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();

        const apx = cx + apPt.x * pxPerMeter;
        const apy = cy - apPt.y * pxPerMeter;
        const apLabelX = Math.max(24, Math.min(width - 130, apx + 8));
        const apLabelY = Math.max(84, Math.min(height - 145, apy - 4));
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(apx, apy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText(
          trajectory.isEscaping ? 'ESCAPE' : `Ap ${Math.round(trajectory.apoapsisKm)} km`,
          apLabelX,
          apLabelY
        );

        if (trajectory.periapsisKm > 0) {
          const pex = cx + pePt.x * pxPerMeter;
          const pey = cy - pePt.y * pxPerMeter;
          const peLabelX = Math.max(24, Math.min(width - 130, pex + 8));
          const peLabelY = Math.max(88, Math.min(height - 145, pey + 12));
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(pex, pey, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(`Pe ${Math.round(trajectory.periapsisKm)} km`, peLabelX, peLabelY);
        }
      }

      // Rocket Marker & 360-degree orientation arrow
      const localZenithRad = Math.atan2(flightState.posX, flightState.posY);
      ctx.save();
      ctx.translate(rocketScreenX, rocketScreenY);
      ctx.rotate(localZenithRad + (flightState.angleDeg * Math.PI) / 180);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(6, 7);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    } else {
      // SOLAR SYSTEM INTERPLANETARY TRANSFER MAP (Real Heliocentric Ephemeris & Spacecraft Coordinates)
      const maxAU = 1.75;
      const pxPerAU = (Math.min(width, height) * 0.43 * zoom) / maxAU;
      const pxPerSunMeter = pxPerAU / PLANETS.earth.orbitRadiusSimMeters;

      // Sun
      const sunGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 24);
      sunGrad.addColorStop(0, '#FEF08A');
      sunGrad.addColorStop(0.6, '#F59E0B');
      sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();

      const solarPlanets: Array<'venus' | 'earth' | 'mars'> = ['venus', 'earth', 'mars'];
      const coords: Record<string, { x: number; y: number }> = {};

      for (const pid of solarPlanets) {
        const p = PLANETS[pid];
        const rPx = p.orbitRadiusAU * pxPerAU;
        ctx.strokeStyle =
          mission.targetBody === pid ? 'rgba(16, 185, 129, 0.55)' : 'rgba(71, 85, 105, 0.45)';
        ctx.lineWidth = mission.targetBody === pid ? 1.8 : 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.stroke();

        const pState = getPlanetHeliocentricState(pid, flightState.missionElapsedSec);
        const px = cx + pState.x * pxPerSunMeter;
        const py = cy - pState.y * pxPerSunMeter;
        coords[pid] = { x: px, y: py };

        // Draw subtle SOI boundary ring around target planet
        if (pid === mission.targetBody || pid === flightState.activeManeuver?.targetBody) {
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
          ctx.beginPath();
          ctx.arc(px, py, Math.max(10, p.soiRadiusMeters * pxPerSunMeter), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = p.colorHex;
        ctx.beginPath();
        ctx.arc(px, py, pid === 'earth' ? 7 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#E2E8F0';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillText(p.name.toUpperCase(), px + 10, py + 4);
      }

      // Draw Moon around Earth
      let moonScreenCoord = coords.earth;
      if (coords.earth) {
        const mState = getMoonEarthState(flightState.missionElapsedSec);
        const moonAng = mState.angleRad;
        const mx = coords.earth.x + Math.cos(moonAng) * 20;
        const my = coords.earth.y - Math.sin(moonAng) * 20;
        moonScreenCoord = { x: mx, y: my };
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.5)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(coords.earth.x, coords.earth.y, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#CBD5E1';
        ctx.beginPath();
        ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Real Heliocentric Predicted Trajectory when in Sun SOI
      if (flightState.soiBody === 'sun' && trajectory.points.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        trajectory.points.forEach((pt, idx) => {
          const sx = cx + pt.x * pxPerSunMeter;
          const sy = cy - pt.y * pxPerSunMeter;
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Real Spacecraft Marker on Solar Transfer Map
      let shipSunX = flightState.posX;
      let shipSunY = flightState.posY;
      if (flightState.soiBody !== 'sun') {
        const host = getPlanetHeliocentricState(flightState.soiBody, flightState.missionElapsedSec);
        shipSunX = host.x + flightState.posX;
        shipSunY = host.y + flightState.posY;
      }
      const shipPxX = cx + shipSunX * pxPerSunMeter;
      const shipPxY = cy - shipSunY * pxPerSunMeter;

      if (flightState.soiBody === 'sun') {
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(shipPxX, shipPxY, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#22D3EE';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const host = flightState.soiBody === 'moon' ? moonScreenCoord : coords[flightState.soiBody];
        if (host) {
          ctx.strokeStyle = '#22D3EE';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(host.x, host.y, 13, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [flightState, mission, trajectory, mapScope, zoom]);

  return (
    <div data-testid="orbital-map-2d" className="relative w-full h-full bg-[#050811] select-none">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Map Scope & Zoom Controls */}
      <div className="absolute top-20 left-4 flex items-center gap-2 bg-[#0B111E]/95 border border-slate-700/80 rounded-lg p-1.5 shadow-xl">
        <button
          type="button"
          onClick={() => setMapScope('local')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            mapScope === 'local'
              ? 'bg-cyan-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Orbit className="w-3.5 h-3.5" />
          Local SOI Orbit
        </button>
        <button
          type="button"
          onClick={() => setMapScope('solar')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            mapScope === 'solar'
              ? 'bg-cyan-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Solar Transfer Map
        </button>
        <div className="w-px h-5 bg-slate-700 mx-1" />
        <button
          type="button"
          aria-label="Zoom out 2D map"
          onClick={() => setZoom((z) => Math.max(0.25, Number((z * 0.75).toFixed(2))))}
          className="p-1.5 rounded text-slate-300 hover:bg-slate-800"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Zoom in 2D map"
          onClick={() => setZoom((z) => Math.min(4.0, Number((z * 1.35).toFixed(2))))}
          className="p-1.5 rounded text-slate-300 hover:bg-slate-800"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Exact Transfer Window Day, Time & Target Entry Orbit Card */}
      <div className="absolute top-20 right-4 w-80 bg-[#0B111E]/95 border border-slate-700/80 rounded-xl p-3.5 shadow-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
            Orbital Flight Computer
          </span>
          <span className="text-xs font-mono text-slate-300 tabular-nums">
            Day {flightState.missionDays.toFixed(2)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] font-mono text-slate-400">APOAPSIS (Ap)</div>
            <div className="font-mono font-semibold text-cyan-300 tabular-nums">
              {trajectory.isEscaping ? 'ESCAPE' : `${Math.round(trajectory.apoapsisKm)} km`}
            </div>
          </div>
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] font-mono text-slate-400">PERIAPSIS (Pe)</div>
            <div className="font-mono font-semibold text-amber-300 tabular-nums">
              {Math.round(trajectory.periapsisKm)} km
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-2.5 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Transfer Window:</span>
            <span className="font-mono text-slate-100">
              Day {mission.transferWindow.optimalDay} · {mission.transferWindow.optimalTimeUtc}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Phase Angle:</span>
            <span className="font-mono text-slate-100">
              {mission.transferWindow.phaseAngleDeg}°
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Target Entry Orbit:</span>
            <span className="font-mono text-emerald-400">
              {mission.transferWindow.entryOrbitKm} km ({mission.targetBody.toUpperCase()})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Throttle Burn Δv Preview:</span>
            <span className="font-mono text-amber-400">
              +{Math.round(trajectory.estimatedBurnDeltaV)} m/s @ {Math.round(flightState.throttle * 100)}%
            </span>
          </div>
        </div>

        {flightState.activeManeuver ? (
          <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-cyan-200 font-semibold">
              <span>{flightState.activeManeuver.label}</span>
              <span className="uppercase text-[10px] text-amber-300">
                {flightState.activeManeuver.phase.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Target:</span>
              <span className="text-white">{PLANETS[flightState.activeManeuver.targetBody].name}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Distance:</span>
              <span className="text-cyan-300 tabular-nums">
                {flightState.activeManeuver.distanceRemainingMeters >= 1_000_000
                  ? `${(flightState.activeManeuver.distanceRemainingMeters / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km`
                  : `${(flightState.activeManeuver.distanceRemainingMeters / 1000).toFixed(1)} km`}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>ETA:</span>
              <span className="text-amber-300 tabular-nums">
                {flightState.activeManeuver.etaSeconds >= 86400
                  ? `${(flightState.activeManeuver.etaSeconds / 86400).toFixed(2)} d`
                  : flightState.activeManeuver.etaSeconds >= 3600
                    ? `${(flightState.activeManeuver.etaSeconds / 3600).toFixed(1)} h`
                    : `${Math.ceil(flightState.activeManeuver.etaSeconds)} s`}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Δv Rem / Burn / Fuel:</span>
              <span className="text-emerald-300 tabular-nums">
                {Math.round(flightState.activeManeuver.remainingDeltaV)} m/s ·{' '}
                {flightState.activeManeuver.estimatedBurnSec.toFixed(0)}s ·{' '}
                {Math.round(flightState.activeManeuver.estimatedFuelKg)} kg
              </span>
            </div>
            {onToggleAutoWarp &&
              (flightState.activeManeuver.phase === 'coasting_to_burn' ||
                flightState.activeManeuver.phase === 'coasting_to_target' ||
                flightState.activeManeuver.phase === 'capture_coast') && (
                <button
                  type="button"
                  onClick={onToggleAutoWarp}
                  className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md text-xs font-semibold transition-colors ${
                    flightState.activeManeuver.autoWarpToArrival
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  <FastForward className="w-3.5 h-3.5" />
                  {flightState.activeManeuver.autoWarpToArrival
                    ? 'Warping (Auto-Stop at Event)…'
                    : flightState.activeManeuver.phase === 'coasting_to_burn'
                      ? 'Warp to Transfer Burn'
                      : 'Warp to Arrival'}
                </button>
              )}
          </div>
        ) : (
          <>
            {flightState.soiBody !== 'sun' &&
              flightState.soiBody !== mission.targetBody &&
              mission.targetBody !== 'earth' && (() => {
                const plan = computeTransferPlan(flightState, parts, nextHopBody);
                const distEta = getShipTargetDistanceAndEta(flightState, nextHopBody);
                return (
                  <div className="space-y-1.5">
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-mono space-y-0.5">
                      <div className="text-[10px] text-cyan-400 uppercase">
                        Transfer Burn · {PLANETS[nextHopBody].name}
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Δv Needed:</span>
                        <span className="text-amber-300">{Math.round(plan.requiredDeltaV)} m/s</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Burn Time / Fuel:</span>
                        <span className="text-cyan-200">
                          {plan.estimatedBurnSec.toFixed(1)}s · {Math.round(plan.estimatedFuelKg)} kg
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Distance:</span>
                        <span>{Math.round(distEta.distanceMeters / 1000).toLocaleString()} km</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!canTransferNow}
                      onClick={() => onExecuteTransfer(nextHopBody)}
                      className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                        canTransferNow
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {canTransferNow ? <Sparkles className="w-3.5 h-3.5" /> : <Rocket className="w-3.5 h-3.5" />}
                      {canTransferNow
                        ? flightState.soiBody === 'moon'
                          ? `Launch Moon Orbit → ${PLANETS[mission.targetBody].name}`
                          : nextHopBody === 'moon'
                            ? 'Travel to Moon’s Orbit (TLI)'
                            : `Travel to ${PLANETS[mission.targetBody].name}`
                        : `Clear ${(planet.atmosphereHeightMeters / 1000).toFixed(0)} km Atmo to Travel`}
                    </button>
                  </div>
                );
              })()}

            {canDeorbitAtTarget && onDeorbitBurn && (
              <button
                type="button"
                onClick={onDeorbitBurn}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Deorbit &amp; Descend to {planet.name}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

