const express = require('express');
const http = require('node:http');
const { Server } = require('socket.io');
const path = require('node:path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || false } });
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, players: players.size }));

const PORT = Number(process.env.PORT) || 3000;
const ROUND_SECONDS = 180;
const ARENA = 32;
const SPAWNS = { blue: [-27, -27], red: [27, 27] };
const FLAGS = { blue: { x: -30, z: -27 }, red: { x: 30, z: 27 } };
const BLOCKS = [
  { x: -10, z: -18, w: 3, d: 8 }, { x: 10, z: -18, w: 3, d: 8 },
  { x: -10, z: -8, w: 3, d: 8 }, { x: 10, z: -8, w: 3, d: 8 },
  { x: -10, z: 8, w: 3, d: 8 }, { x: 10, z: 8, w: 3, d: 8 },
  { x: -10, z: 18, w: 3, d: 8 }, { x: 10, z: 18, w: 3, d: 8 },
  { x: 0, z: 0, w: 12, d: 3 },
];
const players = new Map();
const arrows = new Map();
const score = { blue: 0, red: 0 };
let timeLeft = ROUND_SECONDS;
let lastTick = Date.now();
let arrowCounter = 0;

function spawn(team) {
  const [x, z] = SPAWNS[team];
  return { x: x + (Math.random() - .5) * 2, z: z + (Math.random() - .5) * 2 };
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function blocked(x, z, radius = .55) {
  if (Math.abs(x) > ARENA - radius || Math.abs(z) > ARENA - radius) return true;
  return BLOCKS.some(b => Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius);
}
function publicPlayer(p) {
  return { id: p.id, name: p.name, team: p.team, x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, health: p.health, carrying: p.carrying };
}
function resetFlag(team) {
  const f = FLAGS[team];
  f.carrier = null;
  f.x = team === 'blue' ? -30 : 30;
  f.z = team === 'blue' ? -27 : 27;
}
function resetPlayer(p, message) {
  const at = spawn(p.team);
  p.x = at.x; p.z = at.z; p.health = 100; p.deadUntil = 0;
  if (p.carrying) { resetFlag(p.carrying); p.carrying = null; }
  if (message) io.to(p.id).emit('notice', message);
}
function snapshot() {
  return {
    players: [...players.values()].map(publicPlayer),
    flags: Object.fromEntries(Object.entries(FLAGS).map(([team, f]) => [team, { x: f.x, z: f.z, carrier: f.carrier }])),
    score: { ...score }, timeLeft: Math.ceil(timeLeft),
  };
}
function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len ? clamp(((px - ax) * dx + (pz - az) * dz) / len, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

io.on('connection', socket => {
  socket.on('join', payload => {
    if (players.has(socket.id)) return;
    const name = String(payload?.name || 'Archer').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Archer';
    const counts = { blue: 0, red: 0 };
    for (const p of players.values()) counts[p.team]++;
    const team = counts.blue <= counts.red ? 'blue' : 'red';
    const at = spawn(team);
    players.set(socket.id, { id: socket.id, name, team, x: at.x, z: at.z, yaw: team === 'blue' ? Math.PI / 4 : -3 * Math.PI / 4, pitch: 0, health: 100, carrying: null, input: {}, deadUntil: 0, lastShot: 0 });
    socket.emit('welcome', { id: socket.id, team });
    io.emit('state', snapshot());
  });

  socket.on('input', data => {
    const p = players.get(socket.id);
    if (!p || p.deadUntil > Date.now()) return;
    p.input = {
      forward: !!data?.forward, back: !!data?.back, left: !!data?.left, right: !!data?.right,
      sprint: !!data?.sprint,
    };
    if (Number.isFinite(data?.yaw)) p.yaw = data.yaw;
    if (Number.isFinite(data?.pitch)) p.pitch = clamp(data.pitch, -1.2, .55);
  });

  socket.on('shoot', data => {
    const p = players.get(socket.id);
    const now = Date.now();
    if (!p || p.health <= 0 || p.deadUntil > now || now - p.lastShot < 420) return;
    p.lastShot = now;
    const power = clamp(Number(data?.power) || .5, .25, 1);
    const horizontal = Math.cos(p.pitch);
    const speed = 28 + power * 24;
    const id = `a${++arrowCounter}`;
    arrows.set(id, {
      id, owner: p.id, team: p.team,
      x: p.x + Math.sin(p.yaw) * .8, y: 2.45, z: p.z + Math.cos(p.yaw) * .8,
      vx: Math.sin(p.yaw) * horizontal * speed,
      vy: Math.sin(p.pitch) * speed,
      vz: Math.cos(p.yaw) * horizontal * speed,
      life: 3.5,
    });
    io.emit('arrow', { id, owner: p.id, team: p.team, x: p.x, y: 2.45, z: p.z, vx: Math.sin(p.yaw) * horizontal * speed, vy: Math.sin(p.pitch) * speed, vz: Math.cos(p.yaw) * horizontal * speed });
  });

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p?.carrying) resetFlag(p.carrying);
    players.delete(socket.id);
    io.emit('state', snapshot());
  });
});

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, .05);
  lastTick = now;
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = ROUND_SECONDS; score.blue = 0; score.red = 0;
    for (const team of ['blue', 'red']) resetFlag(team);
    for (const p of players.values()) resetPlayer(p, 'New round!');
    io.emit('notice', score.blue === score.red ? 'Draw! New round.' : `${score.blue > score.red ? 'Blue' : 'Red'} wins! New round.`);
  }

  for (const p of players.values()) {
    if (p.deadUntil > now) {
      if (p.deadUntil <= now + 50) resetPlayer(p, 'Respawned');
      continue;
    }
    let dx = Number(p.input.right) - Number(p.input.left);
    let dz = Number(p.input.back) - Number(p.input.forward);
    const length = Math.hypot(dx, dz) || 1;
    dx /= length; dz /= length;
    const speed = p.input.sprint ? 9 : 6;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const mx = (dx * c + dz * s) * speed * dt;
    const mz = (-dx * s + dz * c) * speed * dt;
    if (!blocked(p.x + mx, p.z)) p.x += mx;
    if (!blocked(p.x, p.z + mz)) p.z += mz;
    p.x = clamp(p.x, -ARENA + 1, ARENA - 1); p.z = clamp(p.z, -ARENA + 1, ARENA - 1);

    const enemy = p.team === 'blue' ? 'red' : 'blue';
    const flag = FLAGS[enemy];
    if (!flag.carrier && Math.hypot(p.x - flag.x, p.z - flag.z) < 2) {
      flag.carrier = p.id; p.carrying = enemy; io.to(p.id).emit('notice', 'Enemy flag secured! Return to your base.');
    }
    if (p.carrying) {
      const home = FLAGS[p.team];
      if (Math.hypot(p.x - home.x, p.z - home.z) < 3 && !home.carrier) {
        score[p.team]++; resetFlag(p.carrying); p.carrying = null;
        io.emit('notice', `${p.team.toUpperCase()} captured the flag!`);
      }
    }
  }

  for (const [id, a] of arrows) {
    const oldX = a.x, oldZ = a.z;
    a.vy -= 13 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt; a.life -= dt;
    let hit = false;
    for (const p of players.values()) {
      if (p.id === a.owner || p.team === a.team || p.health <= 0 || p.deadUntil > now) continue;
      if (segmentDistance(p.x, p.z, oldX, oldZ, a.x, a.z) < .72 && a.y > .45 && a.y < 3.6) {
        p.health -= 55;
        if (p.health <= 0) {
          p.health = 0; p.deadUntil = now + 2500;
          if (p.carrying) { resetFlag(p.carrying); p.carrying = null; }
          io.to(p.id).emit('notice', 'You were tagged. Respawning…');
          io.to(a.owner).emit('notice', `You tagged ${p.name}!`);
        }
        hit = true; break;
      }
    }
    if (hit || a.life <= 0 || a.y <= .1 || blocked(a.x, a.z, .08)) {
      arrows.delete(id); io.emit('arrowEnd', id);
    } else {
      io.emit('arrowMove', { id, x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz });
    }
  }
  io.volatile.emit('state', snapshot());
}, 50);

server.listen(PORT, () => console.log(`Arrowkeep listening on http://localhost:${PORT}`));
