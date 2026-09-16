import { InstancedBufferAttribute, PointsNodeMaterial, Sprite, DynamicDrawUsage } from 'three/webgpu';
import { instancedBufferAttribute, instancedDynamicBufferAttribute } from 'three/tsl';

// WebGPU point primitives are one pixel wide. Instanced sprites preserve
// the original particle sizes and perspective attenuation in one draw call.
export function createPointSprites(positions, { colors, dynamic = false, ...options } = {}) {
  const positionAttribute = new InstancedBufferAttribute(positions, 3);
  const colorAttribute = colors ? new InstancedBufferAttribute(colors, 3) : null;
  if (dynamic) {
    positionAttribute.setUsage(DynamicDrawUsage);
    colorAttribute?.setUsage(DynamicDrawUsage);
  }
  const material = new PointsNodeMaterial(options);
  const attributeNode = dynamic ? instancedDynamicBufferAttribute : instancedBufferAttribute;
  material.positionNode = attributeNode(positionAttribute);
  if (colorAttribute) material.colorNode = attributeNode(colorAttribute);
  const mesh = new Sprite(material);
  mesh.count = positions.length / 3;
  // Positions live in instance attributes, outside the base sprite's bounds.
  mesh.frustumCulled = false;
  return {
    mesh,
    update(count) {
      mesh.count = count;
      mesh.visible = count > 0;
      positionAttribute.needsUpdate = true;
      if (colorAttribute) colorAttribute.needsUpdate = true;
    },
  };
}
