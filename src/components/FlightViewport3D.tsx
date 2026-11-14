import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ATMOSPHERE_LAYERS,
  PLANETS,
  getBodyConfig,
  getMoonEarthState,
  getPlanetHeliocentricState
} from '../game/planets';
import {
  ensureAttitudeQuat,
  getLocalHorizonBasis,
  getRocketForwardWorld
} from '../game/physics';
import {
  createReentryBowShockMaterial,
  createReentryHeatUniforms
} from '../game/reentryShader';
import { buildRocketAssemblyGroup } from '../game/rocketMeshBuilder';
import {
  attachEnvironmentMap,
  createAtmosphereRimMaterial,
  createLaunchpadTexture,
  createPlanetMaps,
  createStudioRenderer,
  detectSoftwareWebGL,
  PlanetTextureSet
} from '../game/threeHelpers';
import { FlightState, PlacedPart, PlanetId, SpaceBodyId, TrajectoryPrediction } from '../game/types';

function createAtmoLabelTexture(title: string, colorHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 320, 64);
    ctx.fillStyle = 'rgba(8, 13, 24, 0.85)';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(6, 8, 308, 48, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(26, 32, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 42, 33);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type FlightCameraMode = 'chase' | 'wide' | 'pad';

interface FlightViewport3DProps {
  flightState: FlightState;
  parts: PlacedPart[];
  trajectory: TrajectoryPrediction;
  cameraMode?: FlightCameraMode;
}

// Visual scale: 1 scene unit = 40 simulation meters
const WORLD_SCALE = 1 / 40;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _radVec = new THREE.Vector3();
const _eVec = new THREE.Vector3();
const _uVec = new THREE.Vector3();
const _nVec = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _qHorizon = new THREE.Quaternion();
const _qAtt = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _velDirWorld = new THREE.Vector3(0, -1, 0);
const _flowLocal = new THREE.Vector3(0, -1, 0);
const _rocketBounds = new THREE.Box3();
const _rocketCenter = new THREE.Vector3();
const _rocketSize = new THREE.Vector3();

export const FlightViewport3D: React.FC<FlightViewport3DProps> = ({
  flightState,
  parts,
  trajectory,
  cameraMode = 'chase'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ flightState, parts, trajectory, cameraMode });
  stateRef.current = { flightState, parts, trajectory, cameraMode };

  const rebuildFlagRef = useRef({
    stage: -1,
    legs: false,
    solar: false,
    chute: false,
    ignited: false,
    crashed: false,
    throttleBucket: -1,
    soiBody: 'earth' as SpaceBodyId
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createStudioRenderer(container, isSoftwareGl);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#04070E');
    const envTex = attachEnvironmentMap(renderer, scene);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const camera = new THREE.PerspectiveCamera(
      50,
      (container.clientWidth || 1280) / (container.clientHeight || 720),
      0.5,
      180_000
    );
    const initialRScaled = PLANETS.earth.radiusMeters * WORLD_SCALE;
    camera.position.set(18, initialRScaled + 16, 52);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.target.set(0, initialRScaled + 9.5, 0);
    controls.minDistance = 8;
    controls.maxDistance = 28000;

    // Warm Sun directional key + cool space fill
    const sunLight = new THREE.DirectionalLight(0xfff5e6, 2.75);
    sunLight.position.set(500, 700, 400);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.72);
    scene.add(hemiLight);

    // 3D Sun Beacon + Corona in deep sky along sunLight vector
    const sunGroup = new THREE.Group();
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(750, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
    );
    const sunCorona = new THREE.Mesh(
      new THREE.SphereGeometry(1250, 24, 18),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
      })
    );
    sunGroup.add(sunCore, sunCorona);
    sunGroup.position.set(22000, 31000, 18000);
    scene.add(sunGroup);

    // Instanced starfield (zero GC, 800 stars)
    const starCount = 800;
    const starGeo = new THREE.OctahedronGeometry(18, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const starMesh = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
      const theta = (i * 137.5 * Math.PI) / 180;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / starCount);
      const r = 44000 + (i % 7) * 1800;
      dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      const s = 0.6 + (i % 4) * 0.45;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      starMesh.setMatrixAt(i, dummy.matrix);
    }
    starMesh.computeBoundingSphere();
    scene.add(starMesh);

    // Planetary sphere + Cloud layer + Fresnel Atmosphere + Companion Celestial Body
    const planetGroup = new THREE.Group();
    scene.add(planetGroup);

    let currentBodyMesh: THREE.Mesh | null = null;
    let currentCloudMesh: THREE.Mesh | null = null;
    let currentAtmoMesh: THREE.Mesh | null = null;
    let currentAtmoMat: THREE.ShaderMaterial | null = null;
    let currentAtmoRing: THREE.LineLoop | null = null;
    let currentPlanetMaps: PlanetTextureSet | null = null;
    let atmoLayerEntries: {
      radiusScaled: number;
      sprite: THREE.Sprite;
      band: THREE.Mesh;
      texture: THREE.CanvasTexture;
    }[] = [];

    // Companion 3D celestial body (e.g. 3D Moon in Earth sky, 3D Earth in Moon sky)
    let companionMesh: THREE.Group | null = null;
    let companionMaps: PlanetTextureSet | null = null;
    let companionAtmoMat: THREE.ShaderMaterial | null = null;

    // 3D Destination Planet Approaching During Interplanetary / Lunar Transit
    const transitTargetGroup = new THREE.Group();
    transitTargetGroup.visible = false;
    scene.add(transitTargetGroup);
    let activeTransitBody: PlanetId | null = null;
    let transitMaps: PlanetTextureSet | null = null;
    let transitAtmoMat: THREE.ShaderMaterial | null = null;

    // Launchpad anchored on Earth surface (0, R_earth) with coastal launch complex apron
    const padTex = createLaunchpadTexture(maxAniso);
    const padGroup = new THREE.Group();

    const oceanShelf = new THREE.Mesh(
      new THREE.CylinderGeometry(520, 540, 0.6, 56),
      new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.35, metalness: 0.15 })
    );
    oceanShelf.position.y = -1.25;
    padGroup.add(oceanShelf);

    const coastalApron = new THREE.Mesh(
      new THREE.CylinderGeometry(180, 195, 0.8, 48),
      new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.92, metalness: 0.04 })
    );
    coastalApron.position.y = -0.8;
    padGroup.add(coastalApron);

    const padDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 18, 1.2, 32),
      new THREE.MeshStandardMaterial({ map: padTex, color: 0xffffff, roughness: 0.7 })
    );
    padGroup.add(padDisc);

    // Steel truss gantry tower
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.45, metalness: 0.55 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.75 });
    for (const tx of [-8.4, -6.6]) {
      for (const tz of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 25, 0.35), steelMat);
        leg.position.set(tx, 12.5, tz);
        padGroup.add(leg);
      }
    }
    for (let ty = 3; ty <= 24; ty += 3.5) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 2.3), towerMat);
      deck.position.set(-7.5, ty, 0);
      padGroup.add(deck);
    }

    // 4 Articulated Hold-Down Clamps + Lightning Arrestor Masts (SFS2 Launch Complex)
    const clampMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45, metalness: 0.5 });
    const holdDownClamps: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const clampPivot = new THREE.Group();
      clampPivot.position.set(Math.cos(ang) * 4.4, 0.7, Math.sin(ang) * 4.4);
      clampPivot.rotation.y = -ang;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.65, 0.55), clampMat);
      arm.position.set(-1.3, 0.8, 0);
      clampPivot.add(arm);
      padGroup.add(clampPivot);
      holdDownClamps.push(clampPivot);
    }
    for (const [lx, lz] of [[-24, -22], [24, -22], [-24, 22], [24, 22]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.48, 34, 8), steelMat);
      mast.position.set(lx, 17, lz);
      padGroup.add(mast);
    }

    // Volumetric Troposphere 3D Cloud Clusters hovering above Launch Complex (2.2 km to 9.5 km)
    const cloudPuffCount = 48;
    const cloudPuffGeo = new THREE.IcosahedronGeometry(1, 1);
    const cloudPuffMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.96,
      metalness: 0.0,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });
    const cloudInstanced = new THREE.InstancedMesh(cloudPuffGeo, cloudPuffMat, cloudPuffCount);
    const cloudDummy = new THREE.Object3D();
    for (let i = 0; i < cloudPuffCount; i++) {
      const ang = (i * 137.5 * Math.PI) / 180;
      const radialSpread = 45 + (i % 7) * 52;
      const altUnits = 55 + (i % 9) * 22; // 2.2 km -> 9.2 km above pad
      cloudDummy.position.set(
        Math.cos(ang) * radialSpread,
        altUnits,
        Math.sin(ang) * radialSpread
      );
      const sx = 24 + (i % 5) * 9;
      const sy = 6 + (i % 3) * 3;
      const sz = 18 + (i % 4) * 7;
      cloudDummy.scale.set(sx, sy, sz);
      cloudDummy.updateMatrix();
      cloudInstanced.setMatrixAt(i, cloudDummy.matrix);
    }
    cloudInstanced.computeBoundingSphere();
    padGroup.add(cloudInstanced);

    scene.add(padGroup);

    // Non-Earth 3D Planetary Landing Surface Zone (craters, rocks, beacon ring)
    const landingSiteGroup = new THREE.Group();
    const landingSurfaceDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(140, 155, 0.7, 36),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.94, metalness: 0.05 })
    );
    landingSurfaceDisc.position.y = -0.35;
    landingSiteGroup.add(landingSurfaceDisc);

    const landingBeaconRing = new THREE.Mesh(
      new THREE.RingGeometry(11, 13.5, 36),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    landingBeaconRing.rotation.x = -Math.PI / 2;
    landingBeaconRing.position.y = 0.08;
    landingSiteGroup.add(landingBeaconRing);

    const surfaceRockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.95 });
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + 0.3;
      const dist = 24 + (i % 5) * 18;
      const rockSize = 1.4 + (i % 4) * 1.1;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rockSize, 0), surfaceRockMat);
      rock.position.set(Math.cos(ang) * dist, rockSize * 0.4, Math.sin(ang) * dist);
      rock.rotation.set(i * 0.7, i * 1.1, 0);
      landingSiteGroup.add(rock);
    }
    landingSiteGroup.visible = false;
    scene.add(landingSiteGroup);

    // Rocket Root + Atmospheric Re-entry Heating Plasma Shader & Bow-Shock Sheath
    const rocketPivot = new THREE.Group();
    rocketPivot.scale.setScalar(1.35);
    scene.add(rocketPivot);
    let rocketModel: THREE.Group | null = null;
    let rocketLocalCenterY = 4.5;
    let rocketLocalHalfHeight = 5.0;

    const heatUniforms = createReentryHeatUniforms();
    const reentryPlasmaMat = createReentryBowShockMaterial(heatUniforms);
    const reentryPlasmaCone = new THREE.Mesh(
      new THREE.ConeGeometry(4.0, 12.5, 28, 12, true),
      reentryPlasmaMat
    );
    reentryPlasmaCone.position.y = 4.5;
    reentryPlasmaCone.visible = false;
    reentryPlasmaCone.renderOrder = 25;
    rocketPivot.add(reentryPlasmaCone);

    // Separate short heading arrow pointing along rocket nose (1.5x rocket length, cyan)
    const headingArrowGroup = new THREE.Group();
    const arrowShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 7.5, 8),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    arrowShaft.position.y = 6.5;
    const arrowHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.4, 12),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    arrowHead.position.y = 10.6;
    headingArrowGroup.add(arrowShaft, arrowHead);
    rocketPivot.add(headingArrowGroup);

    // Live 3D Trajectory Arc Line (preallocated buffer, 350 points with vertex color fading)
    const MAX_TRAJ_PTS = 350;
    const trajPositions = new Float32Array(MAX_TRAJ_PTS * 3);
    const trajColors = new Float32Array(MAX_TRAJ_PTS * 3);
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(trajPositions, 3));
    trajGeo.setAttribute('color', new THREE.BufferAttribute(trajColors, 3));
    const trajMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92
    });
    const trajLine = new THREE.Line(trajGeo, trajMat);
    trajLine.frustumCulled = false;
    scene.add(trajLine);

    // Pooled Particle System (160 particles for engine exhaust, touchdown dust ring, and crash fireball)
    const PARTICLE_COUNT = 160;
    const pGeo = new THREE.SphereGeometry(0.6, 7, 7);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_COUNT);
    pMesh.frustumCulled = false;
    scene.add(pMesh);

    const pLife = new Float32Array(PARTICLE_COUNT);
    const pPos = new Float32Array(PARTICLE_COUNT * 3);
    const pVel = new Float32Array(PARTICLE_COUNT * 3);
    const pScale = new Float32Array(PARTICLE_COUNT);
    const pColor = new THREE.Color();
    let pCursor = 0;

    let prevRocketWorldX = 0;
    let prevRocketWorldY = initialRScaled;
    let prevRocketWorldZ = 0;
    let prevPhase = stateRef.current.flightState.phase;
    let shakeTimer = 0;
    let camGlideActive = false;
    let camGlideElapsed = 0;
    const CAM_GLIDE_DURATION = 1.45;
    const camGlideStartOffset = new THREE.Vector3(18, 16, 52);
    const camGlideTargetOffset = new THREE.Vector3(44, 72, 92);

    function spawnBurstParticles(
      wx: number,
      wy: number,
      mode: 'crash' | 'softland',
      nx: number,
      ny: number
    ) {
      const count = mode === 'crash' ? 75 : 42;
      for (let i = 0; i < count; i++) {
        const idx = pCursor;
        pCursor = (pCursor + 1) % PARTICLE_COUNT;
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        if (mode === 'crash') {
          pLife[idx] = 1.2 + Math.random() * 0.6;
          pScale[idx] = 1.6 + Math.random() * 2.8;
          pPos[idx * 3] = wx + (Math.random() - 0.5) * 3;
          pPos[idx * 3 + 1] = wy + (Math.random() - 0.5) * 3;
          pPos[idx * 3 + 2] = (Math.random() - 0.5) * 3;
          const spd = 14 + Math.random() * 34;
          pVel[idx * 3] = Math.cos(ang) * spd + nx * (10 + Math.random() * 18);
          pVel[idx * 3 + 1] = Math.sin(ang) * spd * 0.6 + ny * (10 + Math.random() * 18);
          pVel[idx * 3 + 2] = Math.sin(ang) * spd;
          pColor.setHex(i % 3 === 0 ? 0xef4444 : i % 3 === 1 ? 0xf97316 : 0xfacc15);
        } else {
          // Radial horizontal regolith / dust ring around landing legs
          pLife[idx] = 1.0 + Math.random() * 0.4;
          pScale[idx] = 1.1 + Math.random() * 1.4;
          pPos[idx * 3] = wx + Math.cos(ang) * 2.2;
          pPos[idx * 3 + 1] = wy + 0.5;
          pPos[idx * 3 + 2] = Math.sin(ang) * 2.2;
          const spd = 10 + Math.random() * 14;
          // Spread tangent to local surface
          const tx = ny;
          const ty = -nx;
          pVel[idx * 3] = tx * Math.cos(ang) * spd + nx * 2.5;
          pVel[idx * 3 + 1] = ty * Math.cos(ang) * spd + ny * 2.5;
          pVel[idx * 3 + 2] = Math.sin(ang) * spd;
          pColor.setHex(0xcbd5e1);
        }
        pMesh.setColorAt(idx, pColor);
      }
      if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
    }

    function disposeCurrentPlanet() {
      while (planetGroup.children.length > 0) {
        planetGroup.remove(planetGroup.children[0]);
      }
      for (const entry of atmoLayerEntries) {
        entry.texture.dispose();
        (entry.sprite.material as THREE.SpriteMaterial).dispose();
      }
      atmoLayerEntries = [];
      if (currentPlanetMaps) {
        currentPlanetMaps.map.dispose();
        currentPlanetMaps.bumpMap.dispose();
        currentPlanetMaps.cloudMap?.dispose();
        currentPlanetMaps = null;
      }
      if (currentAtmoMat) {
        currentAtmoMat.dispose();
        currentAtmoMat = null;
      }
      if (companionMaps) {
        companionMaps.map.dispose();
        companionMaps.bumpMap.dispose();
        companionMaps.cloudMap?.dispose();
        companionMaps = null;
      }
      if (companionAtmoMat) {
        companionAtmoMat.dispose();
        companionAtmoMat = null;
      }
      companionMesh = null;
    }

    function disposeTransitTarget() {
      while (transitTargetGroup.children.length > 0) {
        transitTargetGroup.remove(transitTargetGroup.children[0]);
      }
      if (transitMaps) {
        transitMaps.map.dispose();
        transitMaps.bumpMap.dispose();
        transitMaps.cloudMap?.dispose();
        transitMaps = null;
      }
      if (transitAtmoMat) {
        transitAtmoMat.dispose();
        transitAtmoMat = null;
      }
      activeTransitBody = null;
      transitTargetGroup.visible = false;
    }

    function buildTransitTarget(bodyId: PlanetId) {
      disposeTransitTarget();
      activeTransitBody = bodyId;
      transitMaps = createPlanetMaps(bodyId, maxAniso);
      const radiusVis = bodyId === 'moon' ? 680 : bodyId === 'mars' ? 920 : 1200;

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(radiusVis, 48, 36),
        new THREE.MeshStandardMaterial({
          map: transitMaps.map,
          bumpMap: transitMaps.bumpMap,
          bumpScale: 24,
          roughness: bodyId === 'earth' ? 0.72 : 0.9
        })
      );
      transitTargetGroup.add(sphere);

      if (transitMaps.cloudMap) {
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(radiusVis * 1.012, 40, 30),
          new THREE.MeshStandardMaterial({
            map: transitMaps.cloudMap,
            transparent: true,
            opacity: bodyId === 'venus' ? 0.8 : 0.55,
            depthWrite: false
          })
        );
        transitTargetGroup.add(clouds);
      }

      if (PLANETS[bodyId].atmosphereHeightMeters > 0) {
        transitAtmoMat = createAtmosphereRimMaterial(PLANETS[bodyId].atmosphereColorHex);
        transitTargetGroup.add(
          new THREE.Mesh(new THREE.SphereGeometry(radiusVis * 1.1, 40, 30), transitAtmoMat)
        );
      }

      transitTargetGroup.visible = true;
    }

    function rebuildPlanetForSOI(bodyId: SpaceBodyId) {
      disposeCurrentPlanet();

      const fs = stateRef.current.flightState;
      const useFloating = bodyId === 'sun';
      const renderRx = useFloating ? 0 : fs.posX * WORLD_SCALE;
      const renderRy = useFloating ? 0 : fs.posY * WORLD_SCALE;
      const renderRz = useFloating ? 0 : (fs.posZ ?? 0) * WORLD_SCALE;

      if (bodyId === 'sun') {
        padGroup.visible = false;
        landingSiteGroup.visible = false;

        const prevOffset = camera.position.clone().sub(controls.target);
        if (!Number.isFinite(prevOffset.length()) || prevOffset.length() < 8 || prevOffset.length() > 600) {
          prevOffset.set(18, 16, 52);
        }
        prevRocketWorldX = renderRx;
        prevRocketWorldY = renderRy;
        prevRocketWorldZ = renderRz;
        controls.target.set(renderRx, renderRy + 3.5, renderRz);
        camera.position.copy(controls.target).add(prevOffset);
        camGlideStartOffset.copy(prevOffset);
        camGlideTargetOffset.set(42, 34, 88);
        camGlideElapsed = 0;
        camGlideActive = rebuildFlagRef.current.soiBody !== bodyId;
        rebuildFlagRef.current.soiBody = bodyId;
        return;
      }

      const planet = PLANETS[bodyId];
      const rScaled = planet.radiusMeters * WORLD_SCALE;
      currentPlanetMaps = createPlanetMaps(bodyId, maxAniso);

      currentBodyMesh = new THREE.Mesh(
        new THREE.SphereGeometry(rScaled, 72, 54),
        new THREE.MeshStandardMaterial({
          map: currentPlanetMaps.map,
          bumpMap: currentPlanetMaps.bumpMap,
          bumpScale: bodyId === 'moon' ? 65 : 42,
          color: 0xffffff,
          roughness: bodyId === 'earth' ? 0.7 : 0.9,
          metalness: 0.06
        })
      );
      currentBodyMesh.rotation.x = Math.PI / 2;
      planetGroup.add(currentBodyMesh);

      if (currentPlanetMaps.cloudMap) {
        currentCloudMesh = new THREE.Mesh(
          new THREE.SphereGeometry(rScaled * 1.0035, 64, 48),
          new THREE.MeshStandardMaterial({
            map: currentPlanetMaps.cloudMap,
            transparent: true,
            opacity: bodyId === 'venus' ? 0.82 : bodyId === 'mars' ? 0.35 : 0.72,
            depthWrite: false,
            roughness: 0.95
          })
        );
        currentCloudMesh.rotation.x = Math.PI / 2;
        planetGroup.add(currentCloudMesh);
      } else {
        currentCloudMesh = null;
      }

      const layers = ATMOSPHERE_LAYERS[bodyId];
      if (planet.atmosphereHeightMeters > 0) {
        // Distinct 3D Concentric Atmospheric Layer Shells, Orbital Rings, Horizon Bands & 3D Labels
        for (const layer of layers) {
          const layerR = (planet.radiusMeters + layer.maxKm * 1000) * WORLD_SCALE;

          const shell = new THREE.Mesh(
            new THREE.SphereGeometry(layerR, 56, 36),
            new THREE.MeshBasicMaterial({
              color: layer.colorHex,
              transparent: true,
              opacity: Math.min(0.3, layer.opacity * 1.45),
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          planetGroup.add(shell);

          const layerRingPts: THREE.Vector3[] = [];
          for (let i = 0; i < 128; i++) {
            const a = (i / 128) * Math.PI * 2;
            layerRingPts.push(new THREE.Vector3(Math.cos(a) * layerR, Math.sin(a) * layerR, 0));
          }
          const layerRing = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(layerRingPts),
            new THREE.LineBasicMaterial({
              color: layer.colorHex,
              transparent: true,
              opacity: 0.85
            })
          );
          planetGroup.add(layerRing);

          // Local 3D translucent ceiling disc + sprite marker positioned dynamically along zenith
          const band = new THREE.Mesh(
            new THREE.RingGeometry(24, 180, 48),
            new THREE.MeshBasicMaterial({
              color: layer.colorHex,
              transparent: true,
              opacity: 0.38,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          );
          band.rotation.x = Math.PI / 2;
          planetGroup.add(band);

          const tex = createAtmoLabelTexture(`${layer.name.toUpperCase()} · ${layer.maxKm} km`, layer.colorHex);
          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
          );
          sprite.scale.set(95, 19, 1);
          planetGroup.add(sprite);

          atmoLayerEntries.push({ radiusScaled: layerR, sprite, band, texture: tex });
        }

        const atmoR = (planet.radiusMeters + planet.atmosphereHeightMeters) * WORLD_SCALE;
        currentAtmoMat = createAtmosphereRimMaterial(planet.atmosphereColorHex);
        currentAtmoMesh = new THREE.Mesh(
          new THREE.SphereGeometry(atmoR, 56, 40),
          currentAtmoMat
        );
        planetGroup.add(currentAtmoMesh);

        // Glowing Atmosphere Boundary Ring in orbital plane
        const ringPts: THREE.Vector3[] = [];
        for (let i = 0; i < 128; i++) {
          const a = (i / 128) * Math.PI * 2;
          ringPts.push(new THREE.Vector3(Math.cos(a) * atmoR, Math.sin(a) * atmoR, 0));
        }
        currentAtmoRing = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(ringPts),
          new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
        );
        planetGroup.add(currentAtmoRing);
      } else {
        currentAtmoMesh = null;
        currentAtmoRing = null;
      }

      // Render 3D companion body in sky (Moon when at Earth; Earth when at Moon)
      if (bodyId === 'earth' || bodyId === 'moon') {
        const compId: PlanetId = bodyId === 'earth' ? 'moon' : 'earth';
        companionMaps = createPlanetMaps(compId, maxAniso);
        companionMesh = new THREE.Group();
        const compRadius = compId === 'moon' ? 460 : 1850;
        const compSphere = new THREE.Mesh(
          new THREE.SphereGeometry(compRadius, 40, 30),
          new THREE.MeshStandardMaterial({
            map: companionMaps.map,
            bumpMap: companionMaps.bumpMap,
            bumpScale: 18,
            roughness: compId === 'earth' ? 0.72 : 0.92
          })
        );
        companionMesh.add(compSphere);

        if (compId === 'earth') {
          if (companionMaps.cloudMap) {
            const cSphere = new THREE.Mesh(
              new THREE.SphereGeometry(compRadius * 1.015, 36, 26),
              new THREE.MeshStandardMaterial({
                map: companionMaps.cloudMap,
                transparent: true,
                opacity: 0.72,
                depthWrite: false
              })
            );
            companionMesh.add(cSphere);
          }
          companionAtmoMat = createAtmosphereRimMaterial('#38BDF8');
          companionMesh.add(
            new THREE.Mesh(new THREE.SphereGeometry(compRadius * 1.08, 36, 26), companionAtmoMat)
          );
        }

        const skyDist = bodyId === 'earth' ? 32000 : 22000;
        companionMesh.position.set(-skyDist * 0.48, skyDist * 0.68, -skyDist * 0.55);
        planetGroup.add(companionMesh);
      }

      // Colorize non-Earth landing surface disc to match planet geology
      const discMat = landingSurfaceDisc.material as THREE.MeshStandardMaterial;
      const rockMat = surfaceRockMat;
      if (bodyId === 'moon') {
        discMat.color.set('#64748B');
        rockMat.color.set('#475569');
      } else if (bodyId === 'mars') {
        discMat.color.set('#9A3412');
        rockMat.color.set('#7C2D12');
      } else if (bodyId === 'venus') {
        discMat.color.set('#A16207');
        rockMat.color.set('#713F12');
      }

      padGroup.visible = bodyId === 'earth';
      padGroup.position.set(0, rScaled, 0);

      // Smoothly glide 3D camera (~1.45s) around rocket on real SOI transition without instant snap
      const isInitialSetup = prevRocketWorldX === 0 && prevRocketWorldY === initialRScaled && rebuildFlagRef.current.soiBody === bodyId;
      const prevOffset = camera.position.clone().sub(controls.target);
      prevRocketWorldX = renderRx;
      prevRocketWorldY = renderRy;
      prevRocketWorldZ = renderRz;
      controls.target.set(renderRx, renderRy + 3.5, renderRz);

      if (isInitialSetup) {
        if (fs.altitudeMeters > 20_000) {
          camera.position.set(renderRx + 42, renderRy + 86, renderRz + 74);
        } else {
          camera.position.set(renderRx + 18, renderRy + 16, renderRz + 52);
        }
        camGlideActive = false;
      } else {
        if (!Number.isFinite(prevOffset.length()) || prevOffset.length() < 8 || prevOffset.length() > 600) {
          prevOffset.set(22, 20, 56);
        }
        camera.position.copy(controls.target).add(prevOffset);
        camGlideStartOffset.copy(prevOffset);
        if (fs.altitudeMeters > 20_000) {
          camGlideTargetOffset.set(42, 86, 74);
        } else {
          camGlideTargetOffset.set(18, 16, 52);
        }
        camGlideElapsed = 0;
        camGlideActive = true;
      }
      rebuildFlagRef.current.soiBody = bodyId;
    }

    rebuildPlanetForSOI('earth');

    let lastTime = performance.now();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const { flightState: fs, parts: pList, trajectory: traj } = stateRef.current;

      if (rebuildFlagRef.current.soiBody !== fs.soiBody) {
        rebuildPlanetForSOI(fs.soiBody);
      }

      const useFloatingOrigin = fs.soiBody === 'sun';
      const originMetersX = useFloatingOrigin ? fs.posX : 0;
      const originMetersY = useFloatingOrigin ? fs.posY : 0;
      const originMetersZ = useFloatingOrigin ? (fs.posZ ?? 0) : 0;

      // Visual sky color transitions smoothly from planetary sky -> black deep space
      const planet = getBodyConfig(fs.soiBody);
      if (planet.atmosphereHeightMeters > 0 && fs.soiBody !== 'sun') {
        const altRatio = Math.min(1, fs.altitudeMeters / planet.atmosphereHeightMeters);
        const skyColor = new THREE.Color(
          fs.soiBody === 'mars' ? '#7C2D12' : fs.soiBody === 'venus' ? '#854D0E' : '#0EA5E9'
        ).lerp(new THREE.Color('#04070E'), Math.pow(altRatio, 0.6));
        scene.background = skyColor;
      } else {
        scene.background = new THREE.Color('#04070E');
      }

      // Sync planetary spin & launchpad rotation with Earth's surface rotation so rocket launches straight along its pointing axis
      const surfOmega = planet.rotationVelocityEquatorial / planet.radiusMeters;
      const surfTheta = fs.missionElapsedSec * surfOmega;
      if (currentBodyMesh) {
        currentBodyMesh.rotation.y = surfTheta * 0.25;
        if (currentCloudMesh) {
          currentCloudMesh.rotation.y = surfTheta * 0.35 + now * 0.000018;
        }
      }
      if (fs.soiBody === 'earth') {
        const rEarthScaled = PLANETS.earth.radiusMeters * WORLD_SCALE;
        padGroup.position.set(
          Math.sin(surfTheta) * rEarthScaled,
          Math.cos(surfTheta) * rEarthScaled,
          0
        );
        padGroup.rotation.z = -surfTheta;
        // Swing hold-down clamps open on liftoff
        const clampOpen = fs.altitudeMeters > 1.5 || fs.ignited ? -0.78 : 0;
        for (const c of holdDownClamps) {
          c.rotation.z = THREE.MathUtils.lerp(c.rotation.z, clampOpen, Math.min(1, dt * 6));
        }
      }
      if (companionMesh) {
        companionMesh.rotation.y += dt * 0.05;
        if (fs.soiBody === 'earth') {
          const moonPos = getMoonEarthState(fs.missionElapsedSec);
          const mLen = Math.max(1, Math.hypot(moonPos.x, moonPos.y));
          companionMesh.position.set(
            (moonPos.x / mLen) * 32000,
            (moonPos.y / mLen) * 32000,
            -12000
          );
        }
      }

      // Position non-Earth planetary landing terrain directly beneath rocket when descending near surface
      const rx = (fs.posX - originMetersX) * WORLD_SCALE;
      const ry = (fs.posY - originMetersY) * WORLD_SCALE;
      const rz = ((fs.posZ ?? 0) - originMetersZ) * WORLD_SCALE;
      const rDist = Math.max(1, Math.hypot(fs.posX, fs.posY));
      const nx = fs.posX / rDist;
      const ny = fs.posY / rDist;

      starMesh.position.set(rx, ry, rz);
      if (fs.soiBody === 'sun') {
        const sunDirLen = Math.max(1, Math.hypot(fs.posX, fs.posY, fs.posZ ?? 0));
        const sx = -fs.posX / sunDirLen;
        const sy = -fs.posY / sunDirLen;
        const sz = -(fs.posZ ?? 0) / sunDirLen;
        sunGroup.position.set(rx + sx * 26000, ry + sy * 26000, rz + sz * 26000);
        sunLight.position.set(sx * 900, sy * 900, sz * 900 + 300);
      } else {
        sunGroup.position.set(22000, 31000, 18000);
        sunLight.position.set(500, 700, 400);
      }

      // Update 3D atmospheric boundary horizon bands & floating 3D layer labels along current zenith
      if (atmoLayerEntries.length > 0 && fs.soiBody !== 'sun') {
        _radVec.set(nx, ny, 0);
        for (const entry of atmoLayerEntries) {
          const bx = nx * entry.radiusScaled;
          const by = ny * entry.radiusScaled;
          entry.band.position.set(bx, by, 0);
          entry.band.quaternion.setFromUnitVectors(_upVec, _radVec);
          entry.band.rotateX(Math.PI / 2);

          // Offset label neatly to the right of the ascent corridor
          const tx = ny;
          const ty = -nx;
          const labelScale = Math.max(40, Math.min(260, camera.position.distanceTo(_v1.set(bx, by, 0)) * 0.19));
          entry.sprite.scale.set(labelScale, labelScale * 0.2, 1);
          entry.sprite.position.set(bx + tx * (labelScale * 0.52), by + ty * (labelScale * 0.52), 0);
        }
      }

      if (fs.soiBody !== 'earth' && fs.soiBody !== 'sun' && fs.altitudeMeters < 22_000) {
        landingSiteGroup.visible = true;
        const rScaled = planet.radiusMeters * WORLD_SCALE;
        landingSiteGroup.position.set(nx * rScaled, ny * rScaled, 0);
        _radVec.set(nx, ny, 0);
        landingSiteGroup.quaternion.setFromUnitVectors(_upVec, _radVec);
      } else {
        landingSiteGroup.visible = false;
      }

      // Detect Crash Landing vs Soft Landing transitions for 3D VFX
      const isCrashed = fs.phase === 'crashed';
      const isSoftLanded =
        fs.phase === 'landed' ||
        (fs.phase === 'mission_complete' && fs.altitudeMeters < 50 && prevPhase !== 'mission_complete');

      if (isCrashed && prevPhase !== 'crashed') {
        spawnBurstParticles(rx, ry, 'crash', nx, ny);
        shakeTimer = 0.75;
      } else if (isSoftLanded && prevPhase !== 'landed' && prevPhase !== 'mission_complete') {
        spawnBurstParticles(rx, ry, 'softland', nx, ny);
      }
      prevPhase = fs.phase;

      // Rebuild rocket mesh only when discrete state changes
      const tBucket = fs.ignited ? Math.round(fs.throttle * 10) : 0;
      const rf = rebuildFlagRef.current;
      if (
        !rocketModel ||
        rf.stage !== fs.currentStage ||
        rf.legs !== fs.legsDeployed ||
        rf.solar !== fs.solarDeployed ||
        rf.chute !== fs.chuteDeployed ||
        rf.ignited !== fs.ignited ||
        rf.crashed !== isCrashed ||
        rf.throttleBucket !== tBucket
      ) {
        if (rocketModel) rocketPivot.remove(rocketModel);
        rocketModel = buildRocketAssemblyGroup(pList, {
          activeStage: fs.currentStage,
          legsDeployed: fs.legsDeployed,
          solarDeployed: fs.solarDeployed,
          chuteDeployed: fs.chuteDeployed,
          engineThrottle: fs.throttle,
          ignited: !isCrashed && fs.ignited && fs.remainingFuelKg > 0 && fs.currentThrustN > 0,
          heatUniforms
        });
        _rocketBounds.setFromObject(rocketModel);
        if (!_rocketBounds.isEmpty()) {
          _rocketBounds.getCenter(_rocketCenter);
          _rocketBounds.getSize(_rocketSize);
          rocketLocalCenterY = _rocketCenter.y;
          rocketLocalHalfHeight = Math.max(2.5, _rocketSize.y * 0.45);
          const shockRadius = Math.max(2.4, Math.max(_rocketSize.x, _rocketSize.z) * 0.95);
          reentryPlasmaCone.scale.set(shockRadius / 4.0, Math.max(0.65, _rocketSize.y / 10.5), shockRadius / 4.0);
        }
        // Visually fracture & char rocket parts if crashed!
        if (isCrashed) {
          rocketModel.children.forEach((partObj, idx) => {
            const side = idx % 2 === 0 ? 1 : -1;
            partObj.position.x += side * (0.4 + (idx % 3) * 0.55);
            partObj.position.z += ((idx % 3) - 1) * 0.5;
            partObj.position.y = Math.max(0.4, partObj.position.y * 0.55);
            partObj.rotation.z += side * (0.35 + (idx % 4) * 0.25);
            partObj.rotation.x += ((idx % 2) - 0.5) * 0.4;
            partObj.traverse((node) => {
              if ((node as THREE.Mesh).isMesh) {
                const mat = ((node as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
                mat.color.multiplyScalar(0.55);
                mat.emissive = new THREE.Color(0x9a3412);
                mat.emissiveIntensity = 0.35;
                (node as THREE.Mesh).material = mat;
              }
            });
          });
        }
        rocketPivot.add(rocketModel);
        rf.stage = fs.currentStage;
        rf.legs = fs.legsDeployed;
        rf.solar = fs.solarDeployed;
        rf.chute = fs.chuteDeployed;
        rf.ignited = fs.ignited;
        rf.crashed = isCrashed;
        rf.throttleBucket = tBucket;
      }

      // Position rocket in 3D scaled planet / floating Sun coordinates
      rocketPivot.position.set(rx, ry, rz);

      // Apply unified gimbal-lock-free 3D quaternion in local [East, Up, Normal] horizon frame
      const basis = getLocalHorizonBasis(fs.posX, fs.posY, fs.posZ ?? 0);
      _eVec.set(basis.E[0], basis.E[1], basis.E[2]);
      _uVec.set(basis.U[0], basis.U[1], basis.U[2]);
      _nVec.set(basis.N[0], basis.N[1], basis.N[2]);
      _basisMat.makeBasis(_eVec, _uVec, _nVec);
      _qHorizon.setFromRotationMatrix(_basisMat);
      const qRaw = ensureAttitudeQuat(fs);
      _qAtt.set(qRaw[0], qRaw[1], qRaw[2], qRaw[3]);
      rocketPivot.quaternion.copy(_qHorizon).multiply(_qAtt);

      // Keep camera following rocket delta smoothly + impact shake + ~1.45s SOI glide
      const dx = rx - prevRocketWorldX;
      const dy = ry - prevRocketWorldY;
      const dz = rz - prevRocketWorldZ;
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
      if (shakeTimer > 0) {
        shakeTimer = Math.max(0, shakeTimer - dt);
        const mag = shakeTimer * 2.2;
        controls.target.set(
          rx + (Math.random() - 0.5) * mag,
          ry + 3.5 + (Math.random() - 0.5) * mag,
          rz + (Math.random() - 0.5) * mag
        );
      } else {
        controls.target.set(rx, ry + 3.5, rz);
      }
      prevRocketWorldX = rx;
      prevRocketWorldY = ry;
      prevRocketWorldZ = rz;

      if (camGlideActive) {
        camGlideElapsed += dt;
        const rawT = Math.min(1, camGlideElapsed / CAM_GLIDE_DURATION);
        const eased = 1 - Math.pow(1 - rawT, 3);
        _v1.copy(camGlideStartOffset).lerp(camGlideTargetOffset, eased);
        camera.position.copy(controls.target).add(_v1);
        if (rawT >= 1) camGlideActive = false;
      }

      // Update live 3D predicted trajectory line (origin-relative in Sun SOI for zero float jitter)
      const pts = traj.points;
      const count = Math.min(MAX_TRAJ_PTS, pts.length);
      for (let i = 0; i < count; i++) {
        trajPositions[i * 3] = (pts[i].x - originMetersX) * WORLD_SCALE;
        trajPositions[i * 3 + 1] = (pts[i].y - originMetersY) * WORLD_SCALE;
        trajPositions[i * 3 + 2] = ((pts[i].z ?? 0) - originMetersZ) * WORLD_SCALE;

        const fade = Math.max(0.12, 1.0 - (i / Math.max(1, count - 1)) * 0.85);
        trajColors[i * 3] = 0.96 * fade;
        trajColors[i * 3 + 1] = 0.62 * fade;
        trajColors[i * 3 + 2] = 0.05 * fade;
      }
      trajGeo.setDrawRange(0, count);
      trajGeo.attributes.position.needsUpdate = true;
      trajGeo.attributes.color.needsUpdate = true;

      // Atmospheric re-entry plasma shader uniforms & bow-shock sheath scaled by flightState.heatLoad
      const heatNormalized = Math.max(0, Math.min(1.25, fs.heatLoad / 100));
      heatUniforms.uHeatLoad.value = heatNormalized;
      heatUniforms.uTime.value = now * 0.001;
      heatUniforms.uRocketWorldPos.value.copy(rocketPivot.position);

      const speedMag = Math.hypot(fs.velX, fs.velY, fs.velZ ?? 0);
      if (speedMag > 5) {
        _velDirWorld.set(fs.velX / speedMag, fs.velY / speedMag, (fs.velZ ?? 0) / speedMag);
      } else {
        _velDirWorld.set(-nx, -ny, 0).normalize();
      }
      heatUniforms.uFlowDirWorld.value.copy(_velDirWorld);

      if (fs.heatLoad > 2.5 && planet.atmosphereHeightMeters > 0 && fs.altitudeMeters < planet.atmosphereHeightMeters * 1.15) {
        reentryPlasmaCone.visible = true;
        _invQuat.copy(rocketPivot.quaternion).invert();
        _flowLocal.copy(_velDirWorld).applyQuaternion(_invQuat).normalize();
        reentryPlasmaCone.quaternion.setFromUnitVectors(_upVec, _flowLocal);
        reentryPlasmaCone.position
          .set(0, rocketLocalCenterY, 0)
          .addScaledVector(_flowLocal, rocketLocalHalfHeight * 0.18);
      } else {
        reentryPlasmaCone.visible = false;
      }

      // Real-ephemeris 3D destination planet visual during transfer coast / SOI approach
      const maneuverTarget =
        fs.activeManeuver?.kind === 'transfer' && fs.soiBody !== fs.activeManeuver.targetBody
          ? fs.activeManeuver.targetBody
          : null;
      const shouldDrawTargetBeacon =
        maneuverTarget !== null &&
        ((fs.soiBody === 'earth' && maneuverTarget === 'moon') || fs.soiBody === 'sun');

      if (shouldDrawTargetBeacon && maneuverTarget) {
        if (activeTransitBody !== maneuverTarget) {
          buildTransitTarget(maneuverTarget);
        }
        const targetState =
          fs.soiBody === 'earth' && maneuverTarget === 'moon'
            ? getMoonEarthState(fs.missionElapsedSec)
            : getPlanetHeliocentricState(maneuverTarget, fs.missionElapsedSec);
        const relX = targetState.x - fs.posX;
        const relY = targetState.y - fs.posY;
        const relZ = -(fs.posZ ?? 0);
        const distMeters = Math.max(1, Math.hypot(relX, relY, relZ));
        const visDist = THREE.MathUtils.clamp(distMeters * WORLD_SCALE, 2200, 26000);
        transitTargetGroup.position.set(
          rx + (relX / distMeters) * visDist,
          ry + (relY / distMeters) * visDist,
          rz + (relZ / distMeters) * visDist
        );
        const refRange = maneuverTarget === 'moon' ? 1.5e7 : 1.2e8;
        const scaleApproach = THREE.MathUtils.clamp(1.35 - (distMeters / refRange) * 0.75, 0.55, 1.35);
        transitTargetGroup.scale.setScalar(scaleApproach);
        transitTargetGroup.rotation.y += dt * 0.14;
      } else {
        if (activeTransitBody !== null) {
          disposeTransitTarget();
        }
        if (!camGlideActive) {
          const camMode = stateRef.current.cameraMode;
          if (camMode === 'pad' && fs.soiBody === 'earth' && fs.altitudeMeters < 1500) {
            const padTargetX = padGroup.position.x + 28;
            const padTargetY = padGroup.position.y + 12;
            camera.position.x = THREE.MathUtils.damp(camera.position.x, padTargetX, 3.2, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, padTargetY, 3.2, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, 54, 3.2, dt);
          } else if (camMode === 'wide') {
            const curOffsetLen = _v1.set(camera.position.x - rx, camera.position.y - ry, camera.position.z - rz).length();
            if (curOffsetLen < 120) {
              camera.position.x = THREE.MathUtils.damp(camera.position.x, rx + 75, 2.5, dt);
              camera.position.y = THREE.MathUtils.damp(camera.position.y, ry + 110, 2.5, dt);
              camera.position.z = THREE.MathUtils.damp(camera.position.z, rz + 175, 2.5, dt);
            }
          }
        }
      }

      // Update pooled exhaust & launchpad water-deluge steam particles
      const thrustActive =
        !isCrashed &&
        fs.ignited &&
        fs.throttle > 0.05 &&
        fs.remainingFuelKg > 0 &&
        fs.currentThrustN > 0;
      if (thrustActive) {
        const fwd = getRocketForwardWorld(fs);
        const backX = -fwd[0];
        const backY = -fwd[1];
        const backZ = -fwd[2];
        for (let s = 0; s < 3; s++) {
          const idx = pCursor;
          pCursor = (pCursor + 1) % PARTICLE_COUNT;
          pLife[idx] = 0.65;
          pScale[idx] = 1.6;
          pPos[idx * 3] = rx + backX * 1.4 + (Math.random() - 0.5) * 0.6;
          pPos[idx * 3 + 1] = ry + backY * 1.4 + (Math.random() - 0.5) * 0.6;
          pPos[idx * 3 + 2] = rz + backZ * 1.4 + (Math.random() - 0.5) * 0.6;
          const spd = 16 + fs.throttle * 26;
          pVel[idx * 3] = backX * spd + (Math.random() - 0.5) * 4;
          pVel[idx * 3 + 1] = backY * spd + (Math.random() - 0.5) * 4;
          pVel[idx * 3 + 2] = backZ * spd + (Math.random() - 0.5) * 4;
          pColor.setHex(0xfdba74);
          pMesh.setColorAt(idx, pColor);
        }
        // Billowing white water-deluge steam when near launchpad
        if (fs.altitudeMeters < 180) {
          const idx = pCursor;
          pCursor = (pCursor + 1) % PARTICLE_COUNT;
          pLife[idx] = 1.1;
          pScale[idx] = 2.6;
          const side = pCursor % 2 === 0 ? 1 : -1;
          pPos[idx * 3] = rx + side * (2 + Math.random() * 2);
          pPos[idx * 3 + 1] = padGroup.position.y + 1.2;
          pPos[idx * 3 + 2] = (Math.random() - 0.5) * 3;
          pVel[idx * 3] = side * (12 + Math.random() * 14);
          pVel[idx * 3 + 1] = 2 + Math.random() * 4;
          pVel[idx * 3 + 2] = (Math.random() - 0.5) * 10;
          pColor.setHex(0xe2e8f0);
          pMesh.setColorAt(idx, pColor);
        }
        if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
      }

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (pLife[i] > 0) {
          pLife[i] -= dt * 1.15;
          pPos[i * 3] += pVel[i * 3] * dt;
          pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
          pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
          const sc = Math.max(0.01, pLife[i] * (pScale[i] || 1.8));
          _v1.set(pPos[i * 3], pPos[i * 3 + 1], pPos[i * 3 + 2]);
          _v2.set(sc, sc, sc);
          dummy.position.copy(_v1);
          dummy.scale.copy(_v2);
        } else {
          dummy.position.set(0, -99999, 0);
          dummy.scale.set(0.001, 0.001, 0.001);
        }
        dummy.updateMatrix();
        pMesh.setMatrixAt(i, dummy.matrix);
      }
      pMesh.instanceMatrix.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 720;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      envTex.dispose();
      padTex.dispose();
      reentryPlasmaMat.dispose();
      reentryPlasmaCone.geometry.dispose();
      disposeCurrentPlanet();
      disposeTransitTarget();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-testid="flight-3d-viewport"
      className="w-full h-full cursor-grab active:cursor-grabbing"
    />
  );
};
