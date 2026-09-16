import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Texture, Box3, Vector3, AnimationMixer } from 'three';

const required = ['Root', 'Pelvis', 'Torso', 'Chest', 'Head', 'Cape', 'Foot_L', 'Foot_R', 'UpperArm_L', 'Forearm_L', 'UpperLeg_L', 'Shin_L'];
// The realism pass reserves more geometry for facial loops and strand cards.
const budgets = { eren: { triangles: 56000, bytes: 16000000 }, 'attack-titan': { triangles: 58000, bytes: 12000000 }, 'pure-titan': { triangles: 42000, bytes: 12000000 } };
for (const name of ['eren', 'attack-titan', 'pure-titan']) {
  const file = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const length = file.readUInt32LE(12);
  const json = JSON.parse(file.toString('utf8', 20, 20 + length));
  const binaryStart = 20 + length + 8;
  assert(json.skins?.length > 0, 'Export contains a bone rig');
  for (const motion of ['idle','walk','run','jump','odm','land','attack']) {
    assert(json.animations.some(animation => animation.name === `${name}_${motion}`), `Export contains ${motion}`);
  }
  const triangleCount=json.meshes.reduce((total,mesh)=>total+mesh.primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0),0);
  assert(triangleCount < budgets[name].triangles, 'Character stays within its rendering budget');
  assert(file.length < budgets[name].bytes, 'Embedded asset stays within its download budget');
  const hair = json.materials.find(m => m.name === 'Chestnut strand cards');
  assert(hair?.alphaMode === 'MASK' && hair.doubleSided, 'Strand cards retain their masked, double-sided material');
  assert(hair.pbrMetallicRoughness.baseColorTexture, 'Hair strand texture is exported');
  const face = json.materials.find(m => /face skin/.test(m.name));
  assert(face?.normalTexture && face.pbrMetallicRoughness.baseColorTexture && face.pbrMetallicRoughness.metallicRoughnessTexture, 'Facial color, pores and roughness survive export');
  for (const image of json.images) {
    assert(!image.uri, 'Texture is embedded and works offline');
    const view = json.bufferViews[image.bufferView];
    const offset = binaryStart + (view.byteOffset || 0);
    assert.equal(file.toString('hex', offset, offset + 8), '89504e470d0a1a0a', 'Embedded texture is a PNG');
    assert(file.readUInt32BE(offset + 16) > 0 && file.readUInt32BE(offset + 20) > 0, 'PNG has valid dimensions');
  }
  const loader = new GLTFLoader();
  // Decode geometry and skeletons in Node; PNG data is checked above, browser tests cover GPU decoding.
  loader.register(() => ({ name: 'MODEL_VALIDATION_TEXTURES', loadTexture: () => Promise.resolve(new Texture()) }));
  const gltf = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  for (const bone of required) assert(gltf.scene.getObjectByName(bone)?.isBone, `Missing ${bone}`);
  if(name==='eren') {
    for(const bone of ['Neck','Clavicle_L','Clavicle_R','Toe_L','Toe_R','HairFront','HairBack','CapeMid','CapeTip','Jacket_L','Jacket_R','Lapel_L','Lapel_R','ElbowCorrect_L','KneeCorrect_L','Fingers_L','Thumb_R'])assert(gltf.scene.getObjectByName(bone)?.isBone,`Missing human joint ${bone}`);
    for(const variant of ['walk_in_place','walk_root_motion'])assert(gltf.animations.some(c=>c.name===`eren_${variant}`),`Missing ${variant}`);
    assert(json.skins.every(s=>s.joints.length<=40),'Human rig stays within 40 bones');
  }
  const instance = clone(gltf.scene);
  assert.notEqual(instance.getObjectByName('Head'), gltf.scene.getObjectByName('Head'), 'Clones have independent bones');
  const meshes = [];
  instance.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  assert(meshes.length > 0);
  for (const mesh of meshes) {
    const weights = mesh.geometry.attributes.skinWeight;
    const joints = mesh.geometry.attributes.skinIndex;
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < weights.count; i++) {
      const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
      assert(Math.abs(sum - 1) < .002, `${name}: vertex ${i} has unnormalized bone weights ${sum}`);
      if (name !== 'eren' && Math.abs(positions.getX(i)) < .4 && positions.getY(i) > .95 && positions.getY(i) < 1.12) {
        for (let component = 0; component < 4; component++) {
          const joint = mesh.skeleton.bones[joints.getComponent(i, component)];
          assert(!(weights.getComponent(i, component) > .001 && /Hand|Forearm|UpperArm/.test(joint.name)), 'Pelvis vertices must not follow arm bones');
        }
      }
    }
  }
  for(const clip of gltf.animations) {
    assert(clip.duration>0, `${clip.name} has a duration`);
    for(const track of clip.tracks) assert(Array.from(track.values).every(Number.isFinite), `${clip.name} contains finite transforms`);
  }
  if(name!=='eren') assert(instance.getObjectByName('Finger2_1_L')?.isBone, 'Titan fists are articulated');
  const mixer = new AnimationMixer(instance);
  mixer.clipAction(gltf.animations.find(clip => clip.name === `${name}_walk`)).play();
  for (let frame = 0; frame < 30; frame++) {
    mixer.update(1 / 30); instance.updateMatrixWorld(true);
    for (const mesh of meshes) {
      mesh.skeleton.update();
      for (const i of [0, Math.floor(mesh.geometry.attributes.position.count / 2), mesh.geometry.attributes.position.count - 1]) {
        const point = mesh.getVertexPosition(i, new Vector3());
        assert(point.toArray().every(Number.isFinite), 'Animated skin deforms to finite positions');
      }
    }
  }
  const box = new Box3().setFromObject(instance);
  assert(box.getSize(new Vector3()).y > 2 && box.getSize(new Vector3()).y < 2.8, 'Character remains at expected gameplay scale');
  console.log(`${name}: ${meshes.length} skinned meshes; ${json.images.length} embedded textures; independent rig, weights, geometry budget, scale, and ${gltf.animations.length} motion clips PASS`);
}
