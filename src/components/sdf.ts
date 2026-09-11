/**
 * TSL port of the GLSL raymarcher from yarrut2024's SignedSdf scene.
 *
 * The original ran as a ShaderMaterial with hand-written GLSL. WebGPURenderer
 * has no GLSL path, so every distance function, the march loop and the colour
 * blend are rebuilt as TSL nodes here. Behaviour is meant to match the
 * original, not improve on it.
 */
import * as THREE from "three";
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  clamp,
  distance,
  dot,
  exp,
  float,
  int,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  sign,
  uniform,
  uniformArray,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

/**
 * TSL's generated typings are nominal: a Node<"vec3"> is not assignable to the
 * VarNode<"vec3", JoinNode<"vec3">> that a sibling helper infers, so threading
 * concrete node classes through Fn signatures does not typecheck. The shader
 * graph is validated by the node system at build time instead.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

export const MAX_SPHERES = 20;
/** The GLSL version read u_maxSteps from a uniform. TSL wants a literal loop
 *  bound, so the count is fixed and the march exits early via Break instead. */
export const MAX_STEPS = 100;

export type SdfUniforms = ReturnType<typeof createUniforms>;

export function createUniforms() {
  return {
    eps: uniform(0.001),
    maxDis: uniform(1000),

    clearColor: uniform(new THREE.Color("#06452f")),
    boxColor: uniform(new THREE.Color("#ff6aa5")),
    boxSize: uniform(new THREE.Vector3(1, 1, 1)),

    camPos: uniform(new THREE.Vector3()),
    camToWorldMat: uniform(new THREE.Matrix4()),
    camInvProjMat: uniform(new THREE.Matrix4()),

    lightDir: uniform(new THREE.Vector3(0, 1.5, 1)),
    lightColor: uniform(new THREE.Color("white")),
    lightIntensity: uniform(1),

    light2Dir: uniform(new THREE.Vector3(2, -2, -1)),
    light2Color: uniform(new THREE.Color("red")),
    light2Intensity: uniform(0.2),

    diffIntensity: uniform(0.5),
    specIntensity: uniform(3),
    ambientIntensity: uniform(0.15),
    shininess: uniform(16),

    colorSmoothFactor: uniform(1),
    shapeSmoothFactor: uniform(0.5),

    dynamicSpherePos: uniform(new THREE.Vector3()),
    dynamicSphereSize: uniform(1),
    dynamicSphereColor: uniform(new THREE.Color("#6aff8a")),

    numSpheres: uniform(0, "int"),
    spherePositions: uniformArray(
      Array.from({ length: MAX_SPHERES }, () => new THREE.Vector3()),
    ),
    sphereRadii: uniformArray(new Array<number>(MAX_SPHERES).fill(0)),
    sphereColors: uniformArray(
      Array.from({ length: MAX_SPHERES }, () => new THREE.Color()),
    ),
  };
}

/** Polynomial smooth minimum, unchanged from the original. */
/** uniformArray().element() returns UniformArrayElementNode<unknown>, which no
 *  TSL builtin accepts. Read through here to keep it on the loose alias. */
const el = (arr: N, i: N): N => arr.element(i);

export const smin = Fn(
  ([a, b, k]: N[]) => {
    const h = clamp(b.sub(a).mul(0.5).div(k).add(0.5), 0, 1);
    return mix(b, a, h).sub(k.mul(h).mul(h.oneMinus()));
  },
);

export const sdBox = Fn(([p, b]: N[]) => {
  const q: N = abs(p).sub(b);
  return length(max(q, 0)).add(min(max(q.x, max(q.y, q.z)), 0));
});

/** 2D cross, revolved in the scene function to make the plus-shaped solid. */
export const sdCross = Fn(
  ([p0, b, r]: N[]) => {
    const a: N = abs(p0).toVar();
    // Swap so the larger component is in x, matching the GLSL ternary.
    const p: N = a.y.greaterThan(a.x).select(a.yx, a.xy).toVar();

    const q: N = p.sub(b).toVar();
    const k: N = max(q.y, q.x).toVar();
    const w: N = k.greaterThan(0).select(q, vec2(b.y.sub(p.x), k.negate())).toVar();

    return sign(k).mul(length(max(w, 0))).add(r);
  },
);

/** Revolution: collapse xz into a radius, keep y. */
export const opRevolution = Fn(([p, w]: N[]) =>
  vec2(length(p.xz).sub(w), p.y),
);

