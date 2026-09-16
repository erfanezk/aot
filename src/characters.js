import * as THREE from 'three';
import { sampleMotion, boneNames } from './motion.js';
import { WALK, RUN } from './human-walk.js';
import {updateFootContacts} from './foot-ik.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const assets = new Map();
const bindRotations = new WeakMap();
const bindPositions = new WeakMap();
const rotation = new THREE.Quaternion();
const angles = new THREE.Euler();
const deltaRotation = new THREE.Quaternion();
const names = ['eren', 'attack-titan', 'pure-titan'];
const requiredBones = ['Torso', 'Head', 'UpperArm_L', 'UpperArm_R', 'Forearm_L', 'Forearm_R', 'UpperLeg_L', 'UpperLeg_R', 'Shin_L', 'Shin_R', 'Cape'];
let loading;

/** Load the actual Blender exports once; instances share geometry and textures. */
export function loadCharacterAssets(onProgress = () => {}) {
  loading ||= (async () => {
    const loader = new GLTFLoader();
    let loaded = 0;
    await Promise.all(names.map(async name => {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
      for (const bone of requiredBones) {
        if (!gltf.scene.getObjectByName(bone)?.isBone) throw new Error(`${name}.glb is missing the ${bone} bone`);
      }
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = !/iris|pupil|sclera|ivory|sinew/i.test(object.material?.name || '');
        object.receiveShadow = true;
        // Include a motion envelope while culling characters outside the camera view.
        if (object.isSkinnedMesh) {
          object.computeBoundingSphere();
          object.boundingSphere.radius = object.boundingSphere.radius * 1.3 + .65;
        }
        object.frustumCulled = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material.map) material.map.anisotropy = 4;
          if (material.normalMap) material.normalScale.multiplyScalar(.65);
        }
      });
      assets.set(name, gltf);
      onProgress(++loaded, names.length);
    }));
  })();
  return loading;
}

export function createCharacter({ titan = false, attack = false, variation = 0 } = {}) {
  const name = titan ? (attack ? 'attack-titan' : 'pure-titan') : 'eren';
  const template = assets.get(name);
  if (!template) throw new Error(`Character assets must finish loading before creating ${name}`);
  const group = new THREE.Group();
  const body = new THREE.Group();
  const model = clone(template.scene);
  // Blender-authored characters face -Y, exported as +Z. Gameplay faces -Z.
  model.rotation.y = Math.PI;
  body.add(model); group.add(body);
  const bone = name => {
    const object = model.getObjectByName(name);
    bindRotations.set(object, object.quaternion.clone());
    bindPositions.set(object, object.position.clone());
    return object;
  };
  const torso = bone('Torso'), head = bone('Head');
  const motionBones = Object.fromEntries(boneNames.map(name => [name, model.getObjectByName(name) ? bone(name) : null]));
  model.traverse(object => { if (object.isBone && !motionBones[object.name]) motionBones[object.name]=bone(object.name); });
  const walkMixer = new THREE.AnimationMixer(model);
  const walkClip=template.animations.find(clip=>clip.name==='eren_walk_in_place');
  const walkAction=walkClip ? walkMixer.clipAction(walkClip) : null;
  const runClip=template.animations.find(clip=>clip.name==='eren_run');
  const runAction=runClip ? walkMixer.clipAction(runClip) : null;
  const fingers = [];
  model.traverse(object => { if (object.isBone && object.name.startsWith('Finger') && !object.name.startsWith('Fingers')) fingers.push(bone(object.name)); });
  const arms = [bone('UpperArm_L'), bone('UpperArm_R')];
  const legs = [bone('UpperLeg_L'), bone('UpperLeg_R')];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 'L' : 'R';
    arms[i].userData.forearm = bone(`Forearm_${side}`);
    legs[i].userData.shin = bone(`Shin_${side}`);
  }
  const capeBone = bone('Cape');
  if (titan && !attack) {
    const tint = [0xf4e5d6, 0xe6c3ae, 0xd7d0b8, 0xf0c9b4][variation % 4];
    model.traverse(object => {
      if (object.isMesh && /^Pure Titan (face )?skin$/.test(object.material?.name || '')) {
        object.material = object.material.clone();
        object.material.color.multiply(new THREE.Color(tint));
      }
    });
  }
  const nape = new THREE.Mesh(
    new THREE.SphereGeometry(.055, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xeab27a, transparent: true, opacity: .8 }),
  );
  nape.position.set(0, 1.955, .065);
  nape.visible = titan && !attack;
  body.add(nape);
  group.userData.asset = name;
  return { group, body, torso, head, arms, legs, capeBone, titan, nape, asset: name, clips: template.animations, motionBones, fingers, walkMixer, walkAction, runAction, motion: { phase: 0, speed: 0, landing: 0, airborne: false } };
}

