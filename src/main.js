import './style.css';
import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld, seededRandom } from './world.js';
import { loadCharacterAssets, createCharacter, animateCharacter } from './characters.js';
import { createPointSprites } from './point-sprites.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const backgroundMusic = $('background-music');
backgroundMusic.volume = .4;
let renderer;
try {
  $('loading').querySelector('span').textContent = 'Initializing graphics…';
  renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  await renderer.init();
} catch (error) {
  $('loading').hidden = true; $('fatal').hidden = false;
  $('fatal-message').textContent = 'Graphics could not start. Enable hardware acceleration and open the game on localhost or HTTPS in a browser with WebGPU or WebGL 2 support.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xafb9af);
const environmentGenerator = new THREE.PMREMGenerator(renderer);
const materialEnvironment = new RoomEnvironment();
scene.environment = environmentGenerator.fromScene(materialEnvironment, .04).texture;
scene.environmentIntensity = .3;
materialEnvironment.dispose(); environmentGenerator.dispose();
scene.fog = new THREE.FogExp2(0xafb7a9, .0028);
const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .15, 1300);
const sky = new SkyMesh(); sky.scale.setScalar(1200); scene.add(sky);
sky.turbidity.value = 6;
sky.rayleigh.value = 1.45;
sky.mieCoefficient.value = .006;
sky.mieDirectionalG.value = .8;
sky.cloudCoverage.value = 0;
const sunPosition = new THREE.Vector3(-.65, .36, -.48).normalize();
sky.sunPosition.value.copy(sunPosition);
scene.add(new THREE.HemisphereLight(0xc7dbdf, 0x6b614e, 2));
const sun = new THREE.DirectionalLight(0xffdfaa, 3.6); sun.position.copy(sunPosition).multiplyScalar(180);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95; sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 430; sun.shadow.bias = -.0004; sun.shadow.normalBias = .12;
scene.add(sun); scene.add(sun.target);
try {
  $('loading').querySelector('span').textContent = 'Loading Blender character models…';
  await loadCharacterAssets((loaded, total) => {
    $('loading').querySelector('span').textContent = `Loading Blender character models · ${loaded} / ${total}`;
  });
} catch (error) {
  $('loading').hidden = true;
  $('fatal').hidden = false;
  $('fatal-message').textContent = 'The character models could not load. Check your connection and reload the game.';
  throw error;
}
const world = createWorld(scene);
const human = createCharacter(), attackTitan = createCharacter({ titan: true, attack: true });
attackTitan.group.scale.setScalar(7.4); attackTitan.group.visible = false; scene.add(human.group, attackTitan.group);
const titanSpawns = [[0, 24, 7.8], [-4, -44, 8.8], [57, 0, 7], [-57, 5, 6.1], [0, -78, 8.2], [56, 42, 7.1]];
const titans = titanSpawns.map(([x, z, scale], i) => {
  const model = createCharacter({ titan: true, variation: i });
  model.group.scale.setScalar(scale); model.group.position.set(x, 0, z); model.group.rotation.y = Math.PI + i * .7; scene.add(model.group);
  return { ...model, id: i, scale, spawn: new THREE.Vector3(x, 0, z), hp: 100, alive: true, cooldown: 2, death: 0, phase: i * 2, attackTime: 0, patrol: i % 2 ? 1 : -1 };
});

const player = { position: new THREE.Vector3(0, 0, 74), velocity: new THREE.Vector3(), health: 100, gas: 100, energy: 100, form: 'human', grounded: true, invulnerable: 0, attackTime: 0, attackCooldown: 0, jumps: 0, grapple: null, strike: null };
let mode = 'menu', yaw = 0, pitch = .2, elapsed = 0, menuTime = 0, kills = 0, notificationTime = 0, hudTime = 0, shake = 0, soundEnabled = false, audioContext, manualWasPlaying = false;
const keys = new Set(), forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3(), cameraTarget = new THREE.Vector3(), desiredCamera = new THREE.Vector3();
const lastCameraPlayer = player.position.clone();
const raycaster = new THREE.Raycaster(), rayBox = new THREE.Box3(), scratch = new THREE.Vector3(), map = $('minimap').getContext('2d');
const random = seededRandom(812);
const lines = [];
for (let i = 0; i < 2; i++) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc0c5b4, transparent: true, opacity: .85 })); line.frustumCulled = false; line.visible = false; scene.add(line); lines.push(line);
}
const particles = [], particleCount = 250;
const particlePositions = new Float32Array(particleCount * 3), particleColors = new Float32Array(particleCount * 3);
const particleSprites = createPointSprites(particlePositions, { colors: particleColors, dynamic: true, size: .45, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending });
particleSprites.update(0); scene.add(particleSprites.mesh);
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .022, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffc879, transparent: true, opacity: 0 })); ring.rotation.x = Math.PI / 2; scene.add(ring);
let ringLife = 0;
const lightning = new THREE.Group(); scene.add(lightning); let lightningLife = 0;

