export type PlanetId = 'earth' | 'moon' | 'mars' | 'venus';
export type SpaceBodyId = PlanetId | 'sun';

export type PartCategory =
  | 'command'
  | 'propulsion'
  | 'fuel'
  | 'science'
  | 'power_comms'
  | 'structural';

export type MissionCategory = 'satellite' | 'moon' | 'mars' | 'venus';

export type MissionObjectiveType =
  | 'orbit'
  | 'geostationary'
  | 'flyby'
  | 'impact'
  | 'soft_landing'
  | 'sample_return'
  | 'gravity_assist';

export interface PlanetConfig {
  id: SpaceBodyId;
  name: string;
  radiusMeters: number; // Simulation radius (1:10 Earth scale for playable orbital times)
  surfaceGravity: number; // m/s^2 at surface
  mu: number; // GM (m^3 / s^2)
  atmosphereHeightMeters: number; // Altitude where atmosphere ends (0 = vacuum)
  atmosphereScaleHeightMeters: number; // Exponential density scale height
  surfacePressureAtm: number; // 1.0 Earth, 0.006 Mars, 92 Venus, 0 Moon
  rotationVelocityEquatorial: number; // m/s tangential surface velocity
  rotationPeriodHours: number;
  soiRadiusMeters: number; // Sphere of influence radius
  orbitParent: 'sun' | 'earth';
  orbitRadiusAU: number; // For heliocentric 2D map & transfer windows
  orbitRadiusSimMeters: number; // Sim orbital radius around parent
  orbitPeriodDays: number;
  initialPhaseRad: number;
  colorHex: string;
  atmosphereColorHex: string;
  surfaceTintHex: string;
  description: string;
}

export interface PartDefinition {
  id: string;
  name: string;
  category: PartCategory;
  description: string;
  cost: number; // USD in thousands ($k) or game credits ($)
  dryMassKg: number;
  fuelMassKg: number;
  thrustN: number; // Newtons (0 if not an engine)
  ispVac: number; // Specific impulse in vacuum (s)
  ispAtm: number; // Specific impulse at sea level (s)
  powerGenWatts: number; // Solar / RTG generation
  powerDrawWatts: number; // Continuous draw
  commsRangeAU: number; // Max comms link distance in AU (0.01 = LEO/Moon, 2.5 = Deep Space)
  heatToleranceK: number; // Max thermal tolerance
  hasHeatShield?: boolean;
  hasParachute?: boolean;
  hasLandingLegs?: boolean;
  isDecoupler?: boolean;
  isCommand?: boolean;
  scienceInstrument?:
    | 'radiation'
    | 'comms_relay'
    | 'imaging'
    | 'magnetometer'
    | 'surface_drill'
    | 'rover'
    | 'atmo_probe';
  // 3D bounding box / hitbox dimensions in meters (build space units)
  width: number;
  height: number;
  depth: number;
  accentColor: string;
  bodyColor: string;
  shapeType:
    | 'capsule'
    | 'probe'
    | 'tank'
    | 'engine'
    | 'srb'
    | 'decoupler'
    | 'solar'
    | 'dish'
    | 'instrument'
    | 'heatshield'
    | 'legs'
    | 'chute';
}

export interface PlacedPart {
  instanceId: string;
  partId: string;
  x: number; // Horizontal offset in VAB meters (center = 0)
  y: number; // Vertical height in VAB meters (pad = 0)
  z: number; // Depth offset in VAB meters (center = 0)
  stage: number; // Stage index (0 = bottom/launch stage, higher = upper stages)
  rotationDeg: number; // Optional mounting rotation
}

export interface MissionRequirement {
  minDeltaV: number; // Recommended m/s
  minTWR: number; // Minimum launchpad TWR
  minPowerBalanceW: number; // Net power >= 0
  minCommsAU: number; // Required communications range
  requiresHeatShield?: boolean;
  requiresLandingLegs?: boolean;
  requiresParachute?: boolean;
  requiredScience?: NonNullable<PartDefinition['scienceInstrument']>[];
}

export interface MissionDefinition {
  id: string;
  year: string;
  name: string;
  agency: 'NASA' | 'USSR' | 'ISRO' | 'NASA/Bell';
  category: MissionCategory;
  targetBody: PlanetId;
  objectiveType: MissionObjectiveType;
  summary: string;
  historicalSignificance: string;
  budget: number;
  targetOrbitKm: { min: number; max: number };
  transferWindow: {
    optimalDay: number;
    optimalTimeUtc: string;
    phaseAngleDeg: number;
    entryOrbitKm: number;
    flightDurationDays: number;
  };
  routeWaypoints?: PlanetId[];
  requirements: MissionRequirement;
  starterBlueprint: Omit<PlacedPart, 'instanceId'>[];
}

