"use client";

import { CameraControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useCallback, useState } from "react";
import * as THREE from "three/webgpu";
import RayMarchingPlane from "./RayMarchingPlane";

type Backend = "webgpu" | "webgl";

/**
 * WebGPURenderer already falls back to a WebGL 2 backend on its own if WebGPU
 * init throws, but that path runs through an exception and a console warning.
 * When navigator.gpu is absent we know up front, so ask for WebGL directly and
 * keep the automatic fallback for the case where WebGPU exists but fails to
 * start, which is common on older Android drivers.
 *
 * Either way the scene is unchanged: the raymarcher is TSL nodes, so the same
 * graph compiles to WGSL or GLSL depending on which backend wins.
 */
export default function SdfScene() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failed, setFailed] = useState(false);

  const createRenderer = useCallback(async (props: object) => {
    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;

    const renderer = new THREE.WebGPURenderer({
      ...(props as ConstructorParameters<typeof THREE.WebGPURenderer>[0]),
      forceWebGL: !hasWebGPU,
      antialias: false,
    });

    try {
      await renderer.init();
    } catch (error) {
      setFailed(true);
      throw error;
    }

    // isWebGPUBackend is set by WebGPUBackend at runtime but is absent from the
    // published Backend type.
    const active = renderer.backend as { isWebGPUBackend?: boolean };
    setBackend(active.isWebGPUBackend === true ? "webgpu" : "webgl");
    return renderer;
  }, []);

  if (failed) {
    return (
      <div className="status">
        <p>This scene could not start a GPU context.</p>
        <p className="muted">
          It needs WebGPU or WebGL 2. Both are blocked or unavailable in this
          browser.
        </p>
      </div>
    );
  }

  return (
    <>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 5] }}
        // r3f awaits this factory, so the renderer is initialised before first draw.
        gl={createRenderer}
      >
        {/* The original set dollySpeed={0} and clamped 2..10, so wheel and pinch
            did nothing. Zoom is wanted here, so dolly is on and the far clamp is
            wider. The camera starts at 5. */}
        <CameraControls
          makeDefault
          minDistance={2}
          maxDistance={20}
          dampingFactor={0.1}
          dollySpeed={1}
          truckSpeed={1}
        />
        <RayMarchingPlane />
      </Canvas>
      {backend ? <p className="backend">{backend}</p> : null}
    </>
  );
}