function sound(type) {
  if (!soundEnabled || !audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.connect(gain); gain.connect(audioContext.destination);
  const presets = { hook: [560, 120, .17, .05], slash: [240, 45, .2, .13], hit: [100, 25, .35, .18], transform: [50, 18, 1.5, .24], refill: [440, 880, .4, .07], kill: [360, 80, .5, .1], step: [45, 20, .16, .07] };
  const [start, end, duration, volume] = presets[type] || presets.hit;
  osc.type = type === 'refill' ? 'sine' : 'triangle'; osc.frequency.setValueAtTime(start, now); osc.frequency.exponentialRampToValueAtTime(end, now + duration);
  gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration); osc.start(); osc.stop(now + duration);
}
function enableSound() {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume();
    sound('refill');
    backgroundMusic.play().catch(error => {
      // Switching sound off while the file loads can cancel the play request.
      if (soundEnabled && error.name !== 'AbortError') notify('Music could not play. Toggle sound to try again.', 5);
    });
  } else {
    backgroundMusic.pause();
  }
  $('audio-label').textContent = soundEnabled ? 'SOUND ON' : 'SOUND OFF';
  $('audio-button').setAttribute('aria-label', soundEnabled ? 'Disable music and sound' : 'Enable music and sound');
  $('audio-button').setAttribute('aria-pressed', String(soundEnabled));
}
function notify(message, duration = 3) { $('notification').textContent = message; $('notification').classList.add('visible'); notificationTime = duration; }
function burst(position, color = 0xffc583, count = 40, force = 10, duration = 1) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    if (particles.length >= particleCount) particles.shift();
    particles.push({ p: position.clone(), v: new THREE.Vector3((random() - .5) * force, random() * force, (random() - .5) * force), color: c, life: duration * (.5 + random() * .5), total: duration });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; } p.p.addScaledVector(p.v, dt); p.v.y -= dt * 8; }
  for (let i = 0; i < particles.length; i++) { const p = particles[i]; particlePositions.set(p.p.toArray(), i * 3); const fade = Math.min(1, p.life / p.total * 2); particleColors.set([p.color.r * fade, p.color.g * fade, p.color.b * fade], i * 3); }
  particleSprites.update(particles.length);
  if (ringLife > 0) { ringLife -= dt; ring.scale.setScalar(2 + (1 - ringLife) * 38); ring.material.opacity = Math.max(0, ringLife * .8); }
  if (lightningLife > 0) { lightningLife -= dt; lightning.visible = Math.random() > .25; } else lightning.visible = false;
}
function transformationEffect() {
  burst(player.position.clone().add(new THREE.Vector3(0, 5, 0)), 0xffc16c, 160, 35, 2.3);
  ring.position.copy(player.position); ring.position.y += .2; ringLife = 1;
  for (const child of [...lightning.children]) { lightning.remove(child); child.geometry.dispose(); child.material.dispose(); }
  for (let j = 0; j < 5; j++) {
    const points = [];
    for (let i = 0; i < 12; i++) points.push(new THREE.Vector3(player.position.x + (random() - .5) * (i ? 12 : 0), player.position.y + i * 7, player.position.z + (random() - .5) * 12));
    lightning.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffe7a1 })));
  }
  lightningLife = .65; $('transform-flash').style.transition = 'none'; $('transform-flash').style.opacity = '.9';
  requestAnimationFrame(() => { $('transform-flash').style.transition = 'opacity 1.4s'; $('transform-flash').style.opacity = '0'; });
  shake = 1.3; sound('transform');
}
function transform() {
  if (mode !== 'playing') return;
  if (player.form === 'human') {
    if (player.energy < 35) { notify('Transformation needs 35% charge. Defeat Titans or visit a supply station.'); return; }
    player.form = 'titan'; player.velocity.multiplyScalar(.2); player.grounded = false; player.invulnerable = 2;
    human.group.visible = false; attackTitan.group.visible = true; document.body.classList.add('titan-form');
    notify('THE ATTACK TITAN · Click or F to punch. T to return to human form.', 5);
  } else {
    player.form = 'human'; player.position.y += 14; player.velocity.y = 8; player.grounded = false; player.invulnerable = 2;
    human.group.visible = true; attackTitan.group.visible = false; document.body.classList.remove('titan-form');
    notify('Human form restored. Keep moving, Eren.');
  }
  player.grapple = null; player.strike = null; transformationEffect(); updateHUD();
}

