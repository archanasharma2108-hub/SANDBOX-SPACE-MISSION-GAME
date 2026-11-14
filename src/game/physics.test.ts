import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, MISSIONS_BY_ID } from './missions';
import { PARTS_BY_ID } from './partsCatalog';
import { PLANETS } from './planets';
import {
  calculateCashBack,
  checkPlacementCollision,
  circularizeCurrentOrbit,
  computeCenterOfMassAndThrust,
  createInitialFlightState,
  deployNextStage,
  doPartsIntersect,
  evaluateRocketEngineering,
  executeDeorbitBurn,
  executeTransferToTarget,
  formatMissionTimestamp,
  getAtmosphereLayerName,
  getOpenAttachmentSockets,
  normalizeAngle360,
  predictTrajectory,
  snapPositionToNearestSocket,
  startTransferTransit,
  stepFlightPhysics,
  toggleEngineIgnition
} from './physics';
import { FlightState, MissionDefinition, PlacedPart } from './types';

function makeParts(specs: Omit<PlacedPart, 'instanceId'>[]): PlacedPart[] {
  return specs.map((s, idx) => ({ ...s, instanceId: `p-${idx}` }));
}

test('all 28 historical and 2026 Artemis-Mars missions are registered', () => {
  assert.ok(MISSIONS.length >= 28);
  assert.ok(MISSIONS_BY_ID['artemis-mars-2026']);
  assert.deepEqual(MISSIONS_BY_ID['artemis-mars-2026'].routeWaypoints, ['earth', 'moon', 'mars']);
  assert.ok(MISSIONS_BY_ID['explorer-1']);
  assert.ok(MISSIONS_BY_ID['apollo-11']);
  assert.ok(MISSIONS_BY_ID['viking-1']);
  assert.ok(MISSIONS_BY_ID['parker-solar-probe']);
  assert.ok(MISSIONS_BY_ID['chandrayaan-3']);
});

test('hitbox collision detects intersecting parts and allows flush stacking', () => {
  const tankA: PlacedPart = {
    instanceId: 'a',
    partId: 'tank_medium', // height 3.0, width 1.5
    x: 0,
    y: 1.5,
    z: 0,
    stage: 0,
    rotationDeg: 0
  };
  const tankBOverlap: PlacedPart = {
    instanceId: 'b',
    partId: 'tank_medium',
    x: 0,
    y: 3.0, // overlaps by 1.5m
    z: 0,
    stage: 0,
    rotationDeg: 0
  };
  const tankCFlush: PlacedPart = {
    instanceId: 'c',
    partId: 'tank_medium',
    x: 0,
    y: 4.5, // flush on top (1.5 + 3.0)
    z: 0,
    stage: 0,
    rotationDeg: 0
  };

  assert.equal(doPartsIntersect(tankA, tankBOverlap), true);
  assert.equal(doPartsIntersect(tankA, tankCFlush), false);

  const collision = checkPlacementCollision(tankBOverlap, [tankA]);
  assert.equal(collision.collides, true);
  assert.deepEqual(collision.collidingIds, ['a']);
});

