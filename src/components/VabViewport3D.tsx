import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS_BY_ID } from '../game/partsCatalog';
import {
  checkPlacementCollision,
  computeCenterOfMassAndThrust,
  getOpenAttachmentSockets,
  snapPositionToNearestSocket
} from '../game/physics';
import { buildPartMeshGroup, buildRocketAssemblyGroup } from '../game/rocketMeshBuilder';
import {
  attachEnvironmentMap,
  createLaunchpadTexture,
  createStudioRenderer,
  detectSoftwareWebGL
} from '../game/threeHelpers';
import { PlacedPart } from '../game/types';

export interface SymmetryPlacement {
  x: number;
  y: number;
  z: number;
  rotationDeg: number;
}

export function computeSymmetryPlacements(
  x: number,
  y: number,
  z: number,
  baseRotDeg: number,
  symmetryCount: 1 | 2 | 4
): SymmetryPlacement[] {
  const radius = Math.hypot(x, z);
  if (symmetryCount === 1 || radius < 0.35) {
    return [{ x, y, z, rotationDeg: baseRotDeg }];
  }
  if (symmetryCount === 2) {
    return [
      { x, y, z, rotationDeg: baseRotDeg },
      {
        x: Number((-x).toFixed(2)),
        y,
        z: Number((-z).toFixed(2)),
        rotationDeg: (baseRotDeg + 180) % 360
      }
    ];
  }
  // 4x radial symmetry around Y axis
  return [
    { x, y, z, rotationDeg: baseRotDeg },
    { x: Number((-z).toFixed(2)), y, z: Number(x.toFixed(2)), rotationDeg: (baseRotDeg + 90) % 360 },
    { x: Number((-x).toFixed(2)), y, z: Number((-z).toFixed(2)), rotationDeg: (baseRotDeg + 180) % 360 },
    { x: Number(z.toFixed(2)), y, z: Number((-x).toFixed(2)), rotationDeg: (baseRotDeg + 270) % 360 }
  ];
}

interface VabViewport3DProps {
  parts: PlacedPart[];
  draggingPartId: string | null;
  draggingInstanceId: string | null;
  selectedInstanceId: string | null;
  depthOffsetZ?: number;
  symmetryCount?: 1 | 2 | 4;
  showComCot?: boolean;
  onSelectInstance: (instanceId: string | null) => void;
  onDoubleTapPart: (instanceId: string) => void;
  onPlaceOrMovePart: (x: number, y: number, z: number) => void;
  onMovePartDirect?: (instanceId: string, x: number, y: number, z: number) => void;
  onDragPositionChange?: (valid: boolean, x: number, y: number, z: number) => void;
}

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _camDir = new THREE.Vector3();
const _planeCenter = new THREE.Vector3();
const _buildPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _planeHit = new THREE.Vector3();
const _normalMatrix = new THREE.Matrix3();
const _worldNormal = new THREE.Vector3();

function buildGizmoArrow(colorHex: number, axis: 'x' | 'y' | 'z'): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 10), mat);
  shaft.position.y = 0.85;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 12), mat);
  cone.position.y = 1.75;
  // Invisible slightly thicker hit proxy for effortless clicking
  const hitProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 2.0, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitProxy.position.y = 1.0;

  shaft.renderOrder = 999;
  cone.renderOrder = 999;
  g.add(shaft, cone, hitProxy);
  if (axis === 'x') g.rotation.z = -Math.PI / 2;
  if (axis === 'z') g.rotation.x = Math.PI / 2;
  g.traverse((obj) => {
    obj.userData.gizmoAxis = axis;
  });
  return g;
}

