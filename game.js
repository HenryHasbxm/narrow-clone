import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';

const socket = io();
const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x86bad9); scene.fog = new THREE.Fog(0x86bad9, 48, 110);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .05, 200); scene.add(camera);
scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x586348, 2));
const sun = new THREE.DirectionalLight(0xffefd7, 2.8); sun.position.set(-30, 50, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const world = new THREE.Group(); scene.add(world);
const material = (color, roughness = .82) => new THREE.MeshStandardMaterial({ color, roughness });
const mats = { grass: material(0x668653), stone: material(0xaaa696), darkstone: material(0x777a70), wood: material(0x806044), blue: material(0x397dad), red: material(0x9d4140), skin: material(0xd0a17d), leaves: material(0x3e6538), arrow: material(0x583e26) };
function box(w, h, d, mat, x, y = h / 2, z = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; world.add(o); return o; }
box(110, .8, 110, mats.grass, 0, -.4);
box(2, 4, 68, mats.stone, -34, 2); box(2, 4, 68, mats.stone, 34, 2); box(68, 4, 2, mats.stone, 0, 2, -34); box(68, 4, 2, mats.stone, 0, 2, 34);
for (const x of [-27, 27]) for (const z of [-27, 27]) { box(9, 14, 9, mats.stone, x, 7, z); box(11, 2, 11, mats.darkstone, x, 15, z); }
for (const z of [-18, -8, 8, 18]) { box(3, 3, 8, mats.wood, -10, 1.5, z); box(3, 3, 8, mats.wood, 10, 1.5, z); }
box(12, 1.6, 3, mats.wood, 0, .8); box(3, 6, 3, mats.darkstone, 0, 4);
for (const [x, z] of [[-45, -35], [45, -35], [-45, 35], [45, 35], [-48, 0], [48, 0]]) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.55, .8, 4, 8), mats.wood); trunk.position.set(x, 2, z); trunk.castShadow = true; world.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(3.6, 7, 8), mats.leaves); crown.position.set(x, 7, z); crown.castShadow = true; world.add(crown);
}
function makeFlag(team) {
  const group = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 5, 8), mats.wood); pole.position.y = 2.5; group.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.7), team === 'blue' ? mats.blue : mats.red); cloth.position.set(.9, 4, 0); group.add(cloth); world.add(group); return group;
}
const flagMeshes = { blue: makeFlag('blue'), red: makeFlag('red') };

