import { getStarterBlueprint } from './partsCatalog';
import { MissionDefinition } from './types';

export const MISSIONS: MissionDefinition[] = [
  // ==========================================
  // MAJOR SATELLITES (EARTH)
  // ==========================================
  {
    id: 'explorer-1',
    year: '1958',
    name: 'Explorer 1',
    agency: 'NASA',
    category: 'satellite',
    targetBody: 'earth',
    objectiveType: 'orbit',
    summary: 'Launch the first U.S. satellite into elliptical Earth orbit to detect radiation belts.',
    historicalSignificance: 'First successful U.S. satellite; discovered the Van Allen radiation belts.',
    budget: 34000,
    targetOrbitKm: { min: 110, max: 350 },
    transferWindow: {
      optimalDay: 1,
      optimalTimeUtc: '03:48 UTC',
      phaseAngleDeg: 0,
      entryOrbitKm: 160,
      flightDurationDays: 0.2
    },
    requirements: {
      minDeltaV: 2500,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.02,
      requiredScience: ['radiation']
    },
    starterBlueprint: getStarterBlueprint('satellite')
  },
  {
    id: 'telstar-1',
    year: '1962',
    name: 'Telstar 1',
    agency: 'NASA/Bell',
    category: 'satellite',
    targetBody: 'earth',
    objectiveType: 'orbit',
    summary: 'Place an active communications relay satellite into medium Earth orbit.',
    historicalSignificance: 'First active communications satellite to relay television, telephone, and data signals.',
    budget: 38000,
    targetOrbitKm: { min: 150, max: 500 },
    transferWindow: {
      optimalDay: 1,
      optimalTimeUtc: '08:35 UTC',
      phaseAngleDeg: 0,
      entryOrbitKm: 240,
      flightDurationDays: 0.3
    },
    requirements: {
      minDeltaV: 2700,
      minTWR: 1.25,
      minPowerBalanceW: 20,
      minCommsAU: 0.1,
      requiredScience: ['comms_relay']
    },
    starterBlueprint: getStarterBlueprint('satellite')
  },
  {
    id: 'syncom-3',
    year: '1964',
    name: 'Syncom 3',
    agency: 'NASA',
    category: 'satellite',
    targetBody: 'earth',
    objectiveType: 'geostationary',
    summary: 'Reach high geostationary-equivalent orbit above Earth’s equator with full power & relay.',
    historicalSignificance: 'First geostationary communications satellite.',
    budget: 45000,
    targetOrbitKm: { min: 450, max: 1400 },
    transferWindow: {
      optimalDay: 1,
      optimalTimeUtc: '12:15 UTC',
      phaseAngleDeg: 0,
      entryOrbitKm: 650,
      flightDurationDays: 0.6
    },
    requirements: {
      minDeltaV: 3200,
      minTWR: 1.25,
      minPowerBalanceW: 20,
      minCommsAU: 0.1,
      requiredScience: ['comms_relay']
    },
    starterBlueprint: getStarterBlueprint('lunar_orbiter')
  },
  {
    id: 'landsat-1',
    year: '1972',
    name: 'Landsat 1',
    agency: 'NASA',
    category: 'satellite',
    targetBody: 'earth',
    objectiveType: 'orbit',
    summary: 'Deploy a multispectral Earth observation satellite to monitor global land surfaces.',
    historicalSignificance: 'Began long-term satellite monitoring of Earth’s land surfaces.',
    budget: 42000,
    targetOrbitKm: { min: 140, max: 320 },
    transferWindow: {
      optimalDay: 1,
      optimalTimeUtc: '14:08 UTC',
      phaseAngleDeg: 0,
      entryOrbitKm: 190,
      flightDurationDays: 0.25
    },
    requirements: {
      minDeltaV: 2650,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 0.05,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('satellite')
  },

  // ==========================================
  // MOON MISSIONS
  // ==========================================
  {
    id: 'luna-2',
    year: '1959',
    name: 'Luna 2',
    agency: 'USSR',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'impact',
    summary: 'Escape Earth gravity and guide a probe to direct impact on the lunar surface.',
    historicalSignificance: 'First human-made object to reach the Moon.',
    budget: 46000,
    targetOrbitKm: { min: 0, max: 50 },
    transferWindow: {
      optimalDay: 3,
      optimalTimeUtc: '06:00 UTC',
      phaseAngleDeg: 52.0,
      entryOrbitKm: 0,
      flightDurationDays: 2.6
    },
    requirements: {
      minDeltaV: 3900,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiredScience: ['radiation']
    },
    starterBlueprint: getStarterBlueprint('lunar_orbiter')
  },
  {
    id: 'luna-3',
    year: '1959',
    name: 'Luna 3',
    agency: 'USSR',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'flyby',
    summary: 'Loop around the Moon in a free-return flyby and photograph its unseen far side.',
    historicalSignificance: 'First spacecraft to photograph the Moon’s far side.',
    budget: 48000,
    targetOrbitKm: { min: 40, max: 600 },
    transferWindow: {
      optimalDay: 4,
      optimalTimeUtc: '02:20 UTC',
      phaseAngleDeg: 54.0,
      entryOrbitKm: 120,
      flightDurationDays: 3.1
    },
    requirements: {
      minDeltaV: 4100,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('lunar_orbiter')
  },
  {
    id: 'ranger-7',
    year: '1964',
    name: 'Ranger 7',
    agency: 'NASA',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'impact',
    summary: 'Transmit rapid close-up lunar surface photographs all the way until impact.',
    historicalSignificance: 'First successful U.S. lunar-imaging mission; returned close-up images before impact.',
    budget: 48000,
    targetOrbitKm: { min: 0, max: 40 },
    transferWindow: {
      optimalDay: 3,
      optimalTimeUtc: '16:50 UTC',
      phaseAngleDeg: 51.5,
      entryOrbitKm: 0,
      flightDurationDays: 2.8
    },
    requirements: {
      minDeltaV: 4000,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('lunar_orbiter')
  },
  {
    id: 'luna-9',
    year: '1966',
    name: 'Luna 9',
    agency: 'USSR',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'soft_landing',
    summary: 'Execute a powered retro-descent onto the airless Moon at under 12 m/s.',
    historicalSignificance: 'First soft landing on another world.',
    budget: 64000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 5,
      optimalTimeUtc: '11:41 UTC',
      phaseAngleDeg: 53.0,
      entryOrbitKm: 35,
      flightDurationDays: 3.4
    },
    requirements: {
      minDeltaV: 4800,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiresLandingLegs: true,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'lunar-orbiter-1-5',
    year: '1966–67',
    name: 'Lunar Orbiter 1–5',
    agency: 'NASA',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'orbit',
    summary: 'Enter stable low lunar orbit to map landing sites for future crewed missions.',
    historicalSignificance: 'Mapped the Moon and helped select Apollo landing sites.',
    budget: 52000,
    targetOrbitKm: { min: 25, max: 220 },
    transferWindow: {
      optimalDay: 4,
      optimalTimeUtc: '19:26 UTC',
      phaseAngleDeg: 52.0,
      entryOrbitKm: 60,
      flightDurationDays: 3.2
    },
    requirements: {
      minDeltaV: 4400,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 0.05,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('lunar_orbiter')
  },
  {
    id: 'surveyor-1-7',
    year: '1966–68',
    name: 'Surveyor 1, 3, 5, 6 & 7',
    agency: 'NASA',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'soft_landing',
    summary: 'Test closed-loop radar descent and robotic surface operations on the Moon.',
    historicalSignificance: 'Successful robotic Moon landers that tested landing and surface operations.',
    budget: 65000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 5,
      optimalTimeUtc: '14:41 UTC',
      phaseAngleDeg: 53.5,
      entryOrbitKm: 40,
      flightDurationDays: 2.9
    },
    requirements: {
      minDeltaV: 4800,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiresLandingLegs: true,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'apollo-8',
    year: '1968',
    name: 'Apollo 8',
    agency: 'NASA',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'orbit',
    summary: 'Carry a crewed Apollo command module into lunar orbit and capture Earthrise.',
    historicalSignificance: 'First crewed mission to orbit the Moon.',
    budget: 74000,
    targetOrbitKm: { min: 30, max: 240 },
    transferWindow: {
      optimalDay: 6,
      optimalTimeUtc: '12:51 UTC',
      phaseAngleDeg: 51.8,
      entryOrbitKm: 65,
      flightDurationDays: 3.0
    },
    requirements: {
      minDeltaV: 4600,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.1,
      requiresHeatShield: true,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'apollo-11',
    year: '1969',
    name: 'Apollo 11',
    agency: 'NASA',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'soft_landing',
    summary: 'Land crew safely on Mare Tranquillitatis with Eagle lander legs and sufficient fuel.',
    historicalSignificance: 'First crewed Moon landing; Neil Armstrong and Buzz Aldrin walked on the Moon on 20 July 1969.',
    budget: 85000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 7,
      optimalTimeUtc: '13:32 UTC',
      phaseAngleDeg: 52.4,
      entryOrbitKm: 50,
      flightDurationDays: 3.1
    },
    requirements: {
      minDeltaV: 5100,
      minTWR: 1.3,
      minPowerBalanceW: 0,
      minCommsAU: 0.1,
      requiresLandingLegs: true,
      requiresHeatShield: true
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'apollo-12',
    year: '1969',
    name: 'Apollo 12',
    agency: 'NASA',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'soft_landing',
    summary: 'Perform a precision crewed lunar landing near Oceanus Procellarum.',
    historicalSignificance: 'Second successful crewed lunar landing.',
    budget: 85000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 8,
      optimalTimeUtc: '16:22 UTC',
      phaseAngleDeg: 52.1,
      entryOrbitKm: 50,
      flightDurationDays: 3.2
    },
    requirements: {
      minDeltaV: 5100,
      minTWR: 1.3,
      minPowerBalanceW: 0,
      minCommsAU: 0.1,
      requiresLandingLegs: true,
      requiresHeatShield: true
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'luna-16',
    year: '1970',
    name: 'Luna 16',
    agency: 'USSR',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'sample_return',
    summary: 'Soft-land on the Moon, drill regolith samples, and maintain return capability.',
    historicalSignificance: 'First robotic mission to return lunar soil samples to Earth.',
    budget: 78000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 9,
      optimalTimeUtc: '14:48 UTC',
      phaseAngleDeg: 53.0,
      entryOrbitKm: 45,
      flightDurationDays: 4.5
    },
    requirements: {
      minDeltaV: 5200,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiresLandingLegs: true,
      requiredScience: ['surface_drill']
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'luna-17-lunokhod-1',
    year: '1970',
    name: 'Luna 17 / Lunokhod 1',
    agency: 'USSR',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'soft_landing',
    summary: 'Deliver the 8-wheeled Lunokhod robotic rover safely onto Mare Imbrium.',
    historicalSignificance: 'First robotic rover on another world.',
    budget: 76000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 10,
      optimalTimeUtc: '14:44 UTC',
      phaseAngleDeg: 52.8,
      entryOrbitKm: 40,
      flightDurationDays: 3.5
    },
    requirements: {
      minDeltaV: 5000,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiresLandingLegs: true,
      requiredScience: ['rover']
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },
  {
    id: 'chandrayaan-3',
    year: '2023',
    name: 'Chandrayaan-3',
    agency: 'ISRO',
    category: 'moon',
    targetBody: 'moon',
    objectiveType: 'soft_landing',
    summary: 'Guide Vikram lander and Pragyan rover to a soft touchdown near the lunar south pole.',
    historicalSignificance: 'Successful landing near the Moon’s south pole.',
    budget: 72000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 11,
      optimalTimeUtc: '09:05 UTC',
      phaseAngleDeg: 52.5,
      entryOrbitKm: 35,
      flightDurationDays: 5.2
    },
    requirements: {
      minDeltaV: 4950,
      minTWR: 1.25,
      minPowerBalanceW: 0,
      minCommsAU: 0.05,
      requiresLandingLegs: true,
      requiredScience: ['rover']
    },
    starterBlueprint: getStarterBlueprint('lunar_lander')
  },

  // ==========================================
  // MARS MISSIONS
  // ==========================================
  {
    id: 'artemis-mars-2026',
    year: '2026',
    name: 'Artemis–Mars Expedition',
    agency: 'NASA',
    category: 'mars',
    targetBody: 'mars',
    objectiveType: 'soft_landing',
    summary:
      'Complete a full multi-leg expedition: enter Earth orbit, stage at Moon’s orbit, launch through lunar orbit towards Mars, and land softly on Mars.',
    historicalSignificance:
      'NASA 2026 Moon-to-Mars architecture using cislunar staging before interplanetary Mars landing.',
    budget: 110000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 22,
      optimalTimeUtc: '16:40 UTC',
      phaseAngleDeg: 44.3,
      entryOrbitKm: 150,
      flightDurationDays: 210
    },
    routeWaypoints: ['earth', 'moon', 'mars'],
    requirements: {
      minDeltaV: 5800,
      minTWR: 1.25,
      minPowerBalanceW: 20,
      minCommsAU: 2.0,
      requiresHeatShield: true,
      requiresParachute: true,
      requiresLandingLegs: true,
      requiredScience: ['imaging', 'atmo_probe']
    },
    starterBlueprint: getStarterBlueprint('planetary_lander')
  },
  {
    id: 'mariner-4',
    year: '1965',
    name: 'Mariner 4',
    agency: 'NASA',
    category: 'mars',
    targetBody: 'mars',
    objectiveType: 'flyby',
    summary: 'Fly past Mars on a Hohmann transfer and beam back close-up crater images over deep space.',
    historicalSignificance: 'First successful Mars flyby and first close-up images of Mars.',
    budget: 66000,
    targetOrbitKm: { min: 50, max: 1200 },
    transferWindow: {
      optimalDay: 14,
      optimalTimeUtc: '14:22 UTC',
      phaseAngleDeg: 44.3,
      entryOrbitKm: 280,
      flightDurationDays: 228
    },
    routeWaypoints: ['earth', 'moon', 'mars'],
    requirements: {
      minDeltaV: 4800,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 1.6,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'mariner-6-7',
    year: '1969',
    name: 'Mariner 6 & 7',
    agency: 'NASA',
    category: 'mars',
    targetBody: 'mars',
    objectiveType: 'flyby',
    summary: 'Dual-trajectory Mars flyby carrying optical imaging and atmospheric sensors.',
    historicalSignificance: 'Successful Mars flybys that returned detailed images.',
    budget: 68000,
    targetOrbitKm: { min: 40, max: 900 },
    transferWindow: {
      optimalDay: 16,
      optimalTimeUtc: '01:29 UTC',
      phaseAngleDeg: 44.1,
      entryOrbitKm: 210,
      flightDurationDays: 157
    },
    routeWaypoints: ['earth', 'moon', 'mars'],
    requirements: {
      minDeltaV: 4900,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 1.6,
      requiredScience: ['imaging', 'atmo_probe']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'mariner-9',
    year: '1971',
    name: 'Mariner 9',
    agency: 'NASA',
    category: 'mars',
    targetBody: 'mars',
    objectiveType: 'orbit',
    summary: 'Perform Mars orbital insertion burn and map Olympus Mons and Valles Marineris.',
    historicalSignificance: 'First spacecraft to orbit another planet.',
    budget: 76000,
    targetOrbitKm: { min: 80, max: 450 },
    transferWindow: {
      optimalDay: 18,
      optimalTimeUtc: '22:23 UTC',
      phaseAngleDeg: 44.4,
      entryOrbitKm: 180,
      flightDurationDays: 167
    },
    routeWaypoints: ['earth', 'moon', 'mars'],
    requirements: {
      minDeltaV: 5400,
      minTWR: 1.25,
      minPowerBalanceW: 15,
      minCommsAU: 1.8,
      requiredScience: ['imaging']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'viking-1',
    year: '1975–76',
    name: 'Viking 1',
    agency: 'NASA',
    category: 'mars',
    targetBody: 'mars',
    objectiveType: 'soft_landing',
    summary: 'Enter Earth orbit, stage at Moon orbit, launch to Mars atmosphere (120 km boundary), and land softly.',
    historicalSignificance: 'First successful Mars orbiter-and-lander mission; its lander was the first successful landing on Mars.',
    budget: 96000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 20,
      optimalTimeUtc: '21:22 UTC',
      phaseAngleDeg: 44.3,
      entryOrbitKm: 150,
      flightDurationDays: 304
    },
    routeWaypoints: ['earth', 'moon', 'mars'],
    requirements: {
      minDeltaV: 5800,
      minTWR: 1.25,
      minPowerBalanceW: 20,
      minCommsAU: 2.0,
      requiresHeatShield: true,
      requiresParachute: true,
      requiresLandingLegs: true,
      requiredScience: ['imaging', 'atmo_probe']
    },
    starterBlueprint: getStarterBlueprint('planetary_lander')
  },

  // ==========================================
  // VENUS MISSIONS
  // ==========================================
  {
    id: 'mariner-2',
    year: '1962',
    name: 'Mariner 2',
    agency: 'NASA',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'flyby',
    summary: 'Navigate an inward Venus transfer and scan cloud-top temperatures and solar wind.',
    historicalSignificance: 'First successful mission to another planet; flew by Venus on 14 December 1962.',
    budget: 62000,
    targetOrbitKm: { min: 100, max: 1400 },
    transferWindow: {
      optimalDay: 12,
      optimalTimeUtc: '06:53 UTC',
      phaseAngleDeg: -54.1,
      entryOrbitKm: 320,
      flightDurationDays: 109
    },
    requirements: {
      minDeltaV: 4600,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 1.2,
      requiredScience: ['magnetometer']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'mariner-5',
    year: '1967',
    name: 'Mariner 5',
    agency: 'NASA',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'flyby',
    summary: 'Skim above Venus’s 250 km atmosphere boundary to measure magnetic and radio occultation data.',
    historicalSignificance: 'Successful Venus flyby that measured the planet’s atmosphere and magnetic environment.',
    budget: 65000,
    targetOrbitKm: { min: 150, max: 1000 },
    transferWindow: {
      optimalDay: 13,
      optimalTimeUtc: '06:01 UTC',
      phaseAngleDeg: -54.0,
      entryOrbitKm: 270,
      flightDurationDays: 127
    },
    requirements: {
      minDeltaV: 4700,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 1.2,
      requiredScience: ['magnetometer', 'atmo_probe']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'venera-7',
    year: '1970',
    name: 'Venera 7',
    agency: 'USSR',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'soft_landing',
    summary: 'Survive intense 92-bar atmospheric entry at 250 km using a heat shield & parachute to land.',
    historicalSignificance: 'First successful landing on Venus.',
    budget: 88000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 15,
      optimalTimeUtc: '05:38 UTC',
      phaseAngleDeg: -54.2,
      entryOrbitKm: 260,
      flightDurationDays: 120
    },
    requirements: {
      minDeltaV: 5400,
      minTWR: 1.25,
      minPowerBalanceW: 10,
      minCommsAU: 1.2,
      requiresHeatShield: true,
      requiresParachute: true,
      requiresLandingLegs: true,
      requiredScience: ['atmo_probe']
    },
    starterBlueprint: getStarterBlueprint('planetary_lander')
  },
  {
    id: 'mariner-10',
    year: '1973–74',
    name: 'Mariner 10',
    agency: 'NASA',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'gravity_assist',
    summary: 'Slingshot past Venus using a precision gravity-assist trajectory toward the inner solar system.',
    historicalSignificance: 'Used Venus for a gravity assist while traveling to Mercury.',
    budget: 70000,
    targetOrbitKm: { min: 150, max: 900 },
    transferWindow: {
      optimalDay: 17,
      optimalTimeUtc: '05:45 UTC',
      phaseAngleDeg: -54.0,
      entryOrbitKm: 290,
      flightDurationDays: 94
    },
    requirements: {
      minDeltaV: 5000,
      minTWR: 1.25,
      minPowerBalanceW: 15,
      minCommsAU: 1.4,
      requiredScience: ['imaging', 'magnetometer']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'venera-9-10',
    year: '1975',
    name: 'Venera 9 & 10',
    agency: 'USSR',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'soft_landing',
    summary: 'Deploy an atmospheric entry capsule through Venus clouds to transmit surface panoramas.',
    historicalSignificance: 'First Venus orbiters and first spacecraft to send images from Venus’s surface.',
    budget: 90000,
    targetOrbitKm: { min: 0, max: 5 },
    transferWindow: {
      optimalDay: 19,
      optimalTimeUtc: '02:38 UTC',
      phaseAngleDeg: -54.1,
      entryOrbitKm: 260,
      flightDurationDays: 136
    },
    requirements: {
      minDeltaV: 5500,
      minTWR: 1.25,
      minPowerBalanceW: 15,
      minCommsAU: 1.2,
      requiresHeatShield: true,
      requiresParachute: true,
      requiresLandingLegs: true,
      requiredScience: ['imaging', 'atmo_probe']
    },
    starterBlueprint: getStarterBlueprint('planetary_lander')
  },
  {
    id: 'pioneer-venus-1',
    year: '1978',
    name: 'Pioneer Venus 1',
    agency: 'NASA',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'orbit',
    summary: 'Insert into stable Venus orbit above the 250 km cloud deck for radar altimetry mapping.',
    historicalSignificance: 'First U.S. spacecraft to orbit Venus.',
    budget: 74000,
    targetOrbitKm: { min: 260, max: 650 },
    transferWindow: {
      optimalDay: 21,
      optimalTimeUtc: '15:13 UTC',
      phaseAngleDeg: -54.0,
      entryOrbitKm: 300,
      flightDurationDays: 198
    },
    requirements: {
      minDeltaV: 5200,
      minTWR: 1.25,
      minPowerBalanceW: 15,
      minCommsAU: 1.3,
      requiredScience: ['atmo_probe', 'magnetometer']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  },
  {
    id: 'parker-solar-probe',
    year: '2018–present',
    name: 'Parker Solar Probe',
    agency: 'NASA',
    category: 'venus',
    targetBody: 'venus',
    objectiveType: 'gravity_assist',
    summary: 'Execute high-energy Venus gravity-assist flybys to dive deep toward the solar corona.',
    historicalSignificance: 'Uses repeated Venus flybys to study the Sun.',
    budget: 82000,
    targetOrbitKm: { min: 150, max: 1100 },
    transferWindow: {
      optimalDay: 22,
      optimalTimeUtc: '07:31 UTC',
      phaseAngleDeg: -53.8,
      entryOrbitKm: 280,
      flightDurationDays: 50
    },
    requirements: {
      minDeltaV: 5600,
      minTWR: 1.3,
      minPowerBalanceW: 20,
      minCommsAU: 1.5,
      requiresHeatShield: true,
      requiredScience: ['magnetometer', 'radiation']
    },
    starterBlueprint: getStarterBlueprint('planetary_flyby')
  }
];

export const MISSIONS_BY_ID: Record<string, MissionDefinition> = Object.fromEntries(
  MISSIONS.map((m) => [m.id, m])
);
