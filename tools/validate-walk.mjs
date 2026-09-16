import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Texture,AnimationMixer,Vector3,Quaternion} from 'three';
import {humanWalk,humanRun,WALK,RUN} from '../src/human-walk.js';
import {updateFootContacts} from '../src/foot-ik.js';
const file=await readFile(new URL('../public/models/eren.glb',import.meta.url));
const loader=new GLTFLoader();loader.register(()=>({name:'TEST_TEXTURE',loadTexture:()=>Promise.resolve(new Texture())}));
const gltf=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
const scene=gltf.scene; const mixer=new AnimationMixer(scene);const report={};
for(const variant of ['in_place','root_motion','run']) {
 const running=variant==='run',stride=running?RUN:WALK;
 const clip=gltf.animations.find(c=>c.name===(running?'eren_run':`eren_walk_${variant}`));assert(clip);
 const action=mixer.clipAction(clip).play();
 let maxTargetError=0,maxFlatDrift=0,minKnee=10,maxStepAngle=0,minSole=10;
 const anchors={};let previousKnees={};const ends=[];
 for(let i=0;i<=264;i++) {
  const phase=i/264;action.time=phase*clip.duration;mixer.update(0);scene.updateMatrixWorld(true);
  const plan=running?humanRun(phase):humanWalk(phase,variant==='root_motion');
  for(const side of ['L','R']) {
   const bone=scene.getObjectByName('Foot_'+side);const actual=bone.getWorldPosition(new Vector3());
   const contact=plan.feet[side], target=new Vector3(contact.position[0],contact.position[2],-contact.position[1]+(variant==='root_motion'?phase*WALK.distance:0));
   maxTargetError=Math.max(maxTargetError,actual.distanceTo(target));
   if(variant!=='root_motion')actual.z+=phase*stride.distance;
   if(contact.phase>(running?.06:.14) && contact.phase<(running?.13:.44)) {
    if(anchors[side]) maxFlatDrift=Math.max(maxFlatDrift,actual.distanceTo(anchors[side])); else anchors[side]=actual.clone();
   } else anchors[side]=null;
   const hip=scene.getObjectByName('UpperLeg_'+side).getWorldPosition(new Vector3());
   const knee=scene.getObjectByName('Shin_'+side).getWorldPosition(new Vector3());
   const ankle=bone.getWorldPosition(new Vector3());
   const bend=Math.PI-hip.clone().sub(knee).angleTo(ankle.clone().sub(knee));minKnee=Math.min(minKnee,bend);
   const q=scene.getObjectByName('Shin_'+side).quaternion;
   if(previousKnees[side])maxStepAngle=Math.max(maxStepAngle,q.angleTo(previousKnees[side]));previousKnees[side]=q.clone();
  }
  if(variant!=='in_place' && i%4===0) scene.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
    const pos=mesh.geometry.attributes.position;
    for(let j=0;j<pos.count;j++)if(pos.getY(j)<.04) {
      const point=mesh.getVertexPosition(j,new Vector3()).applyMatrix4(mesh.matrixWorld); minSole=Math.min(minSole,point.y);
    }
  });
  if(i===0 || i===264) {
   const joints={};scene.traverse(o=>{if(o.isBone)joints[o.name]=o.quaternion.toArray()});
   ends.push({joints,root:scene.getObjectByName('Root').getWorldPosition(new Vector3()).toArray()});
  }
 }
 let maxLoopError=0;
 for(const name in ends[0].joints)maxLoopError=Math.max(maxLoopError,new Quaternion().fromArray(ends[0].joints[name]).angleTo(new Quaternion().fromArray(ends[1].joints[name])));
 const travel=ends[1].root[2]-ends[0].root[2];
 report[variant]={duration:clip.duration,minSole:variant!=='in_place'?minSole:null,maxTargetError,maxFlatDrift,minKneeDegrees:minKnee*180/Math.PI,maxStepDegrees:maxStepAngle*180/Math.PI,maxLoopDegrees:maxLoopError*180/Math.PI,travel};
 // The faster run spans much larger joint arcs between exported 60 FPS keys.
 assert(maxTargetError<(running?.02:.006),`${variant} ankle target error ${maxTargetError}`);
 assert(maxFlatDrift<.006,`${variant} planted foot drifts ${maxFlatDrift}`);
 assert(minKnee>.03,'Knees retain a bend');assert(maxStepAngle<.09,'Knee interpolation avoids snapping');
 assert(maxLoopError<.003,'Loop joint poses match');
 if(variant!=='in_place')assert(minSole>=-.001,`Skinned soles stay above the ground: ${minSole}`);
 assert(Math.abs(travel-(variant==='root_motion'?WALK.distance:0))<.001,'Root travel matches metadata');
 mixer.stopAllAction();
}
// Exercise the actual runtime solver while the actor turns during a planted step.
const runtime={group:scene,motion:{},motionBones:{}};
scene.traverse(o=>{if(o.isBone)runtime.motionBones[o.name]=o});
const action=mixer.clipAction(gltf.animations.find(c=>c.name==='eren_walk_in_place')).play();
let maxRuntimeDrift=0,planted;
for(let i=0;i<=45;i++) {
 const phase=.14+i/45*.29;
 action.time=phase*action.getClip().duration;mixer.update(0);
 scene.position.z=phase*WALK.distance;scene.rotation.y=i/45*.12;
 updateFootContacts(runtime,phase);scene.updateMatrixWorld(true);
 const foot=runtime.motionBones.Foot_L.getWorldPosition(new Vector3());
 planted ||= foot.clone();maxRuntimeDrift=Math.max(maxRuntimeDrift,foot.distanceTo(planted));
}
assert(maxRuntimeDrift<.002,`Runtime IK planted ankle drift ${maxRuntimeDrift}`);
updateFootContacts(runtime,.7);assert(!runtime.motion.contacts.L,'Contact releases during swing');
report.runtimeIK={maxPlantedDrift:maxRuntimeDrift,turnDegrees:.12*180/Math.PI};
console.log(JSON.stringify(report,null,2));
await writeFile(new URL('../output/walk-review/metrics.json',import.meta.url),JSON.stringify(report,null,2));