test('3D VAB snapping supports +Z/-Z radial faces, free off-axis X/Y/Z placement, and 90-deg rotated hitboxes', () => {
  const core: PlacedPart = {
    instanceId: 'core',
    partId: 'tank_medium', // 1.5 x 3.0 x 1.5
    x: 0,
    y: 2.0,
    z: 0,
    stage: 0,
    rotationDeg: 0
  };
  const boosterDef = PARTS_BY_ID['srb_booster']; // width 0.85, height 3.4, depth 0.85

  // Snapping onto +Z front face of core: z = (1.5 + 0.85) / 2 = 1.175 -> 1.18
  const snappedFront = snapPositionToNearestSocket(boosterDef, 0.05, 2.05, 1.35, [core]);
  assert.equal(snappedFront.snapped, true);
  assert.equal(snappedFront.x, 0);
  assert.ok(snappedFront.z > 1.0, `Expected positive Z radial socket, got ${snappedFront.z}`);

  // Free off-axis 3D placement anywhere inside build bay (e.g. X=4.2, Y=2.5, Z=-3.1)
  const freePlace = snapPositionToNearestSocket(boosterDef, 4.2, 2.5, -3.1, [core]);
  assert.equal(freePlace.snapped, false);
  assert.equal(freePlace.x, 4.2);
  assert.equal(freePlace.y, 2.5);
  assert.equal(freePlace.z, -3.1);

  // Asymmetric part (solar_wing: width 1.6, depth 0.5) rotated 90° swaps X/Z footprint
  const wingUnrotated: PlacedPart = {
    instanceId: 'w1',
    partId: 'solar_wing',
    x: 0,
    y: 1.5,
    z: 0.9,
    stage: 0,
    rotationDeg: 0
  };
  const probeAtFront: PlacedPart = {
    instanceId: 'pFront',
    partId: 'probe_explorer', // 1.0 x 1.1 x 1.0
    x: 0,
    y: 1.5,
    z: 2.0, // distance in Z = 1.1; when unrotated half-sum Z = (0.5+1.0)/2 = 0.75 (clear)
    stage: 0,
    rotationDeg: 0
  };
  assert.equal(doPartsIntersect(wingUnrotated, probeAtFront), false);

  // Rotating wing 90° makes its Z depth 1.6 -> half-sum Z = (1.6+1.0)/2 = 1.3 > 1.1 (intersects!)
  const wingRotated: PlacedPart = { ...wingUnrotated, rotationDeg: 90 };
  assert.equal(doPartsIntersect(wingRotated, probeAtFront), true);
});

test('recycle bin returns exact 20% cashback on unused components', () => {
  assert.equal(calculateCashBack('engine_hawk'), 1300); // 20% of 6500
  assert.equal(calculateCashBack('tank_heavy'), 1760); // 20% of 8800
  assert.equal(calculateCashBack('sci_geiger'), 600); // 20% of 3000
});

test('starter blueprints produce valid engineering TWR and Delta-V', () => {
  const explorer = MISSIONS_BY_ID['explorer-1'];
  const parts = makeParts(explorer.starterBlueprint);
  const summary = evaluateRocketEngineering(parts, explorer);

  assert.equal(summary.hasCommand, true);
  assert.ok(summary.launchTWR > 1.2, `Expected TWR > 1.2, got ${summary.launchTWR}`);
  assert.ok(summary.estimatedDeltaV > 2000, `Expected dV > 2000, got ${summary.estimatedDeltaV}`);
});

test('360-degree rotation wraps continuously across -180 to +180', () => {
  assert.equal(normalizeAngle360(185), -175);
  assert.equal(normalizeAngle360(-185), 175);
  assert.equal(normalizeAngle360(360), 0);
  assert.equal(normalizeAngle360(90), 90);
});

test('Earth rotation imparts eastward velocity boost and trajectory scales with 0% to 100% throttle', () => {
  const explorer = MISSIONS_BY_ID['explorer-1'];
  const parts = makeParts(explorer.starterBlueprint);
  let flight = createInitialFlightState(parts, explorer);

  assert.ok(flight.velX > 460, 'Expected Earth rotation eastward boost ~465 m/s');

  flight.ignited = true;
  flight.throttle = 1.0;
  for (let i = 0; i < 40; i++) {
    flight = stepFlightPhysics(flight, parts, explorer, 0.25, { rotateInput: 0 });
  }
  assert.ok(flight.altitudeMeters > 100, 'Rocket should ascend off pad at 100% throttle');

  const trajZero = predictTrajectory(flight, 0.0, 60);
  const trajFull = predictTrajectory(flight, 1.0, 60);
  assert.ok(
    trajFull.estimatedBurnDeltaV > trajZero.estimatedBurnDeltaV,
    '100% throttle prediction must include higher delta-V burn than 0% coast'
  );
});