const actors = new Map(), arrows = new Map();
let myId = null, myTeam = 'blue', joined = false, locked = false, yaw = Math.PI / 4, pitch = 0, charge = 0, firing = false;
const keys = Object.create(null);
const status = document.querySelector('#notice');
let noticeTimer;
function notice(text) { status.textContent = text; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { status.textContent = ''; }, 2500); }
function createActor(p) {
  const g = new THREE.Group();
  const armor = p.team === 'blue' ? mats.blue : mats.red;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.65, .62), armor); body.position.y = 2.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.43, 12, 9), mats.skin); head.position.y = 3.25; head.castShadow = true; g.add(head);
  const helmet = new THREE.Mesh(new THREE.CylinderGeometry(.47, .52, .25, 10), p.team === 'blue' ? mats.blue : mats.red); helmet.position.y = 3.58; g.add(helmet);
  for (const side of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.36, 1.1, .4), mats.darkstone); leg.position.set(side * .3, .65, 0); leg.castShadow = true; g.add(leg); }
  const bow = new THREE.Mesh(new THREE.TorusGeometry(.48, .045, 7, 18, Math.PI), mats.wood); bow.position.set(.65, 2.3, -.35); bow.rotation.y = Math.PI / 2; g.add(bow);
  g.userData.team = p.team; world.add(g); actors.set(p.id, g); return g;
}
function makeArrow(id, team, x, y, z, vx, vy, vz) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.1, 6), mats.arrow); mesh.geometry.rotateX(Math.PI / 2); mesh.position.set(x, y, z); mesh.userData.velocity = new THREE.Vector3(vx, vy, vz); mesh.userData.team = team; mesh.castShadow = true; scene.add(mesh); arrows.set(id, mesh); return mesh;
}
function obstacleCollision(x, z, radius = .55) {
  if (Math.abs(x) > 31.5 || Math.abs(z) > 31.5) return true;
  return [-18, -8, 8, 18].some(v => Math.abs(z - v) < 4 + radius && Math.abs(Math.abs(x) - 10) < 1.5 + radius) || (Math.abs(x) < 6 + radius && Math.abs(z) < 1.5 + radius);
}
const local = { x: -27, z: -27, health: 100, carrying: null };
let lastSend = 0;
document.querySelector('#join').addEventListener('click', () => {
  socket.emit('join', { name: document.querySelector('#name').value });
  document.querySelector('#menu').classList.add('hidden'); canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
canvas.addEventListener('click', () => { if (joined && !locked) canvas.requestPointerLock(); });
document.addEventListener('mousemove', e => { if (!locked) return; yaw -= e.movementX * .0022; pitch = Math.max(-1.2, Math.min(.55, pitch - e.movementY * .0022)); });
document.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (['w', 'a', 's', 'd', ' '].includes(e.key.toLowerCase())) e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', e => { if (e.button === 0 && joined && locked) { firing = true; charge = 0; } });
document.addEventListener('mouseup', e => { if (e.button === 0 && firing) { firing = false; socket.emit('shoot', { power: Math.max(.25, charge) }); charge = 0; } });

socket.on('welcome', data => { myId = data.id; myTeam = data.team; joined = true; notice(`You joined the ${myTeam} team`); });
socket.on('notice', notice);
socket.on('state', state => {
  document.querySelector('#blueScore').textContent = `BLUE ${state.score.blue}`;
  document.querySelector('#redScore').textContent = `RED ${state.score.red}`;
  const min = Math.floor(state.timeLeft / 60), sec = state.timeLeft % 60;
  document.querySelector('#timer').textContent = `${min}:${String(sec).padStart(2, '0')}`;
  const alive = new Set(state.players.map(p => p.id));
  for (const [id, actor] of actors) if (!alive.has(id)) { world.remove(actor); actors.delete(id); }
  for (const p of state.players) {
    let actor = actors.get(p.id); if (!actor) actor = createActor(p);
    if (p.id === myId) {
      local.x = p.x; local.z = p.z; local.health = p.health; local.carrying = p.carrying;
      document.querySelector('#healthFill').style.width = `${p.health}%`;
    } else {
      actor.position.x += (p.x - actor.position.x) * .48; actor.position.z += (p.z - actor.position.z) * .48;
      actor.rotation.y = p.yaw;
    }
  }
  for (const team of ['blue', 'red']) {
    const f = state.flags[team], mesh = flagMeshes[team];
    if (f.carrier && actors.has(f.carrier)) { const a = actors.get(f.carrier); mesh.position.set(a.position.x, 0, a.position.z); mesh.visible = false; }
    else { mesh.position.set(f.x, 0, f.z); mesh.visible = true; }
  }
});
socket.on('arrow', a => makeArrow(a.id, a.team, a.x, a.y, a.z, a.vx, a.vy, a.vz));
socket.on('arrowMove', a => { const m = arrows.get(a.id); if (m) { m.position.set(a.x, a.y, a.z); m.userData.velocity.set(a.vx, a.vy, a.vz); m.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz); } });
socket.on('arrowEnd', id => { const a = arrows.get(id); if (a) scene.remove(a); arrows.delete(id); });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  if (firing) { charge = Math.min(1, charge + dt * .72); document.querySelector('#chargeFill').style.width = `${charge * 100}%`; }
  else document.querySelector('#chargeFill').style.width = '0%';
  if (joined && locked) {
    const forward = Number(keys.w) - Number(keys.s), side = Number(keys.d) - Number(keys.a);
    const n = Math.hypot(forward, side) || 1, speed = (keys.shift ? 9 : 6) * dt;
    const dx = (side * Math.cos(yaw) + forward * Math.sin(yaw)) / n * speed;
    const dz = (-side * Math.sin(yaw) + forward * Math.cos(yaw)) / n * speed;
    if (!obstacleCollision(local.x + dx, local.z)) local.x += dx;
    if (!obstacleCollision(local.x, local.z + dz)) local.z += dz;
    const now = performance.now();
    if (now - lastSend > 45) {
      socket.emit('input', { forward: !!keys.w, back: !!keys.s, left: !!keys.a, right: !!keys.d, sprint: !!keys.shift, yaw, pitch }); lastSend = now;
    }
  }
  const me = actors.get(myId);
  const cx = me ? me.position.x : local.x, cz = me ? me.position.z : local.z;
  camera.position.set(cx, 2.35 + Math.sin(performance.now() * .008) * .025, cz);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  renderer.render(scene, camera);
}
animate();
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.addEventListener('beforeunload', () => socket.disconnect());
