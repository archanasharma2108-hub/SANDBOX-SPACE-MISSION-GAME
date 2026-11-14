import * as THREE from 'three';

export interface ReentryHeatUniforms {
  uHeatLoad: { value: number }; // Normalized ~0.0 .. 1.2 (flightState.heatLoad / 100)
  uTime: { value: number }; // Seconds elapsed for animated plasma turbulence
  uFlowDirWorld: { value: THREE.Vector3 }; // Unit velocity direction in world space (facing bow shock)
  uRocketWorldPos: { value: THREE.Vector3 }; // Rocket root world position for stable relative coords
}

export function createReentryHeatUniforms(): ReentryHeatUniforms {
  return {
    uHeatLoad: { value: 0 },
    uTime: { value: 0 },
    uFlowDirWorld: { value: new THREE.Vector3(0, -1, 0) },
    uRocketWorldPos: { value: new THREE.Vector3(0, 0, 0) }
  };
}

const REENTRY_GLSL_NOISE = /* glsl */ `
float reentryHash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float reentryNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = reentryHash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = reentryHash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = reentryHash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = reentryHash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = reentryHash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = reentryHash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = reentryHash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = reentryHash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float reentryFbm(vec3 p) {
  float v = 0.0;
  float a = 0.55;
  v += a * reentryNoise3(p);
  p = p * 2.13 + vec3(13.7, -7.1, 5.3);
  a *= 0.5;
  v += a * reentryNoise3(p);
  return v;
}
`;

export function applyReentryHeatShader(
  mat: THREE.MeshStandardMaterial,
  uniforms: ReentryHeatUniforms
): THREE.MeshStandardMaterial {
  mat.customProgramCacheKey = () => 'rocket-reentry-pbr-v1';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHeatLoad = uniforms.uHeatLoad;
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFlowDirWorld = uniforms.uFlowDirWorld;
    shader.uniforms.uRocketWorldPos = uniforms.uRocketWorldPos;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uRocketWorldPos;
varying vec3 vReentryWorldNormal;
varying vec3 vReentryRelPos;
varying vec3 vReentryLocalPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vec4 reentryWorldPos = modelMatrix * vec4( transformed, 1.0 );
vReentryWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );
vReentryRelPos = reentryWorldPos.xyz - uRocketWorldPos;
vReentryLocalPos = transformed;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uHeatLoad;
uniform float uTime;
uniform vec3 uFlowDirWorld;
varying vec3 vReentryWorldNormal;
varying vec3 vReentryRelPos;
varying vec3 vReentryLocalPos;
${REENTRY_GLSL_NOISE}`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
if (uHeatLoad > 0.005) {
  float heatNorm = clamp(uHeatLoad, 0.0, 1.25);
  vec3 flowDir = normalize(uFlowDirWorld);
  vec3 wNorm = normalize(vReentryWorldNormal);

  // Stagnation heating on faces oriented toward oncoming atmosphere + wrapped shear boundary
  float facing = dot(wNorm, flowDir);
  float stagnation = smoothstep(-0.22, 0.88, facing);
  float wakeWrap = smoothstep(-0.85, 0.25, facing) * 0.42;

  // Grazing silhouette plasma rim glow
  vec3 viewDirFrag = normalize(vViewPosition);
  float rimNdotV = clamp(abs(dot(normalize(normal), viewDirFrag)), 0.0, 1.0);
  float fresnelRim = pow(1.0 - rimNdotV, 2.1);

  // High-speed turbulent plasma ribbons streaming opposite the velocity vector
  vec3 advectCoord = vReentryRelPos * 1.45 + vReentryLocalPos * 0.35 + flowDir * (uTime * 11.5);
  float turb = reentryFbm(advectCoord);
  float streaks = smoothstep(0.28, 0.85, turb);

  // Combine thermal intensity modulated by flightState.heatLoad
  float localHeat = heatNorm * (0.24 + 0.92 * stagnation + wakeWrap + fresnelRim * 0.78);
  localHeat *= mix(0.72, 1.38, streaks);

  // Multi-stage blackbody & ionized plasma color ramp: crimson -> incandescent amber -> white-hot
  vec3 emberRed = vec3(1.15, 0.14, 0.02);
  vec3 plasmaOrange = vec3(2.55, 0.68, 0.08);
  vec3 whiteHot = vec3(3.8, 2.55, 1.45);
  vec3 ionizedViolet = vec3(1.25, 0.45, 1.35);

  vec3 thermalCol = mix(emberRed, plasmaOrange, smoothstep(0.08, 0.55, localHeat));
  thermalCol = mix(thermalCol, whiteHot, smoothstep(0.58, 1.18, localHeat));
  // Subtle ionized shock-lip tint on outer Fresnel edges during intense descent
  thermalCol += ionizedViolet * (fresnelRim * smoothstep(0.45, 1.15, heatNorm) * 0.55);

  float glowWeight = smoothstep(0.01, 1.05, localHeat) * (0.55 + heatNorm * 1.35);
  totalEmissiveRadiance += thermalCol * glowWeight;

  // Slight thermal scorching contrast on sunlit hull paint at peak heat
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, clamp(heatNorm * 0.45, 0.0, 0.4));
}`
      );
  };
  return mat;
}

export function createReentryBowShockMaterial(uniforms: ReentryHeatUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeatLoad: uniforms.uHeatLoad,
      uTime: uniforms.uTime
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      void main() {
        vUv = uv;
        vLocalPos = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uHeatLoad;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      ${REENTRY_GLSL_NOISE}

      void main() {
        if (uHeatLoad <= 0.015) discard;

        float heat = clamp(uHeatLoad, 0.0, 1.25);

        // Stagnation cap at vUv.y -> 1.0 (nose/heatshield end), trailing ionized wake toward vUv.y -> 0.0
        float axialFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.72, vUv.y * 0.92);
        float tipFocus = pow(smoothstep(0.15, 0.96, vUv.y), 1.35);

        // Wrap-safe turbulent shock streaks streaming backward along cylinder/cone
        float angle = vUv.x * 6.2831853;
        vec3 noiseCoord = vec3(cos(angle) * 2.1, sin(angle) * 2.1, vUv.y * 4.5 + uTime * 14.0);
        float fbm = reentryFbm(noiseCoord);
        float plasmaRibbons = smoothstep(0.24, 0.86, fbm);

        // Soft grazing silhouette edge fade
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewPos)));
        float edgeGlow = mix(0.45, 1.15, pow(1.0 - ndotv, 1.5)) * smoothstep(0.02, 0.28, ndotv);

        vec3 outerOrange = vec3(1.8, 0.36, 0.04);
        vec3 shockGold = vec3(2.8, 1.15, 0.22);
        vec3 stagnationCore = vec3(3.6, 2.7, 1.8);
        vec3 ionHalo = vec3(1.1, 0.38, 1.25);

        float temp = clamp(heat * (0.55 + 0.65 * tipFocus + 0.35 * plasmaRibbons), 0.0, 1.4);
        vec3 col = mix(outerOrange, shockGold, smoothstep(0.2, 0.75, temp));
        col = mix(col, stagnationCore, smoothstep(0.7, 1.25, temp));
        col = mix(col, ionHalo, (1.0 - vUv.y) * smoothstep(0.45, 1.15, heat) * 0.32);

        float alpha = axialFade * edgeGlow * (0.35 + 0.85 * plasmaRibbons) * smoothstep(0.02, 0.85, heat) * 0.78;
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}