function resetGame() {
  player.position.set(0, 0, 74); player.velocity.set(0, 0, 0); player.health = player.gas = player.energy = 100;
  player.form = 'human'; player.grounded = true; player.invulnerable = 3; player.jumps = 0; player.grapple = player.strike = player.pendingPunch = null; player.combo = 0; player.attackTime = player.attackCooldown = 0;
  yaw = 0; pitch = .22; elapsed = kills = 0; keys.clear(); particles.length = 0;
  human.group.visible = true; attackTitan.group.visible = false; document.body.classList.remove('titan-form');
  for (const t of titans) { t.hp = 100; t.alive = true; t.death = 0; t.cooldown = 3; t.attackTime = 0; t.group.position.copy(t.spawn); t.group.rotation.set(0, Math.PI + t.id * .7, 0); t.group.scale.setScalar(t.scale); t.group.visible = true; }
  $('pause-title').textContent = 'The battle can wait.'; $('pause-copy').textContent = 'Your expedition is paused.'; $('resume').hidden = false;
  updateHUD();
}
function requestMouse() {
  document.activeElement?.blur();
  try { const result = canvas.requestPointerLock?.(); result?.catch(() => {}); } catch { /* Arrow keys provide a camera fallback. */ }
}
function deploy() {
  resetGame(); mode = 'playing'; document.body.classList.add('playing');
  $('menu').hidden = $('menu-portrait').hidden = $('menu-footer').hidden = $('pause').hidden = true; $('hud').hidden = false;
  camera.position.set(0, 5, 86); camera.lookAt(0, 2, 65); requestMouse();
  lastCameraPlayer.copy(player.position);
  notify('TROST HAS BEEN BREACHED · Use E to grapple. T unleashes the Attack Titan.', 7);
}
function pauseGame() {
  if (mode !== 'playing') return; mode = 'paused'; keys.clear(); player.grapple = null; $('pause').hidden = false;
  document.exitPointerLock?.();
}
function resumeGame() { if (mode !== 'paused') return; mode = 'playing'; $('pause').hidden = true; requestMouse(); }
function endGame(won) {
  mode = won ? 'won' : 'lost'; keys.clear(); player.grapple = null; document.exitPointerLock?.();
  $('pause-title').textContent = won ? 'Trost stands. Because of you.' : 'Rise again, Eren.';
  $('pause-copy').textContent = won ? `All ${titans.length} Titans eliminated in ${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s. Humanity lives to see another day.` : `${kills} of ${titans.length} Titans eliminated. Use rooftops to stay safe, and visit green supply stations to recover.`;
  $('resume').hidden = true; $('pause').hidden = false;
}
function openManual() {
  manualWasPlaying = mode === 'playing';
  if (manualWasPlaying) pauseGame(); $('manual').hidden = false;
}
function closeManual() { $('manual').hidden = true; if (manualWasPlaying) resumeGame(); manualWasPlaying = false; }
$('deploy').addEventListener('click', deploy); $('resume').addEventListener('click', resumeGame); $('restart').addEventListener('click', deploy);
$('return-menu').addEventListener('click', () => { mode = 'menu'; $('pause').hidden = $('hud').hidden = true; $('menu').hidden = $('menu-portrait').hidden = $('menu-footer').hidden = false; document.body.classList.remove('playing', 'titan-form'); resetGame(); });
$('audio-button').addEventListener('click', enableSound); $('help-button').addEventListener('click', openManual); $('close-manual').addEventListener('click', closeManual);
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement && (event.code === 'Space' || event.code === 'Enter')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Escape' && !$('manual').hidden) { closeManual(); return; }
  if (event.code === 'KeyP' || event.code === 'Escape') { if (mode === 'playing') pauseGame(); else if (mode === 'paused') resumeGame(); return; }
  if (mode !== 'playing') return;
  keys.add(event.code); if (event.repeat) return;
  if (event.code === 'Space') jump();
  if (event.code === 'KeyT') transform();
  if (event.code === 'KeyF') attack();
  if (event.code === 'KeyR') resupply();
  if (event.code === 'KeyE') startGrapple();
});
window.addEventListener('keyup', event => { keys.delete(event.code); if (event.code === 'KeyE') player.grapple = null; });
canvas.addEventListener('mousedown', event => { if (mode !== 'playing') return; if (document.pointerLockElement !== canvas) requestMouse(); if (event.button === 0) attack(); if (event.button === 2) { keys.add('MouseRight'); startGrapple(); } });
window.addEventListener('mouseup', event => { if (event.button === 2) { keys.delete('MouseRight'); player.grapple = null; } });
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('mousemove', event => { if (mode === 'playing' && document.pointerLockElement === canvas) { yaw -= event.movementX * .0022; pitch = THREE.MathUtils.clamp(pitch + event.movementY * .0017, -.6, 1.12); } });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && mode === 'playing') pauseGame(); });
window.addEventListener('blur', () => { keys.clear(); if (mode === 'playing') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pauseGame(); });

