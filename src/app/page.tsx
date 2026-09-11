import dynamic from "next/dynamic";

// WebGPU only exists in the browser, so the whole scene is client-only.
const SdfScene = dynamic(() => import("@/components/SdfScene"), {
  loading: () => <div className="status">Starting WebGPU…</div>,
});

export default function Home() {
  return (
    <main>
      <SdfScene />
      <div className="hint">drag to orbit · double click to drop a sphere</div>
    </main>
  );
}
