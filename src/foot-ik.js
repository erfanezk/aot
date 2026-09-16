import {Vector3,Quaternion} from 'three';
const a=new Vector3(),b=new Vector3(),c=new Vector3(),axis=new Vector3(),pole=new Vector3(),knee=new Vector3();
const u=new Vector3(),v=new Vector3(),q=new Quaternion(),parentQ=new Quaternion(),delta=new Quaternion();
function worldRotation(bone,rotation) {
 bone.parent.getWorldQuaternion(parentQ).invert();bone.quaternion.copy(parentQ).multiply(rotation);bone.updateWorldMatrix(false,true);
}
function aim(bone,child,target) {
 bone.getWorldPosition(u);child.getWorldPosition(v);v.sub(u).normalize();u.subVectors(target,u).normalize();
 delta.setFromUnitVectors(v,u);bone.getWorldQuaternion(q);q.premultiply(delta);worldRotation(bone,q);
}
/** Solve a planted ankle in world space; keep the animated knee's bend plane. */
export function solveFoot(upper,lower,foot,target,orientation) {
 upper.getWorldPosition(a);lower.getWorldPosition(b);foot.getWorldPosition(c);
 const l1=a.distanceTo(b),l2=b.distanceTo(c);
 axis.copy(target).sub(a);const distance=Math.max(.001,Math.min(axis.length(),l1+l2-.0005));axis.normalize();
 pole.copy(b).sub(a);pole.addScaledVector(axis,-pole.dot(axis));
 if(pole.lengthSq()<1e-8) pole.set(0,0,1).addScaledVector(axis,-axis.z);
 pole.normalize();
 const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
 knee.copy(a).addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
 aim(upper,lower,knee);aim(lower,foot,target);worldRotation(foot,orientation);
}
export function updateFootContacts(model,phase,contact={start:.12,end:.46}) {
 model.group.updateMatrixWorld(true);
 model.motion.contacts ||= {};
 for(const [i,side] of ['L','R'].entries()) {
  const t=(phase+i*.5)%1, foot=model.motionBones[`Foot_${side}`];
  if(t<contact.start || t>contact.end) {delete model.motion.contacts[side];continue;}
  const position=foot.getWorldPosition(new Vector3()),orientation=foot.getWorldQuaternion(new Quaternion());
  let anchor=model.motion.contacts[side];
  if(!anchor || anchor.position.distanceTo(position)>.22 || anchor.orientation.angleTo(orientation)>.7) {
   anchor={position,orientation};model.motion.contacts[side]=anchor;
  }
  solveFoot(model.motionBones[`UpperLeg_${side}`],model.motionBones[`Shin_${side}`],foot,anchor.position,anchor.orientation);
 }
}