function jump() {
  if (player.form === 'titan') { if (player.grounded) { player.velocity.y = 22; player.grounded = false; burst(player.position, 0xbaa58a, 35, 12, .8); } return; }
  if (player.grounded || (player.jumps < 2 && player.gas >= 8)) {
    if (!player.grounded) { player.gas -= 8; burst(player.position, 0xd5e0d6, 15, 4, .5); }
    player.velocity.y = player.grounded ? 12 : 17; player.grounded = false; player.jumps++; sound('hook');
  }
}
function getTarget(maxDistance = 100, wide = false) {
  let best = null, bestScore = Infinity; const view = camera.getWorldDirection(new THREE.Vector3());
  for (const t of titans) {
    if (!t.alive) continue;
    const target = t.group.position.clone().add(new THREE.Vector3(0, t.scale * 1.94, 0));
    const distance = target.distanceTo(player.position); if (distance > maxDistance) continue;
    const dir = target.clone().sub(camera.position).normalize(), alignment = dir.dot(view);
    const horizontalDir = t.group.position.clone().sub(player.position); horizontalDir.y = 0; horizontalDir.normalize();
    const facing = horizontalDir.dot(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)));
    if (alignment < (wide ? .58 : .87) && facing < (wide ? .6 : .94)) continue;
    const score = distance * .3 + (1 - alignment) * 90;
    if (score < bestScore) { bestScore = score; best = { titan: t, point: target, distance }; }
  }
  return best;
}
function startGrapple() {
  if (player.form !== 'human' || player.gas <= 2 || mode !== 'playing') return;
  const target = getTarget(100, true);
  if (target) { player.grapple = { titan: target.titan, point: target.point }; sound('hook'); return; }
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); let nearest = 125, point = null;
  for (const b of world.colliders) {
    rayBox.min.set(b.x - b.w / 2, 0, b.z - b.d / 2); rayBox.max.set(b.x + b.w / 2, b.h, b.z + b.d / 2);
    const hit = raycaster.ray.intersectBox(rayBox, new THREE.Vector3());
    if (hit && player.position.distanceTo(hit) < nearest) { nearest = player.position.distanceTo(hit); point = hit; point.y = Math.max(point.y, b.h + 1.5); }
  }
  if (!point) {
    const view = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); let score = Infinity;
    for (const b of world.colliders) {
      const p = new THREE.Vector3(b.x, b.h + 2, b.z), dir = p.clone().sub(player.position), dist = dir.length();
      dir.y = 0; dir.normalize(); const alignment = dir.dot(view), currentScore = dist + (1 - alignment) * 85;
      if (dist < 95 && dist > 7 && alignment > .35 && currentScore < score) { score = currentScore; point = p; }
    }
  }
  if (point) { player.grapple = { point }; sound('hook'); } else notify('No anchor in reach. Aim toward a rooftop or Titan.');
}
function attack() {
  if (mode !== 'playing' || player.attackCooldown > 0) return;
  player.combo = (player.combo || 0) + 1;
  player.attackTime = .48; player.attackCooldown = player.form === 'titan' ? .7 : .55;
  const isTitan = player.form === 'titan'; if (!isTitan) sound('slash');
  const target = getTarget(isTitan ? 24 : 46, true);
  if (!target) { notify(isTitan ? 'Move closer and face a Titan to land a punch.' : 'Face a Titan and grapple closer. Strike within 46 m.', 1.8); return; }
  if (isTitan) {
    const distance = Math.hypot(target.titan.group.position.x - player.position.x, target.titan.group.position.z - player.position.z);
    if (distance < 20 && Math.abs(target.titan.group.position.y - player.position.y) < 18) {
      player.pendingPunch = { titan: target.titan, remaining: .25 };
    } else notify('Close the distance. Punch within 20 m.', 1.5);
  } else {
    if (player.gas < 6) { notify('ODM gas depleted. Visit a green supply station.'); return; }
    player.gas -= 6; player.invulnerable = .9; player.grapple = null;
    const behind = new THREE.Vector3(Math.sin(target.titan.group.rotation.y), 0, Math.cos(target.titan.group.rotation.y)).multiplyScalar(target.titan.scale * .35);
    const end = target.point.clone().add(behind);
    // Strike paths use the same building collision check as movement; solid masonry blocks a dash.
    const direction = end.clone().sub(player.position), distance = direction.length(); const strikeRay = new THREE.Ray(player.position.clone().add(new THREE.Vector3(0, 1, 0)), direction.normalize());
    for (const b of world.colliders) {
      rayBox.min.set(b.x - b.w / 2, 0, b.z - b.d / 2); rayBox.max.set(b.x + b.w / 2, b.h - 1, b.z + b.d / 2);
      const hit = strikeRay.intersectBox(rayBox, scratch);
      if (hit && hit.distanceTo(player.position) < distance - 3) { notify('Your strike is blocked. Grapple above the rooftops.'); return; }
    }
    player.strike = { titan: target.titan, from: player.position.clone(), to: end, time: 0 }; player.grounded = false;
  }
}
function killTitan(t) {
  if (!t.alive) return; t.alive = false; t.hp = 0; t.death = 0; kills++;
  player.energy = Math.min(100, player.energy + (player.form === 'human' ? 18 : 4));
  player.gas = Math.min(100, player.gas + 6);
  burst(t.group.position.clone().add(new THREE.Vector3(0, t.scale * 1.8, 0)), 0xffdeab, 60, 14, 1.8);
  sound('kill'); shake = .55; notify(`${player.form === 'human' ? 'NAPE STRIKE' : 'TITAN ELIMINATED'} · ${kills} / ${titans.length} eliminated`, 3);
  if (kills === titans.length) endGame(true);
}
function damage(amount) {
  if (player.invulnerable > 0 || mode !== 'playing') return;
  player.health = Math.max(0, player.health - amount * (player.form === 'titan' ? .45 : 1)); player.invulnerable = 1.6; shake = .65;
  $('damage-flash').style.opacity = '.8'; setTimeout(() => $('damage-flash').style.opacity = '0', 260); sound('hit');
  if (player.health <= 0) endGame(false);
}
function resupply() {
  if (world.supplies.some(s => Math.hypot(s.x - player.position.x, s.z - player.position.z) < 11 && player.position.y < 6)) {
    player.health = player.gas = 100; player.energy = 100; sound('refill'); burst(player.position, 0xa3eac0, 40, 6, 1); notify('RESUPPLIED · Health, ODM gas, and transformation charge restored.');
  } else notify('Move within 11 m of a green supply station, then press R.');
}

