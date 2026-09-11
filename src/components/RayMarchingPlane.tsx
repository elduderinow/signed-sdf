"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { positionGeometry, uv, vec4 } from "three/tsl";
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

  const pointer = useRef({ x: 0, y: 0 });
  const sphereCount = useRef(0);
  const lastClick = useRef(0);

  const { material, uniforms } = useMemo(() => {
    const u = createUniforms();
    const m = new MeshBasicNodeMaterial();
    m.colorNode = buildColorNode(u, uv());

    // The quad only carries fragments. Every ray is rebuilt in the shader from
    // the camera uniforms, so the geometry is written straight to clip space
    // rather than pinned to the camera's near plane the way the GLSL original
    // did it. WebGPU clips depth against [0, 1], and a quad sitting exactly on
    // the near plane sits exactly on that boundary, so rounding decided
    // frame by frame whether it survived: a still camera showed the clear
    // colour and a moving one flickered.
    // planeGeometry spans [-0.5, 0.5], so doubling it covers NDC.
    m.vertexNode = vec4(positionGeometry.xy.mul(2), 0, 1);
    m.depthTest = false;
    m.depthWrite = false;

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

  useFrame(() => {
    uniforms.camPos.value.copy(camera.position);
    uniforms.camToWorldMat.value.copy(camera.matrixWorld);
    uniforms.camInvProjMat.value.copy(camera.projectionMatrixInverse);

    uniforms.dynamicSpherePos.value.copy(
      getMouseWorldPos(camera, pointer.current.x, pointer.current.y),
    );
  });

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <planeGeometry />
    </mesh>
  );
}