test('realistic landing system distinguishes safe touchdown from high-speed crash', () => {
  const apollo = MISSIONS_BY_ID['apollo-11'];
  const parts = makeParts(apollo.starterBlueprint);
  const base = createInitialFlightState(parts, apollo);

  // Safe lunar landing with legs deployed
  const safeDescent = {
    ...base,
    soiBody: 'moon' as const,
    posX: 0,
    posY: 173_705, // 5m above Moon surface
    velX: 4.6, // Moon rotation
    velY: -6.0, // 6 m/s vertical descent (safe < 18 m/s)
    angleDeg: 0,
    legsDeployed: true,
    phase: 'space' as const
  };
  const landed = stepFlightPhysics(safeDescent, parts, apollo, 1.0, { rotateInput: 0 });
  assert.equal(landed.phase, 'mission_complete');

  // Hard crash without slowing down
  const hardDescent = {
    ...safeDescent,
    velY: -85.0
  };
  const crashed = stepFlightPhysics(hardDescent, parts, apollo, 1.0, { rotateInput: 0 });
  assert.equal(crashed.phase, 'crashed');
});

test('mission log records Engine Ignition, Stage Separation, Atmospheric Exit, and Orbit Achieved with timestamps', () => {
  const explorer = MISSIONS_BY_ID['explorer-1'];
  const parts = makeParts(explorer.starterBlueprint);
  let flight = createInitialFlightState(parts, explorer);

  assert.equal(formatMissionTimestamp(0), 'T+00:00:00');
  assert.equal(formatMissionTimestamp(90065), 'D1 01:01:05');
  assert.equal(flight.missionLog[0].title, 'Pad 39A Ready');

  // 1. Engine Ignition
  flight = toggleEngineIgnition(flight);
  assert.ok(flight.missionLog.some((e) => e.title === 'Engine Ignition'));

  // 2. Stage Separation
  flight = deployNextStage(flight, parts);
  assert.ok(flight.missionLog.some((e) => e.title === 'Stage Separation'));

  // 3. Atmospheric Exit (crossing above 100 km Earth atmosphere)
  const preExit = {
    ...flight,
    soiBody: 'earth' as const,
    posX: 0,
    posY: 637_100 + 99_500,
    velX: 1200,
    velY: 1800,
    altitudeMeters: 99_500,
    phase: 'ascent' as const,
    ignited: false
  };
  const postExit = stepFlightPhysics(preExit, parts, explorer, 1.0, { rotateInput: 0 });
  const exitEntry = postExit.missionLog.find((e) => e.title === 'Atmospheric Exit');
  assert.ok(exitEntry, 'Expected Atmospheric Exit log entry');
  assert.ok(exitEntry.timestampLabel.startsWith('T+') || exitEntry.timestampLabel.startsWith('D'));

  // 4. Orbit Achieved (stable Earth orbit > 80 km periapsis)
  const rOrbit = 637_100 + 160_000;
  const vCirc = Math.sqrt(3.986e12 / rOrbit);
  const inOrbitPre = {
    ...postExit,
    posX: 0,
    posY: rOrbit,
    velX: vCirc,
    velY: 0,
    altitudeMeters: 160_000,
    phase: 'space' as const,
    ignited: false
  };
  const inOrbitPost = stepFlightPhysics(inOrbitPre, parts, explorer, 1.0, { rotateInput: 0 });
  assert.ok(
    inOrbitPost.missionLog.some((e) => e.title === 'Orbit Achieved'),
    'Expected Orbit Achieved log entry'
  );
});

