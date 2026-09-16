import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCharacterAssets, createCharacter, animateCharacter } from './characters.js';

const canvas = document.getElementById('studio');
let renderer;
try {
  document.getElementById('status').textContent = 'Initializing graphics…';
  renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  await renderer.init();
} catch (error) {
  document.getElementById('status').textContent = 'Graphics could not start. Enable hardware acceleration and use a browser with WebGPU or WebGL 2 support on localhost or HTTPS.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x171d1e);
scene.fog = new THREE.Fog(0x171d1e, 7, 18);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, .04).texture;
scene.environmentIntensity = .55;
room.dispose(); pmrem.dispose();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .01, 50);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.minDistance = .25; controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI * .53;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x232c2c, roughness: .86 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -.012; floor.receiveShadow = true; scene.add(floor);
const grid=new THREE.GridHelper(200,200,0x50625a,0x33413c);grid.position.y=.001;scene.add(grid);
scene.add(new THREE.HemisphereLight(0xc0d6dd, 0x414039, .8));
const light = new THREE.DirectionalLight(0xffddbb, 3.2); light.position.set(-3, 5, 4); light.castShadow = true;
light.shadow.mapSize.set(2048, 2048); light.shadow.camera.left = light.shadow.camera.bottom = -3; light.shadow.camera.right = light.shadow.camera.top = 3; light.shadow.bias = -.0001;
scene.add(light);
scene.add(light.target);
const rim = new THREE.DirectionalLight(0xb6d5ff, 2.2); rim.position.set(3, 3, -2); scene.add(rim);
let activeAction, followZ=0;
let model, mixer, current = 'eren', motionName = 'walk_in_place', walking = true, motionTime = 0, wireframe = false, portrait = false, ready = false;
const models = new Map();
const data = {
  eren: ['Eren<br/>Yeager.', 'A Scout built for the front line. Layered canvas, weathered leather, twin blades, and fully modeled ODM equipment.'],
  'attack-titan': ['The Attack<br/>Titan.', 'The power within. A continuous sculpted body, exposed teeth, swept hair, and a weighted skeleton for close-range combat.'],
  'pure-titan': ['The Pure<br/>Titan.', 'A giant beyond the walls. Anatomical facial topology, textured skin, individually modeled teeth, and a complete bone rig.'],
};
function frameCamera() {
  light.position.z=4+followZ;light.target.position.z=followZ;floor.position.z=followZ;grid.position.z=Math.round(followZ);
  if (portrait) { controls.target.set(0, 2.15, 0); camera.position.set(.28, 2.21, -1.06); }
  else { controls.target.set(.35, 1.22, 0); camera.position.set(1.45, 1.92, -4.8); }
  camera.position.z+=followZ;controls.target.z+=followZ;
  controls.update();
}
function select(name) {
  if (!ready) return;
  if (model) { scene.remove(model.group); mixer?.stopAllAction(); }
  current = name; model = models.get(name); scene.add(model.group);
  document.querySelector('option[value="walk_root_motion"]').disabled=name!=='eren';
  if(name!=='eren' && motionName==='walk_root_motion') {
    motionName='walk_in_place';document.getElementById('motion').value=motionName;
  }
  mixer = new THREE.AnimationMixer(model.group);
  motionTime=0; followZ=0; model.group.position.set(0,0,0);
  setClip();
  document.getElementById('name').innerHTML = data[name][0];
  document.getElementById('description').textContent = data[name][1];
  document.querySelectorAll('[data-character]').forEach(button => button.classList.toggle('active', button.dataset.character === name));
  let triangles = 0, bones = new Set();
  model.group.traverse(object => {
    if (object.isMesh && object!==model.nape) {
      triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.wireframe = wireframe;
    }
    if (object.isBone) bones.add(object);
  });
  document.getElementById('stats').textContent = `${Math.round(triangles).toLocaleString()} TRIANGLES · ${bones.size} BONES`;
  model.nape.visible = false;
  frameCamera();
}
function setClip() {
  mixer?.stopAllAction(); if (!model) return;
  const clip=model.clips.find(c=>c.name===`${current}_${motionName}`) || model.clips.find(c=>c.name===`${current}_walk`);
  activeAction=clip ? mixer.clipAction(clip).reset().play() : null;
}
document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click', () => select(button.dataset.character)));
document.getElementById('animate').addEventListener('click', event => { walking = !walking; event.target.textContent = walking ? 'PAUSE MOTION' : 'PLAY MOTION'; event.target.classList.toggle('active', walking); });
document.getElementById('motion').addEventListener('change', event => { motionName = event.target.value; motionTime = 0; model.group.position.set(0,0,0); followZ=0; setClip(); frameCamera(); });
document.getElementById('portrait').addEventListener('click', event => { portrait = !portrait; event.target.textContent = portrait ? 'FULL CHARACTER' : 'FACE DETAIL'; frameCamera(); });
document.getElementById('wireframe').addEventListener('click', event => { wireframe = !wireframe; event.target.classList.toggle('active', wireframe); if (model) select(current); });
try {
  await loadCharacterAssets((loaded, total) => { document.getElementById('status').textContent = `Loading Blender models · ${loaded} / ${total}`; });
  models.set('eren', createCharacter()); models.set('attack-titan', createCharacter({ titan: true, attack: true })); models.set('pure-titan', createCharacter({ titan: true }));
  ready = true; select('eren');
  document.getElementById('status').textContent = 'Preparing graphics pipelines…';
  await renderer.compileAsync(scene, camera);
  document.getElementById('status').hidden = true;
} catch (error) { ready = false; document.getElementById('status').textContent = `Studio could not load: ${error.message}`; throw error; }
let last = performance.now();
renderer.setAnimationLoop(now => { const dt = Math.min((now - last) / 1000, .04); last = now; if (walking && model) {
  motionTime += dt;
  if ((motionName.startsWith('walk') || (current==='eren' && motionName==='run')) && activeAction) {
    const duration=activeAction.getClip().duration;
    activeAction.time=motionTime%duration; mixer.update(0);
    if(motionName==='walk_root_motion' && current==='eren') {
      model.group.position.z=-Math.floor(motionTime/duration)*1.3;
      const z=-motionTime/duration*1.3, delta=z-followZ; camera.position.z+=delta;controls.target.z+=delta;followZ=z;
      light.position.z=4+z;light.target.position.z=z;floor.position.z=z;grid.position.z=Math.round(z);
    }
  } else {
  const attacking = motionName === 'attack' && motionTime % 1.5 < .7;
  animateCharacter(model, motionTime, motionName === 'run' ? 14 : motionName === 'walk' ? 4 : 0,
    motionName === 'odm' || motionName === 'jump', attacking ? 1 - (motionTime % 1.5) / .7 : 0,
    { dt, grapple: motionName === 'odm', combo: Math.floor(motionTime / 1.5), turn: motionName === 'odm' ? Math.sin(motionTime) * .45 : 0 });
} } controls.update(); renderer.render(scene, camera); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.getStudioState = () => ({ backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2', ready, current, motionName, motionTime, walkClips: model?.clips.filter(c=>c.name.includes('walk')).map(c=>({name:c.name,duration:c.duration})), walking, wireframe, portrait, meshes: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles });
