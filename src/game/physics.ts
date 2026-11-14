import { PARTS_BY_ID } from './partsCatalog';
import {
  ATMOSPHERE_LAYERS,
  getBodyConfig,
  getMoonEarthState,
  getPlanetHeliocentricState,
  PLANETS,
  SUN_MU
} from './planets';
import {
  ActiveManeuverState,
  AttitudeTargetMode,
  EngineeringSummary,
  FlightState,
  MissionDefinition,
  MissionLogEntry,
  MissionLogSeverity,
  PartDefinition,
  PlacedPart,
  PlanetId,
  SpaceBodyId,
  TrajectoryPoint,
  TrajectoryPrediction,
  TransferBurnPlan
} from './types';

const G0 = 9.80665;
const HITBOX_EPS = 0.05; // Allow flush contact without false overlap

function getEffectiveDims(def: PartDefinition, rotationDeg: number) {
  const rad = ((rotationDeg || 0) * Math.PI) / 180;
  const swapped = Math.abs(Math.sin(rad)) > 0.707;
  return {
    w: swapped ? def.depth : def.width,
    h: def.height,
    d: swapped ? def.width : def.depth
  };
}

export function doPartsIntersect(a: PlacedPart, b: PlacedPart): boolean {
  const defA = PARTS_BY_ID[a.partId];
  const defB = PARTS_BY_ID[b.partId];
  if (!defA || !defB) return false;

  const dimA = getEffectiveDims(defA, a.rotationDeg);
  const dimB = getEffectiveDims(defB, b.rotationDeg);

  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);

  const overlapX = dx < (dimA.w + dimB.w) / 2 - HITBOX_EPS;
  const overlapY = dy < (dimA.h + dimB.h) / 2 - HITBOX_EPS;
  const overlapZ = dz < (dimA.d + dimB.d) / 2 - HITBOX_EPS;

  return overlapX && overlapY && overlapZ;
}

export function checkPlacementCollision(
  candidate: PlacedPart,
  existingParts: PlacedPart[],
  ignoreInstanceId?: string
): { collides: boolean; collidingIds: string[] } {
  const collidingIds: string[] = [];
  for (const part of existingParts) {
    if (ignoreInstanceId && part.instanceId === ignoreInstanceId) continue;
    if (doPartsIntersect(candidate, part)) {
      collidingIds.push(part.instanceId);
    }
  }
  return {
    collides: collidingIds.length > 0,
    collidingIds
  };
}

export function snapPositionToNearestSocket(
  partDef: PartDefinition,
  targetX: number,
  targetY: number,
  targetZ: number,
  existingParts: PlacedPart[],
  ignoreInstanceId?: string,
  rotationDeg = 0
): { x: number; y: number; z: number; snapped: boolean } {
  const selfDim = getEffectiveDims(partDef, rotationDeg);
  // Keep vertical floor above pad y >= partDef.height / 2, allow wide 3D placement across X, Y, Z
  const minY = selfDim.h / 2;
  let bestX = Math.max(-8.5, Math.min(8.5, Number(targetX.toFixed(2))));
  let bestY = Math.max(minY, Math.min(26, Number(targetY.toFixed(2))));
  let bestZ = Math.max(-8.5, Math.min(8.5, Number(targetZ.toFixed(2))));
  let snapped = false;

  // Snap gently to center axes X=0 / Z=0 if close
  if (Math.abs(bestX) < 0.3) bestX = 0;
  if (Math.abs(bestZ) < 0.3) bestZ = 0;

  // Check proximity to existing parts' 6 orthogonal 3D attachment sockets (Top, Bottom, +X, -X, +Z, -Z)
  let minDist = 0.72;
  for (const other of existingParts) {
    if (ignoreInstanceId && other.instanceId === ignoreInstanceId) continue;
    const otherDef = PARTS_BY_ID[other.partId];
    if (!otherDef) continue;
    const otherDim = getEffectiveDims(otherDef, other.rotationDeg);

    const candidates = [
      // Top (+Y) & Bottom (-Y)
      { x: other.x, y: other.y + (otherDim.h + selfDim.h) / 2, z: other.z },
      { x: other.x, y: other.y - (otherDim.h + selfDim.h) / 2, z: other.z },
      // Right (+X) & Left (-X)
      { x: other.x + (otherDim.w + selfDim.w) / 2, y: other.y, z: other.z },
      { x: other.x - (otherDim.w + selfDim.w) / 2, y: other.y, z: other.z },
      // Front (+Z) & Back (-Z) for full 3D radial attachment
      { x: other.x, y: other.y, z: other.z + (otherDim.d + selfDim.d) / 2 },
      { x: other.x, y: other.y, z: other.z - (otherDim.d + selfDim.d) / 2 }
    ];

    for (const c of candidates) {
      if (c.y < minY) continue;
      const dist = Math.hypot(targetX - c.x, targetY - c.y, targetZ - c.z);
      if (dist < minDist) {
        minDist = dist;
        bestX = Number(c.x.toFixed(2));
        bestY = Number(c.y.toFixed(2));
        bestZ = Number(c.z.toFixed(2));
        snapped = true;
      }
    }
  }

  return { x: bestX, y: bestY, z: bestZ, snapped };
}

export interface AttachmentSocket {
  x: number;
  y: number;
  z: number;
  normal: 'top' | 'bottom' | 'px' | 'nx' | 'pz' | 'nz';
  parentInstanceId: string;
}

export function getOpenAttachmentSockets(
  partDef: PartDefinition,
  existingParts: PlacedPart[],
  ignoreInstanceId?: string,
  rotationDeg = 0
): AttachmentSocket[] {
  const selfDim = getEffectiveDims(partDef, rotationDeg);
  const minY = selfDim.h / 2;
  const sockets: AttachmentSocket[] = [];

  for (const other of existingParts) {
    if (ignoreInstanceId && other.instanceId === ignoreInstanceId) continue;
    const otherDef = PARTS_BY_ID[other.partId];
    if (!otherDef) continue;
    const otherDim = getEffectiveDims(otherDef, other.rotationDeg);

    const candidates: AttachmentSocket[] = [
      { x: other.x, y: other.y + (otherDim.h + selfDim.h) / 2, z: other.z, normal: 'top', parentInstanceId: other.instanceId },
      { x: other.x, y: other.y - (otherDim.h + selfDim.h) / 2, z: other.z, normal: 'bottom', parentInstanceId: other.instanceId },
      { x: other.x + (otherDim.w + selfDim.w) / 2, y: other.y, z: other.z, normal: 'px', parentInstanceId: other.instanceId },
      { x: other.x - (otherDim.w + selfDim.w) / 2, y: other.y, z: other.z, normal: 'nx', parentInstanceId: other.instanceId },
      { x: other.x, y: other.y, z: other.z + (otherDim.d + selfDim.d) / 2, normal: 'pz', parentInstanceId: other.instanceId },
      { x: other.x, y: other.y, z: other.z - (otherDim.d + selfDim.d) / 2, normal: 'nz', parentInstanceId: other.instanceId }
    ];

    for (const c of candidates) {
      if (c.y < minY) continue;
      const probePart: PlacedPart = {
        instanceId: ignoreInstanceId ?? 'socket-probe',
        partId: partDef.id,
        x: c.x,
        y: c.y,
        z: c.z,
        stage: 0,
        rotationDeg
      };
      const col = checkPlacementCollision(probePart, existingParts, ignoreInstanceId);
      if (!col.collides) {
        sockets.push({
          ...c,
          x: Number(c.x.toFixed(2)),
          y: Number(c.y.toFixed(2)),
          z: Number(c.z.toFixed(2))
        });
      }
    }
  }
  return sockets;
}

export function computeCenterOfMassAndThrust(parts: PlacedPart[]): {
  com: { x: number; y: number; z: number } | null;
  cot: { x: number; y: number; z: number } | null;
} {
  let massSum = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let thrustSum = 0;
  let tx = 0;
  let ty = 0;
  let tz = 0;

  for (const p of parts) {
    const def = PARTS_BY_ID[p.partId];
    if (!def) continue;
    const m = def.dryMassKg + def.fuelMassKg;
    massSum += m;
    mx += p.x * m;
    my += p.y * m;
    mz += p.z * m;
    if (def.thrustN > 0) {
      thrustSum += def.thrustN;
      tx += p.x * def.thrustN;
      ty += (p.y - def.height * 0.4) * def.thrustN;
      tz += p.z * def.thrustN;
    }
  }

  return {
    com: massSum > 0 ? { x: mx / massSum, y: my / massSum, z: mz / massSum } : null,
    cot: thrustSum > 0 ? { x: tx / thrustSum, y: ty / thrustSum, z: tz / thrustSum } : null
  };
}

export function calculateCashBack(partId: string): number {
  const def = PARTS_BY_ID[partId];
  if (!def) return 0;
  return Math.round(def.cost * 0.2);
}

export function evaluateRocketEngineering(
  parts: PlacedPart[],
  mission: MissionDefinition,
  cashbackEarned = 0,
  totalSpentCost?: number
): EngineeringSummary {
  let partsCost = 0;
  let totalDryMassKg = 0;
  let totalFuelMassKg = 0;
  let launchThrustN = 0;
  let weightedIspSum = 0;
  let powerGeneratedW = 0;
  let powerConsumedW = 0;
  let maxCommsAU = 0;
  let hasCommand = false;
  let hasHeatShield = false;
  let hasLandingLegs = false;
  let hasParachute = false;
  const scienceSet = new Set<NonNullable<PartDefinition['scienceInstrument']>>();

  // Group by stage for stage-aware Delta-V calculation
  const stages = new Map<
    number,
    { dryKg: number; fuelKg: number; thrustN: number; ispVac: number }
  >();

  let minStage = Infinity;
  for (const p of parts) {
    const def = PARTS_BY_ID[p.partId];
    if (!def) continue;
    if (p.stage < minStage) minStage = p.stage;

    partsCost += def.cost;
    totalDryMassKg += def.dryMassKg;
    totalFuelMassKg += def.fuelMassKg;
    powerGeneratedW += def.powerGenWatts;
    powerConsumedW += def.powerDrawWatts;
    if (def.commsRangeAU > maxCommsAU) maxCommsAU = def.commsRangeAU;
    if (def.isCommand) hasCommand = true;
    if (def.hasHeatShield) hasHeatShield = true;
    if (def.hasLandingLegs) hasLandingLegs = true;
    if (def.hasParachute) hasParachute = true;
    if (def.scienceInstrument) scienceSet.add(def.scienceInstrument);

    const s = stages.get(p.stage) ?? { dryKg: 0, fuelKg: 0, thrustN: 0, ispVac: 0 };
    s.dryKg += def.dryMassKg;
    s.fuelKg += def.fuelMassKg;
    if (def.thrustN > 0) {
      s.thrustN += def.thrustN;
      s.ispVac = Math.max(s.ispVac, def.ispVac);
    }
    stages.set(p.stage, s);
  }

  // Launch thrust from stage 0 (or lowest stage present)
  const firstStage = stages.get(minStage === Infinity ? 0 : minStage);
  if (firstStage) {
    launchThrustN = firstStage.thrustN;
  }

  // Compute multi-stage Tsiolkovsky Delta-V
  const sortedStages = Array.from(stages.entries()).sort((a, b) => a[0] - b[0]);
  let estimatedDeltaV = 0;
  for (let i = 0; i < sortedStages.length; i++) {
    const [, st] = sortedStages[i];
    if (st.thrustN <= 0 || st.fuelKg <= 0) continue;
    // Upper mass includes all stages above i
    let upperMass = 0;
    for (let j = i + 1; j < sortedStages.length; j++) {
      upperMass += sortedStages[j][1].dryKg + sortedStages[j][1].fuelKg;
    }
    const m0 = upperMass + st.dryKg + st.fuelKg;
    const mf = upperMass + st.dryKg;
    if (m0 > mf && mf > 0) {
      estimatedDeltaV += st.ispVac * G0 * Math.log(m0 / mf);
    }
    weightedIspSum += st.ispVac;
  }

  // Fallback single-burn Delta-V if fuel & engine are on adjacent unseparated stages
  if (estimatedDeltaV === 0 && launchThrustN > 0 && totalFuelMassKg > 0 && totalDryMassKg > 0) {
    const avgIsp = weightedIspSum > 0 ? weightedIspSum / Math.max(1, sortedStages.length) : 310;
    estimatedDeltaV = avgIsp * G0 * Math.log((totalDryMassKg + totalFuelMassKg) / totalDryMassKg);
  }

  const totalMassKg = totalDryMassKg + totalFuelMassKg;
  const launchTWR =
    totalMassKg > 0 ? launchThrustN / (totalMassKg * PLANETS.earth.surfaceGravity) : 0;
  const netPowerW = powerGeneratedW - powerConsumedW;

  const effectiveCost = totalSpentCost !== undefined ? totalSpentCost : partsCost;
  const remainingBudget = mission.budget - effectiveCost + cashbackEarned;

  const warnings: string[] = [];
  if (parts.length === 0) {
    warnings.push('No spacecraft parts placed on launch pad.');
  }
  if (!hasCommand) {
    warnings.push('Missing Command Module or Explorer Probe Core.');
  }
  if (launchThrustN <= 0) {
    warnings.push('Stage 0 has no active rocket engine or booster.');
  } else if (launchTWR < mission.requirements.minTWR) {
    warnings.push(
      `Launch TWR (${launchTWR.toFixed(2)}) is below ${mission.requirements.minTWR.toFixed(2)} — rocket cannot lift off efficiently.`
    );
  }
  if (estimatedDeltaV < mission.requirements.minDeltaV) {
    warnings.push(
      `Delta-V (${Math.round(estimatedDeltaV)} m/s) below recommended ${mission.requirements.minDeltaV} m/s for ${mission.name}.`
    );
  }
  if (netPowerW < mission.requirements.minPowerBalanceW) {
    warnings.push(
      `Power deficit (${netPowerW} W). Add Solar Wings or an RTG Generator.`
    );
  }
  if (maxCommsAU < mission.requirements.minCommsAU) {
    warnings.push(
      `Comms range (${maxCommsAU.toFixed(2)} AU) insufficient for ${mission.targetBody.toUpperCase()} (${mission.requirements.minCommsAU} AU needed). Add Deep Space Dish.`
    );
  }
  if (mission.requirements.requiresHeatShield && !hasHeatShield) {
    warnings.push(`Mission requires an Ablative Heat Shield for atmospheric entry.`);
  }
  if (mission.requirements.requiresLandingLegs && !hasLandingLegs) {
    warnings.push(`Soft landing requires Hydraulic Landing Legs.`);
  }
  if (mission.requirements.requiresParachute && !hasParachute) {
    warnings.push(`Atmospheric landing requires a Drogue & Main Parachute.`);
  }
  if (mission.requirements.requiredScience) {
    for (const reqSci of mission.requirements.requiredScience) {
      if (reqSci && !scienceSet.has(reqSci)) {
        warnings.push(`Missing required scientific instrument: ${reqSci.replace('_', ' ')}.`);
      }
    }
  }
  if (remainingBudget < 0) {
    warnings.push(`Over budget by $${Math.abs(remainingBudget).toLocaleString()}k! Throw unused parts in the 20% Cash Back Bin.`);
  }

  const isReadyToLaunch =
    parts.length > 0 &&
    hasCommand &&
    launchThrustN > 0 &&
    launchTWR >= 1.02 &&
    remainingBudget >= 0;

  return {
    totalCost: effectiveCost,
    remainingBudget,
    totalDryMassKg,
    totalFuelMassKg,
    totalMassKg,
    launchThrustN,
    launchTWR,
    estimatedDeltaV,
    powerGeneratedW,
    powerConsumedW,
    netPowerW,
    maxCommsAU,
    hasCommand,
    hasHeatShield,
    hasLandingLegs,
    hasParachute,
    scienceInstruments: Array.from(scienceSet),
    warnings,
    isReadyToLaunch
  };
}

export function getStageFlightSpecs(parts: PlacedPart[], currentStage: number) {
  let dryMassKg = 0;
  let fuelMassKg = 0;
  let thrustN = 0;
  let maxIsp = 0;
  let hasHeatShield = false;
  let hasLegs = false;
  let hasChute = false;
  let maxStage = 0;

  for (const p of parts) {
    if (p.stage > maxStage) maxStage = p.stage;
    if (p.stage < currentStage) continue; // Jettisoned stages
    const def = PARTS_BY_ID[p.partId];
    if (!def) continue;
    dryMassKg += def.dryMassKg;
    fuelMassKg += def.fuelMassKg;
    if (def.hasHeatShield) hasHeatShield = true;
    if (def.hasLandingLegs) hasLegs = true;
    if (def.hasParachute) hasChute = true;
    if (p.stage === currentStage && def.thrustN > 0) {
      thrustN += def.thrustN;
      maxIsp = Math.max(maxIsp, def.ispVac);
    }
  }

  return {
    dryMassKg: Math.max(200, dryMassKg),
    fuelMassKg,
    thrustN,
    isp: maxIsp || 310,
    hasHeatShield,
    hasLegs,
    hasChute,
    maxStage
  };
}

let missionLogSeq = 1;

export function formatMissionTimestamp(elapsedSec: number): string {
  const safeSec = Math.max(0, Math.floor(elapsedSec));
  const days = Math.floor(safeSec / 86400);
  const rem = safeSec % 86400;
  const hrs = Math.floor(rem / 3600);
  const mins = Math.floor((rem % 3600) / 60);
  const secs = rem % 60;
  const hhmmss = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return days > 0 ? `D${days} ${hhmmss}` : `T+${hhmmss}`;
}

export function createMissionLogEntry(
  title: string,
  detail: string,
  elapsedSec: number,
  severity: MissionLogSeverity = 'info'
): MissionLogEntry {
  return {
    id: `mlog-${missionLogSeq++}`,
    title,
    detail,
    missionElapsedSec: elapsedSec,
    missionDays: elapsedSec / 86400,
    timestampLabel: formatMissionTimestamp(elapsedSec),
    severity
  };
}

export function appendMissionLog(
  state: FlightState,
  title: string,
  detail: string,
  severity: MissionLogSeverity = 'info',
  dedupeWindowSec = 2
): FlightState {
  const last = state.missionLog[state.missionLog.length - 1];
  if (
    last &&
    last.title === title &&
    last.detail === detail &&
    Math.abs(state.missionElapsedSec - last.missionElapsedSec) < dedupeWindowSec
  ) {
    return state;
  }
  const entry = createMissionLogEntry(title, detail, state.missionElapsedSec, severity);
  return {
    ...state,
    missionLog: [...state.missionLog, entry].slice(-60)
  };
}

export function toggleEngineIgnition(state: FlightState): FlightState {
  if (state.phase === 'crashed' || state.phase === 'mission_complete') return state;
  const nextIgnited = !state.ignited;
  if (nextIgnited && state.remainingFuelKg <= 0) {
    return appendMissionLog(
      { ...state, ignited: false },
      'Ignition Failed',
      `Stage ${state.currentStage + 1} propellant depleted — stage separation required.`,
      'danger'
    );
  }
  const updated: FlightState = { ...state, ignited: nextIgnited };
  return nextIgnited
    ? appendMissionLog(
        updated,
        'Engine Ignition',
        `Stage ${state.currentStage + 1} ignited at ${Math.round(state.throttle * 100)}% throttle.`,
        'action'
      )
    : appendMissionLog(
        updated,
        'Engine Cutoff',
        `Stage ${state.currentStage + 1} main engines shut down.`,
        'info'
      );
}

export function toggleLandingLegs(state: FlightState): FlightState {
  const nextDeployed = !state.legsDeployed;
  const updated: FlightState = { ...state, legsDeployed: nextDeployed };
  return appendMissionLog(
    updated,
    nextDeployed ? 'Landing Legs Deployed' : 'Landing Legs Retracted',
    nextDeployed
      ? 'Touchdown struts extended for surface contact.'
      : 'Landing struts stowed.',
    'action'
  );
}

export function toggleParachute(state: FlightState): FlightState {
  const nextDeployed = !state.chuteDeployed;
  const updated: FlightState = { ...state, chuteDeployed: nextDeployed };
  return appendMissionLog(
    updated,
    nextDeployed ? 'Parachute Deployed' : 'Parachute Stowed',
    nextDeployed
      ? 'Drogue/main canopy armed for atmospheric deceleration.'
      : 'Parachute canopy released.',
    'action'
  );
}

export function getAtmosphereLayerName(bodyId: SpaceBodyId, altitudeMeters: number): string {
  if (bodyId === 'sun') return 'Heliocentric Deep Space';
  const planet = PLANETS[bodyId];
  if (planet.atmosphereHeightMeters <= 0) return 'Vacuum (No Atmosphere)';
  if (altitudeMeters >= planet.atmosphereHeightMeters) return 'Deep Space (Above Atmo)';
  const altKm = Math.max(0, altitudeMeters / 1000);
  const layers = ATMOSPHERE_LAYERS[bodyId];
  for (const layer of layers) {
    if (altKm >= layer.minKm && altKm <= layer.maxKm) {
      return `${layer.name} (${layer.minKm}–${layer.maxKm} km)`;
    }
  }
  return layers.length > 0 ? `${layers[layers.length - 1].name}` : 'Atmosphere';
}

export function createInitialFlightState(
  parts: PlacedPart[],
  mission: MissionDefinition
): FlightState {
  const earth = PLANETS.earth;
  const specs = getStageFlightSpecs(parts, 0);
  const summary = evaluateRocketEngineering(parts, mission);
  const route: PlanetId[] =
    mission.routeWaypoints && mission.routeWaypoints.length > 0
      ? mission.routeWaypoints
      : mission.targetBody === 'earth'
        ? ['earth']
        : ['earth', mission.targetBody];

  return {
    soiBody: 'earth',
    posX: 0,
    posY: earth.radiusMeters,
    posZ: 0,
    // Earth's rotation imparts eastward tangential surface velocity at the pad
    velX: earth.rotationVelocityEquatorial,
    velY: 0,
    velZ: 0,
    angleDeg: 0, // Pointing straight up (+Y)
    rollDeg: 0,
    yawDeg: 0,
    attitudeQuat: [0, 0, 0, 1],
    attitudeTarget: { type: 'manual' },
    _syncedAngles: [0, 0, 0],
    angularVelDeg: 0,
    throttle: 0.85,
    ignited: false,
    currentStage: 0,
    maxStage: specs.maxStage,
    remainingFuelKg: specs.fuelMassKg,
    initialFuelKg: specs.fuelMassKg,
    currentDryMassKg: specs.dryMassKg,
    currentThrustN: specs.thrustN,
    currentIsp: specs.isp,
    legsDeployed: false,
    chuteDeployed: false,
    solarDeployed: false,
    missionElapsedSec: 0,
    missionDays: 0,
    timeWarp: 1,
    altitudeMeters: 0,
    speedMs: 0,
    verticalSpeedMs: 0,
    horizontalSpeedMs: 0,
    atmosphereDensity: 1.0,
    atmosphereLayerName: getAtmosphereLayerName('earth', 0),
    heatLoad: 0,
    commsConnected: summary.maxCommsAU >= 0.01,
    powerPercent: summary.netPowerW >= 0 ? 100 : 85,
    phase: 'prelaunch',
    scienceCompleted: false,
    orbitAchieved: false,
    earthOrbitCompleted: false,
    moonOrbitCompleted: false,
    missionRoute: route,
    routeLegIndex: 0,
    activeManeuver: null,
    flybyAchieved: false,
    returnedToEarth: false,
    statusMessage: `Ready on Pad 39A. Launch along rocket axis, then reach ${route.map((b) => PLANETS[b].name).join(' → ')}.`,
    missionLog: [
      createMissionLogEntry(
        'Pad 39A Ready',
        `${mission.year} ${mission.name} on pad · Target: ${PLANETS[mission.targetBody].name}.`,
        0,
        'info'
      )
    ]
  };
}

export function computeAtmosphereDensity(bodyId: SpaceBodyId, altitudeMeters: number): number {
  if (bodyId === 'sun') return 0;
  const planet = PLANETS[bodyId];
  if (planet.atmosphereHeightMeters <= 0) return 0;
  if (altitudeMeters >= planet.atmosphereHeightMeters) return 0;
  if (altitudeMeters < 0) return planet.surfacePressureAtm;
  return (
    planet.surfacePressureAtm *
    Math.exp(-altitudeMeters / Math.max(1, planet.atmosphereScaleHeightMeters))
  );
}