/** Blend authored poses; stride phase is continuous through speed changes. */
export function animateCharacter(model, time, speed, airborne, attackRemaining = 0, context = {}) {
  const dt = Math.min(context.dt ?? 1 / 60, .05), state = model.motion;
  const previousSpeed=state.speed;
  state.speed += (speed - state.speed) * (1 - Math.exp(-dt * 9));
  state.acceleration=(state.speed-previousSpeed)/Math.max(dt,.001);
  const grapple=!!context.grapple;
  state.flightHold=airborne||grapple?.09:Math.max(0,(state.flightHold||0)-dt);
  airborne=airborne||grapple||state.flightHold>0;
  const locomotion=!model.titan && !airborne && attackRemaining<=0 && speed>.08;
  const useRun=locomotion && model.runAction && speed>(state.mode==='run'?2.2:3);
  const useWalk=locomotion && !useRun && model.walkAction;
  const mode=attackRemaining>0?'attack':grapple?'grapple':airborne?'air':useWalk?'walk':speed>.08?'run':'idle';
  if (!model.titan && state.mode && state.mode!==mode) {
    state.transition={elapsed:0,duration:mode==='grapple'||state.mode==='grapple'?.30:.16,poses:[model.body,...Object.values(model.motionBones).filter(Boolean)].map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}))};
  }
  state.mode=mode;
  if (state.airborne && !airborne) state.landing = 1;
  else state.landing = Math.max(0, state.landing - dt * 4.5);
  state.airborne = airborne;
  if (useWalk || useRun) {
    const action=useRun?model.runAction:model.walkAction, stride=useRun?RUN:WALK;
    state.phase += (context.distanceTraveled ?? speed * dt) / stride.distance;
    if (state.activeAction!==action) { model.walkMixer.stopAllAction();action.reset().play();state.activeAction=action;state.walkActive=true;state.contacts={}; }
    action.time = (state.phase % 1) * action.getClip().duration;
    model.walkMixer.update(0);
    model.body.position.set(0,0,0); model.body.rotation.set(0,0,0);
    updateFootContacts(model,state.phase%1,useRun?{start:.04,end:.15}:undefined);
    secondaryMotion(model,dt,context.turn || 0,true);
    blendTransition(model,dt);
    return;
  }
  if (state.walkActive) { model.walkMixer.stopAllAction(); state.walkActive=false; state.activeAction=null;state.contacts={}; }
  if(!model.titan) {
    // Restore channels that only the walk animates before blending a new pose.
    // Otherwise the transition's Root offset can persist into idle or flight.
    for(const [name,bone] of Object.entries(model.motionBones))if(bone && !boneNames.includes(name)) {
      bone.position.copy(bindPositions.get(bone));bone.quaternion.copy(bindRotations.get(bone));
    }
  }
  const frequency = model.titan ? .35 + state.speed / ((context.scale || 7.4) * 4) : .85 + state.speed * .095;
  if (state.speed > .05) state.phase += dt * Math.min(model.titan ? 1.25 : 2.3, frequency);
  const sample = sampleMotion({ time, phase: state.phase, speed: state.speed, titan: model.titan, airborne,
    grapple: context.grapple, turn: context.turn, attack: attackRemaining > 0 ? 1 - attackRemaining : 0,
    combo: context.combo, landing: state.landing });
  const blend = 1 - Math.exp(-dt * (attackRemaining > 0 ? 35 : 15));
  for (const [name, values] of Object.entries(sample.bones)) {
    const bone = model.motionBones[name]; if (!bone) continue;
    angles.set(...values); rotation.copy(bindRotations.get(bone)).multiply(deltaRotation.setFromEuler(angles));
    bone.quaternion.slerp(rotation, blend);
  }
  if (!model.titan) {
    for (const side of ['L','R']) for (const [helper,joint] of [['ElbowCorrect','Forearm'],['KneeCorrect','Shin']]) {
      const b=model.motionBones[`${helper}_${side}`]; if (!b) continue;
      const bend=sample.bones[`${joint}_${side}`]?.[0] || 0;
      angles.set(bend*.5,0,0); rotation.copy(bindRotations.get(b)).multiply(deltaRotation.setFromEuler(angles)); b.quaternion.slerp(rotation,blend);
      const bulge=1+Math.min(Math.abs(bend),1.6)*.045;b.scale.set(bulge,1,bulge);
    }
  }
  for (const bone of model.fingers) {
    angles.set(-sample.grip * (bone.name.includes('_1_') ? 1.25 : 1.55), 0, 0);
    rotation.copy(bindRotations.get(bone)).multiply(deltaRotation.setFromEuler(angles)); bone.quaternion.slerp(rotation, blend);
  }
  model.body.position.y += (sample.height - model.body.position.y) * blend;
  model.body.rotation.x += (sample.lean - model.body.rotation.x) * blend;
  model.body.rotation.z += (sample.bank - model.body.rotation.z) * blend;
  secondaryMotion(model,dt,context.turn || 0,false);
  blendTransition(model,dt);
}

