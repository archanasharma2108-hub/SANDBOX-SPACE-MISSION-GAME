import * as THREE from 'three';
import { PARTS_BY_ID } from './partsCatalog';
import { applyReentryHeatShader, ReentryHeatUniforms } from './reentryShader';
import { PlacedPart } from './types';

// Shared materials & procedural texture caches for crisp SFS2-style PBR rendering
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const heatMaterialCaches = new WeakMap<ReentryHeatUniforms, Map<string, THREE.MeshStandardMaterial>>();
const tankTexCache = new Map<string, THREE.CanvasTexture>();
let nozzleRibTex: THREE.CanvasTexture | null = null;

function createTankHullTexture(bodyColor: string, accentColor: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${bodyColor}-${accentColor}`;
  const cached = tankTexCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base metallic/painted fuselage
  ctx.fillStyle = bodyColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle vertical aluminum panel seams & rivets
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.lineWidth = 2;
  for (let x = 0; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  // Horizontal weld rings
  for (let y = 64; y < 512; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Classic Saturn/SFS2 black-and-white roll pattern near top & bottom
  const squares = 8;
  const sqW = 512 / squares;
  for (let i = 0; i < squares; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#0F172A' : '#F8FAFC';
    ctx.fillRect(i * sqW, 44, sqW, 38);
  }

  // Mission accent stripe
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 96, 512, 24);

  // Bottom dark intertank ring
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 456, 512, 56);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tankTexCache.set(key, tex);
  return tex;
}

function getNozzleRibTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (nozzleRibTex) return nozzleRibTex;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = x % 16 === 0 ? '#1E293B' : '#64748B';
    ctx.fillRect(x, 0, 4, 128);
  }
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.fillRect(0, 24, 256, 8);
  ctx.fillRect(0, 74, 256, 8);

  nozzleRibTex = new THREE.CanvasTexture(canvas);
  nozzleRibTex.colorSpace = THREE.SRGBColorSpace;
  nozzleRibTex.wrapS = THREE.RepeatWrapping;
  return nozzleRibTex;
}

function getMat(
  color: string | number,
  roughness: number,
  metalness: number,
  emissive?: string | number,
  emissiveIntensity = 0,
  map?: THREE.CanvasTexture | null,
  heatUniforms?: ReentryHeatUniforms
): THREE.MeshStandardMaterial {
  const key = `${color}-${roughness}-${metalness}-${emissive ?? 'none'}-${emissiveIntensity}-${map ? map.uuid : 'nomap'}`;
  let cache = materialCache;
  if (heatUniforms) {
    let hCache = heatMaterialCaches.get(heatUniforms);
    if (!hCache) {
      hCache = new Map<string, THREE.MeshStandardMaterial>();
      heatMaterialCaches.set(heatUniforms, hCache);
    }
    cache = hCache;
  }

  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: map ? '#FFFFFF' : color,
      map: map ?? null,
      roughness,
      metalness,
      emissive: emissive !== undefined ? new THREE.Color(emissive) : new THREE.Color(0x000000),
      emissiveIntensity
    });
    if (heatUniforms) {
      applyReentryHeatShader(mat, heatUniforms);
    }
    cache.set(key, mat);
  }
  return mat;
}

export interface BuiltPartOptions {
  isSelected?: boolean;
  isColliding?: boolean;
  legsDeployed?: boolean;
  solarDeployed?: boolean;
  chuteDeployed?: boolean;
  engineGlow?: number; // 0 to 1
  heatUniforms?: ReentryHeatUniforms;
}

function buildMachPlume(width: number, height: number, glow: number, isIon: boolean, isSrb: boolean): THREE.Group {
  const plumeGroup = new THREE.Group();
  const baseLen = (2.1 + glow * 4.4) * Math.max(0.85, height * 0.85);
  const coreColor = isIon ? 0x38bdf8 : isSrb ? 0xfef9c3 : 0xffedd5;
  const outerColor = isIon ? 0x0284c7 : isSrb ? 0xfbbf24 : 0xf97316;

  // Outer glowing plasma sheath
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.34, baseLen, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: outerColor,
      transparent: true,
      opacity: 0.42 + glow * 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  outer.rotation.x = Math.PI;
  outer.position.y = -baseLen * 0.5;
  plumeGroup.add(outer);

  // Inner bright core
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.19, baseLen * 0.62, 14),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    })
  );
  inner.rotation.x = Math.PI;
  inner.position.y = -baseLen * 0.31;
  plumeGroup.add(inner);

  // 3 Mach shock diamonds along exhaust centerline
  for (let i = 0; i < 3; i++) {
    const sc = 1 - i * 0.24;
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(width * 0.14 * sc, 0),
      new THREE.MeshBasicMaterial({
        color: isIon ? 0xe0f2fe : 0xffffff,
        transparent: true,
        opacity: 0.85 - i * 0.2
      })
    );
    diamond.scale.set(0.8, 1.8, 0.8);
    diamond.position.y = -(baseLen * (0.18 + i * 0.22));
    plumeGroup.add(diamond);
  }

  return plumeGroup;
}

export function buildPartMeshGroup(
  partId: string,
  opts: BuiltPartOptions = {}
): THREE.Group {
  const def = PARTS_BY_ID[partId];
  const group = new THREE.Group();
  if (!def) return group;

  const hu = opts.heatUniforms;
  const hullMat = getMat(def.bodyColor, 0.48, 0.28, undefined, 0, undefined, hu);
  const darkMetal = getMat('#1E293B', 0.38, 0.82, undefined, 0, undefined, hu);
  const chromeMat = getMat('#E2E8F0', 0.14, 0.94, undefined, 0, undefined, hu);
  const accentMat = getMat(def.accentColor, 0.35, 0.45, undefined, 0, undefined, hu);
  const goldFoil = getMat('#F59E0B', 0.22, 0.88, undefined, 0, undefined, hu);
  const glassMat = getMat('#38BDF8', 0.08, 0.15, '#0284C7', 0.42, undefined, hu);

  const w = def.width;
  const h = def.height;
  const d = def.depth;

  switch (def.shapeType) {
    case 'capsule': {
      // Conical Apollo/Orion crew capsule with heat-tile collar, hatch, docking port, RCS quads & windows
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.25, w * 0.49, h * 0.74, 28),
        hullMat
      );
      cone.position.y = 0.04;
      group.add(cone);

      const dockingRing = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.21, w * 0.25, h * 0.2, 24),
        darkMetal
      );
      dockingRing.position.y = h * 0.44;
      group.add(dockingRing);

      const dockingLip = new THREE.Mesh(
        new THREE.TorusGeometry(w * 0.18, 0.035, 8, 20),
        chromeMat
      );
      dockingLip.rotation.x = Math.PI / 2;
      dockingLip.position.y = h * 0.54;
      group.add(dockingLip);

      const baseHeatRing = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.495, w * 0.47, h * 0.16, 28),
        accentMat
      );
      baseHeatRing.position.y = -h * 0.38;
      group.add(baseHeatRing);

      // Forward viewport windows
      for (const wx of [-w * 0.11, w * 0.11]) {
        const win = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.13, h * 0.14, 0.12),
          glassMat
        );
        win.position.set(wx, h * 0.12, d * 0.34);
        win.rotation.x = -0.22;
        group.add(win);
      }

      // 4 RCS attitude pods around upper skirt
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), darkMetal);
        rcs.position.set(Math.cos(a) * w * 0.42, -h * 0.18, Math.sin(a) * d * 0.42);
        group.add(rcs);
      }
      break;
    }

    case 'probe': {
      // Octagonal MLI gold-foil satellite bus + avionics collar + star tracker + telemetry whip
      const bus = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.45, w * 0.45, h * 0.72, 8),
        goldFoil
      );
      group.add(bus);

      const topPlate = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.48, w * 0.48, h * 0.12, 8),
        darkMetal
      );
      topPlate.position.y = h * 0.38;
      group.add(topPlate);

      const botPlate = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.48, w * 0.48, h * 0.1, 8),
        darkMetal
      );
      botPlate.position.y = -h * 0.38;
      group.add(botPlate);

      const coreEye = new THREE.Mesh(
        new THREE.SphereGeometry(w * 0.16, 16, 12),
        glassMat
      );
      coreEye.position.set(0, 0, d * 0.42);
      group.add(coreEye);

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.038, h * 0.36, 8),
        chromeMat
      );
      mast.position.y = h * 0.52;
      group.add(mast);
      break;
    }

    case 'tank': {
      // SFS2 cryogenic tank with procedural roll-pattern texture, LOX raceway pipes & dome bulkheads
      const tankTex = createTankHullTexture(def.bodyColor, def.accentColor);
      const tankHullMat = getMat(def.bodyColor, 0.52, 0.18, undefined, 0, tankTex, hu);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.47, w * 0.47, h * 0.88, 28),
        tankHullMat
      );
      group.add(body);

      const topCap = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.42, w * 0.475, h * 0.08, 28),
        darkMetal
      );
      topCap.position.y = h * 0.46;
      group.add(topCap);

      const botCap = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.475, w * 0.42, h * 0.08, 28),
        darkMetal
      );
      botCap.position.y = -h * 0.46;
      group.add(botCap);

      // Dual external LOX/avionics feedlines along sides
      for (const side of [-1, 1]) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, h * 0.84, 8),
          chromeMat
        );
        pipe.position.set(side * w * 0.475, 0, 0);
        group.add(pipe);
      }
      break;
    }

    case 'engine': {
      // SFS2 engine: thrust frame mount, fluted regenerative bell, glowing throat, turbopump & Mach plume
      const mount = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.37, w * 0.39, h * 0.28, 24),
        darkMetal
      );
      mount.position.y = h * 0.35;
      group.add(mount);

      const bellTex = getNozzleRibTexture();
      const bellMat = getMat(def.bodyColor, 0.28, 0.78, undefined, 0, bellTex, hu);
      const bellPts = [
        new THREE.Vector2(w * 0.15, h * 0.22),
        new THREE.Vector2(w * 0.26, -h * 0.04),
        new THREE.Vector2(w * 0.43, -h * 0.45),
        new THREE.Vector2(w * 0.38, -h * 0.46),
        new THREE.Vector2(w * 0.12, h * 0.19)
      ];
      const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 28), bellMat);
      group.add(bell);

      // Cooling manifold torus collars
      for (const ry of [-h * 0.06, -h * 0.26]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(ry < -h * 0.15 ? w * 0.36 : w * 0.27, 0.032, 8, 24),
          accentMat
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = ry;
        group.add(ring);
      }

      // Turbopump exhaust manifold
      const pump = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.095, w * 0.11, h * 0.38, 10),
        chromeMat
      );
      pump.position.set(w * 0.29, h * 0.12, 0);
      group.add(pump);

      if (opts.engineGlow && opts.engineGlow > 0.02) {
        const throat = new THREE.Mesh(
          new THREE.SphereGeometry(w * 0.2, 12, 10),
          new THREE.MeshBasicMaterial({
            color: def.id === 'engine_ion_spark' ? 0x38bdf8 : 0xfef08a
          })
        );
        throat.position.y = -h * 0.35;
        group.add(throat);

        const plume = buildMachPlume(
          w,
          h,
          opts.engineGlow,
          def.id === 'engine_ion_spark',
          false
        );
        plume.position.y = -h * 0.44;
        group.add(plume);
      }
      break;
    }

    case 'srb': {
      // Strap-on booster with ogive cone, roll segments, hazard bands & white-gold plume
      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(w * 0.46, h * 0.19, 24),
        hullMat
      );
      nose.position.y = h * 0.41;
      group.add(nose);

      const tankTex = createTankHullTexture(def.bodyColor, def.accentColor);
      const bodyMat = getMat(def.bodyColor, 0.46, 0.22, undefined, 0, tankTex, hu);
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.46, w * 0.46, h * 0.64, 24),
        bodyMat
      );
      group.add(cyl);

      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.22, w * 0.39, h * 0.18, 20),
        darkMetal
      );
      nozzle.position.y = -h * 0.41;
      group.add(nozzle);

      if (opts.engineGlow && opts.engineGlow > 0.02) {
        const plume = buildMachPlume(w, h * 0.48, opts.engineGlow, false, true);
        plume.position.y = -h * 0.49;
        group.add(plume);
      }
      break;
    }

    case 'solar': {
      const hinge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, h * 0.85, 10),
        chromeMat
      );
      hinge.rotation.z = Math.PI / 2;
      group.add(hinge);

      const spread = opts.solarDeployed === false ? 0.55 : 1.0;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(w * spread, h * 0.72, 0.06),
        getMat('#1D4ED8', 0.16, 0.72, '#1E40AF', 0.25, undefined, hu)
      );
      panel.position.x = 0.08;
      group.add(panel);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w * spread + 0.06, h * 0.78, 0.03),
        chromeMat
      );
      frame.position.x = 0.08;
      group.add(frame);
      break;
    }

    case 'dish': {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.14, w * 0.2, h * 0.38, 12),
        darkMetal
      );
      mast.position.y = -h * 0.25;
      group.add(mast);

      const dishPts = [
        new THREE.Vector2(0.02, -0.08),
        new THREE.Vector2(w * 0.28, -0.02),
        new THREE.Vector2(w * 0.48, 0.18)
      ];
      const dish = new THREE.Mesh(
        new THREE.LatheGeometry(dishPts, 24),
        getMat('#F8FAFC', 0.28, 0.45, undefined, 0, undefined, hu)
      );
      dish.material.side = THREE.DoubleSide;
      dish.position.y = 0.05;
      group.add(dish);

      const feedHorn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, h * 0.42, 8),
        accentMat
      );
      feedHorn.position.y = h * 0.22;
      group.add(feedHorn);
      break;
    }

    case 'instrument': {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.76, h * 0.72, d * 0.76),
        hullMat
      );
      group.add(housing);

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.2, w * 0.2, 0.18, 16),
        glassMat
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0, 0, d * 0.42);
      group.add(lens);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.82, h * 0.14, d * 0.82),
        accentMat
      );
      trim.position.y = h * 0.26;
      group.add(trim);

      const boom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, h * 0.5, 8),
        chromeMat
      );
      boom.position.set(w * 0.28, h * 0.42, 0);
      group.add(boom);
      break;
    }

    case 'decoupler': {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.485, w * 0.485, h * 0.9, 26),
        darkMetal
      );
      group.add(ring);

      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.5, w * 0.5, h * 0.36, 26),
        accentMat
      );
      group.add(stripe);
      break;
    }

    case 'heatshield': {
      const dish = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.48, w * 0.34, h * 0.85, 28),
        hullMat
      );
      group.add(dish);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(w * 0.47, 0.05, 8, 28),
        accentMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = h * 0.35;
      group.add(rim);
      break;
    }

    case 'legs': {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 0.35, 16),
        darkMetal
      );
      collar.position.y = h * 0.2;
      group.add(collar);

      const deployAngle = opts.legsDeployed ? 0.68 : 0.14;
      for (let i = 0; i < 4; i++) {
        const legPivot = new THREE.Group();
        legPivot.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
        const strut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.06, h * 1.15, 8),
          accentMat
        );
        strut.position.set(w * 0.42, -h * 0.22, 0);
        strut.rotation.z = deployAngle;
        legPivot.add(strut);

        const pad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.18, 0.06, 10),
          chromeMat
        );
        pad.position.set(w * (opts.legsDeployed ? 0.68 : 0.48), -h * 0.65, 0);
        legPivot.add(pad);
        group.add(legPivot);
      }
      break;
    }

    case 'chute': {
      const pack = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.42, w * 0.46, h * 0.78, 18),
        hullMat
      );
      group.add(pack);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(w * 0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        accentMat
      );
      cap.position.y = h * 0.35;
      group.add(cap);

      if (opts.chuteDeployed) {
        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(2.4, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          getMat('#EF4444', 0.75, 0.05, undefined, 0, undefined, hu)
        );
        canopy.material.side = THREE.DoubleSide;
        canopy.position.y = 4.2;
        group.add(canopy);
      }
      break;
    }
  }

  // Highlight wireframe outline if selected or colliding in VAB
  if (opts.isSelected || opts.isColliding) {
    const boxColor = opts.isColliding ? 0xef4444 : 0x38bdf8;
    const boxGeo = new THREE.BoxGeometry(w + 0.08, h + 0.08, d + 0.08);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: boxColor })
    );
    group.add(line);
  }

  group.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return group;
}

export function buildRocketAssemblyGroup(
  parts: PlacedPart[],
  options: {
    activeStage?: number;
    selectedInstanceId?: string | null;
    collidingIds?: string[];
    legsDeployed?: boolean;
    solarDeployed?: boolean;
    chuteDeployed?: boolean;
    engineThrottle?: number;
    ignited?: boolean;
    heatUniforms?: ReentryHeatUniforms;
  } = {}
): THREE.Group {
  const root = new THREE.Group();
  const collidingSet = new Set(options.collidingIds ?? []);
  const minActiveStage = options.activeStage ?? 0;

  for (const part of parts) {
    if (part.stage < minActiveStage) continue;
    const def = PARTS_BY_ID[part.partId];
    if (!def) continue;

    const isEngineActive =
      Boolean(options.ignited) &&
      part.stage === minActiveStage &&
      def.thrustN > 0 &&
      (options.engineThrottle ?? 0) > 0.01;

    const mesh = buildPartMeshGroup(part.partId, {
      isSelected: options.selectedInstanceId === part.instanceId,
      isColliding: collidingSet.has(part.instanceId),
      legsDeployed: options.legsDeployed,
      solarDeployed: options.solarDeployed,
      chuteDeployed: options.chuteDeployed,
      engineGlow: isEngineActive ? options.engineThrottle : 0,
      heatUniforms: options.heatUniforms
    });
    mesh.position.set(part.x, part.y, part.z);
    mesh.rotation.y = (part.rotationDeg * Math.PI) / 180;
    mesh.userData.instanceId = part.instanceId;
    root.add(mesh);
  }

  return root;
}
