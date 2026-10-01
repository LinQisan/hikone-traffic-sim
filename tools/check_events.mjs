// Checks every built-in event against its purpose, with the web traffic model and the real city
// geometry for sight lines (no browser):  node tools/check_events.mjs [--dir events] [id…]
//
// For each event:
//   naive    — goes straight on towards the goal at the app's pace without looking (after 0 s and
//              after standing 3 s): must be hit by the event's accident car (not by other traffic)
//   careful  — goes to the edge of the first lane the accident car uses (for 04: the edge of the
//              truck), stops and watches until the accident cars have passed, then goes on: must
//              see each accident car for a while before it passes, and reach the goal unhurt
//   spawn    — where each car appears: hidden from the participant's eyes, or far away
import fs from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const S = await import('../src/shared/scenario.js');
const { Traffic, PLAYER_RADIUS, meetPoint, BODY_SIZE } = await import('../src/traffic.js');
const { placement } = await import('../src/coords.js');

const args = process.argv.slice(2);
const dirArg = args.indexOf('--dir');
const dir = new URL('../' + (dirArg >= 0 ? args[dirArg + 1] : 'data/scenarios') + '/', import.meta.url);
const only = args.filter((a, i) => !a.startsWith('--') && (dirArg < 0 || i !== dirArg + 1));
const data = new URL('../data/', import.meta.url);
const map = JSON.parse(fs.readFileSync(new URL('map.json', data)));
const scene = JSON.parse(fs.readFileSync(new URL('scene.json', data)));
const PACE = 2.4;

