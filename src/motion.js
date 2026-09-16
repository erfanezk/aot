// Authored contact / recoil / passing poses, shared by Blender baking and gameplay.
export const boneNames = ['Pelvis','Torso','Chest','Head','Cape', ...['L','R'].flatMap(s => ['UpperArm','Forearm','Hand','UpperLeg','Shin','Foot'].map(b => `${b}_${s}`))];
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const smooth = t => t*t*(3-2*t);
const mix = (a,b,t) => a+(b-a)*t;
function track(keys,t) {
  for(let i=1;i<keys.length;i++) if(t<=keys[i][0]) {
    const a=keys[i-1],b=keys[i],u=smooth(clamp((t-a[0])/(b[0]-a[0])));
    return a.slice(1).map((v,j)=>mix(v,b[j+1],u));
  }
  return keys.at(-1).slice(1);
}
export function sampleMotion({time=0, phase=0, speed=0, titan=false, airborne=false, grapple=false, attack=0, combo=0, landing=0, turn=0}={}) {
  const p=Object.fromEntries(boneNames.map(n=>[n,[0,0,0]]));
  const moving=clamp(speed/(titan?4:4)), run=titan?clamp((speed-8)/12):clamp((speed-4)/7);
  const cycle=((phase%1)+1)%1, sway=Math.sin(cycle*Math.PI*2)*moving;
  p.Pelvis=[0,sway*.06,sway*(titan?.035:.06)];
  p.Torso=[moving*(titan?.08:.14)+Math.sin(time*2)*.006, -sway*.04,0];
  p.Chest=[Math.sin(time*2)*.009, -sway*.085,0];
  p.Head=[-moving*.05,Math.sin(time*.6)*.025, -sway*.025];
  let height=-.013*moving+Math.cos(cycle*Math.PI*4)*mix(.018,.038,run)*moving;
  for (let i=0;i<2;i++) {
    const s=i?'R':'L', sign=i?-1:1, t=(cycle+i*.5)%1;
    const [hip,knee]=track([[0,-.48,.10],[.16,-.28,.19],[.48,.39,.10],[.62,.5,.66],[.80,-.57,1.12],[1,-.48,.10]],t);
    const stride=1+run*.65;
    p[`UpperLeg_${s}`]=[hip*stride*moving,0,sign*.025*moving];
    p[`Shin_${s}`]=[knee*(1+run*.35)*moving,0,0];
    // Stance foot counter-rotates its hip and knee; toe-off flexes the ankle.
    p[`Foot_${s}`]=[(t<.52?-(hip*stride+knee*(1+run*.35)): -.27)*moving,0,0];
    p[`UpperArm_${s}`]=[-hip*.72*moving,0,sign*.065];
    p[`Forearm_${s}`]=[-.15-run*.75-Math.max(0,hip)*moving*.3,0,0];
    p[`Hand_${s}`]=[0,0,sign*.07];
  }
  if(airborne) {
    p.Torso=[grapple?.42:.1,0,0]; p.Chest=[grapple?.22:0,0,0]; p.Head=[grapple?-.38:-.08,0,0];
    p.UpperLeg_L=[grapple?.22:-.65,0,-.06]; p.UpperLeg_R=[grapple?.44:-.23,0,.06];
    p.Shin_L=[grapple?.78:1.18,0,0]; p.Shin_R=[grapple?1.0:.72,0,0];
    p.UpperArm_L=[grapple?-1.1:-.45,0,-.5]; p.UpperArm_R=[grapple?-.85:-.38,0,.5];
    p.Forearm_L=[-.48,0,0]; p.Forearm_R=[-.62,0,0];
    height=0;
  }
  if(landing>0 && !airborne) {
    p.UpperLeg_L[0]-=landing*.48; p.UpperLeg_R[0]-=landing*.48;
    p.Shin_L[0]+=landing*.9; p.Shin_R[0]+=landing*.9;
    p.Foot_L[0]-=landing*.42; p.Foot_R[0]-=landing*.42;
    p.Torso[0]+=landing*.2; height-=landing*.12;
  }
  // Attack is elapsed normalized time: wind-up, contact, follow-through, recovery.
  if(attack>0 && attack<1) {
    const hand=combo%2?'R':'L', other=hand==='R'?'L':'R', sign=hand==='R'?1:-1;
    const [arm,elbow,twist,spread]=titan
      ? track([[0,.1,-.4,0,.1],[.26,.6,-1.65,.47,.26],[.52,-1.62,-.08,-.52,.10],[.68,-1.3,-.22,-.38,.10],[1,.1,-.4,0,.1]],attack)
      : track([[0,-.15,-.2,0,.1],[.28,-2.15,-.7,.62,.7],[.57,-.55,-.22,-1.0,-.6],[.75,.3,-.55,-.65,-.32],[1,-.15,-.2,0,.1]],attack);
    p[`UpperArm_${hand}`]=[arm,0,sign*spread]; p[`Forearm_${hand}`]=[elbow,0,0];
    p[`UpperArm_${other}`]=[titan?-.48:-1.1,0,-sign*.22]; p[`Forearm_${other}`]=[titan?-1.25:-.6,0,0];
    p.Chest=[titan?.08:.2,twist*sign*.7,0]; p.Torso=[.12,twist*sign*.3,0];
    p.Pelvis=[0,twist*sign*-.16,sign*.025]; p.Head=[-.08,-twist*sign*.45,0];
    if(!airborne) {p.UpperLeg_L[0]-=.16;p.UpperLeg_R[0]-=.16;p.Shin_L[0]+=.22;p.Shin_R[0]+=.22;height-=Math.sin(attack*Math.PI)*.045;}
  }
  if (!airborne) {
    const sole = s => 1.09 - .518 * Math.cos(p[`UpperLeg_${s}`][0])
      - .472 * Math.cos(p[`UpperLeg_${s}`][0] + p[`Shin_${s}`][0]) - .1;
    // Lower the pelvis to keep the supporting foot on the floor as knees flex.
    height = -Math.min(sole('L'), sole('R'));
    if (run > .5 && !attack) height += Math.max(0,Math.sin(cycle*Math.PI*4))*.025*run;
  }
  const capeLift=grapple?.5:moving*.16;
  p.Cape=[capeLift+Math.sin(time*6)*(.018+moving*.035),Math.sin(time*3.2)*.035,clamp(turn,-1,1)*.12];
  return {bones:p,height,lean:grapple?-.38:0,bank:grapple?clamp(turn,-.5,.5)*-.65:0,grip:titan?(attack>0?.95:.18):.6};
}