test('rocket launches in pointed direction, slows down when thrusters are off, and reports 3D atmosphere layers', () => {
  const mission = MISSIONS_BY_ID['artemis-mars-2026'];
  const parts = makeParts(mission.starterBlueprint);
  let flight = createInitialFlightState(parts, mission);

  // Verify 3D atmosphere layer classification
  assert.ok(getAtmosphereLayerName('earth', 2_000).includes('Troposphere'));
  assert.ok(getAtmosphereLayerName('earth', 25_000).includes('Stratosphere'));
  assert.ok(getAtmosphereLayerName('earth', 65_000).includes('Mesosphere'));
  assert.ok(getAtmosphereLayerName('earth', 92_000).includes('Thermosphere'));
  assert.ok(getAtmosphereLayerName('earth', 110_000).includes('Deep Space'));

  // Launch straight up (angleDeg = 0): climbs straight up without spurious sideways drift
  flight.ignited = true;
  flight.throttle = 1.0;
  for (let i = 0; i < 16; i++) {
    flight = stepFlightPhysics(flight, parts, mission, 0.25, { rotateInput: 0 });
  }
  assert.ok(flight.verticalSpeedMs > 20, 'Rocket should accelerate upward along 0 deg');
  assert.ok(
    Math.abs(flight.horizontalSpeedMs) < 5,
    `Straight launch should stay aligned with 0 deg axis, got horiz=${flight.horizontalSpeedMs}`
  );

  // Tilt +40 deg right: velocity steers in the direction of rocket nose
  flight.angleDeg = 40;
  for (let i = 0; i < 16; i++) {
    flight = stepFlightPhysics(flight, parts, mission, 0.25, { rotateInput: 0 });
  }
  assert.ok(flight.horizontalSpeedMs > 20, 'Pitching +40 deg must steer velocity eastward');

  // Turn thrusters OFF: rocket slows down visibly
  const speedBeforeCutoff = flight.speedMs;
  flight.ignited = false;
  flight.throttle = 0;
  for (let i = 0; i < 12; i++) {
    flight = stepFlightPhysics(flight, parts, mission, 0.25, { rotateInput: 0 });
  }
  assert.ok(
    flight.speedMs < speedBeforeCutoff,
    `Expected speed to decrease after thrusters off (${speedBeforeCutoff} -> ${flight.speedMs})`
  );
});

function runUntil(
  initial: FlightState,
  parts: PlacedPart[],
  mission: MissionDefinition,
  predicate: (s: FlightState) => boolean,
  maxSteps = 8000,
  stepDt = 0.05
): { final: FlightState; steps: number } {
  let s = initial;
  for (let i = 0; i < maxSteps; i++) {
    if (predicate(s)) return { final: s, steps: i };
    const m = s.activeManeuver;
    let warp = 1;
    if (m && (m.phase === 'coasting_to_burn' || m.phase === 'capture_coast')) {
      warp = m.etaSeconds > 60 ? 500 : 10;
    } else if (m && m.phase === 'coasting_to_target') {
      warp = s.soiBody === 'sun' ? 10000 : 1000;
    }
    const prevSoi = s.soiBody;
    const prevX = s.posX;
    const prevY = s.posY;
    const prevZ = s.posZ ?? 0;
    const prevSpeed = Math.hypot(s.velX, s.velY, s.velZ ?? 0);

    const next = stepFlightPhysics({ ...s, timeWarp: warp }, parts, mission, stepDt, {});
    const simDt = Math.max(stepDt, next.missionElapsedSec - s.missionElapsedSec);

    // Anti-teleport invariant: within the same SOI, displacement must be bounded by speed * simDt
    if (next.soiBody === prevSoi) {
      const distStep = Math.hypot(
        next.posX - prevX,
        next.posY - prevY,
        (next.posZ ?? 0) - prevZ
      );
      const nextSpeed = Math.hypot(next.velX, next.velY, next.velZ ?? 0);
      const maxAllowed = Math.max(prevSpeed, nextSpeed, 150) * simDt * 1.35 + 25;
      assert.ok(
        distStep <= maxAllowed,
        `Detected position jump in ${next.soiBody} SOI: moved ${distStep.toFixed(1)}m in ${simDt.toFixed(2)}s (max ${maxAllowed.toFixed(1)}m)`
      );
    }

    // missionDays must always match real simulated seconds / 86400
    assert.ok(
      Math.abs(next.missionDays - next.missionElapsedSec / 86400) < 1e-9,
      'missionDays must be derived strictly from missionElapsedSec'
    );

    s = next;
    if (predicate(s)) return { final: s, steps: i + 1 };
  }
  return { final: s, steps: maxSteps };
}