function resolvePosition(position, previous, radius, height, canLand = true) {
  let floor = 0;
  for (const b of world.colliders) {
    const dx = position.x - b.x, dz = position.z - b.z, ex = b.w / 2 + radius, ez = b.d / 2 + radius;
    if (Math.abs(dx) >= ex || Math.abs(dz) >= ez) continue;
    if (canLand && previous.y >= b.h - .7) { floor = Math.max(floor, b.h); continue; }
    if (position.y >= b.h || position.y + height <= 0) continue;
    const px = ex - Math.abs(dx), pz = ez - Math.abs(dz);
    if (px < pz) position.x = b.x + (dx >= 0 ? ex : -ex); else position.z = b.z + (dz >= 0 ? ez : -ez);
  }
  const distance = Math.hypot(position.x, position.z);
  if (distance > world.radius) { position.x *= world.radius / distance; position.z *= world.radius / distance; }
  return floor;
}
function updatePlayer(dt) {
  const isTitan = player.form === 'titan';
  if (player.pendingPunch) {
    const punch = player.pendingPunch; punch.remaining -= dt;
    if (punch.remaining <= 0) {
      const t = punch.titan;
      if (isTitan && t.alive && t.group.position.distanceTo(player.position) < 20) {
        t.hp -= 52; t.cooldown = 1.3; shake = .42; sound('hit');
        burst(t.group.position.clone().add(new THREE.Vector3(0, t.scale * 1.45, 0)), 0xffca91, 35, 15, .8);
        if (t.hp <= 0) killTitan(t); else notify('DIRECT HIT · Strike again to finish the Titan.', 1.4);
      }
      player.pendingPunch = null;
    }
  }
  if (keys.has('ArrowLeft')) yaw += dt * 1.7; if (keys.has('ArrowRight')) yaw -= dt * 1.7;
  if (keys.has('ArrowUp')) pitch = Math.max(-.6, pitch - dt); if (keys.has('ArrowDown')) pitch = Math.min(1.12, pitch + dt);
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw)); move.set(0, 0, 0);
  if (keys.has('KeyW')) move.add(forward); if (keys.has('KeyS')) move.sub(forward); if (keys.has('KeyD')) move.add(right); if (keys.has('KeyA')) move.sub(right); move.normalize();
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight'), speed = isTitan ? (sprint ? 23 : 15) : (sprint ? 8 : 1.3);
  const previous = player.position.clone();
  if (player.strike) {
    const s = player.strike; s.time += dt; const progress = Math.min(1, s.time / .32);
    player.position.lerpVectors(s.from, s.to, 1 - Math.pow(1 - progress, 2));
    if (progress >= 1) { killTitan(s.titan); player.strike = null; player.velocity.copy(forward).multiplyScalar(13); player.velocity.y = 10; }
  } else {
    if (player.grapple && player.gas > 0) {
      if (player.grapple.titan) { if (!player.grapple.titan.alive) player.grapple = null; else player.grapple.point.copy(player.grapple.titan.group.position).add(new THREE.Vector3(0, player.grapple.titan.scale * 1.94, 0)); }
      if (player.grapple) {
        const direction = player.grapple.point.clone().sub(player.position), distance = direction.length();
        if (distance > 2.7) {
          const pull = direction.normalize().multiplyScalar(sprint ? 47 : 35); player.velocity.lerp(pull, 1 - Math.exp(-dt * 6)); player.velocity.addScaledVector(move, dt * 20);
          player.grounded = false; player.gas = Math.max(0, player.gas - dt * (sprint ? 10 : 6));
          if (Math.random() < .5) burst(player.position, 0xd8e1da, 2, 2, .4);
        } else { player.velocity.multiplyScalar(.6); player.grapple = null; }
      }
    } else {
      player.grapple = null;
      const friction = 1 - Math.exp(-dt * (player.grounded ? 12 : 2.7));
      player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, move.x * speed, friction);
      player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, move.z * speed, friction);
      player.velocity.y -= dt * (isTitan ? 33 : 27);
      if (player.grounded) player.gas = Math.min(100, player.gas + dt * 1.2);
    }
    player.position.addScaledVector(player.velocity, dt);
    const floor = resolvePosition(player.position, previous, isTitan ? 2.8 : .45, isTitan ? 16 : 2.2);
    if (player.position.y <= floor && player.velocity.y <= 0) {
      if (!player.grounded && player.velocity.y < -15) { burst(player.position, 0xc6baa1, isTitan ? 45 : 10, isTitan ? 15 : 4, .6); if (isTitan) shake = .4; }
      player.position.y = floor; player.velocity.y = 0; player.grounded = true; player.jumps = 0;
    } else player.grounded = false;
  }
  player.invulnerable = Math.max(0, player.invulnerable - dt); player.attackTime = Math.max(0, player.attackTime - dt); player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  if (isTitan) { player.energy = Math.max(0, player.energy - dt * (100 / 45)); if (player.energy <= 0) transform(); }
  else player.energy = Math.min(100, player.energy + dt * .6);
  const model = player.form === 'titan' ? attackTitan : human;
  model.group.position.copy(player.position);
  const flying=!!player.grapple || !!player.strike || !player.grounded;
  const angle = flying ? Math.hypot(player.velocity.x,player.velocity.z)>.4 ? Math.atan2(-player.velocity.x,-player.velocity.z) : model.group.rotation.y : move.lengthSq() > 0 ? Math.atan2(-move.x, -move.z) : yaw;
  const turn = THREE.MathUtils.euclideanModulo(angle - model.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
  model.group.rotation.y += turn * (1 - Math.exp(-dt * (flying?7:12)));
  animateCharacter(model, elapsed, Math.hypot(player.velocity.x, player.velocity.z), !player.grounded, player.attackTime / .48, { dt, distanceTraveled: Math.hypot(player.position.x-previous.x,player.position.z-previous.z), grapple: !!player.grapple || !!player.strike, verticalSpeed: player.velocity.y, turn, combo: player.combo || 0 });
  if (player.grapple) {
    lines.forEach((line, i) => { line.visible = true; const positions = line.geometry.attributes.position;
      positions.setXYZ(0, player.position.x + (i ? .35 : -.35), player.position.y + 1, player.position.z); positions.setXYZ(1, player.grapple.point.x + (i ? .2 : -.2), player.grapple.point.y, player.grapple.point.z); positions.needsUpdate = true;
    });
  } else lines.forEach(line => line.visible = false);
}