export interface EngineeringSummary {
  totalCost: number;
  remainingBudget: number;
  totalDryMassKg: number;
  totalFuelMassKg: number;
  totalMassKg: number;
  launchThrustN: number;
  launchTWR: number;
  estimatedDeltaV: number;
  powerGeneratedW: number;
  powerConsumedW: number;
  netPowerW: number;
  maxCommsAU: number;
  hasCommand: boolean;
  hasHeatShield: boolean;
  hasLandingLegs: boolean;
  hasParachute: boolean;
  scienceInstruments: NonNullable<PartDefinition['scienceInstrument']>[];
  warnings: string[];
  isReadyToLaunch: boolean;
}

export interface TrajectoryPoint {
  x: number; // Position relative to current SOI body center (meters)
  y: number;
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
  altitudeMeters: number;
  timeOffsetSec: number;
}

export interface TrajectoryPrediction {
  points: TrajectoryPoint[];
  apoapsisKm: number;
  periapsisKm: number;
  eccentricity: number;
  isEscaping: boolean;
  isSuborbitalImpact: boolean;
  crossesAtmosphere: boolean;
  estimatedBurnDeltaV: number;
}

export type FlightPhase =
  | 'prelaunch'
  | 'ascent'
  | 'space'
  | 'reentry'
  | 'landed'
  | 'crashed'
  | 'mission_complete';

export type AttitudeTargetMode =
  | { type: 'manual' }
  | { type: 'angle'; angleDeg: number }
  | { type: 'up' }
  | { type: 'prograde' }
  | { type: 'retrograde' }
  | { type: 'world_dir'; dirX: number; dirY: number; dirZ: number };

export type MissionLogSeverity = 'info' | 'action' | 'milestone' | 'success' | 'danger';

export interface MissionLogEntry {
  id: string;
  title: string;
  detail: string;
  missionElapsedSec: number;
  missionDays: number;
  timestampLabel: string;
  severity: MissionLogSeverity;
}

export type ManeuverKind = 'circularize' | 'transfer' | 'deorbit';

export type ManeuverPhase =
  | 'coasting_to_burn'
  | 'aligning'
  | 'burning'
  | 'coasting_to_target'
  | 'capture_coast'
  | 'capturing';

export interface ActiveManeuverState {
  kind: ManeuverKind;
  phase: ManeuverPhase;
  fromBody: SpaceBodyId;
  targetBody: PlanetId;
  finalDestinationBody?: PlanetId;
  label: string;
  requiredDeltaV: number;
  remainingDeltaV: number;
  estimatedBurnSec: number;
  estimatedFuelKg: number;
  burnWindowElapsedSec: number;
  distanceRemainingMeters: number;
  etaSeconds: number;
  autoWarpToArrival: boolean;
  burnDirectionMode: 'prograde' | 'retrograde' | 'horizon_east' | 'world_dir';
  targetBurnDir?: [number, number, number];
  targetOrbitRadiusMeters?: number;
  targetPeriapsisKm?: number;
  mccDone?: boolean;
  captureTrimDone?: boolean;
  skipCapture?: boolean;
}

export interface TransferBurnPlan {
  targetBody: PlanetId;
  requiredDeltaV: number;
  estimatedBurnSec: number;
  estimatedFuelKg: number;
  coastTimeSec: number;
  distanceMeters: number;
}

export interface FlightState {
  soiBody: SpaceBodyId;
  // 3D orbital coordinates around current SOI body (meters), where pad is at (0, R_earth, 0)
  posX: number;
  posY: number;
  posZ?: number;
  velX: number;
  velY: number;
  velZ?: number;
  // 360-degree full rotational axis (degrees, 0 = local zenith up, +90 = east prograde)
  angleDeg: number; // -180 to +180 (full 360 continuous rotation)
  rollDeg: number;
  yawDeg: number;
  // Unified gimbal-lock-free 3D attitude quaternion [x, y, z, w] in local [East, Up, Normal] frame
  attitudeQuat?: [number, number, number, number];
  attitudeTarget?: AttitudeTargetMode;
  _syncedAngles?: [number, number, number];
  angularVelDeg: number;
  throttle: number; // 0.0 to 1.0 (0% to 100%)
  ignited: boolean;
  currentStage: number;
  maxStage: number;
  remainingFuelKg: number;
  initialFuelKg: number;
  currentDryMassKg: number;
  currentThrustN: number;
  currentIsp: number;
  legsDeployed: boolean;
  chuteDeployed: boolean;
  solarDeployed: boolean;
  missionElapsedSec: number;
  missionDays: number;
  timeWarp: number;
  altitudeMeters: number;
  speedMs: number;
  verticalSpeedMs: number;
  horizontalSpeedMs: number;
  atmosphereDensity: number; // 0 to 1+
  atmosphereLayerName: string; // Active 3D atmosphere layer or Deep Space
  heatLoad: number; // 0 to 100
  commsConnected: boolean;
  powerPercent: number;
  phase: FlightPhase;
  scienceCompleted: boolean;
  orbitAchieved: boolean;
  earthOrbitCompleted: boolean;
  moonOrbitCompleted: boolean;
  missionRoute: PlanetId[];
  routeLegIndex: number;
  activeManeuver: ActiveManeuverState | null;
  flybyAchieved: boolean;
  returnedToEarth: boolean;
  statusMessage: string;
  missionLog: MissionLogEntry[];
}