// Keep pose continuity when the baked walk hands off to procedural game actions.
function blendTransition(model,dt) {
  const transition=model.motion.transition;if(!transition)return;
  transition.elapsed+=dt;
  const t=Math.min(1,transition.elapsed/transition.duration),alpha=t*t*(3-2*t);
  for(const pose of transition.poses) {
    pose.bone.position.lerp(pose.position,1-alpha);
    pose.bone.quaternion.slerp(pose.quaternion,1-alpha);
    pose.bone.scale.lerp(pose.scale,1-alpha);
  }
  if(t===1)model.motion.transition=null;
}

// Small damped offsets add inertia during changes of speed and heading.
function secondaryMotion(model,dt,turn,fromClip) {
 if(model.titan)return;
 const state=model.motion;state.secondary ||= {};
 for(const name of ['HairFront','HairBack','CapeMid','CapeTip','Jacket_L','Jacket_R','Lapel_L','Lapel_R']) {
  const bone=model.motionBones[name];if(!bone)continue;
  const spring=state.secondary[name] ||= {x:0,z:0,vx:0,vz:0};
  const cloth=name.startsWith('Cape'), stiffness=cloth?75:150, damping=cloth?18:25;
  const targetX=THREE.MathUtils.clamp(-state.acceleration*(cloth?.0018:.0008),-.035,.035);
  const targetZ=THREE.MathUtils.clamp(-turn*(cloth?.05:.025),-.035,.035);
  spring.vx+=((targetX-spring.x)*stiffness-spring.vx*damping)*dt;
  spring.vz+=((targetZ-spring.z)*stiffness-spring.vz*damping)*dt;
  spring.x+=spring.vx*dt;spring.z+=spring.vz*dt;
  if(!fromClip)bone.quaternion.copy(bindRotations.get(bone));
  angles.set(spring.x,0,spring.z);bone.quaternion.multiply(deltaRotation.setFromEuler(angles));
 }
}
