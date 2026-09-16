import {writeFileSync} from 'node:fs';
import {sampleMotion} from '../src/motion.js';
import {humanWalk,humanRun,WALK,RUN} from '../src/human-walk.js';
const clips={};
for(const titan of [false,true]) {
 const result={};
 for(const [name,duration] of [['idle',3],['walk',1.1],['run',.65],['odm',1.2],['jump',.9],['land',.55],['attack',.7]]) {
  const frames=[];
  for(let i=0;i<=Math.round(duration*30);i++) {
   const t=i/Math.round(duration*30);
   frames.push(sampleMotion({titan,time:t*duration,phase:t,speed:name==='walk'?(titan?4:4):name==='run'?14:0,airborne:['odm','jump'].includes(name),grapple:name==='odm',attack:name==='attack'?Math.max(.0001,Math.min(.9999,t)):0,combo:1,landing:name==='land'?Math.sin(t*Math.PI):0}));
  }
  result[name]={duration,frames};
 }
 clips[titan?'titan':'human']=result;
}
for(const name of ['walk','walk_in_place','walk_root_motion']) {
 const frames=Array.from({length:67},(_,i)=>humanWalk(i/66,name==='walk_root_motion'));
 clips.human[name]={duration:WALK.duration, fps:60, distance:WALK.distance, frames, ik:true, rootMotion:name==='walk_root_motion'};
}
clips.human.run={duration:RUN.duration,fps:60,distance:RUN.distance,frames:Array.from({length:73},(_,i)=>humanRun(i/72)),ik:true};
writeFileSync(new URL('../assets/blender/motion-samples.json',import.meta.url),JSON.stringify(clips));
console.log('Sampled nine human clips (including both walk variants) and seven Titan clips.');