test('Artemis-Mars 2026 flies real physics: Circularize Earth -> Burn & Coast Moon SOI -> Burn & Coast Mars SOI -> Mars Deorbit & Soft Landing', () => {
  const mission = MISSIONS_BY_ID['artemis-mars-2026'];
  const parts = makeParts(mission.starterBlueprint);
  let flight = createInitialFlightState(parts, mission);

  assert.deepEqual(flight.missionRoute, ['earth', 'moon', 'mars']);

  // 1. Place craft in sub-orbital / elliptical Earth space -> Circularize via real engine burn (NO teleport)
  const rStart = 637_100 + 135_000;
  flight = {
    ...flight,
    posX: 0,
    posY: rStart,
    velX: Math.sqrt(PLANETS.earth.mu / rStart) * 0.88,
    velY: 45,
    altitudeMeters: 135_000,
    phase: 'space'
  };
  const fuelBeforeCirc = flight.remainingFuelKg;
  flight = circularizeCurrentOrbit(flight, parts);
  assert.ok(flight.activeManeuver, 'Circularize must plan a real maneuver rather than instant velocity set');
  assert.equal(flight.orbitAchieved, false, 'Orbit is not achieved until the real burn finishes');

  flight = runUntil(flight, parts, mission, (s) => s.earthOrbitCompleted && !s.activeManeuver, 2000, 0.1).final;
  assert.equal(flight.soiBody, 'earth');
  assert.equal(flight.earthOrbitCompleted, true);
  assert.ok(flight.remainingFuelKg < fuelBeforeCirc, 'Circularization burn must consume real fuel');

  // 2. Plan TLI Transfer Burn -> burn prograde -> coast to Moon SOI -> capture into Moon Orbit
  flight = startTransferTransit(flight, parts, mission, 'moon');
  assert.ok(flight.activeManeuver, 'Expected real TLI transfer maneuver');
  assert.equal(flight.activeManeuver?.targetBody, 'moon');
  assert.equal(flight.soiBody, 'earth', 'Must NOT teleport straight to Moon');

  let enteredMoonSoi = false;
  flight = runUntil(
    flight,
    parts,
    mission,
    (s) => {
      if (s.soiBody === 'moon') enteredMoonSoi = true;
      return s.soiBody === 'moon' && s.moonOrbitCompleted && !s.activeManeuver;
    },
    12000,
    0.05
  ).final;

  assert.equal(enteredMoonSoi, true, 'Craft must coast into Moon SOI via real gravity');
  assert.equal(flight.soiBody, 'moon');
  assert.equal(flight.moonOrbitCompleted, true);
  assert.ok(flight.missionLog.some((e) => e.title === 'SOI Transition' && e.detail.includes('Moon')));
  assert.ok(flight.missionLog.some((e) => e.title === 'Moon Orbit Achieved'));

  // 3. Plan Mars Transfer Burn from Moon Orbit -> exit Moon/Earth SOI -> heliocentric Sun SOI -> Mars SOI capture
  flight = startTransferTransit(flight, parts, mission, 'mars');
  assert.equal(flight.soiBody, 'moon', 'Must NOT teleport away from Moon');

  let visitedSunSoi = false;
  flight = runUntil(
    flight,
    parts,
    mission,
    (s) => {
      if (s.soiBody === 'sun') visitedSunSoi = true;
      return s.soiBody === 'mars' && !s.activeManeuver;
    },
    20000,
    0.05
  ).final;

  assert.equal(visitedSunSoi, true, 'Mars transfer must actually traverse heliocentric Sun SOI');
  assert.equal(flight.soiBody, 'mars');
  assert.ok(flight.missionDays > 1.5, 'Heliocentric Mars coast must advance real simulation days');
  assert.ok(flight.missionLog.some((e) => e.title.includes('Launched Moon Orbit')));
  assert.ok(flight.missionLog.some((e) => e.title.includes('Arrived at Mars SOI')));

  // 4. Continuous retrograde Deorbit burn (does NOT teleport altitude!)
  const altBeforeDeorbit = flight.altitudeMeters;
  flight = executeDeorbitBurn(flight, parts);
  assert.equal(flight.altitudeMeters, altBeforeDeorbit, 'Deorbit burn must not teleport altitude');
  flight = runUntil(flight, parts, mission, (s) => !s.activeManeuver, 1500, 0.05).final;
  assert.ok(flight.missionLog.some((e) => e.title === 'Deorbit Burn'));

  // 5. Touchdown on Mars surface completes the multi-leg mission
  const marsLanding = {
    ...flight,
    posX: 0,
    posY: 339_000 + 4,
    velX: 241.1, // Mars equatorial rotation
    velY: -5.5, // safe descent < 18 m/s
    angleDeg: 0,
    legsDeployed: true,
    phase: 'space' as const
  };
  const landed = stepFlightPhysics(marsLanding, parts, mission, 1.0, { rotateInput: 0 });
  assert.equal(landed.phase, 'mission_complete');
  assert.equal(landed.soiBody, 'mars');
});

