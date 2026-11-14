import { PlanetConfig, PlanetId, SpaceBodyId } from './types';

// Playable 1:10 orbital velocity scale around Sun (V_earth = 1,800 m/s at R_earth = 149,600,000 m)
export const SUN_MU = 1800 * 1800 * 149_600_000;

export const SUN_CONFIG: PlanetConfig = {
  id: 'sun',
  name: 'Sun',
  radiusMeters: 6_960_000,
  surfaceGravity: 274,
  mu: SUN_MU,
  atmosphereHeightMeters: 0,
  atmosphereScaleHeightMeters: 0,
  surfacePressureAtm: 0,
  rotationVelocityEquatorial: 0,
  rotationPeriodHours: 609.1,
  soiRadiusMeters: 1_000_000_000,
  orbitParent: 'sun',
  orbitRadiusAU: 0,
  orbitRadiusSimMeters: 0,
  orbitPeriodDays: 1,
  initialPhaseRad: 0,
  colorHex: '#F59E0B',
  atmosphereColorHex: '#FEF08A',
  surfaceTintHex: '#FBBF24',
  description: 'Central star governing interplanetary trajectories between Earth, Venus, and Mars.'
};

export const PLANETS: Record<PlanetId, PlanetConfig> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    radiusMeters: 637_100, // 1:10 SFS-style scale (637.1 km)
    surfaceGravity: 9.81,
    mu: 9.81 * 637_100 * 637_100,
    atmosphereHeightMeters: 100_000, // Karman line: 100 km
    atmosphereScaleHeightMeters: 8_500,
    surfacePressureAtm: 1.0,
    rotationVelocityEquatorial: 465.1, // Real Earth eastward rotation boost (m/s)
    rotationPeriodHours: 24,
    soiRadiusMeters: 9_500_000,
    orbitParent: 'sun',
    orbitRadiusAU: 1.0,
    orbitRadiusSimMeters: 149_600_000,
    orbitPeriodDays: 365.25,
    initialPhaseRad: 0,
    colorHex: '#2563EB',
    atmosphereColorHex: '#38BDF8',
    surfaceTintHex: '#10B981',
    description:
      'Homeworld launch site. Features a 100 km nitrogen-oxygen atmosphere and 465 m/s eastward surface rotation assist.'
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    radiusMeters: 173_700, // 173.7 km (1:10 scale)
    surfaceGravity: 1.62,
    mu: 1.62 * 173_700 * 173_700,
    atmosphereHeightMeters: 0, // Airless vacuum
    atmosphereScaleHeightMeters: 0,
    surfacePressureAtm: 0,
    rotationVelocityEquatorial: 4.6,
    rotationPeriodHours: 655.7,
    soiRadiusMeters: 2_600_000,
    orbitParent: 'earth',
    orbitRadiusAU: 1.0026,
    orbitRadiusSimMeters: 5_200_000, // Playable lunar distance inside Earth SOI
    orbitPeriodDays: 27.3,
    initialPhaseRad: 0.95,
    colorHex: '#94A3B8',
    atmosphereColorHex: '#64748B',
    surfaceTintHex: '#CBD5E1',
    description:
      'Airless natural satellite with 1/6th Earth gravity (1.62 m/s²). Parachutes have no effect; powered retro-propulsion is required for landing.'
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    radiusMeters: 339_000, // 339.0 km
    surfaceGravity: 3.72,
    mu: 3.72 * 339_000 * 339_000,
    atmosphereHeightMeters: 120_000, // Thin CO2 atmosphere ends at 120 km
    atmosphereScaleHeightMeters: 11_100,
    surfacePressureAtm: 0.006,
    rotationVelocityEquatorial: 241.1,
    rotationPeriodHours: 24.6,
    soiRadiusMeters: 6_200_000,
    orbitParent: 'sun',
    orbitRadiusAU: 1.524,
    orbitRadiusSimMeters: 227_900_000,
    orbitPeriodDays: 687,
    initialPhaseRad: 0.77, // ~44 deg Hohmann lead window!
    colorHex: '#EA580C',
    atmosphereColorHex: '#FB923C',
    surfaceTintHex: '#C2410C',
    description:
      'The Red Planet. Thin CO2 atmosphere (ends at 120 km) provides partial aerobraking, but powered retro-thrust is still needed for soft touchdown.'
  },
  venus: {
    id: 'venus',
    name: 'Venus',
    radiusMeters: 605_100, // 605.1 km
    surfaceGravity: 8.87,
    mu: 8.87 * 605_100 * 605_100,
    atmosphereHeightMeters: 250_000, // Dense super-rotating CO2 atmosphere ends at 250 km
    atmosphereScaleHeightMeters: 15_900,
    surfacePressureAtm: 92.0,
    rotationVelocityEquatorial: 1.8, // Extremely slow retrograde rotation
    rotationPeriodHours: 5832,
    soiRadiusMeters: 8_400_000,
    orbitParent: 'sun',
    orbitRadiusAU: 0.723,
    orbitRadiusSimMeters: 108_200_000,
    orbitPeriodDays: 224.7,
    initialPhaseRad: -0.94, // ~-54 deg inward Hohmann window!
    colorHex: '#EAB308',
    atmosphereColorHex: '#FDE047',
    surfaceTintHex: '#CA8A04',
    description:
      'Dense 92-bar sulfuric atmosphere ending at 250 km. Extreme aerodynamic heating demands a Heat Shield; high drag slows landers naturally.'
  }
};