function updateTitans(dt, preview = false) {
  for (const t of titans) {
    if (!t.alive) {
      t.death += dt;
      t.group.rotation.x = Math.min(Math.PI / 2, t.death * .8); t.group.position.y = -Math.max(0, t.death - 2) * 2;
      if (t.death < 4 && Math.random() > .6) burst(t.group.position.clone().add(new THREE.Vector3(0, 4, 0)), 0xd3c7ae, 3, 4, 1.4);
      if (t.death > 7) t.group.visible = false; continue;
    }
    const position = t.group.position, toPlayer = player.position.clone().sub(position); toPlayer.y = 0; const distance = toPlayer.length();
    let movingSpeed = 0;
    if (!preview) {
      t.cooldown -= dt; t.attackTime = Math.max(0, t.attackTime - dt);
      const range = player.form === 'titan' ? 11 : 5;
      if (distance < range && player.position.y < t.scale * 2.1) {
        t.group.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z);
        if (t.cooldown <= 0) { t.cooldown = 2.8; t.attackTime = .7; }
        if (t.attackTime > .27 && t.attackTime < .43) damage(22 + t.scale);
      } else {
        const chase = distance < 92, direction = chase ? toPlayer.normalize() : new THREE.Vector3(Math.sin(t.id * 2 + elapsed * .045) * .25, 0, t.patrol).normalize();
        movingSpeed = chase ? 3.1 + t.scale * .14 : 1.2;
        const previous = position.clone(); position.addScaledVector(direction, dt * movingSpeed);
        resolvePosition(position, previous, t.scale * .32, t.scale * 2.3, false);
        if (position.distanceTo(previous) < dt * movingSpeed * .2) { const tangent = new THREE.Vector3(direction.z, 0, -direction.x); position.addScaledVector(tangent, dt * movingSpeed); resolvePosition(position, previous, t.scale * .32, t.scale * 2.3, false); }
        const angle = Math.atan2(-direction.x, -direction.z), diff = THREE.MathUtils.euclideanModulo(angle - t.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        t.group.rotation.y += diff * Math.min(1, dt * 2);
        if (Math.abs(position.z) > 82) t.patrol *= -1;
      }
    }
    animateCharacter(t, (preview ? menuTime : elapsed) + t.phase, preview ? 1.8 : movingSpeed, false, t.attackTime / .7, { dt, scale: t.scale });
    t.nape.material.opacity = .6 + Math.sin(elapsed * 4) * .25;
  }
}

