// Foot contacts and secondary poses are baked through Blender's two-bone IK solver.
export const WALK = Object.freeze({ duration: 1.1, distance: 1.3, stance: .62 });
const tau=Math.PI*2;
const ease=t=>t*t*t*(t*(t*6-15)+10);
const hermite=(a,b,va,vb,t)=> (2*t**3-3*t*t+1)*a+(t**3-2*t*t+t)*va+(-2*t**3+3*t*t)*b+(t**3-t*t)*vb;
export function humanWalk(phase, rootMotion=false) {
 const cycle=((phase%1)+1)%1, a=cycle*tau;
 const root=[-.065*Math.sin(a),-.062-.029*Math.cos(a*2), rootMotion ? phase*WALK.distance : 0];
 const bones={
  Pelvis:[.015,.048*Math.cos(a),.021*Math.sin(a)],
  Torso:[.035,-.018*Math.cos(a-.15),-.014*Math.sin(a)],
  Chest:[.014+.006*Math.cos(2*a),-.065*Math.cos(a-.12),-.014*Math.sin(a-.1)],
  Neck:[-.015,.008*Math.sin(a-.35),.007*Math.sin(a)],
  Head:[-.035-.004*Math.cos(2*a-.15),.015*Math.cos(a-.2),.009*Math.sin(a)],
  Cape:[.025+.023*Math.sin(a*2-.6),.009*Math.sin(a-.4),.014*Math.sin(a-.4)],
  CapeMid:[.026+.032*Math.sin(a*2-1.0),.009*Math.sin(a-.9),.012*Math.sin(a-.8)],
  CapeTip:[.026+.039*Math.sin(a*2-1.5),.012*Math.sin(a-1.3),.017*Math.sin(a-1.1)],
  HairFront:[.012*Math.sin(a*2-.8),.009*Math.sin(a-.5),.010*Math.sin(a-.3)],
  HairBack:[.016*Math.sin(a*2-1.3),.013*Math.sin(a-.9),.014*Math.sin(a-.8)],
 };
 const feet={};
 for (const [i,side] of ['L','R'].entries()) {
  const sign=i?1:-1, t=(cycle+i*.5)%1, wave=Math.cos(a+i*Math.PI);
  bones[`Clavicle_${side}`]=[.006*Math.sin(a),sign*.009*wave,sign*.012*Math.sin(a-.2)];
  bones[`UpperArm_${side}`]=[.25*wave*(i?.96:1),.018*Math.sin(a-.2),-sign*.07];
  bones[`Forearm_${side}`]=[-.23-.055*Math.cos(a+i*Math.PI-.28),0,0];
  bones[`Hand_${side}`]=[.018*Math.sin(a+i*Math.PI-.55),.022*Math.sin(a-.4),-sign*.025];
  bones[`Jacket_${side}`]=[.024*Math.sin(2*a-.8+i*.16),.012*Math.sin(a-.5),sign*.018*Math.sin(a-.7)];
  bones[`Lapel_${side}`]=[.018*Math.sin(a*2-.4),0,sign*.014*Math.sin(a-.3)];
  bones[`Fingers_${side}`]=[.045*Math.sin(a+i*Math.PI-.55),0,0];
  bones[`Thumb_${side}`]=[0,.025*Math.sin(a+i*Math.PI-.6),0];
  let forward, lift=0, pitch=0, pivot=0;
  if(t<WALK.stance) {
   forward=WALK.distance*(WALK.stance*.5-t);
   if(t<.12) { pitch=-.18*(1-ease(t/.12)); pivot=.083; }
   else if(t>.46) { pitch=.36*ease((t-.46)/(WALK.stance-.46));pivot=-.16; }
  } else {
   const u=(t-WALK.stance)/(1-WALK.stance), half=WALK.distance*WALK.stance*.5;
   forward=hermite(-half,half,-WALK.distance*(1-WALK.stance),-WALK.distance*(1-WALK.stance),u);
   lift=.12*Math.sin(Math.PI*u)**2;
   pitch=hermite(.36,-.18,0,0,u);
   pivot=-.16+(.083+.16)*ease(u);
  }
  // Blender uses -Y as forward. Correct the ankle around its planted heel/ball.
  const sole=-.100, rotatedY=pivot*Math.cos(pitch)-sole*Math.sin(pitch), rotatedZ=pivot*Math.sin(pitch)+sole*Math.cos(pitch);
  feet[side]={ position:[sign*.138,-forward+pivot-rotatedY,-rotatedZ+lift], pitch, phase:t, contact:t<WALK.stance, pivot };
  bones[`Toe_${side}`]=[-Math.max(0,pitch)*.88,0,0];
 }
 return {root,bones,feet};
}

export const RUN=Object.freeze({duration:.6,distance:4.6,stance:.24});
/** A separate sprint: brief support, flight, high recovery and compact bent arms. */
export function humanRun(phase) {
 const cycle=((phase%1)+1)%1,a=cycle*tau;
 const result=humanWalk(phase),halfPhase=cycle% .5;
 const flight=halfPhase>RUN.stance?Math.sin(Math.PI*(halfPhase-RUN.stance)/(.5-RUN.stance))**2:0;
 result.root=[-.024*Math.sin(a),-.13+.11*flight,0];
 Object.assign(result.bones,{Pelvis:[.07,.09*Math.cos(a),.018*Math.sin(a)],Torso:[.13,-.025*Math.cos(a),-.014*Math.sin(a)],Chest:[.05,-.10*Math.cos(a-.12),-.015*Math.sin(a)],Head:[-.11,.012*Math.cos(a-.2),0],Cape:[.22+.025*Math.sin(2*a-.6),0,.018*Math.sin(a)]});
 for(const [i,side] of ['L','R'].entries()) {
  const t=(cycle+i*.5)%1,wave=Math.cos(a+i*Math.PI),sign=i?1:-1;
  result.bones[`UpperArm_${side}`]=[.63*wave*(i?.96:1),0,-sign*.17];
  result.bones[`Forearm_${side}`]=[-1.12-.19*Math.cos(a+i*Math.PI-.2),0,0];
  let forward,lift=0,pitch,pivot;
  if(t<RUN.stance) {
   forward=RUN.distance*(RUN.stance*.5-t);
   pitch=t<.04?-.04*(1-ease(t/.04)):t>.15?.48*ease((t-.15)/.09):0;
   pivot=t<.04?.083:-.16;
  } else {
   const u=(t-RUN.stance)/(1-RUN.stance);
   if(u<.18)forward=hermite(-.552,-.70,-RUN.distance*.76*.18,0,u/.18);
   else if(u<.77)forward=hermite(-.70,.67,0,0,(u-.18)/.59);
   else forward=hermite(.67,.552,0,-RUN.distance*.76*.23,(u-.77)/.23);
   // Recover the heel beneath the pelvis before extending for the next contact.
   lift=u<.25?.46*ease(u/.25):u<.65?.46-.13*ease((u-.25)/.4):.33*(1-ease((u-.65)/.35));
   pitch=hermite(.48,-.04,0,0,u);pivot=-.16+.243*ease(u);
  }
  const sole=-.105,rotY=pivot*Math.cos(pitch)-sole*Math.sin(pitch),rotZ=pivot*Math.sin(pitch)+sole*Math.cos(pitch);
  result.feet[side]={position:[sign*.14,-forward+pivot-rotY,-rotZ+lift],pitch,phase:t,contact:t<RUN.stance,pivot};
  result.bones[`Toe_${side}`]=[-Math.max(0,pitch)*.88,0,0];
 }
 return result;
}
