import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getStarterBlueprint } from '../game/partsCatalog';
import { buildRocketAssemblyGroup } from '../game/rocketMeshBuilder';
import {
  attachEnvironmentMap,
  createAtmosphereRimMaterial,
  createPlanetMaps,
  createStudioRenderer,
  detectSoftwareWebGL
} from '../game/threeHelpers';
import { PlacedPart } from '../game/types';

export const TitleBackground3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createStudioRenderer(container, isSoftwareGl);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050914');
    const envTex = attachEnvironmentMap(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || 1440) / (container.clientHeight || 900),
      0.1,
      500
    );
    camera.position.set(2, 4, 30);
    camera.lookAt(-2.5, 2, 0);

    const sun = new THREE.DirectionalLight(0xfff5e6, 2.7);
    sun.position.set(24, 20, 22);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.78));

    // Crisp instanced starfield across entire backdrop
    const starCount = 320;
    const starGeo = new THREE.OctahedronGeometry(0.14, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const starMesh = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
      const x = ((i * 73) % 100) - 50;
      const y = ((i * 41) % 60) - 25;
      const z = -45 - (i % 20) * 2;
      dummy.position.set(x, y, z);
      const s = 0.6 + (i % 4) * 0.45;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      starMesh.setMatrixAt(i, dummy.matrix);
    }
    starMesh.computeBoundingSphere();
    scene.add(starMesh);

    // 3D Earth with Bump Relief, Rotating Cloud Layer, and Fresnel Atmosphere
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const earthMaps = createPlanetMaps('earth', maxAniso);
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(14, 56, 42),
      new THREE.MeshStandardMaterial({
        map: earthMaps.map,
        bumpMap: earthMaps.bumpMap,
        bumpScale: 0.32,
        color: 0xffffff,
        roughness: 0.72,
        metalness: 0.08
      })
    );
    earth.position.set(-14.6, -12.8, -7);
    earth.rotation.z = 0.35;
    scene.add(earth);

    const earthClouds = new THREE.Mesh(
      new THREE.SphereGeometry(14.22, 48, 36),
      new THREE.MeshStandardMaterial({
        map: earthMaps.cloudMap,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        roughness: 0.9
      })
    );
    earthClouds.position.copy(earth.position);
    earthClouds.rotation.z = 0.35;
    scene.add(earthClouds);

    const atmoMat = createAtmosphereRimMaterial('#38BDF8');
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(15.35, 48, 36), atmoMat);
    atmo.position.copy(earth.position);
    scene.add(atmo);

    // Distant 3D Moon in upper-left background
    const moonMaps = createPlanetMaps('moon', maxAniso);
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 32, 24),
      new THREE.MeshStandardMaterial({
        map: moonMaps.map,
        bumpMap: moonMaps.bumpMap,
        bumpScale: 0.22,
        roughness: 0.92
      })
    );
    moonMesh.position.set(-18.5, 9.8, -22);
    scene.add(moonMesh);

    // Showcase Multi-stage Rocket flying in orbital space on the left
    const starter: PlacedPart[] = getStarterBlueprint('lunar_lander').map((p, idx) => ({
      ...p,
      instanceId: `hero-${idx}`
    }));
    const rocket = buildRocketAssemblyGroup(starter, {
      activeStage: 0,
      ignited: true,
      engineThrottle: 0.92,
      solarDeployed: true
    });
    rocket.position.set(-13.4, -1.6, 2);
    rocket.rotation.set(0.14, 0.35, -0.32);
    rocket.scale.setScalar(0.8);
    scene.add(rocket);

    let frameId = 0;
    let disposed = false;
    let last = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
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
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      earth.rotation.y += dt * 0.08;
      earthClouds.rotation.y += dt * 0.115;
      moonMesh.rotation.y += dt * 0.04;
      rocket.rotation.y += dt * 0.2;
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const ro = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 1440;
      const h = container.clientHeight || 900;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    });
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      envTex.dispose();
      earthMaps.map.dispose();
      earthMaps.bumpMap.dispose();
      earthMaps.cloudMap?.dispose();
      moonMaps.map.dispose();
      moonMaps.bumpMap.dispose();
      atmoMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" />;
};