function updateCamera(dt) {
  if (mode === 'menu') {
    const a = Math.sin(menuTime * .035) * .08;
    camera.position.set(61 + Math.sin(a) * 35, 43 + Math.sin(menuTime * .06) * 2, 72 + Math.cos(a) * 3);
    camera.lookAt(-14, 17, -38); return;
  }
  const titan = player.form === 'titan', distance = titan ? 32 : player.grapple ? 11 : 8;
  // Follow displacement before damping the camera offset so fast ODM movement
  // cannot make the camera lag through the character or surge on release.
  camera.position.add(scratch.copy(player.position).sub(lastCameraPlayer));lastCameraPlayer.copy(player.position);
  cameraTarget.copy(player.position); cameraTarget.y += titan ? 12 : 1.8;
  desiredCamera.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance + (titan ? 2 : 1), Math.cos(yaw) * Math.cos(pitch) * distance).add(cameraTarget);
  // Keep the third-person camera in front of walls when backing into a building.
  const direction = desiredCamera.clone().sub(cameraTarget), maxDistance = direction.length(); direction.normalize();
  const cameraRay = new THREE.Ray(cameraTarget, direction); let cameraDistance = maxDistance;
  for (const b of world.colliders) {
    rayBox.min.set(b.x - b.w / 2 - .2, 0, b.z - b.d / 2 - .2); rayBox.max.set(b.x + b.w / 2 + .2, b.h, b.z + b.d / 2 + .2);
    const hit = cameraRay.intersectBox(rayBox, scratch); if (hit) cameraDistance = Math.min(cameraDistance, Math.max(.8, hit.distanceTo(cameraTarget) - .5));
  }
  desiredCamera.copy(cameraTarget).addScaledVector(direction, cameraDistance); desiredCamera.y = Math.max(.6, desiredCamera.y);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 7));
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - dt * 2); }
  camera.lookAt(cameraTarget);
  const targetFov = player.grapple ? 69 : titan ? 64 : 59;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 3); camera.updateProjectionMatrix();
  sun.position.copy(player.position).addScaledVector(sunPosition, 180); sun.target.position.copy(player.position);
}
function drawMap() {
  const w = 210, h = 180, scale = .72;
  map.clearRect(0, 0, w, h); map.fillStyle = '#23322e'; map.fillRect(0, 0, w, h);
  map.strokeStyle = '#88917c24'; map.lineWidth = .5;
  for (let x = 0; x < w; x += 21) { map.beginPath(); map.moveTo(x, 0); map.lineTo(x, h); map.stroke(); }
  for (let y = 0; y < h; y += 20) { map.beginPath(); map.moveTo(0, y); map.lineTo(w, y); map.stroke(); }
  map.save(); map.translate(w / 2, h / 2);
  map.strokeStyle = '#b7b499'; map.lineWidth = 2; map.beginPath(); map.arc(0, 0, world.wallRadius * scale, 0, Math.PI * 2); map.stroke();
  map.fillStyle = '#88927a60';
  for (const b of world.buildings) map.fillRect((b.x - b.w / 2) * scale, (b.z - b.d / 2) * scale, b.w * scale, b.d * scale);
  for (const s of world.supplies) { map.fillStyle = '#99d4ae'; map.fillRect(s.x * scale - 2, s.z * scale - 2, 4, 4); }
  for (const t of titans) if (t.alive) { map.fillStyle = '#e59b7b'; map.beginPath(); map.arc(t.group.position.x * scale, t.group.position.z * scale, 2.5, 0, Math.PI * 2); map.fill(); }
  map.translate(player.position.x * scale, player.position.z * scale); map.rotate(-yaw);
  map.fillStyle = '#fff1c7'; map.shadowColor = '#ffe1a5'; map.shadowBlur = 7; map.beginPath(); map.moveTo(0, -5); map.lineTo(-3.5, 4); map.lineTo(0, 2); map.lineTo(3.5, 4); map.closePath(); map.fill(); map.restore();
  map.fillStyle = '#d4d5bd'; map.font = '8px Arial'; map.fillText('N', w / 2 - 3, 9);
}
function updateHUD() {
  $('health-bar').style.width = `${player.health}%`; $('health-value').textContent = Math.ceil(player.health);
  $('gas-bar').style.width = `${player.gas}%`; $('gas-value').textContent = Math.floor(player.gas);
  $('titan-bar').style.width = `${player.energy}%`;
  $('titan-value').textContent = player.form === 'titan' ? `${Math.ceil(player.energy * .45)}s` : player.energy >= 35 ? 'READY' : `${Math.floor(player.energy)}%`;
  $('transform-label').textContent = player.form === 'titan' ? 'RETURN TO HUMAN' : 'TITAN TRANSFORMATION';
  $('form-name').textContent = player.form === 'titan' ? 'THE ATTACK TITAN' : 'EREN YEAGER'; $('form-badge').textContent = player.form.toUpperCase();
  $('kill-count').textContent = `${kills} / ${titans.length}`; $('remaining-label').textContent = `${titans.length - kills} HOSTILES`;
  $('speed').firstElementChild.textContent = String(Math.round(Math.hypot(player.velocity.x, player.velocity.z) * 3.6)).padStart(2, '0');
  const headings = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE']; $('heading').textContent = headings[THREE.MathUtils.euclideanModulo(Math.round(yaw / (Math.PI / 4)), 8)];
  const target = getTarget(110, true); $('crosshair').classList.toggle('targeted', !!target);
  $('target-label').textContent = target ? `${target.titan.hp < 100 ? 'WOUNDED TITAN' : 'TITAN'} · ${Math.round(target.distance)} m${player.form === 'human' ? ' / E GRAPPLE' : ' / CLICK PUNCH'}` : '';
  drawMap();
}