export function normalizeAngle360(deg: number): number {
  let a = ((deg + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  return a;
}

export type Quat4 = [number, number, number, number];
export type Vec3 = [number, number, number];

const SAS_SLEW_RATE_DEG = 30;
const MANUAL_TURN_RATE_DEG = 48;

export function quatNormalize(q: Quat4): Quat4 {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function quatMultiply(a: Quat4, b: Quat4): Quat4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

export function quatFromAxisAngle(axis: Vec3, rad: number): Quat4 {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  const nx = len > 1e-8 ? axis[0] / len : 0;
  const ny = len > 1e-8 ? axis[1] / len : 0;
  const nz = len > 1e-8 ? axis[2] / len : 1;
  const half = rad * 0.5;
  const s = Math.sin(half);
  return [nx * s, ny * s, nz * s, Math.cos(half)];
}

export function quatRotateVec(q: Quat4, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

export function quatFromEulerDegrees(angleDeg: number, yawDeg = 0, rollDeg = 0): Quat4 {
  const qZ = quatFromAxisAngle([0, 0, 1], -(angleDeg * Math.PI) / 180);
  const qX = quatFromAxisAngle([1, 0, 0], (yawDeg * Math.PI) / 180);
  const qY = quatFromAxisAngle([0, 1, 0], (rollDeg * Math.PI) / 180);
  return quatNormalize(quatMultiply(qZ, quatMultiply(qX, qY)));
}

function quatRotateTowards(fromQ: Quat4, targetQ: Quat4, maxRad: number): Quat4 {
  let tx = targetQ[0];
  let ty = targetQ[1];
  let tz = targetQ[2];
  let tw = targetQ[3];
  let dot = fromQ[0] * tx + fromQ[1] * ty + fromQ[2] * tz + fromQ[3] * tw;
  if (dot < 0) {
    tx = -tx;
    ty = -ty;
    tz = -tz;
    tw = -tw;
    dot = -dot;
  }
  dot = Math.min(1, Math.max(-1, dot));
  const halfTheta = Math.acos(dot);
  const fullTheta = halfTheta * 2;
  if (fullTheta <= 1e-6 || fullTheta <= maxRad) {
    return quatNormalize([tx, ty, tz, tw]);
  }
  const t = maxRad / fullTheta;
  const sinHalf = Math.sin(halfTheta);
  if (sinHalf < 1e-6) {
    return quatNormalize([tx, ty, tz, tw]);
  }
  const w1 = Math.sin((1 - t) * halfTheta) / sinHalf;
  const w2 = Math.sin(t * halfTheta) / sinHalf;
  return quatNormalize([
    w1 * fromQ[0] + w2 * tx,
    w1 * fromQ[1] + w2 * ty,
    w1 * fromQ[2] + w2 * tz,
    w1 * fromQ[3] + w2 * tw
  ]);
}

function rotateNoseTowardsDir(currentQ: Quat4, targetDir: Vec3, maxRad: number): Quat4 {
  const curNose = quatRotateVec(currentQ, [0, 1, 0]);
  const tLen = Math.hypot(targetDir[0], targetDir[1], targetDir[2]);
  if (tLen < 1e-8) return currentQ;
  const tx = targetDir[0] / tLen;
  const ty = targetDir[1] / tLen;
  const tz = targetDir[2] / tLen;
  const dot = Math.max(-1, Math.min(1, curNose[0] * tx + curNose[1] * ty + curNose[2] * tz));
  const angle = Math.acos(dot);
  if (angle <= 1e-5) return currentQ;

  const stepRad = Math.min(angle, maxRad);
  let ax = curNose[1] * tz - curNose[2] * ty;
  let ay = curNose[2] * tx - curNose[0] * tz;
  let az = curNose[0] * ty - curNose[1] * tx;
  let aLen = Math.hypot(ax, ay, az);
  if (aLen < 1e-5) {
    // 180-deg opposition: rotate around orbital plane normal (+Z) if perpendicular, else +X
    ax = curNose[1];
    ay = -curNose[0];
    az = 0;
    aLen = Math.hypot(ax, ay, az);
    if (aLen < 1e-5) {
      ax = 1;
      ay = 0;
      az = 0;
      aLen = 1;
    }
  }
  const dq = quatFromAxisAngle([ax / aLen, ay / aLen, az / aLen], stepRad);
  return quatNormalize(quatMultiply(dq, currentQ));
}

export function getLocalHorizonBasis(posX: number, posY: number, posZ = 0): {
  E: Vec3;
  U: Vec3;
  N: Vec3;
} {
  const r = Math.hypot(posX, posY, posZ);
  const U: Vec3 = r > 1e-6 ? [posX / r, posY / r, posZ / r] : [0, 1, 0];
  // East tangent = normalize(U x (0, 0, 1)) -> equals (U.y, -U.x, 0) in orbital plane
  let ex = U[1];
  let ey = -U[0];
  let ez = 0;
  let eLen = Math.hypot(ex, ey, ez);
  if (eLen < 1e-5) {
    ex = 1;
    ey = 0;
    ez = 0;
    eLen = 1;
  }
  const E: Vec3 = [ex / eLen, ey / eLen, ez / eLen];
  const N: Vec3 = [
    E[1] * U[2] - E[2] * U[1],
    E[2] * U[0] - E[0] * U[2],
    E[0] * U[1] - E[1] * U[0]
  ];
  return { E, U, N };
}

export function ensureAttitudeQuat(state: FlightState): Quat4 {
  const sync = state._syncedAngles;
  const externallyEdited =
    !state.attitudeQuat ||
    !sync ||
    Math.abs((state.angleDeg || 0) - sync[0]) > 1e-3 ||
    Math.abs((state.yawDeg || 0) - sync[1]) > 1e-3 ||
    Math.abs((state.rollDeg || 0) - sync[2]) > 1e-3;
  if (externallyEdited) {
    return quatFromEulerDegrees(state.angleDeg || 0, state.yawDeg || 0, state.rollDeg || 0);
  }
  return quatNormalize(state.attitudeQuat!);
}

export function getRocketForwardWorld(state: FlightState): Vec3 {
  const q = ensureAttitudeQuat(state);
  const fLocal = quatRotateVec(q, [0, 1, 0]);
  const { E, U, N } = getLocalHorizonBasis(state.posX, state.posY, state.posZ ?? 0);
  const wx = E[0] * fLocal[0] + U[0] * fLocal[1] + N[0] * fLocal[2];
  const wy = E[1] * fLocal[0] + U[1] * fLocal[1] + N[1] * fLocal[2];
  const wz = E[2] * fLocal[0] + U[2] * fLocal[1] + N[2] * fLocal[2];
  const len = Math.hypot(wx, wy, wz);
  return len > 1e-8 ? [wx / len, wy / len, wz / len] : [U[0], U[1], U[2]];
}

export function getReferenceVelocityWorld(state: FlightState): Vec3 {
  const planet = getBodyConfig(state.soiBody);
  const pz = state.posZ ?? 0;
  const r = Math.max(1, Math.hypot(state.posX, state.posY, pz));
  const alt = r - planet.radiusMeters;
  const vx = state.velX;
  const vy = state.velY;
  const vz = state.velZ ?? 0;
  if (planet.atmosphereHeightMeters > 0 && alt < planet.atmosphereHeightMeters) {
    const { E } = getLocalHorizonBasis(state.posX, state.posY, pz);
    const surfRot = planet.rotationVelocityEquatorial * (r / planet.radiusMeters);
    return [vx - E[0] * surfRot, vy - E[1] * surfRot, vz - E[2] * surfRot];
  }
  return [vx, vy, vz];
}

function extractAnglesFromQuat(q: Quat4, prevAngleDeg: number): {
  angleDeg: number;
  yawDeg: number;
  rollDeg: number;
} {
  const fLocal = quatRotateVec(q, [0, 1, 0]);
  const planarLen = Math.hypot(fLocal[0], fLocal[1]);
  const angleDeg =
    planarLen > 1e-4
      ? normalizeAngle360((Math.atan2(fLocal[0], fLocal[1]) * 180) / Math.PI)
      : prevAngleDeg;
  const yawDeg = normalizeAngle360((Math.asin(Math.max(-1, Math.min(1, -fLocal[2]))) * 180) / Math.PI);
  const rLocal = quatRotateVec(q, [1, 0, 0]);
  const rollRad = Math.atan2(-rLocal[2], rLocal[0]);
  const rollDeg = Number.isFinite(rollRad) ? normalizeAngle360((rollRad * 180) / Math.PI) : 0;
  return { angleDeg, yawDeg, rollDeg };
}

export type AttitudeCommand =
  | { type: 'step'; deltaDeg: number }
  | { type: 'angle'; angleDeg: number }
  | { type: 'up' }
  | { type: 'prograde' }
  | { type: 'retrograde' };

export function commandFlightAttitude(state: FlightState, command: AttitudeCommand): FlightState {
  if (state.phase === 'crashed' || state.phase === 'mission_complete') return state;
  const q = ensureAttitudeQuat(state);
  let target: AttitudeTargetMode;
  if (command.type === 'step') {
    const baseAngle =
      state.attitudeTarget?.type === 'angle'
        ? state.attitudeTarget.angleDeg
        : state.attitudeTarget?.type === 'up'
          ? 0
          : state.angleDeg;
    target = { type: 'angle', angleDeg: normalizeAngle360(baseAngle + command.deltaDeg) };
  } else if (command.type === 'angle') {
    target = { type: 'angle', angleDeg: normalizeAngle360(command.angleDeg) };
  } else if (command.type === 'up') {
    target = { type: 'up' };
  } else if (command.type === 'prograde') {
    target = { type: 'prograde' };
  } else {
    target = { type: 'retrograde' };
  }
  return {
    ...state,
    attitudeQuat: q,
    attitudeTarget: target,
    _syncedAngles: [state.angleDeg, state.yawDeg, state.rollDeg]
  };
}

export function getShipTargetDistanceAndEta(
  state: FlightState,
  targetBody: PlanetId
): { distanceMeters: number; etaSeconds: number; closingSpeedMs: number } {
  const pz = state.posZ ?? 0;
  const vz = state.velZ ?? 0;
  const targetPlanet = PLANETS[targetBody];

  if (state.soiBody === targetBody) {
    return {
      distanceMeters: Math.max(0, state.altitudeMeters),
      etaSeconds:
        state.verticalSpeedMs < -1
          ? Math.max(0, state.altitudeMeters / Math.abs(state.verticalSpeedMs))
          : 0,
      closingSpeedMs: -state.verticalSpeedMs
    };
  }

  let shipX = state.posX;
  let shipY = state.posY;
  let shipVx = state.velX;
  let shipVy = state.velY;
  let targX = 0;
  let targY = 0;
  let targVx = 0;
  let targVy = 0;

  if (
    (state.soiBody === 'earth' || state.soiBody === 'moon') &&
    (targetBody === 'moon' || targetBody === 'earth')
  ) {
    if (state.soiBody === 'moon') {
      const m = getMoonEarthState(state.missionElapsedSec);
      shipX += m.x;
      shipY += m.y;
      shipVx += m.vx;
      shipVy += m.vy;
    }
    if (targetBody === 'moon') {
      const m = getMoonEarthState(state.missionElapsedSec);
      targX = m.x;
      targY = m.y;
      targVx = m.vx;
      targVy = m.vy;
    }
  } else {
    if (state.soiBody !== 'sun') {
      const host = getPlanetHeliocentricState(state.soiBody, state.missionElapsedSec);
      shipX += host.x;
      shipY += host.y;
      shipVx += host.vx;
      shipVy += host.vy;
    }
    const tp = getPlanetHeliocentricState(targetBody, state.missionElapsedSec);
    targX = tp.x;
    targY = tp.y;
    targVx = tp.vx;
    targVy = tp.vy;
  }

  const dx = targX - shipX;
  const dy = targY - shipY;
  const dz = -pz;
  const centerDist = Math.hypot(dx, dy, dz);
  const relVx = shipVx - targVx;
  const relVy = shipVy - targVy;
  const relVz = vz;
  const closingSpeedMs =
    centerDist > 1 ? (dx * relVx + dy * relVy + dz * relVz) / centerDist : 0;
  const distToSurface = Math.max(0, centerDist - targetPlanet.radiusMeters);

  let etaSeconds = 0;
  if (closingSpeedMs > 5) {
    etaSeconds = distToSurface / closingSpeedMs;
  } else if (targetBody === 'moon' && state.soiBody === 'earth') {
    const a = (Math.hypot(state.posX, state.posY) + PLANETS.moon.orbitRadiusSimMeters) * 0.5;
    etaSeconds = Math.PI * Math.sqrt(Math.pow(a, 3) / PLANETS.earth.mu);
  } else {
    const rShip = Math.max(1e6, Math.hypot(shipX, shipY));
    const a = (rShip + targetPlanet.orbitRadiusSimMeters) * 0.5;
    etaSeconds = Math.PI * Math.sqrt(Math.pow(a, 3) / SUN_MU);
  }

  return {
    distanceMeters: distToSurface,
    etaSeconds: Number.isFinite(etaSeconds) ? Math.max(0, etaSeconds) : 0,
    closingSpeedMs
  };
}

function estimateBurnTimeAndFuel(
  state: FlightState,
  parts: PlacedPart[],
  deltaV: number
): { burnSec: number; fuelKg: number } {
  const specs = getStageFlightSpecs(parts, state.currentStage);
  const thrust = Math.max(25_000, specs.thrustN || state.currentThrustN || 200_000);
  const isp = Math.max(220, specs.isp || state.currentIsp || 340);
  const totalMass = Math.max(300, specs.dryMassKg + state.remainingFuelKg);
  const ve = isp * G0;
  const dvClamped = Math.max(0, deltaV);
  const fuelKg = totalMass * (1 - Math.exp(-dvClamped / ve));
  const massFlow = thrust / ve;
  const burnSec = massFlow > 0 ? fuelKg / massFlow : 0;
  return { burnSec, fuelKg };
}

function computeKeplerElements(
  px: number,
  py: number,
  pz: number,
  vx: number,
  vy: number,
  vz: number,
  bodyId: SpaceBodyId
) {
  const body = getBodyConfig(bodyId);
  const r = Math.max(1, Math.hypot(px, py, pz));
  const vSq = vx * vx + vy * vy + vz * vz;
  const specificEnergy = vSq / 2 - body.mu / r;
  const isEscaping = specificEnergy >= 0;
  const hx = py * vz - pz * vy;
  const hy = pz * vx - px * vz;
  const hz = px * vy - py * vx;
  const hSq = hx * hx + hy * hy + hz * hz;
  const eSq = Math.max(0, 1 + (2 * specificEnergy * hSq) / (body.mu * body.mu));
  const eccentricity = Math.sqrt(eSq);
  const a = isEscaping ? Infinity : -body.mu / (2 * specificEnergy);
  const rPeri = isEscaping
    ? (hSq / body.mu) / (1 + eccentricity)
    : a * (1 - eccentricity);
  const rApo = isEscaping ? Infinity : a * (1 + eccentricity);
  const periodSec = isEscaping
    ? Infinity
    : 2 * Math.PI * Math.sqrt(Math.pow(Math.max(1, a), 3) / body.mu);

  // Estimate time to next apoapsis along elliptical orbit
  const rdot = (px * vx + py * vy + pz * vz) / r;
  let timeToApoSec = 0;
  if (!isEscaping && Number.isFinite(periodSec) && eccentricity > 0.005) {
    const p = hSq / body.mu;
    const cosNu = Math.max(-1, Math.min(1, (p / r - 1) / eccentricity));
    let nu = Math.acos(cosNu);
    if (rdot < 0) nu = 2 * Math.PI - nu; // Descending toward periapsis -> Apoapsis is past periapsis
    // True anomaly at apoapsis is pi
    const cosE = (eccentricity + Math.cos(nu)) / (1 + eccentricity * Math.cos(nu));
    let E = Math.acos(Math.max(-1, Math.min(1, cosE)));
    if (nu > Math.PI) E = 2 * Math.PI - E;
    const M = E - eccentricity * Math.sin(E);
    const dM = M <= Math.PI ? Math.PI - M : 3 * Math.PI - M;
    timeToApoSec = (dM / (2 * Math.PI)) * periodSec;
  }

  let timeToPeriSec = 0;
  if (!isEscaping && Number.isFinite(periodSec) && eccentricity > 0.005) {
    const p = hSq / body.mu;
    const cosNu = Math.max(-1, Math.min(1, (p / r - 1) / eccentricity));
    let nu = Math.acos(cosNu);
    if (rdot < 0) nu = 2 * Math.PI - nu;
    const cosE = (eccentricity + Math.cos(nu)) / (1 + eccentricity * Math.cos(nu));
    let E = Math.acos(Math.max(-1, Math.min(1, cosE)));
    if (nu > Math.PI) E = 2 * Math.PI - E;
    const M = E - eccentricity * Math.sin(E);
    const dM = 2 * Math.PI - M;
    timeToPeriSec = (dM / (2 * Math.PI)) * periodSec;
  } else if (isEscaping && rdot < 0) {
    timeToPeriSec = Math.max(0, (r - rPeri) / Math.max(10, Math.abs(rdot)));
  }

  return {
    r,
    vSq,
    specificEnergy,
    isEscaping,
    eccentricity,
    a,
    rPeri,
    rApo,
    periapsisKm: (rPeri - body.radiusMeters) / 1000,
    apoapsisKm: Number.isFinite(rApo) ? (rApo - body.radiusMeters) / 1000 : Infinity,
    periodSec,
    timeToApoSec,
    timeToPeriSec
  };
}

function propagateHeliocentricEnd(
  x0: number,
  y0: number,
  z0: number,
  vx0: number,
  vy0: number,
  vz0: number,
  coastSec: number,
  steps = 64
): { x: number; y: number; z: number } {
  const h = coastSec / steps;
  let x = x0;
  let y = y0;
  let z = z0;
  let vx = vx0;
  let vy = vy0;
  let vz = vz0;
  for (let s = 0; s < steps; s++) {
    const r1 = Math.max(1e5, Math.hypot(x, y, z));
    const g1 = -SUN_MU / (r1 * r1 * r1);
    const vhx = vx + x * g1 * 0.5 * h;
    const vhy = vy + y * g1 * 0.5 * h;
    const vhz = vz + z * g1 * 0.5 * h;
    x += vhx * h;
    y += vhy * h;
    z += vhz * h;
    const r2 = Math.max(1e5, Math.hypot(x, y, z));
    const g2 = -SUN_MU / (r2 * r2 * r2);
    vx = vhx + x * g2 * 0.5 * h;
    vy = vhy + y * g2 * 0.5 * h;
    vz = vhz + z * g2 * 0.5 * h;
  }
  return { x, y, z };
}

function solveHeliocentricIntercept(
  shipX: number,
  shipY: number,
  shipZ: number,
  _shipVx: number,
  _shipVy: number,
  shipVz: number,
  elapsedSec: number,
  targetBody: PlanetId
): { reqVx: number; reqVy: number; reqVz: number; coastSec: number } {
  const rShip = Math.max(1e6, Math.hypot(shipX, shipY, shipZ));
  const targetPlanet = PLANETS[targetBody];
  const rTarget = targetPlanet.orbitRadiusSimMeters;
  const aHoh = (rShip + rTarget) * 0.5;
  const nominalCoast = Math.PI * Math.sqrt(Math.pow(aHoh, 3) / SUN_MU);

  const shipAng = Math.atan2(shipY, shipX);
  const tArriveNom = elapsedSec + nominalCoast;
  const targetAtArrive = getPlanetHeliocentricState(targetBody, tArriveNom);
  let dAng = targetAtArrive.angleRad - shipAng;
  while (dAng <= 0.35) dAng += Math.PI * 2;
  while (dAng > Math.PI * 2 + 0.35) dAng -= Math.PI * 2;

  const coastSec = Math.max(
    nominalCoast * 0.55,
    Math.min(nominalCoast * 1.65, nominalCoast * (dAng / Math.PI))
  );
  const pTarget = getPlanetHeliocentricState(targetBody, elapsedSec + coastSec);
  // Aim just slightly prograde/inside planet center (~0.18 * SOI) so capture periapsis clears surface safely
  const aimOffset = Math.min(targetPlanet.soiRadiusMeters * 0.16, targetPlanet.radiusMeters * 2.5);
  const tLen = Math.max(1, Math.hypot(pTarget.x, pTarget.y));
  const goalX = pTarget.x - (pTarget.x / tLen) * aimOffset;
  const goalY = pTarget.y - (pTarget.y / tLen) * aimOffset;

  const tanX = -Math.sin(shipAng);
  const tanY = Math.cos(shipAng);
  const vHoh = Math.sqrt(Math.max(100, SUN_MU * (2 / rShip - 1 / aHoh)));
  let vx = tanX * vHoh;
  let vy = tanY * vHoh;
  let vz = -shipVz * 0.5;

  const eps = 1.5;
  for (let iter = 0; iter < 8; iter++) {
    const base = propagateHeliocentricEnd(shipX, shipY, shipZ, vx, vy, vz, coastSec);
    const errX = goalX - base.x;
    const errY = goalY - base.y;
    const errZ = 0 - base.z;
    if (Math.hypot(errX, errY, errZ) < 20_000) break;

    const px = propagateHeliocentricEnd(shipX, shipY, shipZ, vx + eps, vy, vz, coastSec);
    const py = propagateHeliocentricEnd(shipX, shipY, shipZ, vx, vy + eps, vz, coastSec);
    const j11 = (px.x - base.x) / eps;
    const j21 = (px.y - base.y) / eps;
    const j12 = (py.x - base.x) / eps;
    const j22 = (py.y - base.y) / eps;
    const det = j11 * j22 - j12 * j21;

    if (Math.abs(det) > 1e-3) {
      let dvx = (j22 * errX - j12 * errY) / det;
      let dvy = (-j21 * errX + j11 * errY) / det;
      const stepMag = Math.hypot(dvx, dvy);
      if (stepMag > 650) {
        dvx = (dvx / stepMag) * 650;
        dvy = (dvy / stepMag) * 650;
      }
      vx += dvx;
      vy += dvy;
    } else {
      vx += (errX / coastSec) * 0.85;
      vy += (errY / coastSec) * 0.85;
    }
    vz += (errZ / coastSec) * 0.9;
  }

  return { reqVx: vx, reqVy: vy, reqVz: vz, coastSec };
}

function solveLunarInterceptCorrection(
  shipX: number,
  shipY: number,
  shipZ: number,
  shipVx: number,
  shipVy: number,
  shipVz: number,
  elapsedSec: number
): { dvX: number; dvY: number; dvZ: number; coastSec: number; minDist: number } {
  const mu = PLANETS.earth.mu;
  const r0 = Math.max(1e5, Math.hypot(shipX, shipY, shipZ));
  const rMoon = PLANETS.moon.orbitRadiusSimMeters;
  const aHoh = (r0 + rMoon) * 0.5;
  const maxCheckSec = Math.PI * Math.sqrt(Math.pow(aHoh, 3) / mu) * 1.15;

  // Measure closest approach of current ballistic trajectory to Moon
  const measureMinDist = (ivx: number, ivy: number, ivz: number) => {
    let x = shipX;
    let y = shipY;
    let z = shipZ;
    let vx = ivx;
    let vy = ivy;
    let vz = ivz;
    const steps = 60;
    const h = maxCheckSec / steps;
    let bestD = Infinity;
    let bestT = maxCheckSec;
    for (let s = 0; s < steps; s++) {
      const t = elapsedSec + s * h;
      const m = getMoonEarthState(t);
      const d = Math.hypot(x - m.x, y - m.y, z);
      if (d < bestD) {
        bestD = d;
        bestT = (s + 0.5) * h;
      }
      if (d < PLANETS.moon.soiRadiusMeters * 0.4) break;
      const r1 = Math.max(1e5, Math.hypot(x, y, z));
      const g1 = -mu / (r1 * r1 * r1);
      const vhx = vx + x * g1 * 0.5 * h;
      const vhy = vy + y * g1 * 0.5 * h;
      const vhz = vz + z * g1 * 0.5 * h;
      x += vhx * h;
      y += vhy * h;
      z += vhz * h;
      const r2 = Math.max(1e5, Math.hypot(x, y, z));
      const g2 = -mu / (r2 * r2 * r2);
      vx = vhx + x * g2 * 0.5 * h;
      vy = vhy + y * g2 * 0.5 * h;
      vz = vhz + z * g2 * 0.5 * h;
    }
    return { bestD, bestT };
  };

  const base = measureMinDist(shipVx, shipVy, shipVz);
  if (base.bestD < PLANETS.moon.soiRadiusMeters * 0.45) {
    return { dvX: 0, dvY: 0, dvZ: 0, coastSec: base.bestT, minDist: base.bestD };
  }

  // Shoot toward Moon position at estimated arrival time
  const coastSec = Math.max(1200, base.bestT);
  const targetM = getMoonEarthState(elapsedSec + coastSec);
  let vx = shipVx;
  let vy = shipVy;
  let vz = shipVz;
  const steps = 60;
  const h = coastSec / steps;

  for (let iter = 0; iter < 8; iter++) {
    let x = shipX;
    let y = shipY;
    let z = shipZ;
    let tvx = vx;
    let tvy = vy;
    let tvz = vz;
    for (let s = 0; s < steps; s++) {
      const r1 = Math.max(1e5, Math.hypot(x, y, z));
      const g1 = -mu / (r1 * r1 * r1);
      const vhx = tvx + x * g1 * 0.5 * h;
      const vhy = tvy + y * g1 * 0.5 * h;
      const vhz = tvz + z * g1 * 0.5 * h;
      x += vhx * h;
      y += vhy * h;
      z += vhz * h;
      const r2 = Math.max(1e5, Math.hypot(x, y, z));
      const g2 = -mu / (r2 * r2 * r2);
      tvx = vhx + x * g2 * 0.5 * h;
      tvy = vhy + y * g2 * 0.5 * h;
      tvz = vhz + z * g2 * 0.5 * h;
    }
    const errX = targetM.x - x;
    const errY = targetM.y - y;
    const errZ = 0 - z;
    if (Math.hypot(errX, errY, errZ) < 120_000) break;
    vx += (errX / coastSec) * 0.85;
    vy += (errY / coastSec) * 0.85;
    vz += (errZ / coastSec) * 0.85;
  }

  return {
    dvX: vx - shipVx,
    dvY: vy - shipVy,
    dvZ: vz - shipVz,
    coastSec,
    minDist: base.bestD
  };
}

function maneuverDirectionToAttitude(
  mode: ActiveManeuverState['burnDirectionMode'],
  targetDir?: [number, number, number]
): AttitudeTargetMode {
  if (mode === 'prograde') return { type: 'prograde' };
  if (mode === 'retrograde') return { type: 'retrograde' };
  if (mode === 'horizon_east') return { type: 'angle', angleDeg: 90 };
  if (mode === 'world_dir' && targetDir) {
    return { type: 'world_dir', dirX: targetDir[0], dirY: targetDir[1], dirZ: targetDir[2] };
  }
  return { type: 'prograde' };
}

function computeDesiredWorldDir(
  state: FlightState,
  target: AttitudeTargetMode
): Vec3 | null {
  const { E, U, N } = getLocalHorizonBasis(state.posX, state.posY, state.posZ ?? 0);
  if (target.type === 'up') return U;
  if (target.type === 'angle') {
    const rad = (target.angleDeg * Math.PI) / 180;
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    return [E[0] * s + U[0] * c, E[1] * s + U[1] * c, E[2] * s + U[2] * c];
  }
  if (target.type === 'prograde' || target.type === 'retrograde') {
    const vRef = getReferenceVelocityWorld(state);
    const sp = Math.hypot(vRef[0], vRef[1], vRef[2]);
    if (sp < 0.5) return null;
    const sign = target.type === 'prograde' ? 1 : -1;
    return [(vRef[0] / sp) * sign, (vRef[1] / sp) * sign, (vRef[2] / sp) * sign];
  }
  if (target.type === 'world_dir') {
    const l = Math.hypot(target.dirX, target.dirY, target.dirZ);
    return l > 1e-6 ? [target.dirX / l, target.dirY / l, target.dirZ / l] : null;
  }
  return null;
}

export function stepFlightPhysics(
  state: FlightState,
  parts: PlacedPart[],
  mission: MissionDefinition,
  dt: number,
  controls: { rotateInput?: number; pitchInput?: number; yawInput?: number; rollInput?: number }
): FlightState {
  if (state.phase === 'crashed' || state.phase === 'mission_complete') {
    return state;
  }

  const specsInit = getStageFlightSpecs(parts, state.currentStage);
  const summary = evaluateRocketEngineering(parts, mission);

  let next: FlightState = {
    ...state,
    posZ: state.posZ ?? 0,
    velZ: state.velZ ?? 0
  };
  next.currentThrustN = specsInit.thrustN;
  next.currentIsp = specsInit.isp;
  next.currentDryMassKg = specsInit.dryMassKg;
  next.maxStage = specsInit.maxStage;

  // Handle manual override of active maneuver if player presses throttle/manual steering? No, keep SAS manual override only on manual keys
  const pitchIn = controls.pitchInput ?? 0;
  const yawIn = (controls.yawInput ?? 0) + (controls.rotateInput ?? 0);
  const rollIn = controls.rollInput ?? 0;
  const hasManualInput = Math.abs(pitchIn) > 0.01 || Math.abs(yawIn) > 0.01 || Math.abs(rollIn) > 0.01;

  // Pre-step Active Maneuver State Machine (window checks, aligning -> burning transitions, warp safety)
  if (next.activeManeuver && !hasManualInput) {
    const m = { ...next.activeManeuver };
    const distEta = getShipTargetDistanceAndEta(next, m.targetBody);
    m.distanceRemainingMeters = distEta.distanceMeters;

    if (m.phase === 'coasting_to_burn') {
      const timeToBurn = m.burnWindowElapsedSec - next.missionElapsedSec;
      m.etaSeconds = Math.max(0, timeToBurn);
      if (timeToBurn <= 12 && next.timeWarp > 1) {
        next.timeWarp = 1;
        m.autoWarpToArrival = false;
      }
      if (timeToBurn <= 4) {
        m.phase = 'aligning';
        next.timeWarp = 1;
        m.autoWarpToArrival = false;
        next.attitudeTarget = maneuverDirectionToAttitude(m.burnDirectionMode, m.targetBurnDir);
        next.statusMessage = `${m.label}: Aligning spacecraft attitude for burn...`;
      } else {
        next.ignited = false;
        next.throttle = 0;
        next.attitudeTarget = maneuverDirectionToAttitude(m.burnDirectionMode, m.targetBurnDir);
        next.statusMessage = `${m.label}: Coasting to burn window (${Math.round(timeToBurn)}s)`;
      }
    } else if (m.phase === 'capture_coast') {
      const kep = computeKeplerElements(
        next.posX,
        next.posY,
        next.posZ ?? 0,
        next.velX,
        next.velY,
        next.velZ ?? 0,
        next.soiBody
      );
      const tPeri = kep.timeToPeriSec;
      m.etaSeconds = tPeri;
      // Align & begin retrograde capture burn shortly before periapsis (or immediately if past/near periapsis)
      const rdot =
        (next.posX * next.velX + next.posY * next.velY + (next.posZ ?? 0) * (next.velZ ?? 0)) /
        Math.max(1, kep.r);
      if ((tPeri <= 20 || rdot >= -5 || kep.r <= kep.rPeri * 1.12) && next.timeWarp > 1) {
        next.timeWarp = 1;
        m.autoWarpToArrival = false;
      }
      if (tPeri <= 15 || rdot >= -2 || kep.r <= kep.rPeri * 1.08) {
        m.phase = 'aligning';
        m.burnDirectionMode = 'retrograde';
        const curBody = getBodyConfig(next.soiBody);
        const vCirc = Math.sqrt(curBody.mu / Math.max(1, kep.r));
        const vNow = Math.hypot(next.velX, next.velY, next.velZ ?? 0);
        m.requiredDeltaV = Math.max(80, vNow - vCirc);
        m.remainingDeltaV = m.requiredDeltaV;
        const est = estimateBurnTimeAndFuel(next, parts, m.requiredDeltaV);
        m.estimatedBurnSec = est.burnSec;
        m.estimatedFuelKg = est.fuelKg;
        next.timeWarp = 1;
        m.autoWarpToArrival = false;
        next.attitudeTarget = { type: 'retrograde' };
        next.statusMessage = `${m.label}: Aligning retrograde for ${curBody.name} orbital insertion!`;
      } else {
        next.ignited = false;
        next.throttle = 0;
        next.attitudeTarget = { type: 'retrograde' };
        next.statusMessage = `Inside ${getBodyConfig(next.soiBody).name} SOI — coasting to periapsis (${Math.round(tPeri)}s)`;
      }
    }

    if (m.phase === 'aligning') {
      next.timeWarp = 1;
      m.autoWarpToArrival = false;
      next.ignited = false;
      next.throttle = 0;
      const desiredTarget = maneuverDirectionToAttitude(m.burnDirectionMode, m.targetBurnDir);
      next.attitudeTarget = desiredTarget;
      const fwdW = getRocketForwardWorld(next);
      const wantW = computeDesiredWorldDir(next, desiredTarget);
      const aligned =
        !wantW ||
        fwdW[0] * wantW[0] + fwdW[1] * wantW[1] + fwdW[2] * wantW[2] > 0.985;
      if (aligned) {
        if (next.remainingFuelKg <= 5 && next.currentStage < next.maxStage) {
          next = deployNextStage(next, parts);
        }
        const isCaptureBurn =
          m.kind === 'transfer' && next.soiBody === m.targetBody;
        m.phase = isCaptureBurn ? 'capturing' : 'burning';
        next.ignited = next.remainingFuelKg > 0;
        next.throttle = 1.0;
        next.statusMessage = `${m.label}: Engine burn active (${Math.round(m.remainingDeltaV)} m/s remaining)`;
        next = appendMissionLog(
          next,
          'Maneuver Ignition',
          `${m.label} burn started (Δv ${Math.round(m.remainingDeltaV)} m/s).`,
          'action'
        );
      }
    } else if (m.phase === 'burning' || m.phase === 'capturing') {
      next.timeWarp = 1;
      m.autoWarpToArrival = false;
      if (next.remainingFuelKg <= 5 && next.currentStage < next.maxStage) {
        next = deployNextStage(next, parts);
      }
      next.attitudeTarget = maneuverDirectionToAttitude(m.burnDirectionMode, m.targetBurnDir);
      if (next.remainingFuelKg > 0 && next.currentThrustN > 0) {
        next.ignited = true;
        next.throttle = 1.0;
      }
      const est = estimateBurnTimeAndFuel(next, parts, m.remainingDeltaV);
      m.estimatedBurnSec = est.burnSec;
      m.estimatedFuelKg = est.fuelKg;
      m.etaSeconds = est.burnSec;
    } else if (m.phase === 'coasting_to_target') {
      next.ignited = false;
      next.throttle = 0;
      m.etaSeconds = distEta.etaSeconds;
      m.remainingDeltaV = 0;
      m.estimatedBurnSec = 0;
      m.estimatedFuelKg = 0;
    }

    next.activeManeuver = m;
  }

  const planet = getBodyConfig(next.soiBody);
  const specs = getStageFlightSpecs(parts, next.currentStage);
  next.currentThrustN = specs.thrustN;
  next.currentIsp = specs.isp;
  next.currentDryMassKg = specs.dryMassKg;
  next.maxStage = specs.maxStage;

  // Unified 3D quaternion attitude steering (works in vacuum/space and with engines off)
  let q = ensureAttitudeQuat(next);
  if (next.phase !== 'landed') {
    if (hasManualInput) {
      next.attitudeTarget = { type: 'manual' };
      const radStep = ((MANUAL_TURN_RATE_DEG * Math.PI) / 180) * dt;
      if (Math.abs(yawIn) > 0.01) {
        q = quatNormalize(quatMultiply(q, quatFromAxisAngle([0, 0, 1], -yawIn * radStep)));
      }
      if (Math.abs(pitchIn) > 0.01) {
        q = quatNormalize(quatMultiply(q, quatFromAxisAngle([1, 0, 0], -pitchIn * radStep)));
      }
      if (Math.abs(rollIn) > 0.01) {
        q = quatNormalize(quatMultiply(q, quatFromAxisAngle([0, 1, 0], -rollIn * radStep)));
      }
    } else if (next.attitudeTarget && next.attitudeTarget.type !== 'manual') {
      const sasMaxRad = ((SAS_SLEW_RATE_DEG * Math.PI) / 180) * dt;
      const target = next.attitudeTarget;
      if (target.type === 'up') {
        q = quatRotateTowards(q, [0, 0, 0, 1], sasMaxRad);
      } else if (target.type === 'angle') {
        const targetQ = quatFromAxisAngle([0, 0, 1], -(target.angleDeg * Math.PI) / 180);
        q = quatRotateTowards(q, targetQ, sasMaxRad);
      } else if (target.type === 'prograde' || target.type === 'retrograde') {
        const vRef = getReferenceVelocityWorld(next);
        const speedRef = Math.hypot(vRef[0], vRef[1], vRef[2]);
        if (speedRef > 0.5) {
          const { E, U, N } = getLocalHorizonBasis(next.posX, next.posY, next.posZ ?? 0);
          const sign = target.type === 'prograde' ? 1 : -1;
          const vE = (vRef[0] * E[0] + vRef[1] * E[1] + vRef[2] * E[2]) * sign;
          const vU = (vRef[0] * U[0] + vRef[1] * U[1] + vRef[2] * U[2]) * sign;
          const vN = (vRef[0] * N[0] + vRef[1] * N[1] + vRef[2] * N[2]) * sign;
          q = rotateNoseTowardsDir(q, [vE, vU, vN], sasMaxRad);
        }
      } else if (target.type === 'world_dir') {
        const { E, U, N } = getLocalHorizonBasis(next.posX, next.posY, next.posZ ?? 0);
        const dE = target.dirX * E[0] + target.dirY * E[1] + target.dirZ * E[2];
        const dU = target.dirX * U[0] + target.dirY * U[1] + target.dirZ * U[2];
        const dN = target.dirX * N[0] + target.dirY * N[1] + target.dirZ * N[2];
        q = rotateNoseTowardsDir(q, [dE, dU, dN], sasMaxRad);
      }
    }
  }

  next.attitudeQuat = q;
  const extracted = extractAnglesFromQuat(q, next.angleDeg);
  next.angleDeg = extracted.angleDeg;
  next.yawDeg = extracted.yawDeg;
  next.rollDeg = extracted.rollDeg;
  next._syncedAngles = [next.angleDeg, next.yawDeg, next.rollDeg];

  const prevAltBeforeStep = state.altitudeMeters;
  const prevSoiBeforeStep = state.soiBody;

  // Prelaunch pad lock until ignited & TWR > 1 or liftoff
  if (next.phase === 'prelaunch') {
    if (!next.ignited || next.throttle <= 0.01 || specs.thrustN <= 0) {
      next.altitudeMeters = 0;
      next.speedMs = 0;
      next.verticalSpeedMs = 0;
      next.horizontalSpeedMs = 0;
      next.atmosphereDensity = computeAtmosphereDensity(next.soiBody, 0);
      return next;
    }

    const weightN = (specs.dryMassKg + next.remainingFuelKg) * planet.surfaceGravity;
    if (specs.thrustN * next.throttle <= weightN) {
      next.statusMessage = 'Insufficient throttle / thrust to lift off! Increase throttle to 100%.';
      return next;
    }
    next.phase = 'ascent';
    next.statusMessage = 'Liftoff! Clear the tower and pitch east (+90°) for orbital assist.';
    next = appendMissionLog(
      next,
      'Liftoff',
      `Cleared launchpad tower on Stage ${next.currentStage + 1}.`,
      'milestone'
    );
  }

  if (next.phase === 'landed') {
    if (next.ignited && next.throttle > 0.1 && next.remainingFuelKg > 0 && specs.thrustN > 0) {
      next.phase = 'ascent';
      next.statusMessage = 'Ascending from planetary surface!';
      next = appendMissionLog(
        next,
        'Surface Liftoff',
        `Ascending from ${planet.name} surface.`,
        'milestone'
      );
    } else {
      return next;
    }
  }

  // Nose direction in rocket's local [East, Up, Normal] frame from unified attitude quaternion
  const fwdLocal = quatRotateVec(q, [0, 1, 0]);
  let pz = next.posZ ?? 0;
  let vz = next.velZ ?? 0;
  const simDt = dt * next.timeWarp;

  const isThrustersPotentiallyActive =
    next.ignited && next.throttle > 0.005 && next.remainingFuelKg > 0 && specs.thrustN > 0;
  const inAtmoNow =
    planet.atmosphereHeightMeters > 0 && next.altitudeMeters < planet.atmosphereHeightMeters;

  // Adaptive sub-stepping: fine in atmosphere/burns, Verlet-accurate across high time warp
  const maxH =
    isThrustersPotentiallyActive || inAtmoNow
      ? 0.25
      : next.soiBody === 'sun'
        ? 120
        : 4;
  const maxSteps = next.soiBody === 'sun' ? 320 : isThrustersPotentiallyActive || inAtmoNow ? 48 : 240;
  const subSteps = Math.min(maxSteps, Math.max(1, Math.ceil(simDt / maxH)));
  const h = simDt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    const activeBody = getBodyConfig(next.soiBody);
    const activeSpecs = getStageFlightSpecs(parts, next.currentStage);
    const r = Math.max(1, Math.hypot(next.posX, next.posY, pz));
    const alt = r - activeBody.radiusMeters;
    const { E, U, N } = getLocalHorizonBasis(next.posX, next.posY, pz);

    // Atmosphere & surface rotation wind
    const atmoDensity = computeAtmosphereDensity(next.soiBody, alt);
    const surfRotSpeed =
      activeBody.rotationVelocityEquatorial * (r / activeBody.radiusMeters);
    const relVx = next.velX - E[0] * surfRotSpeed;
    const relVy = next.velY - E[1] * surfRotSpeed;
    const relVz = vz - E[2] * surfRotSpeed;
    const relSpeed = Math.hypot(relVx, relVy, relVz);

    // Gravity acceleration toward active SOI body center
    const gravAcc = activeBody.mu / (r * r);
    let accX = -U[0] * gravAcc;
    let accY = -U[1] * gravAcc;
    let accZ = -U[2] * gravAcc;

    // Thrust strictly along rocket nose forwardVector: a = (thrust / mass) * forwardVector
    const totalMass = Math.max(200, activeSpecs.dryMassKg + next.remainingFuelKg);
    const thrustersActive =
      next.ignited &&
      next.throttle > 0.005 &&
      next.remainingFuelKg > 0 &&
      activeSpecs.thrustN > 0;

    if (thrustersActive) {
      const effThrust = activeSpecs.thrustN * next.throttle;
      const thrustAcc = effThrust / totalMass;
      // Re-align fwdLocal cleanly if SAS prograde/retrograde/world_dir is locked during burn
      let localFwd = fwdLocal;
      if (next.attitudeTarget && next.attitudeTarget.type !== 'manual') {
        const wantW = computeDesiredWorldDir(next, next.attitudeTarget);
        if (wantW) {
          const curW: Vec3 = [
            E[0] * fwdLocal[0] + U[0] * fwdLocal[1] + N[0] * fwdLocal[2],
            E[1] * fwdLocal[0] + U[1] * fwdLocal[1] + N[1] * fwdLocal[2],
            E[2] * fwdLocal[0] + U[2] * fwdLocal[1] + N[2] * fwdLocal[2]
          ];
          const dotW = curW[0] * wantW[0] + curW[1] * wantW[1] + curW[2] * wantW[2];
          if (dotW > 0.96) {
            localFwd = [
              wantW[0] * E[0] + wantW[1] * E[1] + wantW[2] * E[2],
              wantW[0] * U[0] + wantW[1] * U[1] + wantW[2] * U[2],
              wantW[0] * N[0] + wantW[1] * N[1] + wantW[2] * N[2]
            ];
          }
        }
      }
      const dirX = E[0] * localFwd[0] + U[0] * localFwd[1] + N[0] * localFwd[2];
      const dirY = E[1] * localFwd[0] + U[1] * localFwd[1] + N[1] * localFwd[2];
      const dirZ = E[2] * localFwd[0] + U[2] * localFwd[1] + N[2] * localFwd[2];
      accX += dirX * thrustAcc;
      accY += dirY * thrustAcc;
      accZ += dirZ * thrustAcc;

      const massFlow = effThrust / (activeSpecs.isp * G0);
      next.remainingFuelKg = Math.max(0, next.remainingFuelKg - massFlow * h);
      if (next.activeManeuver && (next.activeManeuver.phase === 'burning' || next.activeManeuver.phase === 'capturing')) {
        next.activeManeuver.remainingDeltaV = Math.max(
          0,
          next.activeManeuver.remainingDeltaV - thrustAcc * h
        );
      }

      if (next.remainingFuelKg <= 0) {
        if (next.activeManeuver && next.currentStage < next.maxStage) {
          next = deployNextStage(next, parts);
        } else {
          next.ignited = false;
          next.statusMessage =
            next.currentStage < next.maxStage
              ? 'Stage propellant depleted! Press SPACE or click STAGE to separate.'
              : 'Propellant depleted — coasting on orbital trajectory.';
          next = appendMissionLog(
            next,
            'Propellant Depleted',
            `Stage ${next.currentStage + 1} fuel exhausted.`,
            'info'
          );
        }
      }
    }

    // Aerodynamic drag & thrusters-off deceleration + thermal heating
    if (atmoDensity > 0 && relSpeed > 0.2) {
      const chuteFactor = next.chuteDeployed && activeSpecs.hasChute ? 28.0 : 1.0;
      const thrustersOffBrake = !thrustersActive ? 5.5 : 1.0;
      const effectiveDensity = !thrustersActive
        ? Math.max(atmoDensity, alt < activeBody.atmosphereHeightMeters ? 0.045 : 0)
        : atmoDensity;
      const dragAreaCd = 3.2 * chuteFactor * thrustersOffBrake;
      const linearBrake = !thrustersActive && !next.chuteDeployed ? relSpeed * 0.28 * totalMass : 0;
      const dragForce =
        0.5 * effectiveDensity * 1.225 * relSpeed * relSpeed * dragAreaCd + linearBrake;
      const dragAcc = Math.min(dragForce / totalMass, relSpeed / h);
      accX -= (relVx / relSpeed) * dragAcc;
      accY -= (relVy / relSpeed) * dragAcc;
      accZ -= (relVz / relSpeed) * dragAcc;

      const heatRate = atmoDensity * Math.pow(relSpeed / 900, 2.4) * 18;
      if (heatRate > 1.2) {
        const shieldMitigation = activeSpecs.hasHeatShield ? 0.18 : 1.0;
        next.heatLoad = Math.min(120, next.heatLoad + heatRate * shieldMitigation * h);
        if (next.heatLoad >= 100 && !activeSpecs.hasHeatShield) {
          next.phase = 'crashed';
          next.activeManeuver = null;
          next.timeWarp = 1;
          next.statusMessage =
            'Atmospheric burn-up! Spacecraft lacked an Ablative Heat Shield for reentry.';
          next = appendMissionLog(
            next,
            'Spacecraft Lost',
            `Thermal burn-up in ${activeBody.name} atmosphere (no Heat Shield).`,
            'danger'
          );
          break;
        }
      } else {
        next.heatLoad = Math.max(0, next.heatLoad - 6 * h);
      }
    } else {
      next.heatLoad = Math.max(0, next.heatLoad - 10 * h);
    }

    // Integrate velocity and position continuously (Velocity Verlet in vacuum for orbital energy conservation)
    if (atmoDensity <= 0 && !thrustersActive) {
      const vhx = next.velX + accX * 0.5 * h;
      const vhy = next.velY + accY * 0.5 * h;
      const vhz = vz + accZ * 0.5 * h;
      next.posX += vhx * h;
      next.posY += vhy * h;
      pz += vhz * h;
      const rNext = Math.max(1, Math.hypot(next.posX, next.posY, pz));
      const gNext = -activeBody.mu / (rNext * rNext * rNext);
      next.velX = vhx + next.posX * gNext * 0.5 * h;
      next.velY = vhy + next.posY * gNext * 0.5 * h;
      vz = vhz + pz * gNext * 0.5 * h;
    } else {
      next.velX += accX * h;
      next.velY += accY * h;
      vz += accZ * h;
      next.posX += next.velX * h;
      next.posY += next.velY * h;
      pz += vz * h;
    }
    next.missionElapsedSec += h;
    next.missionDays = next.missionElapsedSec / 86400;

    // Evaluate Active Maneuver burn termination conditions at each substep (never overshoot!)
    if (next.activeManeuver && (next.activeManeuver.phase === 'burning' || next.activeManeuver.phase === 'capturing')) {
      const m = next.activeManeuver;
      const kepNow = computeKeplerElements(
        next.posX,
        next.posY,
        pz,
        next.velX,
        next.velY,
        vz,
        next.soiBody
      );
      const minSafeAltKm = Math.max(18, activeBody.atmosphereHeightMeters / 1000 + 10);

      if (m.kind === 'circularize') {
        const done =
          (!kepNow.isEscaping && kepNow.eccentricity < 0.045 && kepNow.periapsisKm >= minSafeAltKm) ||
          (m.remainingDeltaV <= 0.5 && !kepNow.isEscaping && kepNow.periapsisKm >= minSafeAltKm * 0.8);
        if (done) {
          next.ignited = false;
          next.throttle = 0;
          next.timeWarp = 1;
          next.activeManeuver = null;
          next.orbitAchieved = true;
          next.earthOrbitCompleted = next.earthOrbitCompleted || next.soiBody === 'earth';
          next.moonOrbitCompleted = next.moonOrbitCompleted || next.soiBody === 'moon';
          next.routeLegIndex =
            next.soiBody === 'earth' && next.missionRoute[1] === 'moon'
              ? Math.max(next.routeLegIndex, 1)
              : next.soiBody === 'moon' && next.missionRoute.includes('mars')
                ? Math.max(next.routeLegIndex, 2)
                : next.routeLegIndex;
          const circSpd = Math.hypot(next.velX, next.velY, vz);
          next.statusMessage = `${activeBody.name} circular orbit locked at ${Math.round((kepNow.r - activeBody.radiusMeters) / 1000)} km!`;
          next = appendMissionLog(
            next,
            'Orbit Achieved',
            `Circularized ${activeBody.name} orbit (${Math.round(kepNow.periapsisKm)} × ${Math.round(kepNow.apoapsisKm)} km, ${Math.round(circSpd)} m/s).`,
            'milestone'
          );
        }
      } else if (m.kind === 'deorbit') {
        const targetPe = m.targetPeriapsisKm ?? (activeBody.atmosphereHeightMeters > 0 ? Math.max(15, activeBody.atmosphereHeightMeters / 1000 * 0.45) : -8);
        if (
          (!kepNow.isEscaping && kepNow.periapsisKm <= targetPe) ||
          m.remainingDeltaV <= 0.5
        ) {
          next.ignited = false;
          next.throttle = 0;
          next.timeWarp = 1;
          next.activeManeuver = null;
          next.attitudeTarget = { type: 'up' };
          next.statusMessage = `Deorbit burn complete over ${activeBody.name}! Descending toward surface (${Math.round(kepNow.periapsisKm)} km Pe).`;
          next = appendMissionLog(
            next,
            'Deorbit Burn',
            `Periapsis lowered to ${Math.round(kepNow.periapsisKm)} km — continuous descent to ${activeBody.name}.`,
            'action'
          );
        }
      } else if (m.kind === 'transfer' && m.phase === 'burning') {
        if (next.soiBody === 'earth' && m.targetBody === 'moon') {
          if (kepNow.rApo >= PLANETS.moon.orbitRadiusSimMeters * 1.015 || m.remainingDeltaV <= 0.5) {
            next.ignited = false;
            next.throttle = 0;
            m.phase = 'coasting_to_target';
            m.remainingDeltaV = 0;
            next.statusMessage = `TLI burn complete — coasting to Moon’s SOI! Use Time Warp or Warp to Arrival.`;
            next = appendMissionLog(
              next,
              'TLI Burn Complete',
              `Ballistic transfer toward Moon’s orbit established (Ap ${Number.isFinite(kepNow.apoapsisKm) ? `${Math.round(kepNow.apoapsisKm)} km` : 'ESCAPE'}).`,
              'milestone'
            );
          }
        } else if (next.soiBody === 'moon' && (m.targetBody === 'mars' || m.targetBody === 'venus')) {
          if ((kepNow.isEscaping && m.remainingDeltaV <= 0.5) || (kepNow.isEscaping && Math.hypot(next.velX, next.velY, vz) > Math.sqrt((2 * activeBody.mu) / kepNow.r) + 210)) {
            next.ignited = false;
            next.throttle = 0;
            m.phase = 'coasting_to_target';
            m.remainingDeltaV = 0;
            next.statusMessage = `Lunar escape burn complete — exiting Moon SOI toward ${PLANETS[m.targetBody].name}!`;
            next = appendMissionLog(
              next,
              `Launched Moon Orbit → ${PLANETS[m.targetBody].name}`,
              `Escaping lunar SOI en route to ${PLANETS[m.targetBody].name}.`,
              'action'
            );
          }
        } else if (next.soiBody === 'earth' && (m.targetBody === 'mars' || m.targetBody === 'venus')) {
          if (m.remainingDeltaV <= 0.5 && kepNow.isEscaping) {
            next.ignited = false;
            next.throttle = 0;
            m.phase = 'coasting_to_target';
            m.remainingDeltaV = 0;
            next.statusMessage = `Earth escape burn complete — coasting out of Earth SOI toward ${PLANETS[m.targetBody].name}!`;
            next = appendMissionLog(
              next,
              'Earth Escape Burn',
              `Hyperbolic escape trajectory established toward ${PLANETS[m.targetBody].name}.`,
              'milestone'
            );
          }
        } else if (next.soiBody === 'sun') {
          if (m.remainingDeltaV <= 0.5) {
            next.ignited = false;
            next.throttle = 0;
            m.phase = 'coasting_to_target';
            m.mccDone = true;
            m.remainingDeltaV = 0;
            next.statusMessage = `Course locked for ${PLANETS[m.targetBody].name} — coasting on heliocentric transfer!`;
            next = appendMissionLog(
              next,
              'Heliocentric Course Locked',
              `Mid-course trim complete — ballistic coast to ${PLANETS[m.targetBody].name} SOI.`,
              'milestone'
            );
          }
        } else if (next.soiBody === m.targetBody) {
          // Approach periapsis raise TCM burn inside target planet SOI
          if (kepNow.periapsisKm >= minSafeAltKm + 25 || m.remainingDeltaV <= 0.5) {
            next.ignited = false;
            next.throttle = 0;
            m.phase = 'capture_coast';
            m.remainingDeltaV = 0;
            next.attitudeTarget = { type: 'retrograde' };
            next.statusMessage = `${activeBody.name} periapsis raised to ${Math.round(kepNow.periapsisKm)} km — coasting to capture burn!`;
          }
        } else if (m.remainingDeltaV <= 0.5) {
          // Earth-Moon coasting trim burn complete
          next.ignited = false;
          next.throttle = 0;
          m.phase = 'coasting_to_target';
          m.mccDone = true;
          m.remainingDeltaV = 0;
        }
      } else if (m.kind === 'transfer' && m.phase === 'capturing') {
        const captureDone =
          !kepNow.isEscaping &&
          (kepNow.eccentricity < 0.22 || m.remainingDeltaV <= 0.5) &&
          kepNow.periapsisKm >= minSafeAltKm * 0.7;
        if (captureDone) {
          next.ignited = false;
          next.throttle = 0;
          next.timeWarp = 1;
          next.activeManeuver = null;
          next.orbitAchieved = true;
          next.attitudeTarget = { type: 'prograde' };
          if (next.soiBody === 'moon') {
            next.moonOrbitCompleted = true;
            next.routeLegIndex = Math.max(next.routeLegIndex, 2);
            next.statusMessage =
              mission.targetBody === 'moon'
                ? `Entered Moon’s Orbit (${Math.round(kepNow.periapsisKm)} × ${Math.round(kepNow.apoapsisKm)} km)! Prepare Deorbit to land.`
                : `Entered Moon’s Orbit (${Math.round(kepNow.periapsisKm)} km)! Launch through lunar orbit to head for ${PLANETS[mission.targetBody].name}.`;
            next = appendMissionLog(
              next,
              'Moon Orbit Achieved',
              `Lunar capture complete (${Math.round(kepNow.periapsisKm)} × ${Math.round(kepNow.apoapsisKm)} km).`,
              'milestone'
            );
          } else if (next.soiBody !== 'sun') {
            next.routeLegIndex = next.missionRoute.length - 1;
            next.statusMessage = `Arrived at ${activeBody.name} Orbit (${Math.round(kepNow.periapsisKm)} km, Day ${next.missionDays.toFixed(1)}). Deorbit & descend through ${activeBody.name}’s atmosphere!`;
            next = appendMissionLog(
              next,
              'Orbit Achieved',
              `${activeBody.name} capture complete (${Math.round(kepNow.periapsisKm)} × ${Math.round(kepNow.apoapsisKm)} km).`,
              'milestone'
            );
          }
        }
      }
    }

    // Real-Time SOI Transitions & Auto-Warp Boundary Drops (Zero Teleports!)
    if (next.soiBody === 'earth') {
      const moonState = getMoonEarthState(next.missionElapsedSec);
      const relMx = next.posX - moonState.x;
      const relMy = next.posY - moonState.y;
      const distToMoon = Math.hypot(relMx, relMy, pz);
      const relApproachDot =
        relMx * (next.velX - moonState.vx) +
        relMy * (next.velY - moonState.vy) +
        pz * vz;

      // Automatically drop time warp before entering Moon SOI
      if (
        distToMoon < PLANETS.moon.soiRadiusMeters * 1.12 &&
        distToMoon >= PLANETS.moon.soiRadiusMeters * 0.94 &&
        relApproachDot < 0 &&
        (next.timeWarp > 1 || next.activeManeuver?.autoWarpToArrival)
      ) {
        next.timeWarp = 1;
        if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
      }

      if (distToMoon < PLANETS.moon.soiRadiusMeters * 0.94 && relApproachDot < 0) {
        next.soiBody = 'moon';
        next.posX = relMx;
        next.posY = relMy;
        next.velX = next.velX - moonState.vx;
        next.velY = next.velY - moonState.vy;
        next.timeWarp = 1;
        if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
        next.statusMessage = 'Entered Moon Sphere of Influence (SOI)!';
        next = appendMissionLog(
          next,
          'SOI Transition',
          'Entered Moon Sphere of Influence (SOI).',
          'milestone'
        );

        // If executing lunar transfer (and not flyby/impact), check entry periapsis & prepare capture
        if (next.activeManeuver?.kind === 'transfer' && next.activeManeuver.targetBody === 'moon') {
          if (next.activeManeuver.skipCapture) {
            next.activeManeuver = null;
          } else {
            const kepEntry = computeKeplerElements(next.posX, next.posY, pz, next.velX, next.velY, vz, 'moon');
            const minSafeKm = 30;
            if (kepEntry.periapsisKm < minSafeKm) {
              const basisE = getLocalHorizonBasis(next.posX, next.posY, pz);
              const vDotU = next.velX * basisE.U[0] + next.velY * basisE.U[1] + vz * basisE.U[2];
              let tx = next.velX - basisE.U[0] * vDotU;
              let ty = next.velY - basisE.U[1] * vDotU;
              let tz = vz - basisE.U[2] * vDotU;
              const tLen = Math.hypot(tx, ty, tz);
              if (tLen > 5) {
                tx /= tLen;
                ty /= tLen;
                tz /= tLen;
              } else {
                [tx, ty, tz] = basisE.E;
              }
              const dvTrim = 140;
              const est = estimateBurnTimeAndFuel(next, parts, dvTrim);
              next.activeManeuver = {
                ...next.activeManeuver,
                phase: 'aligning',
                requiredDeltaV: dvTrim,
                remainingDeltaV: dvTrim,
                estimatedBurnSec: est.burnSec,
                estimatedFuelKg: est.fuelKg,
                burnDirectionMode: 'world_dir',
                targetBurnDir: [tx, ty, tz]
              };
              next.attitudeTarget = { type: 'world_dir', dirX: tx, dirY: ty, dirZ: tz };
            } else {
              next.activeManeuver.phase = 'capture_coast';
              next.attitudeTarget = { type: 'retrograde' };
            }
          }
        }
        break;
      }

      // Leaving Earth SOI -> Enter Sun Heliocentric Space!
      const rEarth = Math.hypot(next.posX, next.posY, pz);
      if (rEarth > PLANETS.earth.soiRadiusMeters * 0.96 && next.timeWarp > 100) {
        next.timeWarp = 10;
      }
      if (rEarth > PLANETS.earth.soiRadiusMeters) {
        const earthState = getPlanetHeliocentricState('earth', next.missionElapsedSec);
        next.soiBody = 'sun';
        next.posX = earthState.x + next.posX;
        next.posY = earthState.y + next.posY;
        next.velX = earthState.vx + next.velX;
        next.velY = earthState.vy + next.velY;
        next.timeWarp = 1;
        if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
        next.statusMessage = 'Escaped Earth SOI — entering Heliocentric Deep Space!';
        next = appendMissionLog(
          next,
          'SOI Transition',
          'Left Earth Sphere of Influence into Heliocentric Space.',
          'milestone'
        );

        // If on interplanetary transfer, compute real mid-course intercept burn toward target planet
        if (
          next.activeManeuver?.kind === 'transfer' &&
          (next.activeManeuver.targetBody === 'mars' || next.activeManeuver.targetBody === 'venus')
        ) {
          const solved = solveHeliocentricIntercept(
            next.posX,
            next.posY,
            pz,
            next.velX,
            next.velY,
            vz,
            next.missionElapsedSec,
            next.activeManeuver.targetBody
          );
          const dvX = solved.reqVx - next.velX;
          const dvY = solved.reqVy - next.velY;
          const dvZ = solved.reqVz - vz;
          const dvMag = Math.hypot(dvX, dvY, dvZ);
          if (dvMag > 12) {
            const est = estimateBurnTimeAndFuel(next, parts, dvMag);
            next.activeManeuver = {
              ...next.activeManeuver,
              phase: 'aligning',
              requiredDeltaV: dvMag,
              remainingDeltaV: dvMag,
              estimatedBurnSec: est.burnSec,
              estimatedFuelKg: est.fuelKg,
              burnDirectionMode: 'world_dir',
              targetBurnDir: [dvX / dvMag, dvY / dvMag, dvZ / dvMag],
              etaSeconds: solved.coastSec
            };
            next.attitudeTarget = {
              type: 'world_dir',
              dirX: dvX / dvMag,
              dirY: dvY / dvMag,
              dirZ: dvZ / dvMag
            };
            next.statusMessage = `In Sun SOI — aligning for ${Math.round(dvMag)} m/s ${PLANETS[next.activeManeuver.targetBody].name} course burn.`;
          } else {
            next.activeManeuver.phase = 'coasting_to_target';
            next.activeManeuver.etaSeconds = solved.coastSec;
          }
        }
        break;
      }

      // Mid-course lunar intercept check in Earth SOI after TLI burn
      if (
        next.activeManeuver?.kind === 'transfer' &&
        next.activeManeuver.targetBody === 'moon' &&
        next.activeManeuver.phase === 'coasting_to_target' &&
        !next.activeManeuver.mccDone &&
        rEarth > PLANETS.earth.radiusMeters + 350_000
      ) {
        const lunarCorr = solveLunarInterceptCorrection(
          next.posX,
          next.posY,
          pz,
          next.velX,
          next.velY,
          vz,
          next.missionElapsedSec
        );
        const dvMag = Math.hypot(lunarCorr.dvX, lunarCorr.dvY, lunarCorr.dvZ);
        if (lunarCorr.minDist > PLANETS.moon.soiRadiusMeters * 0.45 && dvMag > 8) {
          const est = estimateBurnTimeAndFuel(next, parts, dvMag);
          next.timeWarp = 1;
          next.activeManeuver = {
            ...next.activeManeuver,
            phase: 'aligning',
            mccDone: true,
            autoWarpToArrival: false,
            requiredDeltaV: dvMag,
            remainingDeltaV: dvMag,
            estimatedBurnSec: est.burnSec,
            estimatedFuelKg: est.fuelKg,
            burnDirectionMode: 'world_dir',
            targetBurnDir: [lunarCorr.dvX / dvMag, lunarCorr.dvY / dvMag, lunarCorr.dvZ / dvMag]
          };
          next.attitudeTarget = {
            type: 'world_dir',
            dirX: lunarCorr.dvX / dvMag,
            dirY: lunarCorr.dvY / dvMag,
            dirZ: lunarCorr.dvZ / dvMag
          };
          break;
        } else {
          next.activeManeuver.mccDone = true;
        }
      }
    } else if (next.soiBody === 'moon') {
      const rMoon = Math.hypot(next.posX, next.posY, pz);
      if (rMoon > PLANETS.moon.soiRadiusMeters) {
        const moonState = getMoonEarthState(next.missionElapsedSec);
        next.soiBody = 'earth';
        next.posX = moonState.x + next.posX;
        next.posY = moonState.y + next.posY;
        next.velX = moonState.vx + next.velX;
        next.velY = moonState.vy + next.velY;
        next.timeWarp = 1;
        if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
        next.statusMessage = 'Left Moon SOI — back in Earth Sphere of Influence.';
        next = appendMissionLog(
          next,
          'SOI Transition',
          'Exited Moon SOI into Earth Sphere of Influence.',
          'milestone'
        );

        // If on transfer to Mars or Venus, set up Earth-escape injection burn only if needed
        if (
          next.activeManeuver?.kind === 'transfer' &&
          (next.activeManeuver.targetBody === 'mars' || next.activeManeuver.targetBody === 'venus')
        ) {
          const rE = Math.hypot(next.posX, next.posY, pz);
          const vEsc = Math.sqrt((2 * PLANETS.earth.mu) / rE);
          const vInf = 520;
          const vReq = Math.sqrt(vEsc * vEsc + vInf * vInf);
          const vNow = Math.hypot(next.velX, next.velY, vz);
          const dv = Math.max(0, vReq - vNow);
          if (dv > 35) {
            const est = estimateBurnTimeAndFuel(next, parts, dv);
            next.activeManeuver = {
              ...next.activeManeuver,
              phase: 'aligning',
              requiredDeltaV: dv,
              remainingDeltaV: dv,
              estimatedBurnSec: est.burnSec,
              estimatedFuelKg: est.fuelKg,
              burnDirectionMode: 'prograde'
            };
            next.attitudeTarget = { type: 'prograde' };
          } else {
            next.activeManeuver = {
              ...next.activeManeuver,
              phase: 'coasting_to_target',
              requiredDeltaV: 0,
              remainingDeltaV: 0,
              estimatedBurnSec: 0,
              estimatedFuelKg: 0
            };
          }
        }
        break;
      }
    } else if (next.soiBody === 'sun') {
      const checkPlanets: PlanetId[] = ['mars', 'venus', 'earth'];
      let enteredBody: PlanetId | null = null;
      for (const pid of checkPlanets) {
        const pCfg = PLANETS[pid];
        const pState = getPlanetHeliocentricState(pid, next.missionElapsedSec);
        const dist = Math.hypot(next.posX - pState.x, next.posY - pState.y, pz);

        if (
          dist < pCfg.soiRadiusMeters * 1.15 &&
          dist >= pCfg.soiRadiusMeters &&
          (next.timeWarp > 1 || next.activeManeuver?.autoWarpToArrival) &&
          (pid !== 'earth' || next.activeManeuver?.targetBody === 'earth')
        ) {
          next.timeWarp = 1;
          if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
        }

        if (
          dist < pCfg.soiRadiusMeters &&
          (pid !== 'earth' || next.activeManeuver?.targetBody === 'earth')
        ) {
          enteredBody = pid;
          next.soiBody = pid;
          next.posX = next.posX - pState.x;
          next.posY = next.posY - pState.y;
          next.velX = next.velX - pState.vx;
          next.velY = next.velY - pState.vy;
          next.timeWarp = 1;
          if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
          next.statusMessage = `Arrived at ${pCfg.name} SOI (Day ${next.missionDays.toFixed(1)})!`;
          next = appendMissionLog(
            next,
            `Arrived at ${pCfg.name} SOI`,
            `Entered ${pCfg.name} Sphere of Influence on Day ${next.missionDays.toFixed(2)}.`,
            'milestone'
          );

          if (next.activeManeuver?.kind === 'transfer' && next.activeManeuver.targetBody === pid) {
            if (next.activeManeuver.skipCapture) {
              next.activeManeuver = null;
            } else {
              const kepEntry = computeKeplerElements(next.posX, next.posY, pz, next.velX, next.velY, vz, pid);
              const minSafeKm = Math.max(25, pCfg.atmosphereHeightMeters / 1000 + 25);
              if (kepEntry.periapsisKm < minSafeKm) {
                const basisE = getLocalHorizonBasis(next.posX, next.posY, pz);
                const vDotU = next.velX * basisE.U[0] + next.velY * basisE.U[1] + vz * basisE.U[2];
                let tx = next.velX - basisE.U[0] * vDotU;
                let ty = next.velY - basisE.U[1] * vDotU;
                let tz = vz - basisE.U[2] * vDotU;
                const tLen = Math.hypot(tx, ty, tz);
                if (tLen > 5) {
                  tx /= tLen;
                  ty /= tLen;
                  tz /= tLen;
                } else {
                  [tx, ty, tz] = basisE.E;
                }
                const dvTrim = 220;
                const est = estimateBurnTimeAndFuel(next, parts, dvTrim);
                next.activeManeuver = {
                  ...next.activeManeuver,
                  phase: 'aligning',
                  requiredDeltaV: dvTrim,
                  remainingDeltaV: dvTrim,
                  estimatedBurnSec: est.burnSec,
                  estimatedFuelKg: est.fuelKg,
                  burnDirectionMode: 'world_dir',
                  targetBurnDir: [tx, ty, tz]
                };
                next.attitudeTarget = { type: 'world_dir', dirX: tx, dirY: ty, dirZ: tz };
              } else {
                next.activeManeuver.phase = 'capture_coast';
                next.attitudeTarget = { type: 'retrograde' };
              }
            }
          }
          break;
        }
      }
      if (enteredBody) break;
    }

    // Ground / Surface Collision & Realistic Landing Check (only for planetary bodies)
    if (next.soiBody !== 'sun') {
      const postBody = getBodyConfig(next.soiBody);
      const newR = Math.hypot(next.posX, next.posY, pz);
      const newAlt = newR - postBody.radiusMeters;
      if (newAlt <= 0) {
        const norm = getLocalHorizonBasis(next.posX, next.posY, pz);
        next.posX = norm.U[0] * postBody.radiusMeters;
        next.posY = norm.U[1] * postBody.radiusMeters;
        pz = norm.U[2] * postBody.radiusMeters;

        const rotX = norm.E[0] * postBody.rotationVelocityEquatorial;
        const rotY = norm.E[1] * postBody.rotationVelocityEquatorial;
        const rotZ = norm.E[2] * postBody.rotationVelocityEquatorial;
        const impactSpeed = Math.hypot(next.velX - rotX, next.velY - rotY, vz - rotZ);

        const dot = Math.max(-1, Math.min(1, fwdLocal[1]));
        const tiltDeg = (Math.acos(dot) * 180) / Math.PI;

        const maxSafeSpeed = next.legsDeployed && activeSpecs.hasLegs ? 18 : 8;
        const maxSafeTilt = next.legsDeployed && activeSpecs.hasLegs ? 28 : 14;

        next.velX = rotX;
        next.velY = rotY;
        vz = rotZ;
        next.altitudeMeters = 0;
        next.speedMs = impactSpeed;
        next.activeManeuver = null;
        next.timeWarp = 1;

        if (
          mission.targetBody === next.soiBody &&
          mission.objectiveType === 'impact' &&
          impactSpeed > 15
        ) {
          next.phase = 'mission_complete';
          next.scienceCompleted = true;
          next.statusMessage = `Direct lunar impact achieved at ${impactSpeed.toFixed(0)} m/s! ${mission.name} telemetry received.`;
          next = appendMissionLog(
            next,
            'Mission Accomplished',
            `Impact telemetry confirmed on ${postBody.name} at ${impactSpeed.toFixed(0)} m/s.`,
            'success'
          );
          break;
        }

        if (impactSpeed <= maxSafeSpeed && tiltDeg <= maxSafeTilt) {
          next.phase = 'landed';
          next.chuteDeployed = false;
          if (
            mission.targetBody === next.soiBody &&
            (mission.objectiveType === 'soft_landing' || mission.objectiveType === 'sample_return')
          ) {
            next.phase = 'mission_complete';
            next.scienceCompleted = true;
            next.statusMessage = `Touchdown confirmed on ${postBody.name} at ${impactSpeed.toFixed(1)} m/s! Mission Accomplished.`;
            next = appendMissionLog(
              next,
              'Mission Accomplished',
              `Soft touchdown on ${postBody.name} at ${impactSpeed.toFixed(1)} m/s.`,
              'success'
            );
          } else {
            next.statusMessage = `Safe landing on ${postBody.name} at ${impactSpeed.toFixed(1)} m/s.`;
            next = appendMissionLog(
              next,
              'Safe Touchdown',
              `Landed on ${postBody.name} at ${impactSpeed.toFixed(1)} m/s.`,
              'milestone'
            );
          }
        } else {
          next.phase = 'crashed';
          next.statusMessage =
            impactSpeed > maxSafeSpeed
              ? `Crash landing on ${postBody.name}! Impact speed ${impactSpeed.toFixed(1)} m/s exceeded ${maxSafeSpeed} m/s limit.`
              : `Landed tilted ${tiltDeg.toFixed(0)}° (limit ${maxSafeTilt}°) — spacecraft tipped over on ${postBody.name}.`;
          next = appendMissionLog(next, 'Spacecraft Lost', next.statusMessage, 'danger');
        }
        break;
      }
    }
  }

  next.posZ = pz;
  next.velZ = vz;

  // Update telemetry
  const finalPlanet = getBodyConfig(next.soiBody);
  const finalR = Math.max(1, Math.hypot(next.posX, next.posY, pz));
  const finalBasis = getLocalHorizonBasis(next.posX, next.posY, pz);

  next.altitudeMeters = Math.max(0, finalR - finalPlanet.radiusMeters);
  next.atmosphereDensity = computeAtmosphereDensity(next.soiBody, next.altitudeMeters);
  next.atmosphereLayerName = getAtmosphereLayerName(next.soiBody, next.altitudeMeters);

  // Auto-drop time warp upon entering atmosphere or descending low
  if (
    finalPlanet.atmosphereHeightMeters > 0 &&
    next.altitudeMeters < finalPlanet.atmosphereHeightMeters &&
    next.altitudeMeters > 1000 &&
    next.verticalSpeedMs < -20 &&
    next.timeWarp > 10
  ) {
    next.timeWarp = 1;
    if (next.activeManeuver) next.activeManeuver.autoWarpToArrival = false;
  }

  const surfRotFinal =
    finalPlanet.rotationVelocityEquatorial * (finalR / finalPlanet.radiusMeters);
  const inAtmo =
    finalPlanet.atmosphereHeightMeters > 0 && next.altitudeMeters < finalPlanet.atmosphereHeightMeters;
  const dispVx = inAtmo ? next.velX - finalBasis.E[0] * surfRotFinal : next.velX;
  const dispVy = inAtmo ? next.velY - finalBasis.E[1] * surfRotFinal : next.velY;
  const dispVz = inAtmo ? vz - finalBasis.E[2] * surfRotFinal : vz;

  next.verticalSpeedMs =
    dispVx * finalBasis.U[0] + dispVy * finalBasis.U[1] + dispVz * finalBasis.U[2];
  next.horizontalSpeedMs =
    dispVx * finalBasis.E[0] + dispVy * finalBasis.E[1] + dispVz * finalBasis.E[2];
  if (next.phase !== 'crashed' && next.phase !== 'landed' && next.altitudeMeters > 0) {
    next.speedMs = Math.hypot(dispVx, dispVy, dispVz);
  }
  next.missionDays = next.missionElapsedSec / 86400;

  // Refresh live maneuver distance/ETA if still active
  if (next.activeManeuver) {
    const distEta = getShipTargetDistanceAndEta(next, next.activeManeuver.targetBody);
    next.activeManeuver.distanceRemainingMeters = distEta.distanceMeters;
    if (next.activeManeuver.phase === 'coasting_to_target') {
      next.activeManeuver.etaSeconds = distEta.etaSeconds;
    }
  }

  // Phase & Atmospheric boundary crossing updates
  if (next.phase !== 'crashed' && next.phase !== 'landed' && next.phase !== 'mission_complete') {
    if (
      finalPlanet.atmosphereHeightMeters > 0 &&
      prevSoiBeforeStep === next.soiBody &&
      prevAltBeforeStep <= finalPlanet.atmosphereHeightMeters &&
      next.altitudeMeters > finalPlanet.atmosphereHeightMeters
    ) {
      next = appendMissionLog(
        next,
        'Atmospheric Exit',
        `Cleared ${finalPlanet.name} atmosphere (${(finalPlanet.atmosphereHeightMeters / 1000).toFixed(0)} km) into space.`,
        'milestone'
      );
    } else if (
      finalPlanet.atmosphereHeightMeters > 0 &&
      prevSoiBeforeStep === next.soiBody &&
      prevAltBeforeStep > finalPlanet.atmosphereHeightMeters &&
      next.altitudeMeters <= finalPlanet.atmosphereHeightMeters
    ) {
      next = appendMissionLog(
        next,
        'Atmospheric Entry',
        `Entered ${finalPlanet.name} atmosphere below ${(finalPlanet.atmosphereHeightMeters / 1000).toFixed(0)} km.`,
        'info'
      );
    }

    if (next.altitudeMeters > finalPlanet.atmosphereHeightMeters) {
      next.phase = 'space';
      next.solarDeployed = true;
    } else if (next.verticalSpeedMs < -20 && next.heatLoad > 15) {
      next.phase = 'reentry';
    } else {
      next.phase = 'ascent';
    }
  }

  // Evaluate orbit & mission objectives
  const traj = predictTrajectory(next, 0, 90);
  const inTargetOrbit =
    next.soiBody === mission.targetBody &&
    !traj.isEscaping &&
    traj.periapsisKm >= mission.targetOrbitKm.min &&
    traj.apoapsisKm <= mission.targetOrbitKm.max * 1.35;

  if (next.soiBody === 'earth' && traj.periapsisKm >= 80 && !traj.isEscaping) {
    next.orbitAchieved = true;
    next.earthOrbitCompleted = true;
    if (next.routeLegIndex < 1 && next.missionRoute[1] === 'moon') {
      next.routeLegIndex = 1;
      next.statusMessage = 'Earth Orbit achieved! Ready for TLI burn to Moon’s Orbit.';
    }
    if (!next.missionLog.some((e) => e.title === 'Orbit Achieved' && e.detail.includes('Earth'))) {
      next = appendMissionLog(
        next,
        'Orbit Achieved',
        `Stable Earth orbit (${Math.round(traj.periapsisKm)} × ${Math.round(traj.apoapsisKm)} km).`,
        'milestone'
      );
    }
  } else if (next.soiBody === 'moon' && traj.periapsisKm >= 15 && !traj.isEscaping) {
    next.orbitAchieved = true;
    next.moonOrbitCompleted = true;
    if (next.routeLegIndex < 2 && next.missionRoute.includes('mars')) {
      next.routeLegIndex = 2;
      next.statusMessage = 'Moon Orbit achieved! Launch through lunar orbit towards Mars.';
    }
    if (!next.missionLog.some((e) => e.title === 'Moon Orbit Achieved')) {
      next = appendMissionLog(
        next,
        'Moon Orbit Achieved',
        `Stable lunar staging orbit (${Math.round(traj.periapsisKm)} × ${Math.round(traj.apoapsisKm)} km).`,
        'milestone'
      );
    }
  }

  // Comms & power check
  const commsRequired = mission.requirements.minCommsAU;
  next.commsConnected = summary.maxCommsAU >= commsRequired;
  if (summary.netPowerW < 0 && next.phase === 'space') {
    next.powerPercent = Math.max(0, next.powerPercent - 0.5 * dt);
  } else {
    next.powerPercent = Math.min(100, next.powerPercent + 2 * dt);
  }

  // Check orbit / flyby / gravity assist mission completion
  if (next.phase !== 'crashed' && next.phase !== 'mission_complete') {
    if (
      (mission.objectiveType === 'orbit' || mission.objectiveType === 'geostationary') &&
      inTargetOrbit &&
      next.commsConnected
    ) {
      next.phase = 'mission_complete';
      next.scienceCompleted = true;
      next.orbitAchieved = true;
      next.statusMessage = `Stable target orbit achieved (${Math.round(traj.periapsisKm)} × ${Math.round(traj.apoapsisKm)} km)! ${mission.name} Mission Complete.`;
      if (
        !next.missionLog.some(
          (e) => e.title === 'Orbit Achieved' && e.detail.includes(finalPlanet.name)
        )
      ) {
        next = appendMissionLog(
          next,
          'Orbit Achieved',
          `Target ${finalPlanet.name} orbit (${Math.round(traj.periapsisKm)} × ${Math.round(traj.apoapsisKm)} km).`,
          'success'
        );
      }
      next = appendMissionLog(
        next,
        'Mission Accomplished',
        `${mission.name} primary objective complete.`,
        'success'
      );
    } else if (
      (mission.objectiveType === 'flyby' || mission.objectiveType === 'gravity_assist') &&
      next.soiBody === mission.targetBody &&
      next.altitudeMeters <= mission.targetOrbitKm.max * 1000 &&
      next.altitudeMeters >= Math.max(10_000, finalPlanet.atmosphereHeightMeters)
    ) {
      next.flybyAchieved = true;
      next.scienceCompleted = true;
      next.phase = 'mission_complete';
      next.statusMessage = `${finalPlanet.name} ${mission.objectiveType === 'gravity_assist' ? 'Gravity Assist' : 'Flyby'} telemetry captured at ${Math.round(next.altitudeMeters / 1000)} km! Mission Complete.`;
      next = appendMissionLog(
        next,
        'Mission Accomplished',
        `${finalPlanet.name} ${mission.objectiveType === 'gravity_assist' ? 'Gravity Assist' : 'Flyby'} telemetry captured.`,
        'success'
      );
    }
  }

  return next;
}

export function deployNextStage(state: FlightState, parts: PlacedPart[]): FlightState {
  if (state.currentStage >= state.maxStage) return state;
  const nextStage = state.currentStage + 1;
  const specs = getStageFlightSpecs(parts, nextStage);

  const updated: FlightState = {
    ...state,
    currentStage: nextStage,
    remainingFuelKg: specs.fuelMassKg,
    initialFuelKg: specs.fuelMassKg,
    currentDryMassKg: specs.dryMassKg,
    currentThrustN: specs.thrustN,
    currentIsp: specs.isp,
    ignited: specs.thrustN > 0 ? state.ignited : false,
    statusMessage: `Stage ${nextStage + 1} separated! ${specs.thrustN > 0 ? 'Upper engine active.' : 'Payload coasting.'}`
  };

  return appendMissionLog(
    updated,
    'Stage Separation',
    `Stage ${nextStage} jettisoned · Stage ${nextStage + 1} ${specs.thrustN > 0 ? 'propulsion active.' : 'coasting.'}`,
    'action'
  );
}

export function ensureActiveStageHasFuel(
  state: FlightState,
  parts: PlacedPart[]
): FlightState {
  let current = state;
  while (current.remainingFuelKg <= 15 && current.currentStage < current.maxStage) {
    current = deployNextStage(current, parts);
  }
  return current;
}

export function computeTransferPlan(
  state: FlightState,
  parts: PlacedPart[],
  targetBody: PlanetId
): TransferBurnPlan {
  const ready = ensureActiveStageHasFuel(state, parts);
  const pz = ready.posZ ?? 0;
  const vz = ready.velZ ?? 0;
  const distEta = getShipTargetDistanceAndEta(ready, targetBody);

  if (ready.soiBody === 'earth' && targetBody === 'moon') {
    const r1 = Math.max(PLANETS.earth.radiusMeters + 50_000, Math.hypot(ready.posX, ready.posY, pz));
    const r2 = PLANETS.moon.orbitRadiusSimMeters;
    const a = (r1 + r2) * 0.5;
    const vPeri = Math.sqrt(PLANETS.earth.mu * (2 / r1 - 1 / a));
    const vCur = Math.hypot(ready.velX, ready.velY, vz);
    const dv = Math.max(60, vPeri - vCur);
    const est = estimateBurnTimeAndFuel(ready, parts, dv);
    const coastTimeSec = Math.PI * Math.sqrt(Math.pow(a, 3) / PLANETS.earth.mu);
    return {
      targetBody,
      requiredDeltaV: dv,
      estimatedBurnSec: est.burnSec,
      estimatedFuelKg: est.fuelKg,
      coastTimeSec,
      distanceMeters: distEta.distanceMeters
    };
  }

  if (ready.soiBody === 'moon' && (targetBody === 'mars' || targetBody === 'venus')) {
    const r1 = Math.max(PLANETS.moon.radiusMeters + 20_000, Math.hypot(ready.posX, ready.posY, pz));
    const vEscMoon = Math.sqrt((2 * PLANETS.moon.mu) / r1);
    const vCur = Math.hypot(ready.velX, ready.velY, vz);
    const dv = Math.max(150, vEscMoon + 240 - vCur);
    const est = estimateBurnTimeAndFuel(ready, parts, dv);
    const rE = PLANETS.moon.orbitRadiusSimMeters;
    const aSun = (PLANETS.earth.orbitRadiusSimMeters + PLANETS[targetBody].orbitRadiusSimMeters) * 0.5;
    const coastTimeSec =
      Math.PI * Math.sqrt(Math.pow(aSun, 3) / SUN_MU) + rE / 1200;
    return {
      targetBody,
      requiredDeltaV: dv,
      estimatedBurnSec: est.burnSec,
      estimatedFuelKg: est.fuelKg,
      coastTimeSec,
      distanceMeters: distEta.distanceMeters
    };
  }

  // Earth -> Mars/Venus direct TMI / TVI
  const r1 = Math.max(PLANETS.earth.radiusMeters + 50_000, Math.hypot(ready.posX, ready.posY, pz));
  const rSun1 = PLANETS.earth.orbitRadiusSimMeters;
  const rSun2 = PLANETS[targetBody].orbitRadiusSimMeters;
  const aSun = (rSun1 + rSun2) * 0.5;
  const vEarthSun = Math.sqrt(SUN_MU / rSun1);
  const vDepSun = Math.sqrt(Math.max(100, SUN_MU * (2 / rSun1 - 1 / aSun)));
  const vInf = Math.max(350, Math.abs(vDepSun - vEarthSun) * 2.1);
  const vEsc = Math.sqrt((2 * PLANETS.earth.mu) / r1);
  const vReq = Math.sqrt(vEsc * vEsc + vInf * vInf);
  const vCur = Math.hypot(ready.velX, ready.velY, vz);
  const dv = Math.max(180, vReq - vCur);
  const est = estimateBurnTimeAndFuel(ready, parts, dv);
  const coastTimeSec = Math.PI * Math.sqrt(Math.pow(aSun, 3) / SUN_MU);
  return {
    targetBody,
    requiredDeltaV: dv,
    estimatedBurnSec: est.burnSec,
    estimatedFuelKg: est.fuelKg,
    coastTimeSec,
    distanceMeters: distEta.distanceMeters
  };
}

// Real-physics Circularize Burn (NO teleport, NO velocity overwrite)
export function circularizeCurrentOrbit(
  state: FlightState,
  parts: PlacedPart[]
): FlightState {
  if (state.soiBody === 'sun') return state;
  const ready = ensureActiveStageHasFuel(state, parts);
  if (ready.soiBody === 'sun') return ready;
  const planet = getBodyConfig(ready.soiBody);
  if (ready.altitudeMeters < planet.atmosphereHeightMeters) return ready;

  const pz = ready.posZ ?? 0;
  const vz = ready.velZ ?? 0;
  const r = Math.max(1, Math.hypot(ready.posX, ready.posY, pz));
  const basis = getLocalHorizonBasis(ready.posX, ready.posY, pz);
  const vTangential =
    ready.velX * basis.E[0] + ready.velY * basis.E[1] + vz * basis.E[2];
  const vRadial =
    ready.velX * basis.U[0] + ready.velY * basis.U[1] + vz * basis.U[2];

  const kep = computeKeplerElements(
    ready.posX,
    ready.posY,
    pz,
    ready.velX,
    ready.velY,
    vz,
    ready.soiBody
  );

  // If climbing steeply toward apoapsis (> 15s away), schedule burn near apoapsis; otherwise burn now at horizon East/prograde
  const waitSec =
    !kep.isEscaping && vRadial > 20 && kep.timeToApoSec > 18 && kep.timeToApoSec < 900
      ? Math.max(0, kep.timeToApoSec - 6)
      : 0;

  const rBurn =
    waitSec > 0 && Number.isFinite(kep.rApo) ? kep.rApo : r;
  const vCirc = Math.sqrt(planet.mu / Math.max(planet.radiusMeters + 10_000, rBurn));
  const vAtApo =
    waitSec > 0 && Number.isFinite(kep.rApo)
      ? Math.sqrt(Math.max(0, 2 * (kep.specificEnergy + planet.mu / kep.rApo)))
      : Math.abs(vTangential);

  const dvNeeded = Math.max(15, Math.abs(vCirc - vAtApo) + (waitSec === 0 ? Math.abs(vRadial) * 0.45 : 0));
  const est = estimateBurnTimeAndFuel(ready, parts, dvNeeded);
  const burnDirMode: ActiveManeuverState['burnDirectionMode'] =
    vRadial > 25 && waitSec === 0 ? 'horizon_east' : kep.isEscaping || vAtApo > vCirc ? 'retrograde' : 'prograde';

  const maneuver: ActiveManeuverState = {
    kind: 'circularize',
    phase: waitSec > 4 ? 'coasting_to_burn' : 'aligning',
    fromBody: ready.soiBody,
    targetBody: ready.soiBody,
    label: `Circularize ${planet.name} Orbit`,
    requiredDeltaV: dvNeeded,
    remainingDeltaV: dvNeeded,
    estimatedBurnSec: est.burnSec,
    estimatedFuelKg: est.fuelKg,
    burnWindowElapsedSec: ready.missionElapsedSec + waitSec,
    distanceRemainingMeters: Math.max(0, ready.altitudeMeters),
    etaSeconds: waitSec,
    autoWarpToArrival: false,
    burnDirectionMode: burnDirMode
  };

  const next: FlightState = {
    ...ready,
    ignited: false,
    throttle: 0,
    timeWarp: 1,
    attitudeTarget: maneuverDirectionToAttitude(burnDirMode),
    activeManeuver: maneuver,
    statusMessage:
      waitSec > 4
        ? `Scheduled ${planet.name} circularization at apoapsis (Δv ${Math.round(dvNeeded)} m/s, T-${Math.round(waitSec)}s).`
        : `Aligning for real ${planet.name} circularization burn (Δv ${Math.round(dvNeeded)} m/s)!`
  };

  return appendMissionLog(
    next,
    'Circularize Burn Planned',
    `${planet.name} circularization · Δv ${Math.round(dvNeeded)} m/s (${est.burnSec.toFixed(1)}s, ${Math.round(est.fuelKg)} kg fuel).`,
    'info'
  );
}

// Real-physics Hohmann Transfer Burn + Coast (NO teleport!)
export function startTransferTransit(
  state: FlightState,
  parts: PlacedPart[],
  mission: MissionDefinition,
  targetOverride?: PlanetId
): FlightState {
  if (state.activeManeuver?.kind === 'transfer') return state;

  let ready = ensureActiveStageHasFuel(state, parts);
  const hasMoonWaypoint =
    ready.missionRoute.includes('moon') &&
    ready.missionRoute.indexOf('moon') < ready.missionRoute.indexOf(mission.targetBody);

  const toBody: PlanetId =
    targetOverride ??
    (ready.soiBody === 'earth' && hasMoonWaypoint ? 'moon' : mission.targetBody);

  if (toBody === ready.soiBody) return ready;

  if (ready.soiBody === 'earth' && !ready.earthOrbitCompleted) {
    ready = {
      ...ready,
      orbitAchieved: true,
      earthOrbitCompleted: true,
      routeLegIndex: Math.max(ready.routeLegIndex, 1)
    };
  }

  const fromPlanet = getBodyConfig(ready.soiBody);
  const toPlanet = PLANETS[toBody];
  const plan = computeTransferPlan(ready, parts, toBody);

  // Calculate exact orbital phase wait window (< 1 LEO orbit) so real coast aims right at target!
  const pz = ready.posZ ?? 0;
  const r = Math.max(1e5, Math.hypot(ready.posX, ready.posY, pz));
  const shipAng = Math.atan2(ready.posY, ready.posX);
  const angMomZ = ready.posX * ready.velY - ready.posY * ready.velX;
  const omegaShip = angMomZ / (r * r);
  const absOmega = Math.max(2e-4, Math.abs(omegaShip));
  const orbitSign = omegaShip >= 0 ? 1 : -1;

  let waitSec = 0;
  if (ready.soiBody === 'earth' && toBody === 'moon') {
    const tArrival = ready.missionElapsedSec + plan.coastTimeSec;
    const moonAtArrival = getMoonEarthState(tArrival);
    // Hohmann burn happens 180 deg opposite Moon's arrival angle, leading slightly for half burn duration
    const desiredBurnAng = moonAtArrival.angleRad + Math.PI;
    let deltaAng = (desiredBurnAng - shipAng) * orbitSign;
    deltaAng = ((deltaAng % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    waitSec = Math.max(0, deltaAng / absOmega - plan.estimatedBurnSec * 0.5);
  } else if (ready.soiBody === 'earth' && (toBody === 'mars' || toBody === 'venus')) {
    // Align departure asymptote along +V_earth (Mars) or -V_earth (Venus)
    const earthSun = getPlanetHeliocentricState('earth', ready.missionElapsedSec);
    const vDirAng = Math.atan2(earthSun.vy, earthSun.vx);
    const desiredAsymptote = toBody === 'mars' ? vDirAng : vDirAng + Math.PI;
    // Escape hyperbola tangent is ~70 deg behind asymptote along orbit direction
    const desiredVelAng = desiredAsymptote - orbitSign * 1.15;
    const desiredBurnAng = desiredVelAng - orbitSign * (Math.PI * 0.5);
    let deltaAng = (desiredBurnAng - shipAng) * orbitSign;
    deltaAng = ((deltaAng % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    waitSec = Math.max(0, deltaAng / absOmega - plan.estimatedBurnSec * 0.5);
  }

  // Cap window wait cleanly if orbital speed is temporarily very low
  if (!Number.isFinite(waitSec) || waitSec > 3000) waitSec = 0;

  const isFlyby =
    mission.targetBody === toBody &&
    (mission.objectiveType === 'flyby' || mission.objectiveType === 'gravity_assist');

  const maneuver: ActiveManeuverState = {
    kind: 'transfer',
    phase: waitSec > 6 ? 'coasting_to_burn' : 'aligning',
    fromBody: ready.soiBody,
    targetBody: toBody,
    finalDestinationBody: mission.targetBody,
    label: toBody === 'moon' ? 'Trans-Lunar Injection' : `Trans-${toPlanet.name} Injection`,
    requiredDeltaV: plan.requiredDeltaV,
    remainingDeltaV: plan.requiredDeltaV,
    estimatedBurnSec: plan.estimatedBurnSec,
    estimatedFuelKg: plan.estimatedFuelKg,
    burnWindowElapsedSec: ready.missionElapsedSec + waitSec,
    distanceRemainingMeters: plan.distanceMeters,
    etaSeconds: waitSec > 6 ? waitSec : plan.coastTimeSec,
    autoWarpToArrival: false,
    burnDirectionMode: 'prograde',
    skipCapture: isFlyby
  };

  const started: FlightState = {
    ...ready,
    ignited: false,
    throttle: 0,
    timeWarp: 1,
    attitudeTarget: { type: 'prograde' },
    phase: 'space',
    solarDeployed: true,
    activeManeuver: maneuver,
    statusMessage:
      waitSec > 6
        ? `Transfer Burn planned: ${fromPlanet.name} → ${toPlanet.name} (Δv ${Math.round(plan.requiredDeltaV)} m/s, window in ${Math.round(waitSec)}s)`
        : `Aligning prograde for ${fromPlanet.name} → ${toPlanet.name} transfer burn (Δv ${Math.round(plan.requiredDeltaV)} m/s)!`
  };

  return appendMissionLog(
    started,
    maneuver.label,
    `Planned Δv ${Math.round(plan.requiredDeltaV)} m/s (${plan.estimatedBurnSec.toFixed(1)}s burn, ${Math.round(plan.estimatedFuelKg)} kg fuel) → ${toPlanet.name}.`,
    'action'
  );
}

// Continuous Retrograde Deorbit Burn (NO altitude/position teleport!)
export function executeDeorbitBurn(
  state: FlightState,
  parts: PlacedPart[]
): FlightState {
  if (
    state.phase === 'crashed' ||
    state.phase === 'landed' ||
    state.phase === 'mission_complete' ||
    state.soiBody === 'sun'
  ) {
    return state;
  }
  const ready = ensureActiveStageHasFuel(state, parts);
  if (ready.soiBody === 'sun') return ready;
  const planet = getBodyConfig(ready.soiBody);

  const targetPeriapsisKm =
    ready.soiBody === 'moon'
      ? -12
      : ready.soiBody === 'mars'
        ? 42 // Enters Mars 120 km atmosphere cleanly for aerobraking + powered descent
        : ready.soiBody === 'venus'
          ? 85
          : 38;

  const pz = ready.posZ ?? 0;
  const vz = ready.velZ ?? 0;
  const r = Math.max(1, Math.hypot(ready.posX, ready.posY, pz));
  const targetRPeri = Math.max(planet.radiusMeters * 0.85, planet.radiusMeters + targetPeriapsisKm * 1000);
  const aTarget = (r + targetRPeri) * 0.5;
  const vDeorbit = Math.sqrt(Math.max(0, planet.mu * (2 / r - 1 / aTarget)));
  const vCur = Math.hypot(ready.velX, ready.velY, vz);
  const dv = Math.max(45, vCur - vDeorbit);
  const est = estimateBurnTimeAndFuel(ready, parts, dv);

  const maneuver: ActiveManeuverState = {
    kind: 'deorbit',
    phase: 'aligning',
    fromBody: ready.soiBody,
    targetBody: ready.soiBody,
    label: `${planet.name} Deorbit Burn`,
    requiredDeltaV: dv,
    remainingDeltaV: dv,
    estimatedBurnSec: est.burnSec,
    estimatedFuelKg: est.fuelKg,
    burnWindowElapsedSec: ready.missionElapsedSec,
    distanceRemainingMeters: ready.altitudeMeters,
    etaSeconds: est.burnSec,
    autoWarpToArrival: false,
    burnDirectionMode: 'retrograde',
    targetPeriapsisKm
  };

  const updated: FlightState = {
    ...ready,
    ignited: false,
    throttle: 0,
    timeWarp: 1,
    attitudeTarget: { type: 'retrograde' },
    activeManeuver: maneuver,
    statusMessage: `Aligning retrograde for real ${planet.name} deorbit burn (Δv ${Math.round(dv)} m/s)!`
  };

  return appendMissionLog(
    updated,
    'Deorbit Burn Scheduled',
    `Slewing retrograde for continuous descent into ${planet.name} (${Math.round(dv)} m/s).`,
    'action'
  );
}

export function toggleAutoWarpToArrival(state: FlightState): FlightState {
  if (!state.activeManeuver) return state;
  const m = state.activeManeuver;
  if (m.phase === 'burning' || m.phase === 'aligning' || m.phase === 'capturing') {
    return { ...state, timeWarp: 1, activeManeuver: { ...m, autoWarpToArrival: false } };
  }
  const nextAuto = !m.autoWarpToArrival;
  return {
    ...state,
    timeWarp: nextAuto ? state.timeWarp : 1,
    activeManeuver: {
      ...m,
      autoWarpToArrival: nextAuto
    }
  };
}

export function cancelActiveManeuver(state: FlightState): FlightState {
  if (!state.activeManeuver) return state;
  return {
    ...state,
    ignited: false,
    throttle: 0,
    timeWarp: 1,
    activeManeuver: null,
    statusMessage: 'Maneuver autopilot cancelled — manual control active.'
  };
}

export function executeTransferToTarget(
  state: FlightState,
  mission: MissionDefinition,
  parts?: PlacedPart[]
): FlightState {
  return startTransferTransit(state, parts ?? [], mission);
}

export function predictTrajectory(
  state: FlightState,
  throttleOverride?: number,
  steps = 350
): TrajectoryPrediction {
  const planet = getBodyConfig(state.soiBody);
  const points: TrajectoryPoint[] = [];
  let px = state.posX;
  let py = state.posY;
  let pz = state.posZ ?? 0;
  let vx = state.velX;
  let vy = state.velY;
  let vz = state.velZ ?? 0;
  let fuel = state.remainingFuelKg;

  const throttle = throttleOverride !== undefined ? throttleOverride : state.throttle;
  const r0 = Math.max(1, Math.hypot(px, py, pz));
  const alt0 = r0 - planet.radiusMeters;
  const vSq0 = vx * vx + vy * vy + vz * vz;
  const specE0 = vSq0 / 2 - planet.mu / r0;
  const circularPeriod = 2 * Math.PI * Math.sqrt(Math.pow(r0, 3) / planet.mu);
  const useFineAscent =
    state.soiBody !== 'sun' &&
    (alt0 < Math.max(25_000, planet.atmosphereHeightMeters) || throttle > 0.01);
  const fineSteps = useFineAscent ? Math.min(30, Math.floor(steps * 0.3)) : 0;
  const fineDt = 1.5;
  const remainingSteps = Math.max(1, steps - fineSteps);

  // Predict full orbital ellipse OR multi-hour/multi-day transfer arc when escaping or transferring
  let spanSec = circularPeriod;
  if (state.soiBody === 'sun') {
    spanSec =
      state.activeManeuver?.etaSeconds && state.activeManeuver.etaSeconds > 1000
        ? Math.min(circularPeriod * 0.9, state.activeManeuver.etaSeconds * 1.15)
        : circularPeriod * 0.75;
  } else if (specE0 >= 0) {
    spanSec = Math.max(circularPeriod * 2.5, 14_000);
  } else {
    const a0 = -planet.mu / (2 * specE0);
    const orbitPeriod = 2 * Math.PI * Math.sqrt(Math.pow(Math.max(r0, a0), 3) / planet.mu);
    spanSec = Math.min(orbitPeriod * 1.02, 22_000);
  }

  const outerStepDt =
    state.soiBody === 'sun'
      ? Math.max(300, spanSec / remainingSteps)
      : Math.max(2, Math.min(180, spanSec / remainingSteps));

  let maxR = r0;
  let minR = r0;
  let isSuborbitalImpact = false;
  let crossesAtmosphere = false;
  let estimatedBurnDeltaV = 0;

  const burnDurationSec = throttle > 0.01 && state.currentThrustN > 0 ? 45 : 0;
  const qAtt = ensureAttitudeQuat(state);
  const fwdLocal = quatRotateVec(qAtt, [0, 1, 0]);
  let elapsed = 0;

  for (let i = 0; i < steps; i++) {
    const stepDt = i < fineSteps ? fineDt : outerStepDt;
    const r = Math.max(1, Math.hypot(px, py, pz));
    const alt = r - planet.radiusMeters;
    if (r > maxR) maxR = r;
    if (r < minR) minR = r;
    if (planet.atmosphereHeightMeters > 0 && alt < planet.atmosphereHeightMeters && alt > 0) {
      crossesAtmosphere = true;
    }

    points.push({
      x: px,
      y: py,
      z: pz,
      vx,
      vy,
      vz,
      altitudeMeters: alt,
      timeOffsetSec: elapsed
    });

    if (alt < 0 && i > 1) {
      isSuborbitalImpact = true;
      break;
    }

    const { E, U, N } = getLocalHorizonBasis(px, py, pz);
    const gravAcc = planet.mu / (r * r);
    let ax = -U[0] * gravAcc;
    let ay = -U[1] * gravAcc;
    let az = -U[2] * gravAcc;

    // Apply powered burn preview along rocket's real unified attitude forwardVector
    if (elapsed < burnDurationSec && fuel > 0 && throttle > 0.01 && state.currentThrustN > 0) {
      const burnDt = Math.min(stepDt, burnDurationSec - elapsed);
      const totalMass = Math.max(200, state.currentDryMassKg + fuel);
      const effThrust = state.currentThrustN * throttle;
      const thrustAcc = effThrust / totalMass;
      const dirX = E[0] * fwdLocal[0] + U[0] * fwdLocal[1] + N[0] * fwdLocal[2];
      const dirY = E[1] * fwdLocal[0] + U[1] * fwdLocal[1] + N[1] * fwdLocal[2];
      const dirZ = E[2] * fwdLocal[0] + U[2] * fwdLocal[1] + N[2] * fwdLocal[2];
      const dv = thrustAcc * burnDt;
      estimatedBurnDeltaV += dv;
      const frac = burnDt / stepDt;
      ax += dirX * thrustAcc * frac;
      ay += dirY * thrustAcc * frac;
      az += dirZ * thrustAcc * frac;
      const massFlow = effThrust / (state.currentIsp * G0);
      fuel = Math.max(0, fuel - massFlow * burnDt);
      vx += ax * stepDt;
      vy += ay * stepDt;
      vz += az * stepDt;
      px += vx * stepDt;
      py += vy * stepDt;
      pz += vz * stepDt;
    } else {
      // Velocity Verlet step so high-apoapsis transfer trajectories never spiral
      const vhx = vx + ax * 0.5 * stepDt;
      const vhy = vy + ay * 0.5 * stepDt;
      const vhz = vz + az * 0.5 * stepDt;
      px += vhx * stepDt;
      py += vhy * stepDt;
      pz += vhz * stepDt;
      const rNext = Math.max(1, Math.hypot(px, py, pz));
      const gNext = -planet.mu / (rNext * rNext * rNext);
      vx = vhx + px * gNext * 0.5 * stepDt;
      vy = vhy + py * gNext * 0.5 * stepDt;
      vz = vhz + pz * gNext * 0.5 * stepDt;
    }
    elapsed += stepDt;
  }

  // Analytical Keplerian energy check for accurate Apoapsis/Periapsis in 3D
  const finalR = Math.max(1, Math.hypot(px, py, pz));
  const vSq = vx * vx + vy * vy + vz * vz;
  const specificEnergy = vSq / 2 - planet.mu / finalR;
  const isEscaping = specificEnergy >= 0;

  let apoapsisKm = (maxR - planet.radiusMeters) / 1000;
  let periapsisKm = (minR - planet.radiusMeters) / 1000;
  let eccentricity = 0;

  if (!isEscaping) {
    const a = -planet.mu / (2 * specificEnergy);
    const hx = py * vz - pz * vy;
    const hy = pz * vx - px * vz;
    const hz = px * vy - py * vx;
    const hSq = hx * hx + hy * hy + hz * hz;
    const eSq = Math.max(0, 1 + (2 * specificEnergy * hSq) / (planet.mu * planet.mu));
    eccentricity = Math.sqrt(eSq);
    const rApo = a * (1 + eccentricity);
    const rPeri = a * (1 - eccentricity);
    apoapsisKm = (rApo - planet.radiusMeters) / 1000;
    periapsisKm = (rPeri - planet.radiusMeters) / 1000;
  }

  return {
    points,
    apoapsisKm,
    periapsisKm,
    eccentricity,
    isEscaping,
    isSuborbitalImpact,
    crossesAtmosphere,
    estimatedBurnDeltaV
  };
}

