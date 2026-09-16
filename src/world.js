import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPointSprites } from './point-sprites.js';

export function seededRandom(seed = 1945) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function texture(kind, seed) {
  const random = seededRandom(seed);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const base = kind === 'roof' ? [131, 66, 42] : kind === 'stone' ? [147, 141, 122] : kind === 'road' ? [99, 102, 93] : [191, 180, 148];
  ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, 512, 512);
  const bw = kind === 'roof' ? 32 : kind === 'plaster' ? 128 : 64;
  const bh = kind === 'roof' ? 25 : kind === 'plaster' ? 256 : 32;
  for (let y = -1; y < 512 / bh; y++) for (let x = -1; x < 512 / bw + 1; x++) {
    const v = (random() - .5) * 31, xx = x * bw + (y % 2) * bw / 2;
    ctx.fillStyle = `rgb(${base.map(c => Math.floor(c + v)).join(',')})`;
    ctx.fillRect(xx + 1, y * bh + 1, bw - 2, bh - 2);
    ctx.fillStyle = '#ffffff12'; ctx.fillRect(xx + 2, y * bh + 2, bw - 4, 2);
    ctx.fillStyle = '#00000025'; ctx.fillRect(xx + 2, y * bh + bh - 3, bw - 3, 2);
  }
  for (let i = 0; i < 27000; i++) {
    const v = random() > .5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${random() * .075})`;
    ctx.fillRect(random() * 512, random() * 512, random() * 3 + 1, random() * 3 + 1);
  }
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return map;
}

export function createWorld(scene) {
  const rand = seededRandom(4567), buildings = [], colliders = [], supplies = [], batches = new Map();
  const stone = texture('stone', 5), plaster = texture('plaster', 8), roof = texture('roof', 9), road = texture('road', 10);
  const mat = (color, map = null, extra = {}) => new THREE.MeshStandardMaterial({ color, map, roughness: .94, ...extra });
  const materials = {
    wall: mat(0xc0bbaa, stone), trim: mat(0x9b967d, stone), timber: mat(0x4c4234),
    roof: mat(0xddd0bc, roof), roofDark: mat(0x9c9a8d, roof), window: mat(0x263b3c, null, { roughness: .35, metalness: .15 }),
    glow: mat(0xc5ab70, null, { emissive: 0xb77b39, emissiveIntensity: .2 }), foliage: mat(0x536448), trunk: mat(0x5a4d36),
    iron: mat(0x454b43), cloth: mat(0x637462, null, { side: THREE.DoubleSide }), brick: mat(0x817962, stone),
    houses: [0xd8cbae, 0xc2bfa9, 0xdfd0b0, 0xc8bb9b, 0xb8b4a0].map(c => mat(c, plaster)),
  };
  const box = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
  function batch(geo, material, x, y, z, sx, sy, sz, ry = 0, rz = 0) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, ry, rz); dummy.updateMatrix();
    const transformed = geo.clone().applyMatrix4(dummy.matrix);
    // Four district quadrants balance useful culling against material draw-call overhead.
    const key = `${material.uuid}:${(x >= 0 ? 1 : 0)}:${(z >= 0 ? 1 : 0)}`;
    if (!batches.has(key)) batches.set(key, { material, geometries: [] });
    batches.get(key).geometries.push(transformed);
  }
  const cube = (material, x, y, z, sx, sy, sz, ry = 0, rz = 0) => batch(box, material, x, y, z, sx, sy, sz, ry, rz);
  road.repeat.set(45, 45);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480), mat(0xb1ac96, road));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Each house has a pitched tile roof, plasterwork, timber frame, glazed windows, and chimney.
  const roofShape = new THREE.Shape(); roofShape.moveTo(-.5, 0); roofShape.lineTo(.5, 0); roofShape.lineTo(0, 1); roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false }); roofGeometry.translate(0, 0, -.5);
  for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
    if (gx === 0 || gz === 0 || Math.hypot(gx * 28, gz * 28) > 94) continue;
    const x = gx * 28 + (rand() - .5) * 3, z = gz * 28 + (rand() - .5) * 3;
    const w = 15 + rand() * 5, d = 17 + rand() * 3, h = 11 + Math.floor(rand() * 4) * 3.8, rh = 5 + rand() * 2;
    buildings.push({ x, z, w, d, h, roofHeight: rh }); colliders.push({ x, z, w: w + .5, d: d + .5, h: h + rh * .55 });
    cube(materials.houses[Math.floor(rand() * 5)], x, h / 2, z, w, h, d);
    cube(materials.brick, x, 1, z, w + .3, 2, d + .3);
    batch(roofGeometry, rand() > .2 ? materials.roof : materials.roofDark, x, h, z, w + 1.6, rh, d + 1.6);
    cube(materials.timber, x, h + .04, z, w + .7, .3, d + .7);
    cube(materials.trim, x + w * .27, h + rh * .7, z - d * .26, 1.2, 4.8, 1.4);
    cube(materials.brick, x + w * .27, h + rh * .7 + 2.4, z - d * .26, 1.5, .3, 1.7);
    for (let floor = 3.6; floor < h - 1; floor += 3.8) {
      cube(materials.timber, x, floor - 1.6, z, w + .08, .15, d + .08);
      for (let wx = -w / 2 + 2.4; wx < w / 2 - 1; wx += 3.4) for (const side of [-1, 1]) {
        cube(materials.trim, x + wx, floor, z + side * (d / 2 + .04), 1.68, 2.3, .17);
        cube(rand() > .87 ? materials.glow : materials.window, x + wx, floor, z + side * (d / 2 + .15), 1.27, 1.85, .05);
        cube(materials.timber, x + wx, floor, z + side * (d / 2 + .19), .075, 1.85, .04);
        cube(materials.trim, x + wx, floor - 1.12, z + side * (d / 2 + .25), 1.9, .17, .43);
      }
      for (let wz = -d / 2 + 2.5; wz < d / 2 - 1; wz += 3.8) for (const side of [-1, 1]) {
        cube(materials.trim, x + side * (w / 2 + .06), floor, z + wz, .15, 2.3, 1.68);
        cube(materials.window, x + side * (w / 2 + .16), floor, z + wz, .05, 1.85, 1.27);
      }
    }
    for (const dx of [-w / 2 + .2, w / 2 - .2]) for (const dz of [-d / 2 - .02, d / 2 + .02]) cube(materials.timber, x + dx, h / 2, z + dz, .2, h, .17);
    cube(materials.timber, x, 1.6, z + d / 2 + .07, 1.8, 3.2, .15);
    cube(materials.trim, x, .18, z + d / 2 + .6, 2.5, .35, 1.3);
  }

  // Fifty-metre curtain wall and battlements surround the district.
  const radius = 112, segments = 52;
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const gateway = Math.abs(i - segments / 2) <= 1;
    cube(materials.wall, x, gateway ? 40 : 25, z, 14.3, gateway ? 20 : 50, 8, angle);
    cube(materials.trim, x, 47, z, 14.5, 1.1, 9.5, angle);
    cube(materials.trim, x, 37, z, 14.5, .6, 8.6, angle);
    cube(materials.trim, x, 50.1, z, 14.5, 1.1, 10, angle);
    for (let j = -1; j <= 1; j++) cube(materials.wall, x + Math.cos(angle) * j * 4.6, 52, z - Math.sin(angle) * j * 4.6, 2.5, 3.2, 9, angle);
    if (i % 4 === 0) cube(materials.trim, Math.sin(angle) * (radius - 6), 23, Math.cos(angle) * (radius - 6), 4, 46, 7, angle);
  }
  // Gatehouse and its portcullis, visible at the end of the central boulevard.
  for (const x of [-23, 23]) {
    cube(materials.wall, x, 30, -107, 14, 60, 18); cube(materials.trim, x, 60, -107, 16, 2, 20);
    for (let y = 8; y < 55; y += 8) cube(materials.window, x, y, -97.9, 2, 4, .15);
  }
  cube(materials.iron, 0, 14, -111, 29, 28, 1.5);
  for (let x = -14; x <= 14; x += 2) cube(materials.trim, x, 14, -108, .3, 28, .4);
  for (let y = 4; y <= 28; y += 4) cube(materials.trim, 0, y, -108, 29, .3, .4);

  // Street furnishings, poplars, timber carts, and a central fountain.
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10), crown = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 18; i++) {
    const z = -75 + i * 8.8, side = i % 2 ? 1 : -1, x = side * 13;
    batch(cylinder, materials.trunk, x, 2.4, z, .22, 4.8, .22);
    batch(crown, materials.foliage, x, 5.9, z, 1.5, 3.4 + rand(), 1.5);
    if (i % 3 === 0) {
      batch(cylinder, materials.iron, -x * .8, 2.6, z, .1, 5.2, .1);
      cube(materials.iron, -x * .8, 5.35, z, .9, .17, .9);
      cube(materials.glow, -x * .8, 4.95, z, .53, .65, .53);
    }
  }
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, .75, 32), materials.trim); basin.position.set(0, .38, 0); scene.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.6, 32), mat(0x6d9187, null, { metalness: .55, roughness: .2 })); water.rotation.x = -Math.PI / 2; water.position.set(0, .78, 0); scene.add(water);
  batch(cylinder, materials.trim, 0, 2, 0, .65, 4, .65);
  batch(new THREE.CylinderGeometry(1.8, .4, .6, 20), materials.trim, 0, 3.6, 0, 1, 1, 1);
  for (let i = 0; i < 12; i++) {
    const x = (rand() > .5 ? 1 : -1) * (9 + rand() * 2), z = (rand() - .5) * 150;
    cube(materials.timber, x, .7, z, 1 + rand(), 1.4, 1.2);
    cube(materials.trim, x, .75, z, 1.08, .1, 1.27);
  }
  for (const [x, z] of [[-11, 55], [57, 11], [-57, -11], [11, -75]]) {
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.6), mat(0x53624d)); crate.position.y = .75; crate.castShadow = true; group.add(crate);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xb3ebc5 });
    for (const [w, h] of [[.8, .17], [.17, .8]]) { const cross = new THREE.Mesh(new THREE.BoxGeometry(w, h, .02), crossMat); cross.position.set(0, .85, .811); group.add(cross); }
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, 12, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x99e5b3, transparent: true, opacity: .055, side: THREE.DoubleSide, depthWrite: false })); beacon.position.y = 7; group.add(beacon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, .045, 6, 40), crossMat); ring.rotation.x = Math.PI / 2; ring.position.y = .08; group.add(ring);
    scene.add(group); supplies.push({ x, z, group, ring });
  }

  // Distant ridgelines break up the skyline beyond the walls.
  const terrain = new THREE.PlaneGeometry(1800, 1800, 40, 40); terrain.rotateX(-Math.PI / 2);
  const vertices = terrain.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i), r = Math.hypot(x, z);
    const ramp = THREE.MathUtils.smoothstep(r, 300, 530);
    const hills = 50 + 45 * Math.sin(x * .011 + Math.cos(z * .008)) + 28 * Math.cos(z * .018 + x * .005) + 12 * Math.sin(x * .037 + z * .019);
    vertices.setY(i, Math.max(-3, ramp * hills - 3));
  }
  terrain.computeVertexNormals();
  const mountains = new THREE.Mesh(terrain, mat(0x687d6c)); mountains.receiveShadow = true; scene.add(mountains);
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = 256; cloudCanvas.height = 128;
  const cloudCtx = cloudCanvas.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 35 + rand() * 180, y = 40 + rand() * 48, radius = 18 + rand() * 35;
    const gradient = cloudCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, '#ffefdb4d'); gradient.addColorStop(1, '#ffefdb00'); cloudCtx.fillStyle = gradient; cloudCtx.fillRect(0, 0, 256, 128);
  }
  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudMap, transparent: true, opacity: .45, depthWrite: false, fog: true }));
    cloud.position.set(Math.sin(a) * 490, 115 + rand() * 75, Math.cos(a) * 490); cloud.scale.set(130 + rand() * 100, 34 + rand() * 24, 1); scene.add(cloud);
  }
  for (const { material, geometries } of batches.values()) {
    const merged = mergeGeometries(geometries, false); const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); geometries.forEach(g => g.dispose());
  }
  const dustPositions = new Float32Array(180 * 3);
  for (let i = 0; i < dustPositions.length; i += 3) { dustPositions[i] = (rand() - .5) * 180; dustPositions[i + 1] = rand() * 60; dustPositions[i + 2] = (rand() - .5) * 180; }
  const { mesh: dust } = createPointSprites(dustPositions, { color: 0xffe1ab, size: .11, transparent: true, opacity: .48, depthWrite: false }); scene.add(dust);
  return { buildings, colliders, supplies, dust, water, radius: 104, wallRadius: radius };
}