export function buildScene(u: SdfUniforms) {
  /** Smooth union of every active sphere. */
  const sphereField = Fn(([p]: N[]) => {
    const d = float(1e6).toVar();
    Loop({ start: int(0), end: int(MAX_SPHERES), type: "int" }, ({ i }) => {
      If(i.greaterThanEqual(u.numSpheres), () => {
        Break();
      });
      const dSphere: N = distance(p, el(u.spherePositions, i)).sub(
        el(u.sphereRadii, i),
      );
      d.assign(smin(d, dSphere, u.shapeSmoothFactor));
    });
    return d;
  });

  /** Distance to the whole scene: spheres, box, cursor sphere, revolved cross. */
  const scene = Fn(([p]: N[]) => {
    const dSpheres: N = sphereField(p);
    const dBox: N = sdBox(p.sub(vec3(-1, 0, 0)), u.boxSize);
    const dStatic: N = smin(dSpheres, dBox, u.shapeSmoothFactor);

    const dDynamic: N = distance(p, u.dynamicSpherePos).sub(u.dynamicSphereSize);

    const crossPos = vec3(2.0, 0.5, -1.0);
    const crossSize = vec2(2, 0.6);
    const crossRounding = float(0.01);
    const pCross: N = p.sub(crossPos);
    const rev: N = opRevolution(pCross, float(0));
    const dRevolvedCross: N = sdCross(rev, crossSize, crossRounding);

    // mergeShapes: two chained smooth unions.
    const merged: N = smin(dStatic, dDynamic, u.shapeSmoothFactor);
    return smin(merged, dRevolvedCross, u.shapeSmoothFactor);
  });

  const rayMarch = Fn(([ro, rd]: N[]) => {
    const d = float(0).toVar();
    Loop({ start: int(0), end: int(MAX_STEPS), type: "int" }, () => {
      const p: N = ro.add(rd.mul(d));
      const cd: N = scene(p).toVar();
      If(cd.lessThan(u.eps).or(d.greaterThanEqual(u.maxDis)), () => {
        Break();
      });
      d.addAssign(cd);
    });
    return d;
  });

  /** Tetrahedral gradient. The GLSL derived the four offsets with bit maths;
   *  they reduce to these constants. */
  const TETRA = [
    vec3(1, -1, -1),
    vec3(-1, -1, 1),
    vec3(-1, 1, -1),
    vec3(1, 1, 1),
  ];

  const normal = Fn(([p]: N[]) => {
    const n = vec3(0).toVar();
    for (const axis of TETRA) {
      const e: N = axis.mul(0.5773);
      n.addAssign(e.mul(scene(p.add(e.mul(u.eps)))));
    }
    // Degenerate gradient inside a perfectly flat region: point up.
    return length(n).lessThan(0.0001).select(vec3(0, 1, 0), normalize(n));
  });

  /** Exponential-weighted blend of sphere colours, then box, then cursor. */
  const sceneCol = Fn(([p]: N[]) => {
    const sphereColor = vec3(0).toVar();
    const totalWeight = float(0).toVar();
    const dMinSphere = float(1e6).toVar();

    Loop({ start: int(0), end: int(MAX_SPHERES), type: "int" }, ({ i }) => {
      If(i.greaterThanEqual(u.numSpheres), () => {
        Break();
      });
      const dSphere: N = distance(p, el(u.spherePositions, i)).sub(
        el(u.sphereRadii, i),
      );
      const w: N = exp(dSphere.negate().div(u.colorSmoothFactor));
      sphereColor.addAssign(el(u.sphereColors, i).mul(w));
      totalWeight.addAssign(w);
      dMinSphere.assign(min(dMinSphere, dSphere));
    });

    If(totalWeight.greaterThan(0), () => {
      sphereColor.divAssign(totalWeight);
    });

    const dBox: N = sdBox(p.sub(vec3(-1, 0, 0)), u.boxSize);
    const h2: N = clamp(
      dMinSphere.sub(dBox).mul(0.5).div(u.colorSmoothFactor).add(0.5),
      0,
      1,
    );
    const staticColor: N = mix(sphereColor, u.boxColor, h2);

    const dDynamic: N = distance(p, u.dynamicSpherePos).sub(u.dynamicSphereSize);
    const hDynamic: N = clamp(
      min(dMinSphere, dBox).sub(dDynamic).mul(0.5).div(u.colorSmoothFactor).add(0.5),
      0,
      1,
    );

    return mix(staticColor, u.dynamicSphereColor, hDynamic);
  });

  return { scene, rayMarch, normal, sceneCol };
}

/** Final fragment colour for the raymarching plane. */
export function buildColorNode(u: SdfUniforms, uvNode: N): N {
  const { rayMarch, normal, sceneCol } = buildScene(u);

  return Fn(() => {
    const ro = u.camPos;
    const ndc = uvNode.mul(2).sub(1);
    const rdView = u.camInvProjMat.mul(vec4(ndc.x, ndc.y, 0, 1)).xyz;
    const rd = normalize(u.camToWorldMat.mul(vec4(rdView, 0)).xyz).toVar();

    const dTravelled = rayMarch(ro, rd).toVar();
    const hp = ro.add(rd.mul(dTravelled));
    const n = normal(hp).toVar();

    // Light 1
    const diff1 = max(dot(n, u.lightDir), 0).mul(u.diffIntensity);
    const spec1 = pow(max(dot(n, normalize(u.lightDir.add(rd))), 0), u.shininess).mul(
      u.specIntensity,
    );
    const light1 = u.lightColor.mul(diff1.add(spec1).add(u.ambientIntensity)).mul(
      u.lightIntensity,
    );

    // Light 2
    const diff2 = max(dot(n, u.light2Dir), 0).mul(u.diffIntensity);
    const spec2 = pow(max(dot(n, normalize(u.light2Dir.add(rd))), 0), u.shininess).mul(
      u.specIntensity,
    );
    const light2 = u.light2Color.mul(diff2.add(spec2).add(u.ambientIntensity)).mul(
      u.light2Intensity,
    );

    const lit = sceneCol(hp).mul(light1.add(light2));

    return dTravelled.greaterThanEqual(u.maxDis).select(u.clearColor, lit);
  })();
}

/** Write one sphere slot. The uniformArray backing stores are typed as unknown,
 *  so the casts live here rather than at every call site. */
export function setSphere(
  u: SdfUniforms,
  i: number,
  pos: THREE.Vector3,
  radius: number,
  color: THREE.Color,
) {
  (u.spherePositions.array as THREE.Vector3[])[i].copy(pos);
  (u.sphereRadii.array as number[])[i] = radius;
  (u.sphereColors.array as THREE.Color[])[i].copy(color);
}