test('3D snap sockets and CoM/CoT helpers compute open nodes and mass/thrust centers accurately', () => {
  const explorer = MISSIONS_BY_ID['explorer-1'];
  const parts = makeParts(explorer.starterBlueprint);
  const { com, cot } = computeCenterOfMassAndThrust(parts);
  assert.ok(com && cot, 'Expected valid CoM and CoT');
  assert.ok(com.y > cot.y, `Center of Mass (y=${com.y}) should sit above Center of Thrust (y=${cot.y})`);

  const tankDef = PARTS_BY_ID['tank_small'];
  const sockets = getOpenAttachmentSockets(tankDef, parts);
  assert.ok(sockets.length > 0, 'Expected open 3D attachment sockets on starter rocket');
});

test('Stage auto-promotion and Transfer Burn plan compute valid delta-V and fuel without activeTransit', async () => {
  const { computeTransferPlan, ensureActiveStageHasFuel } = await import('./physics');
  const mission = MISSIONS_BY_ID['artemis-mars-2026'];
  const parts = makeParts(mission.starterBlueprint);
  let flight = createInitialFlightState(parts, mission);

  flight = {
    ...flight,
    posX: 0,
    posY: 637_100 + 135_000,
    velX: Math.sqrt(PLANETS.earth.mu / (637_100 + 135_000)),
    velY: 0,
    altitudeMeters: 135_000,
    remainingFuelKg: 0,
    phase: 'space'
  };
  const staged = ensureActiveStageHasFuel(flight, parts);
  assert.equal(staged.currentStage, 1);
  assert.ok(staged.remainingFuelKg > 10_000, 'Stage 1 should provide upper-stage fuel');

  const tliPlan = computeTransferPlan(staged, parts, 'moon');
  assert.ok(tliPlan.requiredDeltaV > 400 && tliPlan.requiredDeltaV < 1500, `Expected realistic sim TLI delta-V, got ${tliPlan.requiredDeltaV}`);
  assert.ok(tliPlan.estimatedBurnSec > 1, 'Expected finite burn time');
  assert.ok(tliPlan.estimatedFuelKg > 100, 'Expected positive fuel mass');
});

