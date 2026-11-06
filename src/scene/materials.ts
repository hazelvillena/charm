import { Color, MeshPhysicalMaterial, IUniform } from 'three';
import { Finish } from '../../design/finishes';

/** Applies a design-system finish to a physical material. */
export function applyFinish(mat: MeshPhysicalMaterial, f: Finish, base: Color) {
  const wasTransmissive = mat.transmission > 0;
  mat.roughness = f.roughness; mat.metalness = f.metalness;
  mat.clearcoat = f.clearcoat; mat.clearcoatRoughness = f.clearcoatRoughness;
  mat.sheen = f.sheen; mat.sheenRoughness = f.sheenRoughness; mat.sheenColor.copy(base).lerp(new Color('#ffffff'), 0.55);
  mat.iridescence = f.iridescence; mat.iridescenceIOR = 1.3; mat.iridescenceThicknessRange = [120, 420];
  mat.transmission = f.transmission; mat.thickness = f.thickness; mat.ior = f.ior;
  mat.envMapIntensity = f.envIntensity;
  if (wasTransmissive !== f.transmission > 0) mat.needsUpdate = true;
}

export const splitUniforms: Record<string, IUniform> = {
  uSplitZ: { value: 0 }, uSplitOn: { value: 1 }, uSplitCy: { value: 0 }, uSplitColor: { value: new Color('#5b6cff') },
};

/** Draws the mold split (parting) line as a thin DASHED accent band on the surface where object z == uSplitZ. */
export function installSplitBand(mat: MeshPhysicalMaterial) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, splitUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nuniform float uSplitZ;\nuniform float uSplitOn;\nuniform float uSplitCy;\nuniform vec3 uSplitColor;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sd = abs(vObjPos.z - uSplitZ);
        float ang = atan(vObjPos.y - uSplitCy, vObjPos.x);
        float dash = 1.0 - smoothstep(0.50, 0.58, abs(fract(ang * 15.0) - 0.5) * 2.0); // ~2 mm dashes, 50/50, around the body
        float sband = (1.0 - smoothstep(0.08, 0.30, sd)) * uSplitOn * dash; // hairline
        diffuseColor.rgb = mix(diffuseColor.rgb, uSplitColor, sband * 0.95);`);
  };
  mat.customProgramCacheKey = () => 'shell-split-band';
}