// ---- sight lines: buildings, walls, trees, gates and the event's parked trucks, cut into cells
const loader = new GLTFLoader();
const glb = async name => {
  const bytes = fs.readFileSync(new URL(`models/impressionist/${name}.lod.glb`, data));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse(o => { if (o.isMesh) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
  return parts;
};
const NOT_SOLID = /^HK_(Road|Ground|Water|Terrain|Sign|Bollard|ChainFence|Guardrail|StreetLamp|GuidePost|Hedge)/;
const layout = JSON.parse(fs.readFileSync(new URL('layout.json', data)));
const cache = new Map();
const cells = new Map();
const addTriangles = (geometry, matrix) => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.applyMatrix4(matrix);
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    const key = Math.floor((p[i] + p[i + 3] + p[i + 6]) / 48) + ',' + Math.floor((p[i + 2] + p[i + 5] + p[i + 8]) / 48);
    if (!cells.has(key)) cells.set(key, []);
    const list = cells.get(key);
    for (let k = 0; k < 9; k++) list.push(p[i + k]);
  }
};
const m = new THREE.Matrix4();
for (const item of layout.items) {
  if (NOT_SOLID.test(item.a)) continue;
  if (!cache.has(item.a)) cache.set(item.a, await glb(item.a));
  for (const g of cache.get(item.a)) addTriangles(g, placement(...item.p, item.r, item.s, m));
}
// the black walls inside the gatehouses hide where cars appear and leave (scene.json blackWalls)
for (const w of scene.blackWalls) {
  const g = new THREE.BoxGeometry(w.size[0], w.size[1], Math.max(w.size[2], 0.05));
  addTriangles(g, placement(w.x, w.y, w.z, w.yaw, [1, 1, 1], new THREE.Matrix4()));
}
const cityMeshes = [...cells.values()].map(list => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
  g.computeBoundingSphere();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
});
const truckSize = {};
for (const name of ['HK_Truck_Large', 'HK_Truck_Medium']) {
  const box = new THREE.Box3(); for (const g of await glb(name)) { g.computeBoundingBox(); box.union(g.boundingBox); }
  truckSize[name] = box;
}
function parkedMeshes(builtIn) {
  const list = scene.scenarios.find(s => s.id === builtIn)?.parked ?? [];
  return list.map(p => {
    const box = p.kind === 'truck' ? truckSize[p.model] : new THREE.Box3(new THREE.Vector3(-0.88, 0, -2.3), new THREE.Vector3(0.88, 1.45, 2.3));
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const g = new THREE.BoxGeometry(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    placement(p.x, p.y, p.z, p.yaw, [1, 1, 1], mesh.matrix); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
    return mesh;
  });
}
const ray = new THREE.Raycaster();
const T = (x, y, z) => new THREE.Vector3(-x, y, z);
/** Is any of the car's front, middle or roof visible from the eye (Unity coordinates)? */
function sees(eye, car, occluders) {
  const a = car.yaw * Math.PI / 180, f = { x: Math.sin(a), z: Math.cos(a) };
  const h = car.size[1];
  for (const [df, y] of [[car.size[2] / 2 - 0.3, h * 0.55], [0, h * 0.85], [-car.size[2] / 2 + 0.3, h * 0.55]]) {
    const from = T(eye.x, eye.y, eye.z), to = T(car.x + f.x * df, y, car.z + f.z * df);
    const d = to.clone().sub(from), len = d.length();
    ray.set(from, d.normalize()); ray.far = len - 0.4; ray.near = 0.3;
    if (ray.intersectObjects(occluders, false).length === 0) return true;
  }
  return false;
}

// ---- participants
/** The way a participant walks: straight to the goal, or round the end of a wall in the way. */
function waypoints(spawn, goal) {
  const clear = (a, b) => !S.crossesWall(map, a, b);
  if (clear(spawn, goal)) return [goal];
  let best = null;
  for (const w of map.walls) {
    const pts = []; for (let i = 0; i < w.polygon.length; i += 2) pts.push({ x: w.polygon[i], z: w.polygon[i + 1] });
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    for (const p of pts) {
      const l = Math.hypot(p.x - cx, p.z - cz) || 1, c = { x: p.x + (p.x - cx) / l * 0.8, z: p.z + (p.z - cz) / l * 0.8 };
      if (!clear(spawn, c) || !clear(c, goal)) continue;
      const len = Math.hypot(c.x - spawn.x, c.z - spawn.z) + Math.hypot(goal.x - c.x, goal.z - c.z);
      if (!best || len < best.len) best = { c, len };
    }
  }
  return best ? [best.c, goal] : [goal];
}

function run(scenario, occluders, behaviour) {
  const traffic = new Traffic(scenario, { seed: behaviour.seed ?? 7, builtInMix: true });
  const { spawn } = scenario;
  const goal = behaviour.edge != null ? { ...scenario.goal, z: behaviour.edge } : scenario.goal;
  // straight at the goal; round a wall only once it stops them (edge riders move to the edge first)
  let way = behaviour.edge != null ? [{ x: spawn.x + Math.sign(goal.x - spawn.x) * 1.5, z: behaviour.edge }, goal] : [goal];
  const eyeH = scenario.playerMode === 'bicycle' ? 1.55 : 1.59;
  let x = spawn.x, z = spawn.z, t = 0, travelled = 0;
  const out = { contact: null, spawns: [], seenBefore: {}, reached: false };
  const firstSeen = {}, passed = {};
  let waitFrom = null;
  // a gap is safe when no car reaches the participant's path within 3.5 s (careful participants)
  const pathDir = (() => { const l = Math.hypot(goal.x - spawn.x, goal.z - spawn.z); return { x: (goal.x - spawn.x) / l, z: (goal.z - spawn.z) / l }; })();
  const along = () => (x - spawn.x) * pathDir.x + (z - spawn.z) * pathDir.z;
  const unsafe = () => traffic.cars.some(c => {
    if (!c.crossing) return false;
    const left = c.crossing.distance - c.distance;
    return left > -c.size[2] && left / Math.max(c.currentSpeed, 1) < 3.5;
  }) || traffic.plans.some(p => p.v.accident && !p.done && p.meet);
  for (; t < 60; t += 1 / 30) {
    let speed = t < (behaviour.idle ?? 0) ? 0 : PACE;
    if (behaviour.stopAt != null && along() >= behaviour.stopAt && !behaviour.crossing) {
      waitFrom ??= t;
      if ((t - waitFrom < 1.5 || unsafe()) && t - waitFrom < 20) speed = 0; else behaviour.crossing = true;
    }
    if (behaviour.slowFrom != null && along() >= behaviour.slowFrom && along() < behaviour.slowUntil) {
      speed = Math.min(speed, 1.0);
      // a careful rider also stops while a car is about to cross in front (and goes on after it)
      if (behaviour.edge == null && traffic.cars.some(c => c.accident && c.crossing && c.distance < c.crossing.distance + c.size[2]
        && Math.hypot(c.x - x, c.z - z) < 9)) speed = 0;
    }
    // move like player.js: towards the goal, stopped by the map's invisible walls, sliding along them
    if (way.length > 1 && Math.hypot(way[0].x - x, way[0].z - z) < 0.3) way.shift();
    const aim = way[0], gx = aim.x - x, gz = aim.z - z, gl = Math.hypot(gx, gz) || 1;
    const dx = gx / gl * speed / 30, dz = gz / gl * speed / 30;
    const reach = (ddx, ddz) => { const l = Math.hypot(ddx, ddz) || 1; return !S.crossesWall(map, { x, z }, { x: x + ddx + ddx / l * 0.25, z: z + ddz + ddz / l * 0.25 }); };
    let mx = 0, mz = 0;
    if (speed > 0) {
      if (reach(dx, dz)) { mx = dx; mz = dz; }
      else if (way.length === 1) { way = waypoints({ x, z }, goal); }   // blocked: head for the wall's end
    }
    x += mx; z += mz; travelled += Math.hypot(mx, mz);
    if (S.hasTrigger(scenario) && traffic.triggerTime == null && S.pointInArea([x, z], scenario.trigger)) traffic.trigger();
    const before = new Set(traffic.cars.map(c => c.id));
    traffic.step(1 / 30, { x, z, vx: mx * 30, vz: mz * 30 });
    const eye = { x, y: eyeH, z };
    for (const car of traffic.cars) {
      if (!before.has(car.id) && !out.spawns.some(e => e.id === car.id)) {
        const dist = Math.hypot(car.x - x, car.z - z);
        out.spawns.push({ id: car.id, name: car.name, accident: car.accident, t: +t.toFixed(2), dist: +dist.toFixed(1), visible: sees(eye, car, occluders) });
      }
      if (car.accident) {
        if (firstSeen[car.id] == null && sees(eye, car, occluders)) firstSeen[car.id] = t;
        const m = car.crossing;
        if (m && car.distance > m.distance + car.size[2]) passed[car.id] ??= t;
      }
    }
    const hit = traffic.hit(x, z, PLAYER_RADIUS);
    if (hit) { out.contact = { at: [+x.toFixed(2), +z.toFixed(2)], car: [+hit.x.toFixed(2), +hit.z.toFixed(2), Math.round(hit.yaw)], name: hit.name, accident: hit.accident, t: +t.toFixed(2), kmh: Math.round(hit.currentSpeed * 3.6), s: +travelled.toFixed(1),
      seenFor: firstSeen[hit.id] != null ? +(t - firstSeen[hit.id]).toFixed(2) : 0 }; break; }
    if (S.pointInArea([x, z], scenario.goal) || (behaviour.edge != null && Math.abs(x - goal.x) < 0.5)) { out.reached = true; break; }
  }
  for (const id of Object.keys(passed)) out.seenBefore[id] = firstSeen[id] != null ? +(passed[id] - firstSeen[id]).toFixed(2) : 0;
  out.time = +t.toFixed(1);
  return out;
}

// --probe <event> "ex,ez;px,pz;px,pz…": is each point (a car there) visible from the eye at ex,ez?
const probeArg = args.indexOf('--probe');
if (probeArg >= 0) {
  const builtIn = Number(args[probeArg + 1].replace('builtin-', '')) - 1;
  const [e, ...points] = args[probeArg + 2].split(';').map(p => p.split(',').map(Number));
  const occ = [...cityMeshes, ...parkedMeshes(builtIn)];
  for (const [px, pz] of points) {
    const car = { x: px, z: pz, yaw: 90, size: BODY_SIZE.sedan };
    const v90 = sees({ x: e[0], y: 1.59, z: e[1] }, car, occ), v0 = sees({ x: e[0], y: 1.59, z: e[1] }, { ...car, yaw: 0 }, occ);
    console.log(`${px},${pz}: ${v90 || v0 ? 'VISIBLE' : 'hidden'}  (${Math.hypot(px - e[0], pz - e[1]).toFixed(1)} m)`);
  }
  process.exit(0);
}
const files = fs.readdirSync(dir).filter(f => /^builtin-\d+\.json$/.test(f) && (!only.length || only.includes(f.replace('.json', '')))).sort();
const results = [];
for (const file of files) {
  const scenario = S.normalize(JSON.parse(fs.readFileSync(new URL(file, dir))));
  const builtIn = Number(scenario.id.replace('builtin-', '')) - 1;
  const occluders = [...cityMeshes, ...parkedMeshes(builtIn)];
  // the first lane an accident car uses: stop 1.5 m before it (walking) / slow down 6 m before (bicycle)
  const meets = scenario.vehicles.filter(v => v.accident).map(v => meetPoint(v.route, scenario.spawn, scenario.goal));
  const firstLane = Math.min(...meets.map(m => m.s));
  // walking: stop at the kerb, where the path first reaches the carriageway (04: before stepping out
  // from behind the truck, i.e. 1.7 m before the first lane the accident cars use, if that is later)
  const len = Math.hypot(scenario.goal.x - scenario.spawn.x, scenario.goal.z - scenario.spawn.z);
  let kerb = 0;
  for (; kerb < len; kerb += 0.1) {
    const f = kerb / len, px = scenario.spawn.x + (scenario.goal.x - scenario.spawn.x) * f, pz = scenario.spawn.z + (scenario.goal.z - scenario.spawn.z) * f;
    if (S.distanceToSurface(map, px, pz, ['carriageway']) < 0.01) break;
  }
  const careStop = Math.max(kerb - 0.4, scenario.id === 'builtin-04' ? firstLane - 1.7 : 0);
  // bicycle: slow down 8 m before the place of danger; 10 (riding on the right, kept there by the
  // walls): keep to the very edge and slow down
  const careful = scenario.id === 'builtin-10' ? { edge: 29.55, slowFrom: 0, slowUntil: 1e9 }
    : scenario.playerMode === 'bicycle' ? { slowFrom: firstLane - 8, slowUntil: firstLane + 3 }
    : { stopAt: Math.max(0, careStop) };
  const r = { id: scenario.id, name: scenario.name,
    naive: run(scenario, occluders, { idle: 0 }), naiveLate: run(scenario, occluders, { idle: 3 }),
    naiveSeed: run(scenario, occluders, { idle: 7.3, seed: 1234 }), careful: run(scenario, occluders, careful) };
  results.push(r);
  const fmt = o => o.contact ? `HIT by ${o.contact.name}${o.contact.accident ? '' : ' [NOT accident car]'} at ${o.contact.kmh} km/h after ${o.contact.s} m (seen ${o.contact.seenFor} s before)` : (o.reached ? 'reached the goal' : 'stopped');
  console.log(`\n${r.id} ${r.name}`);
  console.log(`  naive          : ${fmt(r.naive)}`);
  console.log(`  naive, 3 s late: ${fmt(r.naiveLate)}`);
  console.log(`  naive, 7 s late: ${fmt(r.naiveSeed)}`);
  console.log(`  careful        : ${fmt(r.careful)}; accident cars seen before passing: ${JSON.stringify(r.careful.seenBefore)}`);
  const pops = r.naive.spawns.filter(e => e.visible && e.dist < 60 && e.t > 0.2);   // t ≈ 0: there from the start
  console.log(`  spawns (naive) : ${r.naive.spawns.map(e => `${e.accident ? '★' : ''}${e.name}@${e.t}s ${e.dist}m ${e.t <= 0.2 ? 'there from the start' : e.visible ? 'VISIBLE' : 'hidden'}`).join(' | ')}`);
  if (pops.length) console.log(`  !! visible pop-in within 60 m: ${pops.map(e => e.name).join(', ')}`);
}
if (args.includes('--json')) process.stdout.write('\nJSON ' + JSON.stringify(results) + '\n');
