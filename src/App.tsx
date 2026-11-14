import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttitudeDial } from './components/AttitudeDial';
import { FlightCameraMode, FlightViewport3D } from './components/FlightViewport3D';
import { MissionControlModal } from './components/MissionControlModal';
import { MissionLogSidebar } from './components/MissionLogSidebar';
import { OrbitalMap2D } from './components/OrbitalMap2D';
import { PartsDrawer } from './components/PartsDrawer';
import { TitleBackground3D } from './components/TitleBackground3D';
import { TutorialOverlay } from './components/TutorialOverlay';
import { computeSymmetryPlacements, VabViewport3D } from './components/VabViewport3D';
import { soundEngine } from './game/audio';
import { MISSIONS, MISSIONS_BY_ID } from './game/missions';
import { PARTS_BY_ID } from './game/partsCatalog';
import {
  calculateCashBack,
  cancelActiveManeuver,
  checkPlacementCollision,
  circularizeCurrentOrbit,
  commandFlightAttitude,
  computeTransferPlan,
  createInitialFlightState,
  deployNextStage,
  evaluateRocketEngineering,
  executeDeorbitBurn,
  getLocalHorizonBasis,
  getReferenceVelocityWorld,
  getRocketForwardWorld,
  getShipTargetDistanceAndEta,
  normalizeAngle360,
  predictTrajectory,
  snapPositionToNearestSocket,
  startTransferTransit,
  stepFlightPhysics,
  toggleAutoWarpToArrival,
  toggleEngineIgnition,
  toggleLandingLegs,
  toggleParachute
} from './game/physics';
import { getBodyConfig, PLANETS } from './game/planets';
import { FlightState, PlacedPart, PlanetId } from './game/types';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Compass,
  FastForward,
  Flame,
  HelpCircle,
  Layers,
  Map as MapIcon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Rocket,
  ShieldAlert,
  Trash2,
  Umbrella,
  Volume2,
  VolumeX,
  Wrench
} from 'lucide-react';

type ScreenState = 'title' | 'vab' | 'flight';

let nextInstanceSeq = 1;
function instantiateBlueprint(missionId: string): PlacedPart[] {
  const mission = MISSIONS_BY_ID[missionId] ?? MISSIONS[0];
  return mission.starterBlueprint.map((item) => ({
    ...item,
    instanceId: `part-${nextInstanceSeq++}`
  }));
}