export const PLANET_ORDER: PlanetId[] = ['earth', 'moon', 'mars', 'venus'];

export interface AtmosphereLayerConfig {
  id: string;
  name: string;
  minKm: number;
  maxKm: number;
  colorHex: string;
  opacity: number;
}

export const ATMOSPHERE_LAYERS: Record<PlanetId, AtmosphereLayerConfig[]> = {
  earth: [
    {
      id: 'troposphere',
      name: 'Troposphere',
      minKm: 0,
      maxKm: 12,
      colorHex: '#38BDF8',
      opacity: 0.16
    },
    {
      id: 'stratosphere',
      name: 'Stratosphere',
      minKm: 12,
      maxKm: 50,
      colorHex: '#0284C7',
      opacity: 0.12
    },
    {
      id: 'mesosphere',
      name: 'Mesosphere',
      minKm: 50,
      maxKm: 85,
      colorHex: '#6366F1',
      opacity: 0.09
    },
    {
      id: 'thermosphere',
      name: 'Thermosphere (Kármán)',
      minKm: 85,
      maxKm: 100,
      colorHex: '#22D3EE',
      opacity: 0.08
    }
  ],
  moon: [],
  mars: [
    {
      id: 'mars-troposphere',
      name: 'Dust Troposphere',
      minKm: 0,
      maxKm: 35,
      colorHex: '#F97316',
      opacity: 0.14
    },
    {
      id: 'mars-stratosphere',
      name: 'CO₂ Stratosphere',
      minKm: 35,
      maxKm: 80,
      colorHex: '#FB923C',
      opacity: 0.1
    },
    {
      id: 'mars-thermosphere',
      name: 'Upper Thermosphere',
      minKm: 80,
      maxKm: 120,
      colorHex: '#FDBA74',
      opacity: 0.07
    }
  ],
  venus: [
    {
      id: 'venus-lower',
      name: 'Supercritical Lower',
      minKm: 0,
      maxKm: 50,
      colorHex: '#D97706',
      opacity: 0.18
    },
    {
      id: 'venus-cloud-deck',
      name: 'Sulfuric Cloud Deck',
      minKm: 50,
      maxKm: 110,
      colorHex: '#FACC15',
      opacity: 0.14
    },
    {
      id: 'venus-mesosphere',
      name: 'Upper Haze Layer',
      minKm: 110,
      maxKm: 250,
      colorHex: '#FEF08A',
      opacity: 0.08
    }
  ]
};

export function getBodyConfig(id: SpaceBodyId): PlanetConfig {
  return id === 'sun' ? SUN_CONFIG : PLANETS[id];
}

export interface CelestialBodyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angleRad: number;
  speed: number;
  orbitPeriodSec: number;
}

export function getMoonEarthState(elapsedSec: number): CelestialBodyState {
  const moon = PLANETS.moon;
  const r = moon.orbitRadiusSimMeters;
  const periodSec = moon.orbitPeriodDays * 86400;
  const omega = (2 * Math.PI) / periodSec;
  const angleRad = moon.initialPhaseRad + omega * elapsedSec;
  const speed = Math.sqrt(PLANETS.earth.mu / r);
  return {
    x: Math.cos(angleRad) * r,
    y: Math.sin(angleRad) * r,
    vx: -Math.sin(angleRad) * speed,
    vy: Math.cos(angleRad) * speed,
    angleRad,
    speed,
    orbitPeriodSec: periodSec
  };
}

export function getPlanetHeliocentricState(
  id: PlanetId,
  elapsedSec: number
): CelestialBodyState {
  if (id === 'moon') {
    const earth = getPlanetHeliocentricState('earth', elapsedSec);
    const moon = getMoonEarthState(elapsedSec);
    return {
      x: earth.x + moon.x,
      y: earth.y + moon.y,
      vx: earth.vx + moon.vx,
      vy: earth.vy + moon.vy,
      angleRad: Math.atan2(earth.y + moon.y, earth.x + moon.x),
      speed: Math.hypot(earth.vx + moon.vx, earth.vy + moon.vy),
      orbitPeriodSec: earth.orbitPeriodSec
    };
  }
  const p = PLANETS[id];
  const r = p.orbitRadiusSimMeters;
  const speed = Math.sqrt(SUN_MU / r);
  const omega = speed / r;
  const angleRad = p.initialPhaseRad + omega * elapsedSec;
  return {
    x: Math.cos(angleRad) * r,
    y: Math.sin(angleRad) * r,
    vx: -Math.sin(angleRad) * speed,
    vy: Math.cos(angleRad) * speed,
    angleRad,
    speed,
    orbitPeriodSec: (2 * Math.PI * r) / speed
  };
}

