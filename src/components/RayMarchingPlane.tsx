"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { uv } from "three/tsl";
import { MAX_SPHERES, buildColorNode, createUniforms, setSphere } from "./sdf";

/** Project a normalised pointer position onto a plane `depth` units ahead. */
function getMouseWorldPos(
  camera: THREE.Camera,
  x: number,
  y: number,
  depth = 6,
): THREE.Vector3 {
  const ndc = new THREE.Vector3(x, y, 0);
  ndc.unproject(camera);
  const direction = ndc.sub(camera.position).normalize();
  return camera.position.clone().add(direction.multiplyScalar(depth));
}

function randomColor() {
  return new THREE.Color("#195524").lerp(new THREE.Color("#a5eb43"), Math.random());
}

export default function RayMarchingPlane() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const planeRef = useRef<THREE.Mesh>(null);

  const pointer = useRef({ x: 0, y: 0 });
  const sphereCount = useRef(0);
  const lastClick = useRef(0);

  const { material, uniforms } = useMemo(() => {
    const u = createUniforms();
    const m = new MeshBasicNodeMaterial();
    m.colorNode = buildColorNode(u, uv());
    return { material: m, uniforms: u };
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  /** Double click drops a sphere at the cursor, up to the shader's array size. */
  const addSphere = useCallback(() => {
    const now = Date.now();
    if (now - lastClick.current < 300) return;
    lastClick.current = now;
    if (sphereCount.current >= MAX_SPHERES) return;

    const i = sphereCount.current;
    const pos = getMouseWorldPos(camera, pointer.current.x, pointer.current.y, 6);
    const color = randomColor();

    setSphere(uniforms, i, pos, 1, color);

    sphereCount.current = i + 1;
    uniforms.numSpheres.value = sphereCount.current;
  }, [camera, uniforms]);

  useEffect(() => {
    window.addEventListener("dblclick", addSphere);
    return () => window.removeEventListener("dblclick", addSphere);
  }, [addSphere]);

  const forward = useRef(new THREE.Vector3());

  useFrame(() => {
    const plane = planeRef.current;
    if (!plane) return;

    // Keep the quad pinned to the camera's near plane, filling the frustum.
    const height = camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2;
    plane.scale.set(height * camera.aspect, height, 1);

    camera.getWorldDirection(forward.current);
    plane.position
      .copy(camera.position)
      .add(forward.current.multiplyScalar(camera.near));
    plane.quaternion.copy(camera.quaternion);

    uniforms.camPos.value.copy(camera.position);
    uniforms.camToWorldMat.value.copy(camera.matrixWorld);
    uniforms.camInvProjMat.value.copy(camera.projectionMatrixInverse);

    uniforms.dynamicSpherePos.value.copy(
      getMouseWorldPos(camera, pointer.current.x, pointer.current.y),
    );
  });

  return (
    <mesh ref={planeRef} material={material} frustumCulled={false}>
      <planeGeometry />
    </mesh>
  );
}