const DEFAULT_MISSION = MISSIONS_BY_ID['artemis-mars-2026'] ?? MISSIONS[0];

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screen, setScreen] = useState<ScreenState>(autostart ? 'vab' : 'title');
  const [selectedMissionId, setSelectedMissionId] = useState<string>(DEFAULT_MISSION.id);
  const [completedMissionIds, setCompletedMissionIds] = useState<string[]>([]);
  const [showMissionSelectorModal, setShowMissionSelectorModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // VAB State
  const [parts, setParts] = useState<PlacedPart[]>(() => instantiateBlueprint(DEFAULT_MISSION.id));
  const [spentBudget, setSpentBudget] = useState<number>(() =>
    DEFAULT_MISSION.starterBlueprint.reduce((acc, p) => acc + (PARTS_BY_ID[p.partId]?.cost ?? 0), 0)
  );
  const [cashbackEarned, setCashbackEarned] = useState<number>(0);
  const [partsDrawerOpen, setPartsDrawerOpen] = useState<boolean>(false);
  const [draggingPartId, setDraggingPartId] = useState<string | null>(null);
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [dragValid, setDragValid] = useState<boolean>(true);
  const [vabDepthZ, setVabDepthZ] = useState<number>(0);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number; z: number }>({
    x: 0,
    y: 0,
    z: 0
  });
  const [vabBannerMsg, setVabBannerMsg] = useState<string | null>(null);
  const [lastCashbackMsg, setLastCashbackMsg] = useState<string | null>(null);
  const [symmetryCount, setSymmetryCount] = useState<1 | 2 | 4>(1);
  const [showComCot, setShowComCot] = useState<boolean>(true);
  const [showSfsGuide, setShowSfsGuide] = useState<boolean>(true);

  // Flight State
  const [flightViewMode, setFlightViewMode] = useState<'3d' | '2d'>('3d');
  const [flightCameraMode, setFlightCameraMode] = useState<FlightCameraMode>('chase');
  const [showOutcomeModal, setShowOutcomeModal] = useState<boolean>(false);
  const [flightState, setFlightState] = useState<FlightState>(() =>
    createInitialFlightState(instantiateBlueprint(DEFAULT_MISSION.id), DEFAULT_MISSION)
  );

  const mission = MISSIONS_BY_ID[selectedMissionId] ?? DEFAULT_MISSION;
  const engineering = useMemo(
    () => evaluateRocketEngineering(parts, mission, cashbackEarned, spentBudget),
    [parts, mission, cashbackEarned, spentBudget]
  );

  const trajectory = useMemo(
    () => predictTrajectory(flightState, flightState.throttle, 350),
    [flightState]
  );

  // Sync document.body.dataset.state for testability & game shell parity
  useEffect(() => {
    if (screen === 'title') {
      document.body.dataset.state = 'title';
    } else if (isPaused) {
      document.body.dataset.state = 'paused';
    } else if (
      screen === 'flight' &&
      (flightState.phase === 'crashed' || flightState.phase === 'mission_complete')
    ) {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = 'playing';
    }
  }, [screen, isPaused, flightState.phase]);

  // Mark mission complete, trigger crash/touchdown SFX, and briefly showcase 3D impact/dust
  useEffect(() => {
    if (flightState.phase === 'landed') {
      soundEngine.playTouchdown();
      setShowOutcomeModal(false);
      return;
    }
    if (flightState.phase === 'mission_complete') {
      soundEngine.stopAllLoops();
      if (flightState.altitudeMeters < 50) {
        soundEngine.playTouchdown();
      }
      soundEngine.playSuccess();
      setCompletedMissionIds((prev) =>
        prev.includes(mission.id) ? prev : [...prev, mission.id]
      );
      if (flightState.altitudeMeters < 50) {
        const t = window.setTimeout(() => setShowOutcomeModal(true), 1350);
        return () => window.clearTimeout(t);
      }
      setShowOutcomeModal(true);
      return;
    }
    if (flightState.phase === 'crashed') {
      soundEngine.stopAllLoops();
      soundEngine.playCrash();
      const t = window.setTimeout(() => setShowOutcomeModal(true), 1350);
      return () => window.clearTimeout(t);
    }
    setShowOutcomeModal(false);
  }, [flightState.phase, flightState.altitudeMeters, mission.id]);

  // Clear banner messages softly
  useEffect(() => {
    if (!vabBannerMsg) return;
    const t = window.setTimeout(() => setVabBannerMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [vabBannerMsg]);

  useEffect(() => {
    if (!lastCashbackMsg) return;
    const t = window.setTimeout(() => setLastCashbackMsg(null), 3500);
    return () => window.clearTimeout(t);
  }, [lastCashbackMsg]);

  const loadMissionIntoVab = useCallback((missionId: string) => {
    const m = MISSIONS_BY_ID[missionId] ?? MISSIONS[0];
    const starter = instantiateBlueprint(m.id);
    const starterCost = starter.reduce(
      (acc, p) => acc + (PARTS_BY_ID[p.partId]?.cost ?? 0),
      0
    );
    setSelectedMissionId(m.id);
    setParts(starter);
    setSpentBudget(starterCost);
    setCashbackEarned(0);
    setSelectedInstanceId(null);
    setDraggingPartId(null);
    setDraggingInstanceId(null);
    setIsPaused(false);
    setScreen('vab');
    setShowMissionSelectorModal(false);
  }, []);

  // Enter / Space starts from Title screen
  useEffect(() => {
    if (screen !== 'title' || showTutorial) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadMissionIntoVab(selectedMissionId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, showTutorial, selectedMissionId, loadMissionIntoVab]);

  // VAB Handlers
  const handleStartDragNewPart = (partId: string) => {
    setDraggingPartId(partId);
    setDraggingInstanceId(null);
    setSelectedInstanceId(null);
  };

  const handleQuickAddPart = (partId: string) => {
    const def = PARTS_BY_ID[partId];
    if (!def) return;
    if (engineering.remainingBudget < def.cost) {
      soundEngine.playError();
      setVabBannerMsg(`Insufficient budget for ${def.name} ($${def.cost.toLocaleString()}k).`);
      return;
    }

    // Find highest Y in rocket to stack cleanly on top without intersection
    let topY = 0;
    for (const p of parts) {
      const pDef = PARTS_BY_ID[p.partId];
      if (!pDef) continue;
      topY = Math.max(topY, p.y + pDef.height / 2);
    }
    const targetY = topY + def.height / 2;
    const candidate: PlacedPart = {
      instanceId: `part-${nextInstanceSeq++}`,
      partId,
      x: 0,
      y: targetY,
      z: 0,
      stage: parts.length > 0 ? Math.max(...parts.map((p) => p.stage)) : 0,
      rotationDeg: 0
    };
    const collision = checkPlacementCollision(candidate, parts);
    if (collision.collides) {
      candidate.x = def.width + 0.4;
    }

    setParts((prev) => [...prev, candidate]);
    setSpentBudget((prev) => prev + def.cost);
    setSelectedInstanceId(candidate.instanceId);
    soundEngine.playSnap();
  };

  const handleDoubleTapPart = (instanceId: string) => {
    const target = parts.find((p) => p.instanceId === instanceId);
    if (!target) return;
    setDraggingPartId(target.partId);
    setDraggingInstanceId(target.instanceId);
    setSelectedInstanceId(null);
    setVabBannerMsg('Component detached! Click on the 3D bay to place it, or drop in the 20% Cash Back Bin.');
  };

  const handlePlaceOrMovePart = (x: number, y: number, z: number) => {
    if (!draggingPartId) return;
    const def = PARTS_BY_ID[draggingPartId];
    if (!def) return;

    if (draggingInstanceId) {
      // Repositioning an already-owned part
      const existing = parts.find((p) => p.instanceId === draggingInstanceId);
      if (!existing) return;
      const updated: PlacedPart = { ...existing, x, y, z };
      const col = checkPlacementCollision(updated, parts, draggingInstanceId);
      if (col.collides) {
        soundEngine.playError();
        setVabBannerMsg('Hitbox collision! Parts cannot intersect each other.');
        return;
      }
      setParts((prev) => prev.map((p) => (p.instanceId === draggingInstanceId ? updated : p)));
      setSelectedInstanceId(updated.instanceId);
      setDraggingPartId(null);
      setDraggingInstanceId(null);
      soundEngine.playSnap();
    } else {
      // Placing brand-new part(s) with optional 1x / 2x / 4x symmetry
      const snapped = snapPositionToNearestSocket(def, x, y, z, parts);
      const placements = computeSymmetryPlacements(snapped.x, snapped.y, snapped.z, 0, symmetryCount);
      const totalCost = def.cost * placements.length;
      if (engineering.remainingBudget < totalCost) {
        soundEngine.playError();
        setVabBannerMsg(`Over budget! Need $${totalCost.toLocaleString()}k for ${placements.length}x ${def.name}.`);
        setDraggingPartId(null);
        return;
      }
      const newParts: PlacedPart[] = [];
      for (const pl of placements) {
        const candidate: PlacedPart = {
          instanceId: `part-${nextInstanceSeq++}`,
          partId: draggingPartId,
          x: pl.x,
          y: pl.y,
          z: pl.z,
          stage: parts.length > 0 ? parts[parts.length - 1].stage : 0,
          rotationDeg: pl.rotationDeg
        };
        const col = checkPlacementCollision(candidate, [...parts, ...newParts]);
        if (col.collides) {
          soundEngine.playError();
          setVabBannerMsg('Hitbox collision! Move cursor to clear adjacent parts.');
          return;
        }
        newParts.push(candidate);
      }
      setParts((prev) => [...prev, ...newParts]);
      setSpentBudget((prev) => prev + totalCost);
      setSelectedInstanceId(newParts[0].instanceId);
      setDraggingPartId(null);
      soundEngine.playSnap();
    }
  };

  const handleMovePartDirect = (instanceId: string, x: number, y: number, z: number) => {
    const existing = parts.find((p) => p.instanceId === instanceId);
    if (!existing) return;
    const updated: PlacedPart = { ...existing, x, y, z };
    const col = checkPlacementCollision(updated, parts, instanceId);
    if (col.collides) return;
    setParts((prev) => prev.map((p) => (p.instanceId === instanceId ? updated : p)));
  };

  const handleDropInRecycleBin = () => {
    const targetId = draggingInstanceId ?? selectedInstanceId;
    if (!targetId) {
      setDraggingPartId(null);
      return;
    }
    const target = parts.find((p) => p.instanceId === targetId);
    if (!target) return;
    const refund = calculateCashBack(target.partId);
    setParts((prev) => prev.filter((p) => p.instanceId !== targetId));
    setCashbackEarned((prev) => prev + refund);
    setDraggingPartId(null);
    setDraggingInstanceId(null);
    setSelectedInstanceId(null);
    soundEngine.playCashback();
    setLastCashbackMsg(`+$${refund.toLocaleString()}k (20% Cash Back)`);
    setVabBannerMsg(`Recycled component for +$${refund.toLocaleString()}k (20% cash back)!`);
  };

  const handleLaunchFromVab = () => {
    if (!engineering.isReadyToLaunch) {
      soundEngine.playError();
      setVabBannerMsg(engineering.warnings[0] ?? 'Resolve engineering blockers before launch.');
      return;
    }
    const initial = createInitialFlightState(parts, mission);
    setFlightState(initial);
    setFlightViewMode('3d');
    setIsPaused(false);
    setScreen('flight');
  };

  // Flight Simulation Loop & Keyboard Input
  const keysRef = useRef<Set<string>>(new Set());
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const missionRef = useRef(mission);
  missionRef.current = mission;
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screen === 'flight') {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
          setIsPaused((p) => !p);
          return;
        }
        if (e.key.toLowerCase() === 'm') {
          setFlightViewMode((v) => (v === '3d' ? '2d' : '3d'));
          return;
        }
        if (e.key === ' ') {
          e.preventDefault();
          setFlightState((prev) => {
            if (prev.phase === 'prelaunch') {
              return prev.ignited ? prev : toggleEngineIgnition(prev);
            }
            if (prev.currentStage < prev.maxStage) {
              soundEngine.playStageSeparate();
              return deployNextStage(prev, partsRef.current);
            }
            return toggleEngineIgnition(prev);
          });
          return;
        }
        if (e.key.toLowerCase() === 'l') {
          setFlightState((prev) => toggleLandingLegs(prev));
          return;
        }
        if (e.key.toLowerCase() === 'c') {
          setFlightState((prev) => toggleParachute(prev));
          return;
        }
        if (
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight'
        ) {
          e.preventDefault();
        }
      }
      keysRef.current.add(e.key.toLowerCase());
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    const clearKeys = () => {
      keysRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'flight') {
      soundEngine.stopAllLoops();
      return;
    }

    let last = performance.now();
    let timerId = 0;

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!pausedRef.current) {
        const keys = keysRef.current;
        const pitchInput =
          (keys.has('w') || keys.has('arrowup') ? 1 : 0) -
          (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        const yawInput =
          (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
          (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        const rollInput = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
        const throttleDelta =
          (keys.has('shift') || keys.has('z') ? 0.55 : 0) -
          (keys.has('control') || keys.has('x') ? 0.55 : 0);

        setFlightState((prev) => {
          const nextThrottle = Math.max(0, Math.min(1, prev.throttle + throttleDelta * dt));
          let warpForTick = prev.timeWarp;
          const m = prev.activeManeuver;
          if (m?.autoWarpToArrival && dt > 0) {
            if (m.phase === 'coasting_to_burn') {
              const rem = Math.max(0, m.burnWindowElapsedSec - prev.missionElapsedSec - 10);
              const maxSafeWarp = Math.max(1, Math.floor(rem / dt));
              warpForTick = Math.max(1, Math.min(1000, maxSafeWarp));
            } else if (m.phase === 'capture_coast') {
              const rem = Math.max(0, m.etaSeconds - 22);
              const maxSafeWarp = Math.max(1, Math.floor(rem / dt));
              warpForTick = Math.max(1, Math.min(1000, maxSafeWarp));
            } else if (m.phase === 'coasting_to_target') {
              const info = getShipTargetDistanceAndEta(prev, m.targetBody);
              const rCur = Math.hypot(prev.posX, prev.posY, prev.posZ ?? 0);
              const targetSoi = PLANETS[m.targetBody].soiRadiusMeters;
              if (prev.soiBody === 'earth' && m.targetBody !== 'moon') {
                const margin = Math.max(0, PLANETS.earth.soiRadiusMeters * 1.02 - rCur);
                const maxSafe = Math.max(1, Math.floor((margin / Math.max(300, prev.speedMs) * 0.65) / dt));
                warpForTick = Math.max(1, Math.min(500, maxSafe));
              } else if (prev.soiBody === 'moon' && m.targetBody !== 'moon') {
                const margin = Math.max(0, PLANETS.moon.soiRadiusMeters * 1.02 - rCur);
                const maxSafe = Math.max(1, Math.floor((margin / Math.max(200, prev.speedMs) * 0.65) / dt));
                warpForTick = Math.max(1, Math.min(500, maxSafe));
              } else if (prev.soiBody === 'sun') {
                const margin = Math.max(0, info.distanceMeters - targetSoi * 1.12);
                const timeToMargin = margin / Math.max(500, prev.speedMs);
                const desired =
                  info.distanceMeters > targetSoi * 6
                    ? 60000
                    : info.distanceMeters > targetSoi * 2.5
                      ? 5000
                      : 500;
                const maxSafe = Math.max(1, Math.floor((timeToMargin * 0.65) / dt));
                warpForTick = Math.max(1, Math.min(desired, maxSafe));
              } else {
                const margin = Math.max(0, info.distanceMeters - targetSoi * 1.12);
                const timeToMargin = margin / Math.max(200, prev.speedMs);
                const desired = info.distanceMeters > targetSoi * 3 ? 2000 : 250;
                const maxSafe = Math.max(1, Math.floor((timeToMargin * 0.65) / dt));
                warpForTick = Math.max(1, Math.min(desired, maxSafe));
              }
            }
          }

          const updated = stepFlightPhysics(
            { ...prev, throttle: nextThrottle, timeWarp: warpForTick },
            partsRef.current,
            missionRef.current,
            dt,
            { pitchInput, yawInput, rollInput }
          );
          if (
            m?.autoWarpToArrival &&
            (!updated.activeManeuver || !updated.activeManeuver.autoWarpToArrival)
          ) {
            updated.timeWarp = 1;
          }
          soundEngine.updateEngineThrust(
            updated.throttle,
            updated.ignited && updated.remainingFuelKg > 0 && updated.currentThrustN > 0
          );
          return updated;
        });
      } else {
        soundEngine.stopAllLoops();
      }

      timerId = window.setTimeout(step, 50); // 20 Hz clean physics/UI sync
    };

    timerId = window.setTimeout(step, 50);
    return () => {
      window.clearTimeout(timerId);
      soundEngine.stopAllLoops();
    };
  }, [screen]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const selectedPart = parts.find((p) => p.instanceId === selectedInstanceId) ?? null;
  const selectedPartDef = selectedPart ? PARTS_BY_ID[selectedPart.partId] : null;
  const currentPlanet = getBodyConfig(flightState.soiBody);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07090E] text-slate-100">
      {/* ======================================================== */}
      {/* SCREEN 1: HOME / TITLE SCREEN WITH LIVE 3D ROCKET & EARTH */}
      {/* ======================================================== */}
      {screen === 'title' && (
        <>
          <TitleBackground3D />
          <MissionControlModal
            selectedMissionId={selectedMissionId}
            completedMissionIds={completedMissionIds}
            onSelectMission={setSelectedMissionId}
            onStartMission={loadMissionIntoVab}
            onOpenTutorial={() => setShowTutorial(true)}
          />
        </>
      )}

      {/* ======================================================== */}
      {/* SCREEN 2: 3D VEHICLE ASSEMBLY BUILDING (VAB) */}
      {/* ======================================================== */}
      {screen === 'vab' && (
        <div className="relative w-full h-full">
          <VabViewport3D
            parts={parts}
            draggingPartId={draggingPartId}
            draggingInstanceId={draggingInstanceId}
            selectedInstanceId={selectedInstanceId}
            depthOffsetZ={vabDepthZ}
            symmetryCount={symmetryCount}
            showComCot={showComCot}
            onSelectInstance={setSelectedInstanceId}
            onDoubleTapPart={handleDoubleTapPart}
            onPlaceOrMovePart={handlePlaceOrMovePart}
            onMovePartDirect={handleMovePartDirect}
            onDragPositionChange={(valid, x, y, z) => {
              setDragValid(valid);
              setDragCoords({ x, y, z });
            }}
          />

          {/* Top Engineering & Competing Demands Bar */}
          <header className="fixed top-0 left-0 right-0 z-30 h-16 px-4 bg-[#080D18]/95 border-b border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setShowMissionSelectorModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                <Compass className="w-4 h-4 text-cyan-400" />
                <span className="truncate max-w-[180px]">
                  {mission.year} {mission.name}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowTutorial(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 whitespace-nowrap shrink-0"
              >
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                Tutorial
              </button>
            </div>

            {/* Live Competing Constraints Metrics */}
            <div className="hidden xl:flex items-center gap-4 text-xs font-mono whitespace-nowrap">
              <div className="whitespace-nowrap">
                <span className="text-slate-400 mr-1">BUDGET</span>
                <span
                  className={`font-bold tabular-nums ${
                    engineering.remainingBudget >= 0 ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  ${engineering.remainingBudget.toLocaleString()}k
                </span>
              </div>
              <div className="whitespace-nowrap">
                <span className="text-slate-400 mr-1">MASS</span>
                <span className="text-white font-semibold tabular-nums">
                  {(engineering.totalMassKg / 1000).toFixed(1)} t
                </span>
              </div>
              <div className="whitespace-nowrap">
                <span className="text-slate-400 mr-1">TWR</span>
                <span
                  className={`font-semibold tabular-nums ${
                    engineering.launchTWR >= mission.requirements.minTWR
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {engineering.launchTWR.toFixed(2)}
                </span>
              </div>
              <div className="whitespace-nowrap">
                <span className="text-slate-400 mr-1">DELTA-V</span>
                <span
                  className={`font-semibold tabular-nums ${
                    engineering.estimatedDeltaV >= mission.requirements.minDeltaV
                      ? 'text-cyan-300'
                      : 'text-amber-300'
                  }`}
                >
                  {Math.round(engineering.estimatedDeltaV)} m/s
                </span>
              </div>
              <div className="whitespace-nowrap">
                <span className="text-slate-400 mr-1">POWER</span>
                <span
                  className={`font-semibold tabular-nums ${
                    engineering.netPowerW >= mission.requirements.minPowerBalanceW
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {engineering.netPowerW >= 0 ? `+${engineering.netPowerW}` : engineering.netPowerW} W
                </span>
              </div>
              <div className="whitespace-nowrap">
                <span className="text-slate-400 mr-1">COMMS</span>
                <span
                  className={`font-semibold tabular-nums ${
                    engineering.maxCommsAU >= mission.requirements.minCommsAU
                      ? 'text-cyan-300'
                      : 'text-rose-400'
                  }`}
                >
                  {engineering.maxCommsAU.toFixed(2)} AU
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => loadMissionIntoVab(mission.id)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 whitespace-nowrap"
              >
                Reset Starter
              </button>
              <button
                type="button"
                onClick={() => {
                  setParts([]);
                  setSpentBudget(0);
                  setCashbackEarned(0);
                  setSelectedInstanceId(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 whitespace-nowrap"
              >
                Clear Pad
              </button>
              <button
                type="button"
                data-testid="launch-pad-btn"
                onClick={handleLaunchFromVab}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-colors whitespace-nowrap"
              >
                <Rocket className="w-4 h-4" />
                Launch Pad
              </button>
            </div>
          </header>

          {/* Compact Collapsible Parts Box + Categorized Drawer + 20% Cash Back Bin */}
          <PartsDrawer
            isOpen={partsDrawerOpen}
            onToggleOpen={() => setPartsDrawerOpen((o) => !o)}
            onStartDragNewPart={handleStartDragNewPart}
            onQuickAddPart={handleQuickAddPart}
            draggingPartId={draggingPartId}
            draggingInstanceId={draggingInstanceId}
            onDropInRecycleBin={handleDropInRecycleBin}
            lastCashbackMsg={lastCashbackMsg}
          />

          {/* Right-Side Mission Trade-off Checklist & SFS2 Stage Stack */}
          <div className="fixed right-4 top-20 w-72 z-20 flex flex-col gap-2.5 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="bg-[#0B111E]/95 border border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                  Mission Engineering Check
                </span>
                {engineering.warnings.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="text-xs text-slate-300">
                Target: <strong className="text-white">{PLANETS[mission.targetBody].name}</strong> ·{' '}
                <span className="capitalize">{mission.objectiveType.replace('_', ' ')}</span>
              </div>
              {engineering.warnings.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300">
                  All spacecraft constraints nominal. Ready for Launch Pad.
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                  {engineering.warnings.map((w, idx) => (
                    <li
                      key={idx}
                      className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 leading-snug"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* SFS2 VAB Tools: Symmetry + CoM/CoT + Build Guide */}
            <div className="bg-[#0B111E]/95 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  SFS2 Assembly Tools
                </span>
                <button
                  type="button"
                  onClick={() => setShowSfsGuide((v) => !v)}
                  className="text-[11px] text-cyan-300 hover:underline"
                >
                  {showSfsGuide ? 'Hide Guide' : 'Show Guide'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-300">Symmetry:</span>
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 font-mono text-[11px]">
                  {([1, 2, 4] as const).map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSymmetryCount(sym)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        symmetryCount === sym
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {sym}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-300">CoM &amp; CoT Markers:</span>
                <button
                  type="button"
                  onClick={() => setShowComCot((v) => !v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                    showComCot
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {showComCot ? 'Visible' : 'Hidden'}
                </button>
              </div>

              {/* Compact SFS2 Stage Stack Summary */}
              <div className="pt-2 border-t border-slate-800 space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Stage Sequence
                </div>
                {[0, 1, 2].map((st) => {
                  const stageParts = parts.filter((p) => p.stage === st);
                  const stageEngines = stageParts.filter((p) => (PARTS_BY_ID[p.partId]?.thrustN ?? 0) > 0).length;
                  return (
                    <div
                      key={st}
                      className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded bg-slate-900/80 border border-slate-800"
                    >
                      <span className="text-slate-200">Stage {st + 1}</span>
                      <span className="text-slate-400">
                        {stageParts.length} parts · {stageEngines} eng
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Interactive SFS2 Rocket Tutorial Stepper */}
              {showSfsGuide && (
                <div className="pt-2 border-t border-slate-800 space-y-1 text-[11px]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                    Rocket Build Steps
                  </div>
                  {[
                    { label: 'Command Pod / Probe', ok: engineering.hasCommand },
                    { label: 'Booster Tank & Engine (TWR > 1)', ok: engineering.launchTWR >= 1.02 },
                    {
                      label: 'Multi-Stage Decoupler',
                      ok: parts.some((p) => PARTS_BY_ID[p.partId]?.isDecoupler)
                    },
                    { label: 'All Mission Systems Nominal', ok: engineering.warnings.length === 0 }
                  ].map((step, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className={step.ok ? 'text-emerald-300' : 'text-slate-400'}>
                        {i + 1}. {step.label}
                      </span>
                      <span className={step.ok ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {step.ok ? 'OK' : '…'}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 pt-1 leading-snug">
                    Click a part to slide its 3D X/Y/Z arrows, or double-tap to detach &amp; drag.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Active Dragging / Hitbox Collision Pill + 3D Depth Control */}
          {draggingPartId && (
            <div
              className={`fixed top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl border text-xs font-medium shadow-lg flex flex-wrap items-center gap-3 ${
                dragValid
                  ? 'bg-cyan-950/95 border-cyan-400 text-cyan-100'
                  : 'bg-rose-950/95 border-rose-500 text-rose-100'
              }`}
            >
              <span>
                {dragValid
                  ? `Place ${PARTS_BY_ID[draggingPartId]?.name} at (${dragCoords.x.toFixed(1)}, ${dragCoords.y.toFixed(1)}, ${dragCoords.z.toFixed(1)})`
                  : 'Hitbox intersection detected! Move to open space.'}
              </span>
              <div className="flex items-center gap-1 border-l border-white/20 pl-2.5 font-mono text-[11px]">
                <span className="text-slate-300">Z-Plane:</span>
                <button
                  type="button"
                  onClick={() => setVabDepthZ((z) => Math.max(-4, Number((z - 0.5).toFixed(1))))}
                  className="px-1.5 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-cyan-200"
                >
                  -Z
                </button>
                <button
                  type="button"
                  onClick={() => setVabDepthZ(0)}
                  className="px-1.5 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-white"
                >
                  {vabDepthZ.toFixed(1)}
                </button>
                <button
                  type="button"
                  onClick={() => setVabDepthZ((z) => Math.min(4, Number((z + 0.5).toFixed(1))))}
                  className="px-1.5 py-0.5 rounded bg-slate-900/90 hover:bg-slate-800 text-cyan-200"
                >
                  +Z
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraggingPartId(null);
                  setDraggingInstanceId(null);
                }}
                className="underline text-slate-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}

          {vabBannerMsg && (
            <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-slate-900/95 border border-amber-400/60 text-amber-200 text-xs shadow-xl">
              {vabBannerMsg}
            </div>
          )}

          {/* Bottom Inspector for Selected Attached Part */}
          {selectedPart && selectedPartDef && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3.5 px-4 py-2.5 rounded-xl bg-[#0B111E]/95 border border-slate-700 shadow-2xl">
              <div className="text-xs">
                <div className="font-semibold text-white">{selectedPartDef.name}</div>
                <div className="text-[11px] font-mono text-slate-400">
                  Stage {selectedPart.stage + 1} · Rot {selectedPart.rotationDeg}° · Pos (
                  {selectedPart.x.toFixed(1)}, {selectedPart.y.toFixed(1)}, {selectedPart.z.toFixed(1)})
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 mr-1">Stage:</span>
                {[0, 1, 2].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      setParts((prev) =>
                        prev.map((p) =>
                          p.instanceId === selectedPart.instanceId ? { ...p, stage: st } : p
                        )
                      )
                    }
                    className={`px-2 py-1 rounded text-xs font-mono ${
                      selectedPart.stage === st
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {st + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const rotated: PlacedPart = {
                    ...selectedPart,
                    rotationDeg: (selectedPart.rotationDeg + 90) % 360
                  };
                  const col = checkPlacementCollision(rotated, parts, selectedPart.instanceId);
                  if (col.collides) {
                    soundEngine.playError();
                    setVabBannerMsg('Cannot rotate 90° here — rotated hitbox intersects adjacent part.');
                    return;
                  }
                  setParts((prev) =>
                    prev.map((p) => (p.instanceId === selectedPart.instanceId ? rotated : p))
                  );
                  soundEngine.playSnap();
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
              >
                <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => handleDoubleTapPart(selectedPart.instanceId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300"
              >
                Detach &amp; Move
              </button>
              <button
                type="button"
                onClick={handleDropInRecycleBin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs text-amber-300 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bin (+20%)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SCREEN 3: 3D FLIGHT SIMULATOR & 2D TRAJECTORY MAP */}
      {/* ======================================================== */}
      {screen === 'flight' && (
        <div className="relative w-full h-full">
          {flightViewMode === '3d' ? (
            <FlightViewport3D
              flightState={flightState}
              parts={parts}
              trajectory={trajectory}
              cameraMode={flightCameraMode}
            />
          ) : (
            <OrbitalMap2D
              flightState={flightState}
              mission={mission}
              trajectory={trajectory}
              parts={parts}
              onExecuteTransfer={(targetOverride?: PlanetId) => {
                soundEngine.playStageSeparate();
                setFlightState((prev) =>
                  startTransferTransit(prev, parts, mission, targetOverride)
                );
              }}
              onDeorbitBurn={() => {
                soundEngine.playStageSeparate();
                setFlightState((prev) => executeDeorbitBurn(prev, parts));
              }}
              onToggleAutoWarp={() =>
                setFlightState((prev) => toggleAutoWarpToArrival(prev))
              }
            />
          )}

          {/* Top Flight Telemetry Ribbon */}
          <header className="fixed top-0 left-0 right-0 z-30 h-16 px-4 bg-[#080D18]/95 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.stopAllLoops();
                  setScreen('vab');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 whitespace-nowrap"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                VAB Builder
              </button>
              <button
                type="button"
                data-testid="toggle-map-btn"
                onClick={() => setFlightViewMode((m) => (m === '3d' ? '2d' : '3d'))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  flightViewMode === '2d'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                {flightViewMode === '3d' ? '2D Trajectory Map [M]' : '3D Flight View [M]'}
              </button>
              {flightViewMode === '3d' && (
                <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px] font-mono">
                  {(['chase', 'wide', 'pad'] as const).map((cm) => (
                    <button
                      key={cm}
                      type="button"
                      onClick={() => setFlightCameraMode(cm)}
                      className={`px-2 py-1 rounded capitalize transition-colors ${
                        flightCameraMode === cm
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {cm}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Live Flight Metrics */}
            <div className="flex items-center gap-4 md:gap-6 text-xs font-mono whitespace-nowrap">
              <div className="whitespace-nowrap">
                <div className="text-[10px] text-slate-400">SOI BODY</div>
                <div className="text-white font-semibold">{currentPlanet.name.toUpperCase()}</div>
              </div>
              <div className="whitespace-nowrap">
                <div className="text-[10px] text-slate-400">ALTITUDE</div>
                <div className="text-cyan-300 font-semibold tabular-nums">
                  {(flightState.altitudeMeters / 1000).toFixed(1)} km
                </div>
              </div>
              <div className="whitespace-nowrap">
                <div className="text-[10px] text-slate-400">ATMO ENDS</div>
                <div
                  className={`font-semibold tabular-nums ${
                    currentPlanet.atmosphereHeightMeters === 0 ||
                    flightState.altitudeMeters >= currentPlanet.atmosphereHeightMeters
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {currentPlanet.atmosphereHeightMeters === 0
                    ? 'VACUUM'
                    : flightState.altitudeMeters >= currentPlanet.atmosphereHeightMeters
                      ? 'SPACE'
                      : `${(currentPlanet.atmosphereHeightMeters / 1000).toFixed(0)} km`}
                </div>
              </div>
              <div className="hidden lg:block whitespace-nowrap">
                <div className="text-[10px] text-slate-400">ATMO LAYER</div>
                <div className="text-cyan-200 font-semibold truncate max-w-[165px]">
                  {flightState.atmosphereLayerName}
                </div>
              </div>
              <div className="whitespace-nowrap">
                <div className="text-[10px] text-slate-400">VELOCITY</div>
                <div className="text-white font-semibold tabular-nums">
                  {Math.round(flightState.speedMs)} m/s
                </div>
              </div>
              <div className="whitespace-nowrap">
                <div className="text-[10px] text-slate-400">MISSION DAYS</div>
                <div className="text-amber-400 font-semibold tabular-nums">
                  Day {flightState.missionDays.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Time Warp & Utility Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                {[1, 10, 100, 1000].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() =>
                      setFlightState((p) => ({
                        ...p,
                        timeWarp: w,
                        activeManeuver: p.activeManeuver
                          ? { ...p.activeManeuver, autoWarpToArrival: false }
                          : null
                      }))
                    }
                    className={`px-2 py-1 rounded text-[11px] font-mono ${
                      flightState.timeWarp === w
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {w}x
                  </button>
                ))}
              </div>
              {flightState.activeManeuver &&
                (flightState.activeManeuver.phase === 'coasting_to_burn' ||
                  flightState.activeManeuver.phase === 'coasting_to_target' ||
                  flightState.activeManeuver.phase === 'capture_coast') && (
                  <button
                    type="button"
                    data-testid="warp-to-arrival-btn"
                    onClick={() => setFlightState((p) => toggleAutoWarpToArrival(p))}
                    className={`hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono whitespace-nowrap ${
                      flightState.activeManeuver.autoWarpToArrival
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-cyan-300'
                    }`}
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    {flightState.activeManeuver.autoWarpToArrival
                      ? 'Warping (1x)'
                      : flightState.activeManeuver.phase === 'coasting_to_burn'
                        ? 'Warp to Transfer'
                        : 'Warp to Arrival'}
                  </button>
                )}
              <button
                type="button"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  toggleMute();
                }}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                aria-label="Pause simulation"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setIsPaused((p) => !p);
                }}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300"
              >
                <Pause className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Compact Status Message Banner + Live SFS2 Flight Tutorial Hint */}
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-1.5">
            <div className="px-4 py-1.5 rounded-lg bg-[#0B111E]/90 border border-slate-700/80 text-xs text-slate-200 shadow-lg whitespace-nowrap">
              {flightState.statusMessage}
            </div>
            {flightViewMode === '3d' && flightState.phase !== 'crashed' && flightState.phase !== 'mission_complete' && (
              <div className="px-3 py-1 rounded-md bg-[#080D18]/85 border border-cyan-500/30 text-[11px] text-cyan-200 whitespace-nowrap">
                {flightState.activeManeuver
                  ? `${flightState.activeManeuver.label} (${PLANETS[flightState.activeManeuver.targetBody].name}) · ${
                      flightState.activeManeuver.remainingDeltaV > 2
                        ? `Δv ${Math.round(flightState.activeManeuver.remainingDeltaV)} m/s`
                        : `Dist ${(getShipTargetDistanceAndEta(flightState, flightState.activeManeuver.targetBody).distanceMeters / 1000).toFixed(0)} km`
                    }`
                  : flightState.phase === 'prelaunch'
                    ? 'Flight Guide: Set Throttle 100%, then press SPACE or Ignite to release launch clamps.'
                    : flightState.soiBody === 'earth' && flightState.altitudeMeters < 3000
                      ? 'Flight Guide: Climb vertically above 3 km clouds, then pitch +15° to +45° for Gravity Turn.'
                      : flightState.soiBody === 'earth' && flightState.altitudeMeters < currentPlanet.atmosphereHeightMeters
                        ? 'Flight Guide: Keep climbing past 100 km atmosphere; press SPACE to stage when lower fuel empties.'
                        : flightState.soiBody === 'earth'
                          ? 'Flight Guide: In Earth space! Lock Earth Orbit or click Travel to Moon’s Orbit.'
                          : flightState.soiBody === 'moon' && mission.targetBody !== 'moon'
                            ? `Flight Guide: Orbiting Moon! Click Travel to ${PLANETS[mission.targetBody].name} Orbit (TMI).`
                            : flightState.verticalSpeedMs < -80 || flightState.phase === 'reentry'
                              ? `Flight Guide: Descending to ${currentPlanet.name}! Deploy Legs [L]${currentPlanet.atmosphereHeightMeters > 0 ? ' & Chute [C]' : ''}, point 0° UP & retro-burn <18 m/s.`
                              : `Flight Guide: At ${currentPlanet.name}! Click Deorbit & Land, then deploy Legs [L] & retro-thrust.`}
              </div>
            )}
          </div>

          {/* Left Compact Telemetry Readout (3D mode only so 2D Map stays clear) */}
          {flightViewMode === '3d' && (
            <div className="fixed left-4 top-20 z-20 w-60 bg-[#0B111E]/90 border border-slate-800 rounded-xl p-3 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Vert Vel:</span>
                <span className="text-white tabular-nums">
                  {flightState.verticalSpeedMs.toFixed(1)} m/s
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Horiz Vel:</span>
                <span className="text-cyan-300 tabular-nums">
                  {flightState.horizontalSpeedMs.toFixed(1)} m/s
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Apoapsis:</span>
                <span className="text-cyan-300 tabular-nums">
                  {trajectory.isEscaping ? 'ESCAPE' : `${Math.round(trajectory.apoapsisKm)} km`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Periapsis:</span>
                <span className="text-amber-300 tabular-nums">
                  {Math.round(trajectory.periapsisKm)} km
                </span>
              </div>
              <div className="pt-1 border-t border-slate-800">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Stage {flightState.currentStage + 1} Fuel</span>
                  <span className="text-amber-300">
                    {flightState.initialFuelKg > 0
                      ? `${Math.round((flightState.remainingFuelKg / flightState.initialFuelKg) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{
                      width: `${
                        flightState.initialFuelKg > 0
                          ? (flightState.remainingFuelKg / flightState.initialFuelKg) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>
              {flightState.heatLoad > 5 && (
                <div className="pt-1">
                  <div className="flex justify-between text-[11px] mb-1 text-orange-400">
                    <span>Aero Heating</span>
                    <span>{Math.round(flightState.heatLoad)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-500"
                      style={{ width: `${Math.min(100, flightState.heatLoad)}%` }}
                    />
                  </div>
                </div>
              )}
              {flightState.phase !== 'prelaunch' &&
                flightState.altitudeMeters < 30_000 &&
                (flightState.verticalSpeedMs < -0.8 || flightState.phase === 'crashed') && (() => {
                const basis = getLocalHorizonBasis(
                  flightState.posX,
                  flightState.posY,
                  flightState.posZ ?? 0
                );
                const rotX = basis.E[0] * currentPlanet.rotationVelocityEquatorial;
                const rotY = basis.E[1] * currentPlanet.rotationVelocityEquatorial;
                const rotZ = basis.E[2] * currentPlanet.rotationVelocityEquatorial;
                const surfRelSpeed = Math.hypot(
                  flightState.velX - rotX,
                  flightState.velY - rotY,
                  (flightState.velZ ?? 0) - rotZ
                );
                const fwd = getRocketForwardWorld(flightState);
                const dot = Math.max(
                  -1,
                  Math.min(1, fwd[0] * basis.U[0] + fwd[1] * basis.U[1] + fwd[2] * basis.U[2])
                );
                const tiltDeg = (Math.acos(dot) * 180) / Math.PI;
                const safeMaxSpeed = flightState.legsDeployed ? 18 : 8;
                const safeMaxTilt = flightState.legsDeployed ? 28 : 14;
                const safeApproach = surfRelSpeed <= safeMaxSpeed && tiltDeg <= safeMaxTilt;
                return (
                  <div className="pt-2 border-t border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[10px] tracking-wider uppercase">
                      <span className="text-slate-400">Landing Assist</span>
                      <span
                        className={
                          flightState.phase === 'crashed'
                            ? 'text-rose-400 font-bold'
                            : safeApproach
                              ? 'text-emerald-400 font-bold'
                              : 'text-rose-400 font-bold'
                        }
                      >
                        {flightState.phase === 'crashed'
                          ? 'CRASHED'
                          : safeApproach
                            ? 'SOFT SAFE'
                            : 'CRASH RISK'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Surf Speed:</span>
                      <span
                        className={`tabular-nums ${
                          surfRelSpeed <= safeMaxSpeed ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {surfRelSpeed.toFixed(1)} / {safeMaxSpeed} m/s
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Tilt Angle:</span>
                      <span
                        className={`tabular-nums ${
                          tiltDeg <= safeMaxTilt ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {tiltDeg.toFixed(0)}° / {safeMaxTilt}°
                      </span>
                    </div>
                  </div>
                );
              })()}
              {flightState.missionRoute.length > 1 && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <div className="text-[10px] tracking-wider uppercase text-cyan-400">
                    Mission Flight Plan
                  </div>
                  <div className="space-y-1 text-[11px]">
                    {(() => {
                      const hasMoon = flightState.missionRoute.includes('moon') && mission.targetBody !== 'moon';
                      const targetName = PLANETS[mission.targetBody].name;
                      const steps = [
                        { label: '1. Earth Orbit', done: flightState.earthOrbitCompleted },
                        ...(hasMoon
                          ? [{ label: '2. Moon’s Orbit', done: flightState.moonOrbitCompleted }]
                          : []),
                        {
                          label: `${hasMoon ? '3' : '2'}. ${targetName} Orbit`,
                          done: flightState.soiBody === mission.targetBody
                        },
                        ...(mission.objectiveType === 'soft_landing' ||
                        mission.objectiveType === 'sample_return'
                          ? [
                              {
                                label: `${hasMoon ? '4' : '3'}. ${targetName} Surface`,
                                done:
                                  flightState.phase === 'mission_complete' &&
                                  flightState.soiBody === mission.targetBody
                              }
                            ]
                          : [])
                      ];
                      return steps.map((st, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className={st.done ? 'text-emerald-300' : 'text-slate-300'}>
                            {st.label}
                          </span>
                          <span className={st.done ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                            {st.done ? 'OK' : '…'}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
              {flightState.remainingFuelKg <= 5 &&
                flightState.currentStage < flightState.maxStage &&
                !flightState.activeManeuver && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playStageSeparate();
                      setFlightState((p) => deployNextStage(p, parts));
                    }}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-sans font-bold text-xs transition-colors"
                  >
                    Stage {flightState.currentStage + 2} Ready — Separate [SPACE]
                  </button>
                )}

              {flightState.activeManeuver ? (() => {
                const m = flightState.activeManeuver;
                const distEta = getShipTargetDistanceAndEta(flightState, m.targetBody);
                const distKm = distEta.distanceMeters / 1000;
                const distLabel =
                  distKm >= 100_000
                    ? `${(distKm / 1000).toFixed(1)}k km`
                    : `${Math.round(distKm).toLocaleString()} km`;
                const etaSec = m.phase === 'coasting_to_target' ? distEta.etaSeconds : m.etaSeconds;
                const etaLabel =
                  etaSec > 86400
                    ? `${(etaSec / 86400).toFixed(2)} d`
                    : etaSec > 180
                      ? `${Math.round(etaSec / 60)} min`
                      : `${Math.round(etaSec)} s`;
                const canWarp =
                  m.phase === 'coasting_to_burn' ||
                  m.phase === 'coasting_to_target' ||
                  m.phase === 'capture_coast';
                return (
                  <div
                    data-testid="travel-progress-card"
                    className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 space-y-1.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between text-cyan-200 font-semibold">
                      <span className="truncate">{m.label}</span>
                      <span className="text-amber-300 uppercase text-[10px]">{m.phase.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Target:</span>
                      <span className="text-white font-semibold">{PLANETS[m.targetBody].name}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Dist Rem:</span>
                      <span className="text-cyan-300 tabular-nums">{distLabel}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>ETA:</span>
                      <span className="text-amber-300 tabular-nums">{etaLabel}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Δv Rem:</span>
                      <span className="text-white tabular-nums">{Math.round(m.remainingDeltaV)} m/s</span>
                    </div>
                    {m.estimatedBurnSec > 0 && (
                      <div className="flex justify-between text-slate-400 text-[10px]">
                        <span>Burn / Fuel:</span>
                        <span className="tabular-nums">
                          {m.estimatedBurnSec.toFixed(1)}s · {Math.round(m.estimatedFuelKg)} kg
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 pt-1">
                      {canWarp && (
                        <button
                          type="button"
                          onClick={() => setFlightState((p) => toggleAutoWarpToArrival(p))}
                          className={`flex-1 py-1.5 px-2 rounded text-[11px] font-sans font-bold ${
                            m.autoWarpToArrival
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                          }`}
                        >
                          {m.autoWarpToArrival
                            ? 'Stop Warp'
                            : m.phase === 'coasting_to_burn'
                              ? 'Warp to Transfer'
                              : 'Warp to Arrival'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setFlightState((p) => cancelActiveManeuver(p))}
                        className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-sans"
                      >
                        Abort
                      </button>
                    </div>
                  </div>
                );
              })() : (
                <>
                  {flightState.soiBody === 'earth' &&
                    mission.targetBody !== 'earth' &&
                    flightState.altitudeMeters < currentPlanet.atmosphereHeightMeters && (
                      <div className="pt-1.5 space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Space / Travel Unlock</span>
                          <span className="text-cyan-300">
                            {(flightState.altitudeMeters / 1000).toFixed(1)} /{' '}
                            {(currentPlanet.atmosphereHeightMeters / 1000).toFixed(0)} km
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-400 transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                (flightState.altitudeMeters / currentPlanet.atmosphereHeightMeters) *
                                  100
                              )}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                  {flightState.soiBody !== 'sun' &&
                    flightState.altitudeMeters >= currentPlanet.atmosphereHeightMeters &&
                    !flightState.orbitAchieved &&
                    flightState.phase !== 'crashed' &&
                    (flightState.remainingFuelKg > 20 || flightState.currentStage < flightState.maxStage) && (
                      <button
                        type="button"
                        data-testid="circularize-orbit-btn"
                        onClick={() => {
                          soundEngine.playStageSeparate();
                          setFlightState((prev) => circularizeCurrentOrbit(prev, parts));
                        }}
                        className="w-full mt-1 py-2 px-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-sans font-bold text-xs transition-colors"
                      >
                        Circularize {currentPlanet.name} Orbit
                      </button>
                    )}

                  {mission.targetBody !== 'earth' &&
                    flightState.soiBody !== mission.targetBody &&
                    (flightState.altitudeMeters >= currentPlanet.atmosphereHeightMeters ||
                      flightState.orbitAchieved ||
                      flightState.soiBody === 'sun') && (() => {
                      const hasMoonHop =
                        flightState.missionRoute.includes('moon') &&
                        flightState.missionRoute.indexOf('moon') <
                          flightState.missionRoute.indexOf(mission.targetBody);
                      const nextBody: PlanetId =
                        flightState.soiBody === 'earth' && hasMoonHop ? 'moon' : mission.targetBody;
                      const btnLabel =
                        flightState.soiBody === 'moon'
                          ? `Travel to ${PLANETS[mission.targetBody].name} Orbit (TMI)`
                          : nextBody === 'moon'
                            ? 'Travel to Moon’s Orbit (TLI)'
                            : `Travel to ${PLANETS[mission.targetBody].name}`;
                      const plan = computeTransferPlan(flightState, parts, nextBody);
                      return (
                        <div className="pt-1 space-y-1">
                          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] space-y-0.5">
                            <div className="text-slate-400 uppercase tracking-wider">
                              Transfer Burn ({PLANETS[nextBody].name})
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Δv Needed:</span>
                              <span className="text-cyan-300 font-bold tabular-nums">
                                {Math.round(plan.requiredDeltaV)} m/s
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Burn / Fuel:</span>
                              <span className="text-amber-300 tabular-nums">
                                {plan.estimatedBurnSec.toFixed(1)}s · {Math.round(plan.estimatedFuelKg)} kg
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            data-testid={nextBody === 'moon' ? 'travel-moon-btn' : 'travel-target-btn'}
                            onClick={() => {
                              soundEngine.playStageSeparate();
                              setFlightState((prev) =>
                                startTransferTransit(prev, parts, mission, nextBody)
                              );
                            }}
                            className="w-full py-2 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-bold text-xs transition-colors"
                          >
                            {btnLabel}
                          </button>
                        </div>
                      );
                    })()}

                  {flightState.soiBody === mission.targetBody &&
                    (mission.objectiveType === 'soft_landing' ||
                      mission.objectiveType === 'sample_return' ||
                      mission.objectiveType === 'impact') &&
                    flightState.altitudeMeters > 25_000 &&
                    flightState.verticalSpeedMs > -80 &&
                    flightState.phase !== 'reentry' &&
                    flightState.phase !== 'landed' &&
                    flightState.phase !== 'crashed' &&
                    flightState.phase !== 'mission_complete' && (
                      <button
                        type="button"
                        data-testid="deorbit-btn"
                        onClick={() => {
                          soundEngine.playStageSeparate();
                          setFlightState((prev) => executeDeorbitBurn(prev, parts));
                        }}
                        className="w-full mt-1 py-2 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-sans font-bold text-xs transition-colors"
                      >
                        Deorbit &amp; Land on {currentPlanet.name}
                      </button>
                    )}
                </>
              )}
            </div>
          )}

          {/* Mission Log Sidebar (Right Side in 3D & 2D Flight View) */}
          <MissionLogSidebar
            entries={flightState.missionLog}
            viewMode={flightViewMode}
          />

          {/* Bottom Unified Flight Control Dock (0-100% Throttle + 360° Rotation + Staging/Landing) */}
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-[#0B111E]/95 border border-slate-700/90 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-6 max-w-[95vw]">
            {/* 0% to 100% Throttle Control */}
            <div className="flex items-center gap-3">
              <div className="w-36">
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-slate-400">THROTTLE</span>
                  <span className="text-amber-400 font-bold tabular-nums">
                    {Math.round(flightState.throttle * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Engine throttle 0 to 100 percent"
                  min={0}
                  max={100}
                  value={Math.round(flightState.throttle * 100)}
                  onChange={(e) => {
                    const val = Number(e.target.value) / 100;
                    setFlightState((p) => ({ ...p, throttle: val }));
                  }}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
                  <button
                    type="button"
                    onClick={() => setFlightState((p) => ({ ...p, throttle: 0 }))}
                    className="hover:text-slate-200"
                  >
                    0%
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlightState((p) => ({ ...p, throttle: 0.5 }))}
                    className="hover:text-slate-200"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlightState((p) => ({ ...p, throttle: 1 }))}
                    className="hover:text-slate-200"
                  >
                    100%
                  </button>
                </div>
              </div>

              <button
                type="button"
                data-testid="ignite-btn"
                onClick={() =>
                  setFlightState((p) => toggleEngineIgnition(p))
                }
                className={`flex items-center gap-1.5 px-4 py-3 rounded-xl font-bold text-xs transition-colors whitespace-nowrap ${
                  flightState.ignited
                    ? 'bg-rose-500 hover:bg-rose-400 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                <Flame className="w-4 h-4" />
                {flightState.ignited ? 'Cut Engine' : 'Ignite [Space]'}
              </button>
            </div>

            <div className="w-px h-14 bg-slate-800 hidden sm:block" />

            {/* 360-Degree SFS2 Navball & Rotational Axis Gimbal */}
            {(() => {
              const basis = getLocalHorizonBasis(
                flightState.posX,
                flightState.posY,
                flightState.posZ ?? 0
              );
              const vRef = getReferenceVelocityWorld(flightState);
              const speedRel = Math.hypot(vRef[0], vRef[1], vRef[2]);
              const vE = vRef[0] * basis.E[0] + vRef[1] * basis.E[1] + vRef[2] * basis.E[2];
              const vU = vRef[0] * basis.U[0] + vRef[1] * basis.U[1] + vRef[2] * basis.U[2];
              const progradeAngle =
                speedRel > 2
                  ? normalizeAngle360((Math.atan2(vE, vU) * 180) / Math.PI)
                  : null;
              return (
                <AttitudeDial
                  angleDeg={flightState.angleDeg}
                  progradeAngleDeg={progradeAngle}
                  onSetAngle={(deg) =>
                    setFlightState((p) => commandFlightAttitude(p, { type: 'angle', angleDeg: deg }))
                  }
                  onCommandAttitude={(cmd) =>
                    setFlightState((p) => commandFlightAttitude(p, cmd))
                  }
                />
              );
            })()}

            <div className="w-px h-14 bg-slate-800 hidden sm:block" />

            {/* Staging & Landing Gear Controls */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                disabled={flightState.currentStage >= flightState.maxStage}
                onClick={() => {
                  soundEngine.playStageSeparate();
                  setFlightState((p) => deployNextStage(p, parts));
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                  flightState.currentStage < flightState.maxStage
                    ? 'bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200'
                    : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Stage ({flightState.currentStage + 1}/{flightState.maxStage + 1})
              </button>

              <button
                type="button"
                onClick={() =>
                  setFlightState((p) => toggleLandingLegs(p))
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                  flightState.legsDeployed
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Legs [L]
              </button>

              <button
                type="button"
                onClick={() =>
                  setFlightState((p) => toggleParachute(p))
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                  flightState.chuteDeployed
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <Umbrella className="w-3.5 h-3.5" />
                Chute [C]
              </button>

              <button
                type="button"
                onClick={() => setFlightState(createInitialFlightState(parts, mission))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Pad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PAUSE MODAL */}
      {/* ======================================================== */}
      {isPaused && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0B111E] border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Simulation Paused</h2>
            <p className="text-xs text-slate-400">
              {mission.year} — {mission.name} · Day {flightState.missionDays.toFixed(2)}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsPaused(false)}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Resume Flight
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlightState(createInitialFlightState(parts, mission));
                  setIsPaused(false);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm"
              >
                Restart Launchpad
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPaused(false);
                  setScreen('vab');
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm"
              >
                Return to 3D VAB
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPaused(false);
                  setScreen('title');
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-sm"
              >
                Mission Control Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VICTORY / CRASH OUTCOME MODAL */}
      {/* ======================================================== */}
      {screen === 'flight' &&
        showOutcomeModal &&
        (flightState.phase === 'mission_complete' || flightState.phase === 'crashed') && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#0B111E] border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
              <div className="flex items-center gap-3">
                {flightState.phase === 'mission_complete' ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-rose-400 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-mono text-slate-400">
                    {mission.year} · {mission.name}
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {flightState.phase === 'mission_complete'
                      ? 'Mission Accomplished'
                      : 'Spacecraft Lost'}
                  </h2>
                </div>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">
                {flightState.statusMessage}
              </p>

              <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">MISSION DAYS</div>
                  <div className="text-white font-semibold tabular-nums">
                    {flightState.missionDays.toFixed(2)} d
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">FINAL BODY</div>
                  <div className="text-cyan-300 font-semibold">
                    {getBodyConfig(flightState.soiBody).name}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-slate-400 text-[10px]">SPEED</div>
                  <div className="text-amber-300 font-semibold tabular-nums">
                    {flightState.speedMs.toFixed(1)} m/s
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setScreen('vab')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                >
                  Modify in VAB
                </button>
                <button
                  type="button"
                  data-start="true"
                  onClick={() => setFlightState(createInitialFlightState(parts, mission))}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  Relaunch Mission
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Switch Mission Modal inside VAB */}
      {showMissionSelectorModal && (
        <MissionControlModal
          selectedMissionId={selectedMissionId}
          completedMissionIds={completedMissionIds}
          onSelectMission={setSelectedMissionId}
          onStartMission={loadMissionIntoVab}
          onOpenTutorial={() => setShowTutorial(true)}
          isModalOverlay
          onClose={() => setShowMissionSelectorModal(false)}
        />
      )}

      {/* Interactive Tutorial Modal */}
      {showTutorial && (
        <TutorialOverlay
          onClose={() => setShowTutorial(false)}
          onJumpToVab={() => {
            if (screen === 'title') loadMissionIntoVab(selectedMissionId);
          }}
        />
      )}
    </div>
  );
}