test('unified attitude: smooth 30 deg/s navball turns, +45 deg east burn bends trajectory, PRO/RET orbit, and vacuum engine-off steering', async () => {
  const { commandFlightAttitude, getRocketForwardWorld } = await import('./physics');
  const explorer = MISSIONS_BY_ID['artemis-mars-2026'];
  const parts = makeParts(explorer.starterBlueprint);
  let flight = createInitialFlightState(parts, explorer);

  // 1. Launch at 0° UP -> climbs straight up without NaN or gimbal lock
  flight.ignited = true;
  flight.throttle = 1.0;
  for (let i = 0; i < 16; i++) {
    flight = stepFlightPhysics(flight, parts, explorer, 0.25, {});
  }
  assert.ok(!Number.isNaN(flight.angleDeg) && !Number.isNaN(flight.posX));
  assert.ok(flight.verticalSpeedMs > 20, '0 deg UP ignition goes straight up');
  assert.ok(Math.abs(flight.horizontalSpeedMs) < 5);

  // 2. Command +45 deg via 3x +15° navball steps -> must slew smoothly (~30°/s), NOT snap instantly
  flight = commandFlightAttitude(flight, { type: 'step', deltaDeg: 15 });
  flight = commandFlightAttitude(flight, { type: 'step', deltaDeg: 15 });
  flight = commandFlightAttitude(flight, { type: 'step', deltaDeg: 15 });
  assert.ok(Math.abs(flight.angleDeg) < 2, 'Should not snap instantaneously on command');

  flight = stepFlightPhysics(flight, parts, explorer, 0.25, {}); // ~7.5° in 0.25s
  assert.ok(flight.angleDeg > 5 && flight.angleDeg < 11, `Expected smooth ~7.5 deg turn, got ${flight.angleDeg}`);

  for (let i = 0; i < 10; i++) {
    flight = stepFlightPhysics(flight, parts, explorer, 0.25, {});
  }
  assert.ok(Math.abs(flight.angleDeg - 45) < 1, `Expected ~45 deg after slew, got ${flight.angleDeg}`);
  for (let i = 0; i < 8; i++) {
    flight = stepFlightPhysics(flight, parts, explorer, 0.25, {});
  }

  // Burning at +45° moves rocket east and bends predicted trajectory east
  const traj45 = predictTrajectory(flight, 1.0, 80);
  const startX = traj45.points[0].x;
  const endX = traj45.points[Math.min(25, traj45.points.length - 1)].x;
  assert.ok(flight.horizontalSpeedMs > 30, `Rocket velocity moves east when tilted +45 deg and burning (got ${flight.horizontalSpeedMs})`);
  assert.ok(endX - startX > 3000, `Trajectory line must bend east, dx=${endX - startX}`);

  // 3. 0° UP smoothly returns nose to vertical even in vacuum with engine OFF
  let spaceCraft: FlightState = {
    ...flight,
    posX: 0,
    posY: 637_100 + 160_000,
    velX: Math.sqrt(3.986e12 / (637_100 + 160_000)),
    velY: 0,
    altitudeMeters: 160_000,
    ignited: false,
    throttle: 0,
    phase: 'space'
  };
  spaceCraft = commandFlightAttitude(spaceCraft, { type: 'up' });
  for (let i = 0; i < 10; i++) {
    spaceCraft = stepFlightPhysics(spaceCraft, parts, explorer, 0.25, {});
  }
  assert.ok(Math.abs(spaceCraft.angleDeg) < 1, `Expected smooth return to 0° UP in vacuum with engine off, got ${spaceCraft.angleDeg}`);

  // 4. PRO in orbit aligns nose smoothly along velocity
  spaceCraft = commandFlightAttitude(spaceCraft, { type: 'prograde' });
  for (let i = 0; i < 16; i++) {
    spaceCraft = stepFlightPhysics(spaceCraft, parts, explorer, 0.25, {});
  }
  const fwdPro = getRocketForwardWorld(spaceCraft);
  assert.ok(fwdPro[0] > 0.98, `PRO in orbit should point along east velocity, got ${JSON.stringify(fwdPro)}`);

  // 5. RET aligns opposite velocity and burning slows the ship
  const speedBeforeRetro = spaceCraft.speedMs;
  spaceCraft = commandFlightAttitude(spaceCraft, { type: 'retrograde' });
  for (let i = 0; i < 28; i++) {
    spaceCraft = stepFlightPhysics(spaceCraft, parts, explorer, 0.25, {});
  }
  const fwdRet = getRocketForwardWorld(spaceCraft);
  assert.ok(fwdRet[0] < -0.95, `RET should point opposite velocity, got ${JSON.stringify(fwdRet)}`);
  spaceCraft.ignited = true;
  spaceCraft.throttle = 1.0;
  for (let i = 0; i < 12; i++) {
    spaceCraft = stepFlightPhysics(spaceCraft, parts, explorer, 0.25, {});
  }
  assert.ok(spaceCraft.speedMs < speedBeforeRetro - 20, 'Retrograde burn must slow orbital speed');

  // 6. 3D keyboard pitch (W/S) & roll (Q/E) modify forwardVector & Z position/trajectory in vacuum
  let pitched = commandFlightAttitude(spaceCraft, { type: 'up' });
  for (let i = 0; i < 20; i++) pitched = stepFlightPhysics(pitched, parts, explorer, 0.25, {});
  pitched.ignited = false;
  pitched.throttle = 0;
  for (let i = 0; i < 4; i++) {
    pitched = stepFlightPhysics(pitched, parts, explorer, 0.25, { pitchInput: 1, rollInput: 1 });
  }
  const fwd3D = getRocketForwardWorld(pitched);
  assert.ok(Math.abs(fwd3D[2]) > 0.2, `Pitch + roll steering in vacuum must tilt 3D forward vector in Z, got ${JSON.stringify(fwd3D)}`);
});

