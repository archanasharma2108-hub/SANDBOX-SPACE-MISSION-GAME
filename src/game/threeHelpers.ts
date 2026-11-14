import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PlanetId } from './types';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createStudioRenderer(container: HTMLElement, isSoftwareGl: boolean): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance'
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
  container.appendChild(renderer.domElement);
  return renderer;
}

export function attachEnvironmentMap(renderer: THREE.WebGLRenderer, scene: THREE.Scene): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
  return envTex;
}

export interface PlanetTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  cloudMap?: THREE.CanvasTexture;
}

export function createPlanetMaps(planetId: PlanetId, maxAnisotropy: number): PlanetTextureSet {
  const W = 1024;
  const H = 512;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = W;
  albedoCanvas.height = H;
  const ctx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = W;
  bumpCanvas.height = H;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#404040';
  bCtx.fillRect(0, 0, W, H);

  let cloudCanvas: HTMLCanvasElement | undefined;

  if (planetId === 'earth') {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#F1F5F9');
    grad.addColorStop(0.1, '#1E3A8A');
    grad.addColorStop(0.35, '#1D4ED8');
    grad.addColorStop(0.5, '#0284C7');
    grad.addColorStop(0.65, '#1D4ED8');
    grad.addColorStop(0.9, '#1E3A8A');
    grad.addColorStop(1, '#F1F5F9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Coastal shelves & detailed continents
    const landmasses: Array<[number, number, number, number, number]> = [
      [190, 175, 96, 58, 0.25],
      [275, 295, 58, 78, -0.15],
      [510, 160, 115, 68, 0.18],
      [565, 265, 76, 92, 0.12],
      [750, 190, 145, 78, -0.1],
      [835, 340, 68, 48, 0.3],
      [110, 345, 42, 32, -0.2],
      [685, 315, 44, 52, 0.22]
    ];
    for (const [bx, by, rx, ry, rot] of landmasses) {
      // Coastal teal halo
      ctx.fillStyle = 'rgba(14, 165, 233, 0.35)';
      ctx.beginPath();
      ctx.ellipse(bx, by, rx * 1.12, ry * 1.12, rot, 0, Math.PI * 2);
      ctx.fill();

      // Lush green lowlands
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.ellipse(bx, by, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();

      // Arid ochre interior & mountain spine
      ctx.fillStyle = '#A16207';
      ctx.beginPath();
      ctx.ellipse(bx + rx * 0.12, by - ry * 0.08, rx * 0.48, ry * 0.36, rot, 0, Math.PI * 2);
      ctx.fill();

      // Bump map continent elevation
      bCtx.fillStyle = '#909090';
      bCtx.beginPath();
      bCtx.ellipse(bx, by, rx, ry, rot, 0, Math.PI * 2);
      bCtx.fill();

      bCtx.fillStyle = '#DCDCDC';
      bCtx.beginPath();
      bCtx.ellipse(bx + rx * 0.1, by - ry * 0.05, rx * 0.38, ry * 0.28, rot, 0, Math.PI * 2);
      bCtx.fill();
    }

    // Separate rotating 3D cloud deck
    cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = W;
    cloudCanvas.height = H;
    const cCtx = cloudCanvas.getContext('2d')!;
    cCtx.clearRect(0, 0, W, H);
    for (let i = 0; i < 64; i++) {
      const cx = (i * 137 + 41) % W;
      const cy = 42 + ((i * 73) % (H - 84));
      const rx = 34 + (i % 48);
      const ry = 8 + (i % 14);
      cCtx.fillStyle = `rgba(255, 255, 255, ${0.28 + (i % 4) * 0.1})`;
      cCtx.beginPath();
      cCtx.ellipse(cx, cy, rx, ry, ((i % 7) - 3) * 0.12, 0, Math.PI * 2);
      cCtx.fill();
    }
  } else if (planetId === 'moon') {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, 0, W, H);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, W, H);

    // Dark basalt maria basins
    for (let i = 0; i < 14; i++) {
      const mx = (i * 151 + 80) % W;
      const my = 110 + ((i * 89) % (H - 220));
      const rx = 55 + (i % 4) * 18;
      const ry = 40 + (i % 3) * 14;
      ctx.fillStyle = '#64748B';
      ctx.beginPath();
      ctx.ellipse(mx, my, rx, ry, i * 0.4, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = '#525252';
      bCtx.beginPath();
      bCtx.ellipse(mx, my, rx, ry, i * 0.4, 0, Math.PI * 2);
      bCtx.fill();
    }

    // Multi-scale craters with bright ejecta rims and depressed bowls in bump map
    for (let i = 0; i < 120; i++) {
      const cx = (i * 179 + 37) % W;
      const cy = 36 + ((i * 97) % (H - 72));
      const r = 6 + (i % 24);
      // Ejecta rays on larger craters
      if (i % 7 === 0) {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
        ctx.lineWidth = 2;
        for (let ray = 0; ray < 5; ray++) {
          const ang = ray * 1.25 + i;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * r * 2.6, cy + Math.sin(ang) * r * 2.6);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // Raised crater rim & sunken bowl on bump map
      bCtx.strokeStyle = '#EDEDED';
      bCtx.lineWidth = 3;
      bCtx.beginPath();
      bCtx.arc(cx, cy, r, 0, Math.PI * 2);
      bCtx.stroke();
      bCtx.fillStyle = '#262626';
      bCtx.beginPath();
      bCtx.arc(cx, cy, Math.max(2, r - 2), 0, Math.PI * 2);
      bCtx.fill();
    }
  } else if (planetId === 'mars') {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#F1F5F9');
    grad.addColorStop(0.08, '#9A3412');
    grad.addColorStop(0.5, '#C2410C');
    grad.addColorStop(0.92, '#9A3412');
    grad.addColorStop(1, '#F1F5F9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Dark volcanic regions + iron oxide dust plains
    for (let i = 0; i < 36; i++) {
      const mx = (i * 139 + 40) % W;
      const my = 65 + ((i * 79) % (H - 130));
      const rx = 38 + (i % 34);
      const ry = 20 + (i % 18);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(124, 45, 18, 0.55)' : 'rgba(234, 88, 12, 0.32)';
      ctx.beginPath();
      ctx.ellipse(mx, my, rx, ry, 0.2, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = i % 2 === 0 ? '#5E5E5E' : '#ACACAC';
      bCtx.beginPath();
      bCtx.ellipse(mx, my, rx, ry, 0.2, 0, Math.PI * 2);
      bCtx.fill();
    }

    // Valles Marineris canyon scar & Olympus Mons shield relief
    ctx.strokeStyle = '#431407';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(390, 260);
    ctx.bezierCurveTo(460, 248, 540, 272, 620, 258);
    ctx.stroke();

    bCtx.strokeStyle = '#171717';
    bCtx.lineWidth = 10;
    bCtx.beginPath();
    bCtx.moveTo(390, 260);
    bCtx.bezierCurveTo(460, 248, 540, 272, 620, 258);
    bCtx.stroke();

    bCtx.fillStyle = '#F5F5F5';
    bCtx.beginPath();
    bCtx.arc(270, 210, 28, 0, Math.PI * 2);
    bCtx.fill();

    // Subtle Martian high-altitude dust clouds
    cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = W;
    cloudCanvas.height = H;
    const cCtx = cloudCanvas.getContext('2d')!;
    for (let i = 0; i < 24; i++) {
      cCtx.fillStyle = 'rgba(254, 215, 170, 0.16)';
      cCtx.beginPath();
      cCtx.ellipse((i * 157) % W, 70 + ((i * 61) % (H - 140)), 52, 9, 0.1, 0, Math.PI * 2);
      cCtx.fill();
    }
  } else {
    // Venus golden sulfuric surface + super-rotating cloud deck
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#FEF08A');
    grad.addColorStop(0.35, '#EAB308');
    grad.addColorStop(0.65, '#CA8A04');
    grad.addColorStop(1, '#FEF08A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = 'rgba(161, 98, 7, 0.35)';
      ctx.beginPath();
      ctx.ellipse((i * 123) % W, 50 + ((i * 83) % (H - 100)), 65, 18, 0.08, 0, Math.PI * 2);
      ctx.fill();

      bCtx.fillStyle = i % 2 === 0 ? '#A8A8A8' : '#585858';
      bCtx.beginPath();
      bCtx.ellipse((i * 123) % W, 50 + ((i * 83) % (H - 100)), 60, 16, 0.08, 0, Math.PI * 2);
      bCtx.fill();
    }

    cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = W;
    cloudCanvas.height = H;
    const cCtx = cloudCanvas.getContext('2d')!;
    for (let i = 0; i < 36; i++) {
      cCtx.fillStyle = 'rgba(254, 249, 195, 0.38)';
      cCtx.beginPath();
      cCtx.ellipse(W / 2, 20 + i * 13.5, 480, 10, 0.05 * Math.sin(i), 0, Math.PI * 2);
      cCtx.fill();
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  let cloudMap: THREE.CanvasTexture | undefined;
  if (cloudCanvas) {
    cloudMap = new THREE.CanvasTexture(cloudCanvas);
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.wrapS = THREE.RepeatWrapping;
    cloudMap.wrapT = THREE.ClampToEdgeWrapping;
    cloudMap.anisotropy = maxAnisotropy;
  }

  return { map, bumpMap, cloudMap };
}

export function createPlanetTexture(planetId: PlanetId, maxAnisotropy: number): THREE.CanvasTexture {
  return createPlanetMaps(planetId, maxAnisotropy).map;
}

export function createAtmosphereRimMaterial(colorHex: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(colorHex) }
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalWorld = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormalWorld;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(0.0, dot(-vNormalWorld, vViewDir));
        float intensity = pow(clamp(rim, 0.0, 1.0), 2.4) * 0.72;
        gl_FragColor = vec4(glowColor, intensity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

export function createLaunchpadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, 512, 512);

  // Concrete grid slabs
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Hazard ring
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 10;
  ctx.setLineDash([22, 14]);
  ctx.beginPath();
  ctx.arc(256, 256, 180, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = '#38BDF8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 120, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