export const VabViewport3D: React.FC<VabViewport3DProps> = ({
  parts,
  draggingPartId,
  draggingInstanceId,
  selectedInstanceId,
  depthOffsetZ = 0,
  symmetryCount = 1,
  showComCot = true,
  onSelectInstance,
  onDoubleTapPart,
  onPlaceOrMovePart,
  onMovePartDirect,
  onDragPositionChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const propsRef = useRef({
    parts,
    draggingPartId,
    draggingInstanceId,
    selectedInstanceId,
    depthOffsetZ,
    symmetryCount,
    showComCot,
    onSelectInstance,
    onDoubleTapPart,
    onPlaceOrMovePart,
    onMovePartDirect,
    onDragPositionChange
  });
  propsRef.current = {
    parts,
    draggingPartId,
    draggingInstanceId,
    selectedInstanceId,
    depthOffsetZ,
    symmetryCount,
    showComCot,
    onSelectInstance,
    onDoubleTapPart,
    onPlaceOrMovePart,
    onMovePartDirect,
    onDragPositionChange
  };

  const sceneApiRef = useRef<{
    rebuildRocket: () => void;
    updateGhost: (clientX: number, clientY: number) => void;
    clearGhost: () => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createStudioRenderer(container, isSoftwareGl);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B1324');
    scene.fog = new THREE.Fog('#0B1324', 52, 130);
    const envTex = attachEnvironmentMap(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      44,
      (container.clientWidth || 1280) / (container.clientHeight || 720),
      0.1,
      240
    );
    camera.position.set(12.5, 11.5, 29.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 8.8, 0);
    controls.minDistance = 6;
    controls.maxDistance = 48;
    controls.maxPolarAngle = Math.PI * 0.51;

    // Warm/Cool SFS2 VAB Hangar Lighting
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x1e293b, 1.05);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    keyLight.position.set(16, 28, 18);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -16;
      keyLight.shadow.camera.right = 16;
      keyLight.shadow.camera.top = 26;
      keyLight.shadow.camera.bottom = -4;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.05);
    rimLight.position.set(-16, 16, -14);
    scene.add(rimLight);

    // SFS2 VAB Architectural Hangar Shell + Open Bay Doors Looking Out to Coastal Sky
    const hangarGroup = new THREE.Group();
    const hangarWallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.45 });
    const hangarBeamMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.7 });
    const bayLightMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });

    // Side structural columns & overhead ceiling trusses
    for (const hx of [-20, 20]) {
      for (const hz of [-18, -6, 6, 18]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 34, 1.1), hangarBeamMat);
        pillar.position.set(hx, 17, hz);
        hangarGroup.add(pillar);
      }
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(46, 36), hangarWallMat);
      wall.position.set(hx * 1.04, 17, 0);
      wall.rotation.y = hx < 0 ? Math.PI / 2 : -Math.PI / 2;
      hangarGroup.add(wall);
    }

    // Overhead roof rafters & studio LED strip bays
    for (const hz of [-14, -5, 5, 14]) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(42, 0.9, 0.9), hangarBeamMat);
      truss.position.set(0, 33.5, hz);
      hangarGroup.add(truss);

      const led = new THREE.Mesh(new THREE.BoxGeometry(28, 0.25, 0.65), bayLightMat);
      led.position.set(0, 32.9, hz);
      hangarGroup.add(led);
    }

    // Giant open VAB Bay Door frame in back (-Z) revealing twilight coastal horizon
    const doorFrameLeft = new THREE.Mesh(new THREE.BoxGeometry(10, 34, 1.6), hangarWallMat);
    doorFrameLeft.position.set(-16, 17, -22);
    const doorFrameRight = new THREE.Mesh(new THREE.BoxGeometry(10, 34, 1.6), hangarWallMat);
    doorFrameRight.position.set(16, 17, -22);
    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(42, 6, 1.6), hangarWallMat);
    doorHeader.position.set(0, 31.5, -22);
    hangarGroup.add(doorFrameLeft, doorFrameRight, doorHeader);

    // Horizon backdrop visible through the VAB bay opening
    const skyBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 50),
      new THREE.MeshBasicMaterial({ color: 0x0f2942 })
    );
    skyBackdrop.position.set(0, 18, -42);
    hangarGroup.add(skyBackdrop);

    const horizonStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 10),
      new THREE.MeshBasicMaterial({ color: 0x1e40af, transparent: true, opacity: 0.45 })
    );
    horizonStrip.position.set(0, 3.5, -41.5);
    hangarGroup.add(horizonStrip);

    scene.add(hangarGroup);

    // Concrete Hangar Floor + Blast Trench Launch Pad Disc
    const padTex = createLaunchpadTexture(renderer.capabilities.getMaxAnisotropy());
    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(8.6, 9.4, 0.5, 40),
      new THREE.MeshStandardMaterial({
        map: padTex,
        color: 0xffffff,
        roughness: 0.68,
        metalness: 0.16
      })
    );
    padMesh.position.y = -0.25;
    padMesh.receiveShadow = true;
    scene.add(padMesh);

    const hangarFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85, metalness: 0.12 })
    );
    hangarFloor.rotation.x = -Math.PI / 2;
    hangarFloor.position.y = -0.52;
    hangarFloor.receiveShadow = true;
    scene.add(hangarFloor);

    // Structural Umbilical Gantry Tower on Left
    const gantryGroup = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.42, metalness: 0.78 });
    const safetyOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4, metalness: 0.4 });
    for (const gx of [-6.0, -4.6]) {
      for (const gz of [-0.75, 0.75]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.26, 24, 0.26), steelMat);
        col.position.set(gx, 12, gz);
        gantryGroup.add(col);
      }
    }
    for (let gy = 2; gy <= 22; gy += 3.2) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.18, 1.75), safetyOrange);
      platform.position.set(-5.3, gy, 0);
      gantryGroup.add(platform);
    }
    scene.add(gantryGroup);

    const rocketContainer = new THREE.Group();
    scene.add(rocketContainer);

    const ghostContainer = new THREE.Group();
    scene.add(ghostContainer);

    const snapNodesContainer = new THREE.Group();
    scene.add(snapNodesContainer);

    // Center of Mass (Amber/Black Sphere) & Center of Thrust (Magenta Thrust Arrow)
    const comCotGroup = new THREE.Group();
    const comMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: false, depthTest: false })
    );
    comMarker.renderOrder = 950;
    const comRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false })
    );
    comRing.renderOrder = 951;
    comMarker.add(comRing);

    const cotMarker = new THREE.Group();
    const cotCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.65, 14),
      new THREE.MeshBasicMaterial({ color: 0xd946ef, depthTest: false })
    );
    cotCone.renderOrder = 950;
    const cotStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.85, 10),
      new THREE.MeshBasicMaterial({ color: 0xd946ef, depthTest: false })
    );
    cotStem.position.y = -0.65;
    cotStem.renderOrder = 950;
    cotMarker.add(cotCone, cotStem);
    comCotGroup.add(comMarker, cotMarker);
    scene.add(comCotGroup);

    // Interactive 3D Transform Axis Gizmo for Selected Part
    const gizmoGroup = new THREE.Group();
    const gizmoX = buildGizmoArrow(0xef4444, 'x');
    const gizmoY = buildGizmoArrow(0x22c55e, 'y');
    const gizmoZ = buildGizmoArrow(0x3b82f6, 'z');
    gizmoGroup.add(gizmoX, gizmoY, gizmoZ);
    gizmoGroup.visible = false;
    scene.add(gizmoGroup);

    let currentGhostCoords: { x: number; y: number; z: number; valid: boolean } | null = null;
    let activeGizmoDrag: {
      instanceId: string;
      axis: 'x' | 'y' | 'z';
      startPartPos: { x: number; y: number; z: number };
      startPlaneHit: THREE.Vector3;
    } | null = null;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    function updateSnapNodesVisual(activeSnapX?: number, activeSnapY?: number, activeSnapZ?: number) {
      while (snapNodesContainer.children.length > 0) {
        snapNodesContainer.remove(snapNodesContainer.children[0]);
      }
      const { draggingPartId: dragId, parts: pList, draggingInstanceId: dragInst } = propsRef.current;
      if (!dragId) return;
      const def = PARTS_BY_ID[dragId];
      if (!def) return;

      const sockets = getOpenAttachmentSockets(def, pList, dragInst ?? undefined, 0);
      const nodeGeo = new THREE.SphereGeometry(0.16, 12, 10);
      for (const s of sockets.slice(0, 48)) {
        const isSnapped =
          activeSnapX !== undefined &&
          Math.hypot(s.x - activeSnapX, s.y - activeSnapY!, s.z - activeSnapZ!) < 0.15;
        const mat = new THREE.MeshBasicMaterial({
          color: isSnapped ? 0x10b981 : 0x38bdf8,
          transparent: true,
          opacity: isSnapped ? 0.95 : 0.65
        });
        const sphere = new THREE.Mesh(nodeGeo, mat);
        sphere.position.set(s.x, s.y, s.z);
        if (isSnapped) sphere.scale.setScalar(1.45);
        snapNodesContainer.add(sphere);
      }
    }

    function rebuildRocket() {
      while (rocketContainer.children.length > 0) {
        rocketContainer.remove(rocketContainer.children[0]);
      }
      const {
        parts: pList,
        selectedInstanceId: selId,
        draggingInstanceId: dragInst,
        showComCot: showMarkers
      } = propsRef.current;
      const visibleParts = dragInst ? pList.filter((p) => p.instanceId !== dragInst) : pList;
      const built = buildRocketAssemblyGroup(visibleParts, {
        selectedInstanceId: selId,
        solarDeployed: true
      });
      rocketContainer.add(built);

      // Update CoM & CoT Markers
      if (showMarkers && visibleParts.length > 0) {
        const { com, cot } = computeCenterOfMassAndThrust(visibleParts);
        comCotGroup.visible = true;
        if (com) {
          comMarker.visible = true;
          comMarker.position.set(com.x, com.y, com.z + 1.05);
        } else {
          comMarker.visible = false;
        }
        if (cot) {
          cotMarker.visible = true;
          cotMarker.position.set(cot.x, cot.y, cot.z + 1.05);
        } else {
          cotMarker.visible = false;
        }
      } else {
        comCotGroup.visible = false;
      }

      // Position 3D Axis Gizmo on selected part
      const selPart = selId ? visibleParts.find((p) => p.instanceId === selId) : null;
      if (selPart && !propsRef.current.draggingPartId) {
        gizmoGroup.visible = true;
        gizmoGroup.position.set(selPart.x, selPart.y, selPart.z);
      } else {
        gizmoGroup.visible = false;
      }

      requestRender();
    }

    function clearGhost() {
      while (ghostContainer.children.length > 0) {
        ghostContainer.remove(ghostContainer.children[0]);
      }
      while (snapNodesContainer.children.length > 0) {
        snapNodesContainer.remove(snapNodesContainer.children[0]);
      }
      currentGhostCoords = null;
      requestRender();
    }

    function updateGhost(clientX: number, clientY: number) {
      const {
        draggingPartId: dragId,
        parts: pList,
        draggingInstanceId: dragInst,
        depthOffsetZ: zLayer,
        symmetryCount: symCount
      } = propsRef.current;
      if (!dragId) {
        clearGhost();
        return;
      }
      const def = PARTS_BY_ID[dragId];
      if (!def) return;

      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointer, camera);

      let rawX = 0;
      let rawY = def.height / 2;
      let rawZ = zLayer;
      let resolved = false;

      const rocketHits = _raycaster.intersectObjects(rocketContainer.children, true);
      const hitFace = rocketHits.length > 0 ? rocketHits[0].face : null;
      if (rocketHits.length > 0 && hitFace) {
        const hit = rocketHits[0];
        _normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        _worldNormal.copy(hitFace.normal).applyMatrix3(_normalMatrix).normalize();
        rawX = hit.point.x + _worldNormal.x * (def.width * 0.52);
        rawY = hit.point.y + _worldNormal.y * (def.height * 0.52);
        rawZ = hit.point.z + _worldNormal.z * (def.depth * 0.52);
        resolved = true;
      } else {
        const floorHits = _raycaster.intersectObjects([padMesh, hangarFloor], false);
        if (floorHits.length > 0 && floorHits[0].distance < 48) {
          const hit = floorHits[0];
          rawX = hit.point.x;
          rawY = def.height / 2;
          rawZ = hit.point.z;
          resolved = true;
        }
      }

      if (!resolved) {
        camera.getWorldDirection(_camDir);
        _planeCenter.set(0, controls.target.y, zLayer);
        _buildPlane.setFromNormalAndCoplanarPoint(_camDir.negate(), _planeCenter);
        const hit = _raycaster.ray.intersectPlane(_buildPlane, _planeHit);
        if (!hit) return;
        rawX = hit.x;
        rawY = hit.y;
        rawZ = hit.z;
      }

      const existingDragged = dragInst ? pList.find((p) => p.instanceId === dragInst) : undefined;
      const draggedRot = existingDragged?.rotationDeg ?? 0;

      const snapped = snapPositionToNearestSocket(
        def,
        rawX,
        rawY,
        rawZ,
        pList,
        dragInst ?? undefined,
        draggedRot
      );

      const placements = dragInst
        ? [{ x: snapped.x, y: snapped.y, z: snapped.z, rotationDeg: draggedRot }]
        : computeSymmetryPlacements(snapped.x, snapped.y, snapped.z, draggedRot, symCount);

      let valid = true;
      for (const pl of placements) {
        const candidate: PlacedPart = {
          instanceId: dragInst ?? 'ghost',
          partId: dragId,
          x: pl.x,
          y: pl.y,
          z: pl.z,
          stage: existingDragged?.stage ?? 0,
          rotationDeg: pl.rotationDeg
        };
        const collision = checkPlacementCollision(candidate, pList, dragInst ?? undefined);
        if (collision.collides) {
          valid = false;
          break;
        }
      }

      currentGhostCoords = { x: snapped.x, y: snapped.y, z: snapped.z, valid };
      propsRef.current.onDragPositionChange?.(valid, snapped.x, snapped.y, snapped.z);

      updateSnapNodesVisual(snapped.snapped ? snapped.x : undefined, snapped.y, snapped.z);

      while (ghostContainer.children.length > 0) {
        ghostContainer.remove(ghostContainer.children[0]);
      }
      for (const pl of placements) {
        const ghostMesh = buildPartMeshGroup(dragId, {
          isSelected: valid,
          isColliding: !valid,
          solarDeployed: true
        });
        ghostMesh.position.set(pl.x, pl.y, pl.z);
        ghostMesh.rotation.y = (pl.rotationDeg * Math.PI) / 180;
        ghostMesh.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mat = ((obj as THREE.Mesh).material as THREE.MeshStandardMaterial).clone();
            mat.transparent = true;
            mat.opacity = 0.65;
            mat.emissive = new THREE.Color(valid ? 0x0ea5e9 : 0xef4444);
            mat.emissiveIntensity = 0.55;
            (obj as THREE.Mesh).material = mat;
          }
        });
        ghostContainer.add(ghostMesh);
      }
      requestRender();
    }

    sceneApiRef.current = { rebuildRocket, updateGhost, clearGhost, requestRender };
    rebuildRocket();

    controls.addEventListener('change', requestRender);

    const findInstanceIdFromHit = (obj: THREE.Object3D | null): string | null => {
      let cur: THREE.Object3D | null = obj;
      while (cur) {
        if (cur.userData?.instanceId) return cur.userData.instanceId as string;
        cur = cur.parent;
      }
      return null;
    };

    const getGizmoPlaneHit = (clientX: number, clientY: number, center: THREE.Vector3): THREE.Vector3 | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      camera.getWorldDirection(_camDir);
      _buildPlane.setFromNormalAndCoplanarPoint(_camDir.negate(), center);
      return _raycaster.ray.intersectPlane(_buildPlane, _planeHit.clone());
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activeGizmoDrag) {
        controls.enabled = false;
        const part = propsRef.current.parts.find((p) => p.instanceId === activeGizmoDrag!.instanceId);
        const def = part ? PARTS_BY_ID[part.partId] : null;
        if (!part || !def) return;
        const center = new THREE.Vector3(
          activeGizmoDrag.startPartPos.x,
          activeGizmoDrag.startPartPos.y,
          activeGizmoDrag.startPartPos.z
        );
        const hit = getGizmoPlaneHit(e.clientX, e.clientY, center);
        if (!hit) return;

        let nx = activeGizmoDrag.startPartPos.x;
        let ny = activeGizmoDrag.startPartPos.y;
        let nz = activeGizmoDrag.startPartPos.z;
        if (activeGizmoDrag.axis === 'x') {
          nx = Math.max(-8.5, Math.min(8.5, Number((nx + (hit.x - activeGizmoDrag.startPlaneHit.x)).toFixed(2))));
        } else if (activeGizmoDrag.axis === 'y') {
          ny = Math.max(def.height / 2, Math.min(26, Number((ny + (hit.y - activeGizmoDrag.startPlaneHit.y)).toFixed(2))));
        } else if (activeGizmoDrag.axis === 'z') {
          nz = Math.max(-8.5, Math.min(8.5, Number((nz + (hit.z - activeGizmoDrag.startPlaneHit.z)).toFixed(2))));
        }
        propsRef.current.onMovePartDirect?.(part.instanceId, nx, ny, nz);
        return;
      }

      if (propsRef.current.draggingPartId) {
        controls.enabled = false;
        updateGhost(e.clientX, e.clientY);
      } else {
        controls.enabled = true;
      }
    };

    let lastTapTime = 0;
    let lastTapInstId: string | null = null;
    let justDetachedAt = 0;

    const triggerDoubleTapDetach = (instId: string) => {
      const now = performance.now();
      if (now - justDetachedAt < 400) return;
      justDetachedAt = now;
      lastTapTime = 0;
      lastTapInstId = null;
      propsRef.current.onDoubleTapPart(instId);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (propsRef.current.draggingPartId) {
        if (currentGhostCoords && currentGhostCoords.valid) {
          propsRef.current.onPlaceOrMovePart(
            currentGhostCoords.x,
            currentGhostCoords.y,
            currentGhostCoords.z
          );
          clearGhost();
          controls.enabled = true;
        }
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);

      // Priority 1: Check 3D Axis Gizmo handles if a part is selected
      if (gizmoGroup.visible && propsRef.current.selectedInstanceId) {
        const gHits = _raycaster.intersectObjects(gizmoGroup.children, true);
        if (gHits.length > 0 && gHits[0].object.userData?.gizmoAxis) {
          const axis = gHits[0].object.userData.gizmoAxis as 'x' | 'y' | 'z';
          const selPart = propsRef.current.parts.find(
            (p) => p.instanceId === propsRef.current.selectedInstanceId
          );
          if (selPart) {
            const center = new THREE.Vector3(selPart.x, selPart.y, selPart.z);
            const planeHit = getGizmoPlaneHit(e.clientX, e.clientY, center);
            if (planeHit) {
              controls.enabled = false;
              activeGizmoDrag = {
                instanceId: selPart.instanceId,
                axis,
                startPartPos: { x: selPart.x, y: selPart.y, z: selPart.z },
                startPlaneHit: planeHit
              };
              return;
            }
          }
        }
      }

      const hits = _raycaster.intersectObjects(rocketContainer.children, true);
      if (hits.length > 0) {
        const instId = findInstanceIdFromHit(hits[0].object);
        if (instId) {
          const now = performance.now();
          if (e.detail >= 2 || (lastTapInstId === instId && now - lastTapTime < 400)) {
            triggerDoubleTapDetach(instId);
            return;
          }
          lastTapTime = now;
          lastTapInstId = instId;
        }
        propsRef.current.onSelectInstance(instId);
      } else {
        lastTapInstId = null;
        propsRef.current.onSelectInstance(null);
      }
    };

    const handlePointerUp = () => {
      if (activeGizmoDrag) {
        activeGizmoDrag = null;
        controls.enabled = true;
      }
    };

    const handleDoubleClick = (e: MouseEvent) => {
      if (propsRef.current.draggingPartId) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(rocketContainer.children, true);
      if (hits.length > 0) {
        const instId = findInstanceIdFromHit(hits[0].object);
        if (instId) {
          triggerDoubleTapDetach(instId);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (propsRef.current.draggingPartId) {
        updateGhost(e.clientX, e.clientY);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      if (propsRef.current.draggingPartId) {
        updateGhost(e.clientX, e.clientY);
        if (currentGhostCoords && currentGhostCoords.valid) {
          propsRef.current.onPlaceOrMovePart(
            currentGhostCoords.x,
            currentGhostCoords.y,
            currentGhostCoords.z
          );
        }
        clearGhost();
        controls.enabled = true;
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointermove', handlePointerMove);
    domEl.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    domEl.addEventListener('dblclick', handleDoubleClick);
    domEl.addEventListener('dragover', handleDragOver);
    domEl.addEventListener('drop', handleDrop);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 1280;
      const h = container.clientHeight || 720;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      domEl.removeEventListener('pointermove', handlePointerMove);
      domEl.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      domEl.removeEventListener('dblclick', handleDoubleClick);
      domEl.removeEventListener('dragover', handleDragOver);
      domEl.removeEventListener('drop', handleDrop);
      controls.dispose();
      envTex.dispose();
      padTex.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, []);

  useEffect(() => {
    sceneApiRef.current?.rebuildRocket();
    if (!draggingPartId) {
      sceneApiRef.current?.clearGhost();
    }
  }, [parts, selectedInstanceId, draggingInstanceId, draggingPartId, showComCot]);

  return (
    <div
      ref={containerRef}
      data-testid="vab-3d-viewport"
      className="w-full h-full cursor-grab active:cursor-grabbing"
    />
  );
};