window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let lastTime = performance.now(), frameCount = 0, frameTotal = 0, averageFrame = 16.7, shadowTime = 0;
sun.shadow.autoUpdate = false;
document.addEventListener('visibilitychange', () => { lastTime = performance.now(); });
function frame(now) {
  const rawDt = Math.min((now - lastTime) / 1000, .25); lastTime = now;
  if (document.hidden) return;
  const dt = Math.min(rawDt, .05);
  if (mode === 'paused' || mode === 'won' || mode === 'lost') return;
  if (mode === 'menu') { menuTime += dt; updateTitans(dt, true); human.group.visible = false; attackTitan.group.visible = false; }
  if (mode === 'playing') {
    elapsed += dt; updatePlayer(dt); if (mode === 'playing') updateTitans(dt);
    notificationTime -= dt; if (notificationTime <= 0) $('notification').classList.remove('visible');
    hudTime += dt; if (hudTime > .1) { updateHUD(); hudTime = 0; }
  }
  if (mode === 'playing' || mode === 'menu') {
    updateParticles(dt); updateCamera(dt); world.dust.rotation.y += dt * .003;
    world.supplies.forEach(s => { s.ring.material.opacity = .7 + Math.sin(now * .002) * .3; });
  }
  // Reuse the shadow map between 30 Hz updates; use raw frame time for adaptation.
  shadowTime += rawDt;
  sun.shadow.needsUpdate = shadowTime >= 1 / 30;
  if (sun.shadow.needsUpdate) shadowTime = 0;
  renderer.render(scene, camera);
  averageFrame += (rawDt * 1000 - averageFrame) * .035;
  if (++frameCount > 90) frameTotal += rawDt;
  if (frameCount >= 210) {
    if (frameTotal / 120 > .023 && renderer.getPixelRatio() > .75) renderer.setPixelRatio(Math.max(.75, renderer.getPixelRatio() - .15));
    frameCount = 90; frameTotal = 0;
  }
}
updateCamera(.016); sun.shadow.needsUpdate = true;
try {
  $('loading').querySelector('span').textContent = 'Preparing graphics pipelines…';
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
} catch (error) {
  $('loading').hidden = true; $('fatal').hidden = false;
  $('fatal-message').textContent = 'The scene could not render. Check hardware acceleration and reload the game.';
  throw error;
}
lastTime = performance.now();
renderer.setAnimationLoop(frame);
$('loading').style.opacity = '0'; setTimeout(() => $('loading').hidden = true, 700);

// A read-only snapshot for smoke tests and browser diagnostics.
window.getGameState = () => ({ mode, form: player.form, health: player.health, gas: Math.round(player.gas), energy: Math.round(player.energy), kills, position: player.position.toArray().map(v => +v.toFixed(2)), velocity: player.velocity.toArray().map(v => +v.toFixed(2)), grapple: !!player.grapple, grounded: player.grounded, elapsed: Math.round(elapsed), titans: titans.filter(t => t.alive).map(t => ({ id: t.id, hp: t.hp, position: t.group.position.toArray().map(v => +v.toFixed(1)) })), world: { buildings: world.buildings.length, diameter: world.wallRadius * 2 }, render: { backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2', frameMs: +averageFrame.toFixed(1), pixelRatio: renderer.getPixelRatio(), shadowSize: sun.shadow.mapSize.x, calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles } });

// Development-only rig diagnostics for repeatable movement regression checks.
if(import.meta.env.DEV)window.__motionDebug={human,scene,camera,renderer,player};
