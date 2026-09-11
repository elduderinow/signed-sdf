"use client";

import { CameraControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three/webgpu";
import RayMarchingPlane from "./RayMarchingPlane";

export default function SdfScene() {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "gpu" in navigator);
  }, []);

  if (supported === null) return <div className="status">Checking WebGPU…</div>;

  if (!supported) {
    return (
      <div className="status">
        <p>This scene needs WebGPU.</p>
        <p className="muted">
          Try a recent Chrome, Edge or Safari. Firefox needs it enabled in
          about:config.
        </p>
      </div>
    );
  }

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 5] }}
      // r3f awaits this factory, so the renderer is initialised before first draw.
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(
          props as unknown as ConstructorParameters<typeof THREE.WebGPURenderer>[0],
        );
        await renderer.init();
        return renderer;
      }}
    >
      <CameraControls
        makeDefault
        minDistance={2}
        maxDistance={10}
        dampingFactor={0.1}
        dollySpeed={0}
        truckSpeed={1}
      />
      <RayMarchingPlane />
    </Canvas>
  );
}
