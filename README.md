# signed-sdf

A raymarched signed-distance-field scene rendered with three.js on the
**WebGPURenderer**. The original was a GLSL `ShaderMaterial` from the 2024
portfolio; the whole march, lighting and colour blend have been rewritten in
TSL so they compile to WGSL.

Drag to orbit. Double click to drop a sphere into the field.

## What it does

A full-screen quad is pinned to the camera's near plane and oriented with the
camera, so every pixel is a primary ray. `rayMarch` steps along that ray against
a scene built from a smooth union of up to 20 spheres, a revolved 2D cross and
a box. Normals come from the usual tetrahedral sampling of the distance field,
and surface colour is an exponentially weighted blend of every contributing
primitive rather than a hard pick, which is what keeps the joins from banding.

## How the port differs

- The GLSL read its step count from a uniform. TSL wants a literal `Loop` bound,
  so the count is fixed at 100 and the march exits early through `Break`.
- The post chain from the original (N8AO, ACES tone mapping) is gone. It does
  not run on `WebGPURenderer`, and the raymarcher does its own lighting.
- The HDR environment is gone too. Nothing in the shader ever sampled it.
- TSL's generated typings are nominal, so node types are threaded through a
  loose alias inside `src/components/sdf.ts`. The node system validates the
  graph at build time instead.

## Requirements

WebGPU. The page shows a notice on browsers without `navigator.gpu`.

## Develop

```bash
npm install
npm run dev
```
