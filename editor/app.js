// VRLearn scenario editor (browser). Data model and checks live in the shared scenario.js
// (a copy of VRLearn's ScenarioModel/scenario.js, see tools/sync.mjs). Files go through the local
// server (server/editor-api.mjs: the Unity project's Scenarios/, Unity play, Quest) when it runs,
// otherwise through store.js (this browser's localStorage).
import * as S from '../src/shared/scenario.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const PALETTE = ['#ff9f1c', '#2ec4b6', '#9b5de5', '#00bbf9', '#f15bb5', '#8ac926', '#fee440', '#4d7cfe'];
const ACCIDENT_COLOR = '#ff6b5e';
const PLAY_KEY = 'vrlearn.editor.play';      // read by the simulator's title (?play=editor)
const CAR_LENGTH = 4.4, CAR_WIDTH = 1.8;

const state = {
  map: null,
  list: [],
  file: null,            // { path, template } of the loaded file; null = not saved yet
  scenario: null,
  saved: '',             // serialized text as last loaded/saved (dirty check)
  selection: null,       // { kind: 'spawn'|'goal'|'trigger'|'vehicle', index?, point? }
  tab: 'meta',
  tool: 'select',
  drawing: null,         // index of the vehicle whose route is being drawn
  cursor: null,          // world position of the pointer
  view: { scale: 1, tx: 0, ty: 0 },
  undo: [], redo: [], lastEdit: { key: null, at: 0 },
  time: 0, playing: false, lastFrame: 0,
  problems: [],
  server: false          // true: the local server with the Unity project answers /api/…
};

// ------------------------------------------------------------------ utilities
async function api(path, options = {}) {
  if (!state.server) return store.request(path, options);
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

let toastTimer = 0;
function toast(message, error = false) {
  const t = $('toast');
  t.textContent = message;
  t.className = 'toast' + (error ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 3000);
}

const el = (tag, attrs = {}, parent = null) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};
const html = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
};
const fmt = (v, digits = 1) => Number(v).toFixed(digits);
const clone = o => JSON.parse(JSON.stringify(o));

function getPath(obj, path) { return path.split('.').reduce((o, k) => o?.[k], obj); }
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

// ------------------------------------------------------------------ coordinates
const world = () => state.map.world;
const ppm = () => state.map.pixelsPerMeter;
const toPx = (x, z) => [(x - world().xMin) * ppm(), (world().zMax - z) * ppm()];
const fromPx = (px, py) => ({ x: world().xMin + px / ppm(), z: world().zMax - py / ppm() });
function screenToWorld(event) {
  const rect = $('map').getBoundingClientRect();
  const { scale, tx, ty } = state.view;
  return fromPx((event.clientX - rect.left - tx) / scale, (event.clientY - rect.top - ty) / scale);
}
/** Screen pixels → image pixels, so markers keep their size while zooming. */
const k = px => px / state.view.scale;

function vehicleColor(v, i) { return v.accident ? ACCIDENT_COLOR : PALETTE[i % PALETTE.length]; }

// ------------------------------------------------------------------ undo / dirty
function snapshot() { return JSON.stringify(state.scenario); }
function pushUndo(key = null) {
  const now = performance.now();
  if (key && key === state.lastEdit.key && now - state.lastEdit.at < 900) { state.lastEdit.at = now; return; }
  state.lastEdit = { key, at: now };
  state.undo.push(snapshot());
  if (state.undo.length > 200) state.undo.shift();
  state.redo = [];
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(snapshot());
  state.scenario = JSON.parse(state.undo.pop());
  state.lastEdit = { key: null, at: 0 };
  fixSelection();
  refreshAll();
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(snapshot());
  state.scenario = JSON.parse(state.redo.pop());
  fixSelection();
  refreshAll();
}
const isDirty = () => state.scenario && S.serialize(state.scenario) !== state.saved;

function fixSelection() {
  const s = state.selection;
  if (s?.kind === 'vehicle' && !state.scenario.vehicles[s.index]) state.selection = null;
}

// ------------------------------------------------------------------ map view
function buildMapLayers() {
  const svg = $('map');
  svg.innerHTML = '';
  const viewport = el('g', { id: 'viewport' }, svg);
  el('image', { href: state.map.imageUrl ?? '/api/map/image', x: 0, y: 0,
    width: state.map.imageWidth, height: state.map.imageHeight, id: 'mapImage' }, viewport);

  const surfaces = el('g', { id: 'layerSurfacesG' }, viewport);
  for (const surface of state.map.surfaces) {
    const t = surface.triangles;
    let d = '';
    for (let i = 0; i < t.length; i += 6) {
      const a = toPx(t[i], t[i + 1]), b = toPx(t[i + 2], t[i + 3]), c = toPx(t[i + 4], t[i + 5]);
      d += `M${a[0]},${a[1]}L${b[0]},${b[1]}L${c[0]},${c[1]}Z`;
    }
    el('path', { d, class: 'surface-' + surface.kind }, surfaces);
  }
  const defs = el('defs', {}, svg);
  const arrow = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
  el('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'context-stroke' }, arrow);

  const lanes = el('g', { id: 'layerLanesG' }, viewport);
  for (const lane of state.map.lanes) {
    el('polyline', { points: lane.points.map(p => toPx(p.x, p.z).join(',')).join(' '), class: 'lane',
      'vector-effect': 'non-scaling-stroke', 'stroke-width': 1.5, 'marker-end': 'url(#arrow)' }, lanes)
      .appendChild(document.createElementNS(SVG, 'title')).textContent = lane.id + ' — ' + lane.name;
  }
  const walls = el('g', { id: 'layerWallsG' }, viewport);
  for (const wall of state.map.walls) {
    const pts = [];
    for (let i = 0; i < wall.polygon.length; i += 2) pts.push(toPx(wall.polygon[i], wall.polygon[i + 1]).join(','));
    el('polygon', { points: pts.join(' '), class: 'wall', 'vector-effect': 'non-scaling-stroke', 'stroke-width': 2 }, walls);
  }
  el('g', { id: 'layerSignalsG' }, viewport);
  el('g', { id: 'overlay' }, viewport);
  el('g', { id: 'cars' }, viewport);
  applyLayers();
}

function applyLayers() {
  $('layerSurfacesG').style.display = $('layerSurfaces').checked ? '' : 'none';
  $('layerLanesG').style.display = $('layerLanes').checked ? '' : 'none';
  $('layerWallsG').style.display = $('layerWalls').checked ? '' : 'none';
  $('layerSignalsG').style.display = $('layerSignals').checked ? '' : 'none';
}

function renderSignals() {
  const g = $('layerSignalsG');
  g.innerHTML = '';
  for (const s of state.map.signals) {
    const [x, y] = toPx(s.x, s.z);
    el('rect', { x: x - k(4), y: y - k(4), width: k(8), height: k(8), class: 'signal', 'stroke-width': k(1) }, g)
      .appendChild(document.createElementNS(SVG, 'title')).textContent = s.name;
  }
}

function applyView() {
  const { scale, tx, ty } = state.view;
  $('viewport').setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  renderSignals();
  renderOverlay();
  renderCars();
}

function fitTo(points, padding = 40) {
  const rect = $('map').getBoundingClientRect();
  const px = points.map(p => toPx(p.x, p.z));
  const xs = px.map(p => p[0]), ys = px.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 150), h = Math.max(maxY - minY, 150);
  const scale = Math.min((rect.width - padding * 2) / w, (rect.height - padding * 2) / h, 4);
  state.view = { scale, tx: rect.width / 2 - scale * (minX + maxX) / 2, ty: rect.height / 2 - scale * (minY + maxY) / 2 };
  applyView();
}

function fitScenario() {
  const s = state.scenario;
  const pts = [s.spawn, s.goal, ...(S.hasTrigger(s) ? [s.trigger] : []), ...s.vehicles.flatMap(v => v.route)];
  fitTo(pts.length > 2 ? pts : [{ x: world().xMin, z: world().zMin }, { x: world().xMax, z: world().zMax }]);
}

// ------------------------------------------------------------------ overlay (scenario objects)
function areaShape(g, area, kind) {
  const [cx, cy] = toPx(area.x, area.z);
  const w = area.width * ppm(), d = area.depth * ppm();
  const sel = state.selection?.kind === kind;
  const group = el('g', { transform: `translate(${cx},${cy}) rotate(${area.yaw})` }, g);
  el('rect', { x: -w / 2, y: -d / 2, width: w, height: d, class: `area ${kind}${sel ? ' selected' : ''}`,
    'data-drag': kind, 'vector-effect': 'non-scaling-stroke', 'stroke-width': sel ? 3 : 2 }, group);
  if (sel) {
    el('rect', { x: w / 2 - k(6), y: -d / 2 - k(6), width: k(12), height: k(12), class: 'handle',
      'data-drag': kind + '-resize', 'stroke-width': k(1.5) }, group);
    el('line', { x1: 0, y1: -d / 2, x2: 0, y2: -d / 2 - k(28), stroke: '#fff', 'stroke-width': k(1.5) }, group);
    el('circle', { cx: 0, cy: -d / 2 - k(28), r: k(7), class: 'handle rotate', 'data-drag': kind + '-rotate', 'stroke-width': k(1.5) }, group);
  }
  const label = el('text', { x: cx, y: cy - d / 2 - k(10), class: 'label', 'font-size': k(12), 'text-anchor': 'middle' }, g);
  label.textContent = kind === 'goal' ? 'ゴール' : 'トリガー';
}

function renderOverlay() {
  const g = $('overlay');
  if (!g || !state.scenario) return;
  g.innerHTML = '';
  const s = state.scenario;

  // participant's straight line to the goal
  const [sx, sy] = toPx(s.spawn.x, s.spawn.z);
  const [gx, gy] = toPx(s.goal.x, s.goal.z);
  el('line', { x1: sx, y1: sy, x2: gx, y2: gy, class: 'walkline', 'vector-effect': 'non-scaling-stroke', 'stroke-width': 2, 'marker-end': 'url(#arrow)' }, g);

  if (S.hasTrigger(s)) areaShape(g, s.trigger, 'trigger');
  areaShape(g, s.goal, 'goal');

  // vehicle routes
  s.vehicles.forEach((v, i) => {
    if (!v.route.length) return;
    const color = vehicleColor(v, i);
    const selected = state.selection?.kind === 'vehicle' && state.selection.index === i;
    const pts = v.route.map(p => toPx(p.x, p.z).join(',')).join(' ');
    el('polyline', { points: pts, class: 'route-hit', 'stroke-width': k(14), 'data-drag': 'route:' + i }, g);
    el('polyline', { points: pts, class: 'route', stroke: color, 'stroke-width': selected ? 4 : 2.5,
      'vector-effect': 'non-scaling-stroke', 'marker-end': 'url(#arrow)', 'stroke-dasharray': v.start === S.START_TRIGGER ? '' : '9 5',
      'data-drag': 'route:' + i }, g);
    const [x0, y0] = toPx(v.route[0].x, v.route[0].z);
    el('rect', { x: x0 - k(7), y: y0 - k(7), width: k(14), height: k(14), rx: k(3), fill: color, stroke: '#111',
      'stroke-width': k(1.2), 'data-drag': 'point:' + i + ':0' }, g);
    // cars that start at the same place get stacked labels
    const stack = s.vehicles.slice(0, i).filter(o => o.route.length && Math.hypot(o.route[0].x - v.route[0].x, o.route[0].z - v.route[0].z) < 1).length;
    const label = el('text', { x: x0, y: y0 - k(12 + stack * 14), class: 'label', 'font-size': k(11), 'text-anchor': 'middle' }, g);
    label.textContent = v.name || `車 ${i + 1}`;
    if (selected || state.drawing === i) {
      v.route.forEach((p, n) => {
        const [x, y] = toPx(p.x, p.z);
        const active = state.selection?.point === n;
        el('circle', { cx: x, cy: y, r: k(active ? 7 : 5.5), class: 'handle point' + (active ? ' selected' : ''),
          'stroke-width': k(1.5), 'data-drag': `point:${i}:${n}` }, g);
      });
    }
    // where the car meets the participant's line
    const c = S.conflictPoint(s, v);
    if (c && (v.accident || selected)) {
      const [cx, cy] = toPx(c.x, c.z);
      const r = k(9);
      el('path', { d: `M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx - r},${cy + r}L${cx + r},${cy - r}`, class: 'conflict', 'stroke-width': k(2.5) }, g);
      const t = el('text', { x: cx + k(12), y: cy + k(4), class: 'conflict-label', 'font-size': k(11) }, g);
      const base = v.start === S.START_TRIGGER ? `トリガー後 ${fmt(v.delaySeconds + c.carSeconds)} 秒` : `開始 ${fmt(v.delaySeconds + c.carSeconds)} 秒`;
      t.textContent = `車 ${base} ／ 人 約 ${fmt(c.personSeconds)} 秒`;
    }
  });

  // drawing preview
  if (state.drawing != null && state.cursor) {
    const v = s.vehicles[state.drawing];
    const target = snapped(state.cursor);
    if (v?.route.length) {
      const [x1, y1] = toPx(v.route.at(-1).x, v.route.at(-1).z);
      const [x2, y2] = toPx(target.x, target.z);
      el('line', { x1, y1, x2, y2, class: 'preview', 'vector-effect': 'non-scaling-stroke', 'stroke-width': 2 }, g);
    }
    const [px, py] = toPx(target.x, target.z);
    el('circle', { cx: px, cy: py, r: k(5), fill: target.lane ? '#ffd84d' : '#fff', stroke: '#111', 'stroke-width': k(1) }, g);
  }

  // participant
  const sel = state.selection?.kind === 'spawn';
  const spawn = el('g', { class: 'spawn' + (sel ? ' selected' : ''), 'data-drag': 'spawn' }, g);
  el('circle', { cx: sx, cy: sy, r: k(11), fill: 'var(--spawn)', stroke: sel ? '#fff' : '#0b2a5a', 'stroke-width': k(sel ? 3 : 2), 'data-drag': 'spawn' }, spawn);
  const icon = el('text', { x: sx, y: sy + k(4.5), 'text-anchor': 'middle', 'font-size': k(13), fill: '#fff', 'pointer-events': 'none' }, spawn);
  icon.textContent = s.playerMode === 'bicycle' ? '🚲' : '🚶';
  const label = el('text', { x: sx, y: sy - k(16), class: 'label', 'font-size': k(12), 'text-anchor': 'middle' }, g);
  label.textContent = '出発';
}

function renderCars() {
  const g = $('cars');
  if (!g || !state.scenario) return;
  g.innerHTML = '';
  for (const car of S.carsAt(state.scenario, state.time, triggerTime())) {
    const v = state.scenario.vehicles[car.index];
    const [x, y] = toPx(car.x, car.z);
    el('rect', { x: -CAR_WIDTH / 2 * ppm(), y: -CAR_LENGTH / 2 * ppm(), width: CAR_WIDTH * ppm(), height: CAR_LENGTH * ppm(),
      rx: 0.4 * ppm(), fill: vehicleColor(v, car.index), class: 'car', 'stroke-width': k(1.2),
      transform: `translate(${x},${y}) rotate(${car.yaw})` }, g);
  }
  const tt = triggerTime();
  $('timeLabel').textContent = fmt(state.time) + ' 秒';
  $('timeSlider').value = state.time;
  if (tt != null && state.time >= tt && S.hasTrigger(state.scenario)) {
    // mark the fired trigger
    const [x, y] = toPx(state.scenario.trigger.x, state.scenario.trigger.z);
    el('circle', { cx: x, cy: y, r: k(6), fill: 'var(--trigger)' }, g);
  }
}

// ------------------------------------------------------------------ pointer interaction
let drag = null;

function snapped(p, event = null) {
  if (!$('snapLanes').checked || event?.altKey) return { x: p.x, z: p.z };
  const hit = S.snapToLane(state.map, p.x, p.z, 3);
  return hit ? { x: hit.x, z: hit.z, lane: hit.lane } : { x: p.x, z: p.z };
}

function onPointerDown(event) {
  if (event.button === 2) return;
  const svg = $('map');
  svg.focus();
  const p = screenToWorld(event);
  const target = event.target.closest('[data-drag]');

  if (state.tool === 'draw' && !(target && target.dataset.drag.startsWith('point:'))) {
    addDrawPoint(snapped(p, event));
    return;
  }
  if (!target) {
    drag = { type: 'pan', sx: event.clientX, sy: event.clientY, view: { ...state.view } };
    svg.classList.add('panning');
    svg.setPointerCapture(event.pointerId);
    return;
  }
  const type = target.dataset.drag;
  const s = state.scenario;
  if (type === 'spawn' || type === 'goal' || type === 'trigger') select({ kind: type });
  else if (type.startsWith('route:')) select({ kind: 'vehicle', index: +type.split(':')[1] });
  else if (type.startsWith('point:')) {
    const [, i, n] = type.split(':').map(Number);
    select({ kind: 'vehicle', index: i, point: n });
  }
  drag = { type, start: p, orig: clone(s), moved: false };
  svg.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  const p = screenToWorld(event);
  state.cursor = p;
  const kind = surfaceKindAt(p);
  $('coords').textContent = `x ${fmt(p.x, 2)}　z ${fmt(p.z, 2)}` + (kind ? `　${kind}` : '');
  if (!drag) {
    if (state.drawing != null) renderOverlay();
    return;
  }
  if (drag.type === 'pan') {
    state.view.tx = drag.view.tx + event.clientX - drag.sx;
    state.view.ty = drag.view.ty + event.clientY - drag.sy;
    $('viewport').setAttribute('transform', `translate(${state.view.tx},${state.view.ty}) scale(${state.view.scale})`);
    return;
  }
  if (!drag.moved) {
    if (Math.hypot(p.x - drag.start.x, p.z - drag.start.z) < 0.15) return;
    drag.moved = true;
    state.undo.push(JSON.stringify(drag.orig));
    state.redo = [];
    state.lastEdit = { key: null, at: 0 };
  }
  const s = state.scenario, o = drag.orig;
  const dx = p.x - drag.start.x, dz = p.z - drag.start.z;
  const t = drag.type;
  if (t === 'spawn') { s.spawn.x = o.spawn.x + dx; s.spawn.z = o.spawn.z + dz; }
  else if (t === 'goal' || t === 'trigger') { s[t].x = o[t].x + dx; s[t].z = o[t].z + dz; }
  else if (t.endsWith('-resize')) {
    const a = s[t.split('-')[0]];
    const r = a.yaw * Math.PI / 180;
    const ux = p.x - a.x, uz = p.z - a.z;
    a.width = Math.max(0.5, 2 * Math.abs(ux * Math.cos(r) - uz * Math.sin(r)));
    a.depth = Math.max(0.5, 2 * Math.abs(ux * Math.sin(r) + uz * Math.cos(r)));
  } else if (t.endsWith('-rotate')) {
    const a = s[t.split('-')[0]];
    let yaw = Math.atan2(p.x - a.x, p.z - a.z) * 180 / Math.PI;
    yaw = event.shiftKey ? Math.round(yaw / 15) * 15 : Math.round(yaw);
    a.yaw = ((yaw % 360) + 360) % 360;
  } else if (t.startsWith('point:')) {
    const [, i, n] = t.split(':').map(Number);
    const q = snapped({ x: o.vehicles[i].route[n].x + dx, z: o.vehicles[i].route[n].z + dz }, event);
    s.vehicles[i].route[n] = { x: q.x, z: q.z };
  } else if (t.startsWith('route:')) {
    const i = +t.split(':')[1];
    s.vehicles[i].route = o.vehicles[i].route.map(q => ({ x: q.x + dx, z: q.z + dz }));
  }
  onScenarioChanged({ inspector: 'values' });
}

function onPointerUp() {
  if (drag?.type === 'pan') $('map').classList.remove('panning');
  if (drag?.moved) onScenarioChanged();
  drag = null;
}

function onWheel(event) {
  event.preventDefault();
  const rect = $('map').getBoundingClientRect();
  const mx = event.clientX - rect.left, my = event.clientY - rect.top;
  const factor = Math.exp(-event.deltaY * 0.0015);
  const scale = Math.min(12, Math.max(0.15, state.view.scale * factor));
  const f = scale / state.view.scale;
  state.view = { scale, tx: mx - (mx - state.view.tx) * f, ty: my - (my - state.view.ty) * f };
  applyView();
}

function onDoubleClick(event) {
  if (state.drawing != null) { finishDrawing(true); return; }
  const target = event.target.closest('[data-drag]');
  if (!target || !target.dataset.drag.startsWith('route:')) return;
  // insert a point on the nearest segment
  const i = +target.dataset.drag.split(':')[1];
  const v = state.scenario.vehicles[i];
  const p = screenToWorld(event);
  let best = { d: Infinity, n: 1 };
  for (let n = 1; n < v.route.length; n++) {
    const d = S.segmentDistance([p.x, p.z], [v.route[n - 1].x, v.route[n - 1].z], [v.route[n].x, v.route[n].z]);
    if (d < best.d) best = { d, n };
  }
  pushUndo();
  const q = snapped(p, event);
  v.route.splice(best.n, 0, { x: q.x, z: q.z });
  select({ kind: 'vehicle', index: i, point: best.n });
  onScenarioChanged();
}

function onContextMenu(event) {
  event.preventDefault();
  if (state.drawing != null) { finishDrawing(); return; }
  const target = event.target.closest('[data-drag]');
  if (target?.dataset.drag.startsWith('point:')) {
    const [, i, n] = target.dataset.drag.split(':').map(Number);
    deletePoint(i, n);
  }
}

function surfaceKindAt(p) {
  if (!state.map) return '';
  const names = { carriageway: '車道', ramp: 'スロープ', sidewalk: '歩道', ground: '地面' };
  for (const kind of ['carriageway', 'ramp', 'sidewalk', 'ground'])
    if (S.distanceToSurface(state.map, p.x, p.z, [kind]) === 0) return names[kind];
  return '';
}

// ------------------------------------------------------------------ editing commands
function select(selection) {
  const changed = JSON.stringify(selection) !== JSON.stringify(state.selection);
  state.selection = selection;
  if (selection?.kind === 'vehicle') state.tab = 'vehicles';
  else if (selection && ['spawn', 'goal', 'trigger'].includes(selection.kind)) state.tab = 'layout';
  if (changed) { renderInspector(); renderOverlay(); }
}

function addVehicle() {
  const s = state.scenario;
  pushUndo();
  const first = !s.vehicles.some(v => v.accident);
  const v = S.newVehicle(first
    ? { name: '事故車', accident: true, start: S.hasTrigger(s) ? S.START_TRIGGER : S.START_BEGIN, delaySeconds: 2 }
    : { name: `車の流れ ${s.vehicles.length}`, start: S.START_BEGIN, delaySeconds: 3, repeatMinSeconds: 4, repeatMaxSeconds: 6, stopOnTrigger: S.hasTrigger(s) });
  s.vehicles.push(v);
  startDrawing(s.vehicles.length - 1);
}

function startDrawing(index) {
  state.drawing = index;
  setTool('draw');
  select({ kind: 'vehicle', index });
  $('drawHint').hidden = false;
  onScenarioChanged();
}

function addDrawPoint(p) {
  if (state.drawing == null) {
    // "車を描く" with nothing selected: start a new vehicle at this click
    addVehicle();
  }
  const v = state.scenario.vehicles[state.drawing];
  const last = v.route.at(-1);
  if (last && Math.hypot(last.x - p.x, last.z - p.z) < 0.3) return;
  pushUndo('draw');
  v.route.push({ x: p.x, z: p.z });
  onScenarioChanged({ inspector: 'values' });
}

function finishDrawing(fromDoubleClick = false) {
  if (state.drawing == null) return;
  const i = state.drawing;
  const v = state.scenario.vehicles[i];
  state.drawing = null;
  $('drawHint').hidden = true;
  setTool('select');
  if (v && v.route.length < 2) {
    state.scenario.vehicles.splice(i, 1);
    state.selection = null;
    toast('ルートには 2 点以上が必要なので、この車は取り消しました。');
  }
  onScenarioChanged({ inspector: 'full' });
}

function deletePoint(i, n) {
  const v = state.scenario.vehicles[i];
  if (v.route.length <= 2) { toast('ルートには 2 点以上が必要です。車ごと消す場合は「この車を削除」。', true); return; }
  pushUndo();
  v.route.splice(n, 1);
  state.selection = { kind: 'vehicle', index: i };
  onScenarioChanged({ inspector: 'full' });
}

function deleteVehicle(i) {
  pushUndo();
  state.scenario.vehicles.splice(i, 1);
  state.selection = null;
  onScenarioChanged({ inspector: 'full' });
}

function setTool(tool) {
  state.tool = tool;
  $('toolSelect').classList.toggle('active', tool === 'select');
  $('toolDraw').classList.toggle('active', tool === 'draw');
  $('map').classList.toggle('drawing', tool === 'draw');
  if (tool === 'select' && state.drawing != null) finishDrawing();
}

/** Central change hook. inspector: 'values' (sync inputs), 'full' (rebuild), 'none'. */
function onScenarioChanged({ inspector = 'values' } = {}) {
  renderOverlay();
  renderCars();
  updateProblems();
  updateHeader();
  updateTimeline();
  if (inspector === 'full') renderInspector();
  else if (inspector === 'values') syncInspectorValues();
}

function refreshAll() {
  renderOverlay();
  renderCars();
  updateProblems();
  updateHeader();
  updateTimeline();
  renderInspector();
  renderList();
}

// ------------------------------------------------------------------ inspector
function field(label, path, type = 'text', options = {}) {
  const value = getPath(state.scenario, path);
  let input;
  if (type === 'select') {
    input = html('select', {}, ...options.choices.map(([v, text]) => html('option', { value: v, selected: v === value }, text)));
  } else if (type === 'textarea') {
    input = html('textarea', { rows: options.rows ?? 2 });
    input.value = value ?? '';
  } else if (type === 'checkbox') {
    input = html('input', { type: 'checkbox' });
    input.checked = !!value;
  } else {
    input = html('input', { type, step: options.step ?? 'any', min: options.min, max: options.max });
    input.value = type === 'number' ? round2(value) : (value ?? '');
  }
  input.dataset.path = path;
  input.dataset.type = type;
  const apply = rebuild => {
    let v = type === 'checkbox' ? input.checked : input.value;
    if (type === 'number') { v = parseFloat(v); if (!Number.isFinite(v)) return; }
    pushUndo(path);
    setPath(state.scenario, path, v);
    options.after?.(v);
    onScenarioChanged({ inspector: rebuild ? 'full' : 'none' });
  };
  if (type === 'checkbox' || type === 'select') input.addEventListener('change', () => apply(true));
  else input.addEventListener('input', () => apply(false));
  const control = options.unit ? html('div', { class: 'unit' }, input, html('span', {}, options.unit)) : input;
  return [html('label', {}, label), control];
}
const round2 = v => (v == null ? '' : Math.round(v * 100) / 100);

function syncInspectorValues() {
  for (const input of $('inspector').querySelectorAll('[data-path]')) {
    if (document.activeElement === input) continue;
    const v = getPath(state.scenario, input.dataset.path);
    if (input.dataset.type === 'checkbox') input.checked = !!v;
    else if (input.dataset.type === 'number') input.value = round2(v);
    else if (v !== undefined) input.value = v;
  }
  const info = $('inspector').querySelector('[data-timing]');
  if (info) info.replaceWith(vehicleTiming(+info.dataset.timing));
}

function renderInspector() {
  const root = $('inspector');
  root.innerHTML = '';
  const s = state.scenario;
  if (!s) return;
  const tabs = [['meta', '場面'], ['layout', '出発・ゴール'], ['vehicles', `車 (${s.vehicles.length})`]];
  const section = html('section', {},
    html('div', { class: 'tabs' }, tabs.map(([id, text]) =>
      html('button', { class: state.tab === id ? 'active' : '', onclick: () => { state.tab = id; renderInspector(); } }, text))));
  root.append(section);

  if (state.tab === 'meta') {
    section.append(html('div', { class: 'form' },
      field('id', 'id', 'text'),
      html('div', { class: 'full note' }, 'ファイル名・CSV の CustomScenario 列になります（英小文字・数字・-・_）'),
      field('名前', 'name', 'text'),
      field('英語名', 'nameEn', 'text'),
      field('分類', 'setting', 'select', { choices: Object.entries(S.SETTING_LABELS) }),
      field('移動', 'playerMode', 'select', { choices: Object.entries(S.MODE_LABELS) }),
      field('学ぶこと', 'learningGoal', 'textarea', { rows: 2 }),
      field('事故の状況', 'situation', 'textarea', { rows: 3 }),
      field('確認ポイント', 'point', 'textarea', { rows: 3 })
    ));
  } else if (state.tab === 'layout') {
    const trigger = S.hasTrigger(s);
    section.append(
      html('h3', {}, html('span', { style: 'color:var(--spawn)' }, '●'), '出発点'),
      html('div', { class: 'form' }, ...field('x', 'spawn.x', 'number', { unit: 'm' }), ...field('z', 'spawn.z', 'number', { unit: 'm' }),
        html('div', { class: 'full note' }, '体験者は出発点からゴールの方を向いて始まります。')),
      html('h3', { style: 'margin-top:14px' }, html('span', { style: 'color:var(--goal)' }, '■'), 'ゴール'),
      areaForm('goal'),
      html('h3', { style: 'margin-top:14px' }, html('span', { style: 'color:var(--trigger)' }, '■'), 'トリガー'),
      html('div', { class: 'form' },
        html('label', {}, '使う'),
        html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: trigger, onchange: e => toggleTrigger(e.target.checked) }),
          '入ったときに「トリガー」の車が出発')),
      trigger ? areaForm('trigger') : html('div', { class: 'note' }, 'トリガーなし：全部の車が場面の開始から数えて出発します。'));
  } else {
    section.append(vehicleList());
    const sel = state.selection;
    if (sel?.kind === 'vehicle' && s.vehicles[sel.index]) root.append(vehicleForm(sel.index));
  }
}

function areaForm(kind) {
  return html('div', { class: 'form' },
    ...field('x', `${kind}.x`, 'number', { unit: 'm' }), ...field('z', `${kind}.z`, 'number', { unit: 'm' }),
    ...field('幅', `${kind}.width`, 'number', { unit: 'm', min: 0.5 }), ...field('奥行き', `${kind}.depth`, 'number', { unit: 'm', min: 0.5 }),
    ...field('向き', `${kind}.yaw`, 'number', { unit: '°' }));
}

function toggleTrigger(on) {
  const s = state.scenario;
  pushUndo();
  if (on) {
    s.trigger = { x: s.spawn.x + (s.goal.x - s.spawn.x) * 0.35, z: s.spawn.z + (s.goal.z - s.spawn.z) * 0.35, width: 4, depth: 4, yaw: 0 };
  } else {
    s.trigger.width = 0; s.trigger.depth = 0;
    for (const v of s.vehicles) { if (v.start === S.START_TRIGGER) v.start = S.START_BEGIN; v.stopOnTrigger = false; }
  }
  onScenarioChanged({ inspector: 'full' });
}

function vehicleList() {
  const s = state.scenario;
  return html('div', {},
    html('div', { class: 'vehicles' }, s.vehicles.map((v, i) =>
      html('div', { class: 'vehicle-row' + (state.selection?.kind === 'vehicle' && state.selection.index === i ? ' active' : ''),
        onclick: () => select({ kind: 'vehicle', index: i }) },
        html('span', { class: 'swatch', style: `background:${vehicleColor(v, i)}` }),
        html('span', { class: 'name' }, v.name || `車 ${i + 1}`),
        v.accident ? html('span', { class: 'tag accident' }, '事故車') : null,
        html('span', { class: 'tag' }, v.start === S.START_TRIGGER ? 'トリガー' : '開始'),
        S.isRepeating(v) ? html('span', { class: 'tag' }, '繰り返し') : null))),
    html('div', { class: 'row-buttons' },
      html('button', { onclick: addVehicle }, '＋ 車を追加して描く'),
      laneMenu()));
}

function laneMenu() {
  const select = html('select', { class: 'small', onchange: e => {
    const lane = state.map.lanes.find(l => l.id === e.target.value);
    if (!lane) return;
    const s = state.scenario;
    pushUndo();
    const first = !s.vehicles.some(v => v.accident);
    s.vehicles.push(S.newVehicle({
      name: first ? '事故車' : `車の流れ ${lane.id}`, accident: first,
      start: first && S.hasTrigger(s) ? S.START_TRIGGER : S.START_BEGIN, delaySeconds: first ? 2 : 3,
      repeatMinSeconds: first ? 0 : 4, repeatMaxSeconds: first ? 0 : 6, stopOnTrigger: !first && S.hasTrigger(s),
      route: lane.points.map(p => ({ x: p.x, z: p.z }))
    }));
    select.value = '';
    state.selection = { kind: 'vehicle', index: s.vehicles.length - 1 };
    onScenarioChanged({ inspector: 'full' });
  } }, html('option', { value: '' }, '組み込みの車線から追加…'),
    ...state.map.lanes.map(l => html('option', { value: l.id }, `${l.id}（${l.points.length} 点）`)));
  return select;
}

function vehicleForm(i) {
  const v = state.scenario.vehicles[i];
  const p = `vehicles.${i}`;
  const models = (state.map.vehicleModels ?? ['Car_Left']).map(m => [m, m]);
  const trigger = S.hasTrigger(state.scenario);
  const form = html('div', { class: 'form' },
    ...field('名前', `${p}.name`, 'text'),
    ...field('車種', `${p}.model`, 'select', { choices: models }),
    ...field('車体', `${p}.body`, 'select', { choices: (state.map.vehicleBodies ?? S.BODIES.map(id => ({ id, label: S.BODY_LABELS[id] })))
      .map(b => [b.id, b.label]) }),
    html('label', {}, '事故車'), html('label', { class: 'check' }, fieldInput(`${p}.accident`, 'checkbox'), 'この車が体験者にぶつかる（CSV に記録）'),
    ...field('速さ', `${p}.speedKmh`, 'number', { unit: 'km/h', min: 5, max: 80, step: 1 }),
    ...field('出発の基準', `${p}.start`, 'select', { choices: trigger
      ? [[S.START_BEGIN, '場面の開始から'], [S.START_TRIGGER, 'トリガーに入ってから']]
      : [[S.START_BEGIN, '場面の開始から']] }),
    ...field('待ち時間', `${p}.delaySeconds`, 'number', { unit: '秒', min: 0, step: 0.5 }),
    html('label', {}, '繰り返す'),
    html('label', { class: 'check' }, html('input', { type: 'checkbox', checked: S.isRepeating(v), onchange: e => {
      pushUndo();
      v.repeatMinSeconds = e.target.checked ? 4 : 0;
      v.repeatMaxSeconds = e.target.checked ? 6 : 0;
      onScenarioChanged({ inspector: 'full' });
    } }), '車の流れ（一定の間隔で次々に出る）'),
    ...(S.isRepeating(v) ? [
      html('label', {}, '間隔'),
      html('div', { class: 'pair' }, fieldInput(`${p}.repeatMinSeconds`, 'number'), fieldInput(`${p}.repeatMaxSeconds`, 'number')),
      ...(trigger ? [html('label', {}, 'トリガーで'), html('label', { class: 'check' }, fieldInput(`${p}.stopOnTrigger`, 'checkbox'), '止める（事故車のために流れを切る）')] : [])
    ] : []),
    html('label', {}, '最初の向き'),
    html('label', { class: 'check' }, fieldInput(`${p}.overrideYaw`, 'checkbox', { rebuild: true }), '指定する（しないとルートの方を向く）'),
    ...(v.overrideYaw ? field('向き', `${p}.yaw`, 'number', { unit: '°' }) : [])
  );
  return html('section', {},
    html('h3', {}, html('span', { class: 'swatch', style: `display:inline-block;width:12px;height:12px;border-radius:3px;background:${vehicleColor(v, i)}` }), v.name || `車 ${i + 1}`),
    form,
    html('div', { style: 'margin-top:10px' }, vehicleTiming(i)),
    html('div', { class: 'row-buttons' },
      html('button', { onclick: () => startDrawing(i) }, '✎ 点を描き足す'),
      html('button', { onclick: () => { pushUndo(); v.route.reverse(); onScenarioChanged({ inspector: 'full' }); } }, '⇄ 逆向き'),
      html('button', { class: 'danger', onclick: () => deleteVehicle(i) }, 'この車を削除')));
}

/** A bare input bound to a path (for compact layouts). */
function fieldInput(path, type, { rebuild = false } = {}) {
  const [, control] = field('', path, type);
  if (rebuild && type === 'checkbox') control.addEventListener('change', () => renderInspector());
  return control;
}

function vehicleTiming(i) {
  const s = state.scenario;
  const v = s.vehicles[i];
  const box = html('div', { class: 'timing', 'data-timing': i });
  if (!v || v.route.length < 2) { box.append('ルートを 2 点以上描いてください。'); return box; }
  const speed = v.speedKmh / 3.6;
  const length = S.routeLength(v.route);
  const drive = S.timeToDistance(length, speed);
  const base = v.start === S.START_TRIGGER ? 'トリガーに入ってから' : '場面の開始から';
  box.append(
    html('div', {}, `ルート ${fmt(length)} m ・ 走り切るまで ${fmt(drive)} 秒`),
    html('div', {}, `${base} `, html('b', {}, `${fmt(v.delaySeconds)} 秒`), ' 後に出現' +
      (S.isRepeating(v) ? `、その後 ${fmt(v.repeatMinSeconds)}〜${fmt(v.repeatMaxSeconds)} 秒ごと` : '')));
  const c = S.conflictPoint(s, v);
  if (c) {
    const carAt = v.delaySeconds + c.carSeconds;
    box.append(html('div', {}, '体験者の線と交わる: 出現から ', html('b', {}, `${fmt(c.carSeconds)} 秒`),
      `（${base.replace('から', '')} ${fmt(carAt)} 秒）`));
    if (v.start === S.START_TRIGGER) {
      const diff = carAt - c.personSeconds;
      box.append(html('div', {}, `体験者（${s.playerMode === 'bicycle' ? '自転車 4 m/s' : '歩行 1.2 m/s'}）はトリガーから約 `, html('b', {}, `${fmt(c.personSeconds)} 秒`),
        ` で到達 → 車は ${Math.abs(diff) < 0.5 ? 'ほぼ同時' : diff > 0 ? `${fmt(diff)} 秒 遅い` : `${fmt(-diff)} 秒 早い`}`));
    }
  } else {
    box.append(html('div', { class: 'note' }, '体験者の出発点→ゴールの直線とは交わりません。'));
  }
  return box;
}

// ------------------------------------------------------------------ problems, header, list
function updateProblems() {
  const s = state.scenario;
  state.problems = S.validate(s, state.map);
  const list = $('problems');
  list.innerHTML = '';
  const errors = state.problems.filter(p => p.level === 'error').length;
  const warnings = state.problems.length - errors;
  $('problemCount').textContent = state.problems.length ? `エラー ${errors} ・ 注意 ${warnings}` : '';
  if (!state.problems.length) list.append(html('div', { class: 'all-good' }, '✓ 問題はありません。Unity で読み込めます。'));
  for (const p of state.problems) {
    list.append(html('div', { class: 'problem ' + p.level, onclick: () => focusTarget(p.target) },
      html('span', { class: 'icon' }, p.level === 'error' ? '✕' : '!'), p.message));
  }
  const status = $('status');
  status.innerHTML = '';
  status.append(html('span', { class: 'pill ' + (errors ? 'error' : warnings ? 'warn' : 'ok') },
    errors ? `エラー ${errors}` : warnings ? `注意 ${warnings}` : 'OK'));
}

function focusTarget(target) {
  if (!target) return;
  const s = state.scenario;
  if (target.kind === 'meta') { state.tab = 'meta'; state.selection = null; renderInspector(); return; }
  if (target.kind === 'vehicle') select({ kind: 'vehicle', index: target.index, point: target.point });
  else select({ kind: target.kind });
  const p = target.kind === 'vehicle'
    ? (target.point != null ? s.vehicles[target.index].route[target.point] : s.vehicles[target.index].route[0])
    : s[target.kind];
  if (!p) return;
  const rect = $('map').getBoundingClientRect();
  const [px, py] = toPx(p.x, p.z);
  state.view.tx = rect.width / 2 - px * state.view.scale;
  state.view.ty = rect.height / 2 - py * state.view.scale;
  applyView();
}

function updateHeader() {
  const f = state.file;
  $('fileName').textContent = f ? (f.template ? `ひな形 ・ ${f.path}（保存すると複製になります）` : f.path) : `${state.scenario.id}.json（未保存）`;
  $('dirty').hidden = !isDirty();
  $('btnDelete').disabled = !f || f.template;
  $('btnUndo').disabled = !state.undo.length;
  $('btnRedo').disabled = !state.redo.length;
  document.title = `${isDirty() ? '● ' : ''}${state.scenario.name} — シナリオエディタ`;
}

function renderList() {
  const root = $('scenarioList');
  root.innerHTML = '';
  const groups = [['マイ場面', state.list.filter(e => !e.template)], ['ひな形（組み込みの 10 場面）', state.list.filter(e => e.template)]];
  for (const [title, entries] of groups) {
    root.append(html('div', { class: 'group' }, title));
    if (!entries.length) root.append(html('div', { class: 'note' }, 'まだありません。「＋ 新規」か、ひな形を開いて保存。'));
    for (const e of entries) {
      root.append(html('div', { class: 'item' + (state.file?.path === e.path ? ' active' : ''), onclick: () => openFile(e.path, e.template),
        title: e.unreadable ?? `${e.errors} エラー / ${e.warnings} 注意` },
        html('span', { class: 'dot' + (e.errors ? ' error' : e.warnings ? ' warn' : '') }),
        html('span', { class: 'name' }, e.name, html('span', { class: 'id' }, e.id)),
        html('span', { class: 'chip' }, S.MODE_LABELS[e.playerMode] ?? '')));
    }
  }
}

async function refreshList() {
  state.list = await api('/api/scenarios');
  renderList();
}

// ------------------------------------------------------------------ files
function confirmDiscard() {
  return !isDirty() || confirm('保存していない変更があります。破棄しますか？');
}

function loadScenario(scenario, file) {
  state.scenario = S.normalize(scenario);
  state.file = file;
  state.saved = file ? S.serialize(state.scenario) : '';
  state.undo = []; state.redo = [];
  state.selection = null; state.drawing = null;
  state.time = 0; state.playing = false;
  state.tab = 'meta';
  setTool('select');
  fitScenario();
  refreshAll();
  $('triggerAuto').checked = true;
  updateTimeline();
}

async function openFile(path, template) {
  if (!confirmDiscard()) return;
  try {
    const scenario = await api('/api/scenario?path=' + encodeURIComponent(path));
    loadScenario(scenario, { path, template });
    try { localStorage.setItem('vrlearn.lastFile', JSON.stringify({ path, template })); } catch { /* optional */ }
  } catch (error) {
    toast('開けません: ' + error.message, true);
  }
}

function nextFreeId(base) {
  const taken = new Set(state.list.map(e => e.id));
  for (let n = 1; n < 1000; n++) {
    const id = `${base}-${String(n).padStart(2, '0')}`;
    if (!taken.has(id)) return id;
  }
  return base + '-' + Date.now();
}

function newScenario() {
  if (!confirmDiscard()) return;
  loadScenario(S.newScenario(nextFreeId('custom')), null);
  // an untouched new scenario is not worth a "discard changes?" question
  state.saved = S.serialize(state.scenario);
  updateHeader();
}

function duplicate() {
  const copy = clone(state.scenario);
  const base = copy.id.replace(/^builtin-/, 'custom-from-').replace(/-\d+$/, '') || 'custom';
  copy.id = nextFreeId(base);
  copy.name = copy.name + '（コピー）';
  loadScenario(copy, null);
  state.saved = '';
  updateHeader();
  toast(`複製しました（${copy.id}）。保存するとファイルになります。`);
}

async function save() {
  const s = state.scenario;
  if (state.file?.template || s.id.startsWith('builtin-')) {
    const id = prompt('ひな形は上書きしません。新しい id を入力してください（英小文字・数字・-・_）', nextFreeId(s.id.replace(/^builtin-/, 'custom-from-')));
    if (!id) return false;
    pushUndo();
    s.id = id.trim();
  }
  if (!S.ID_PATTERN.test(s.id)) { toast('id は英小文字・数字・-・_ の 1〜40 文字にしてください。', true); state.tab = 'meta'; renderInspector(); return false; }
  const path = `${s.id}.json`;
  const renaming = !state.file || state.file.path !== path;
  if (renaming && state.list.some(e => !e.template && e.path === path) && !confirm(`${path} はすでにあります。上書きしますか？`)) return false;
  try {
    const result = await api('/api/scenarios/' + encodeURIComponent(s.id), { method: 'PUT', body: S.serialize(s), headers: { 'Content-Type': 'application/json' } });
    const oldPath = state.file && !state.file.template ? state.file.path : null;
    state.file = { path: result.path, template: false };
    state.saved = S.serialize(s);
    try { localStorage.setItem('vrlearn.lastFile', JSON.stringify(state.file)); } catch { /* optional */ }
    await refreshList();
    updateHeader();
    const errors = result.problems.filter(p => p.level === 'error').length;
    toast(errors ? `保存しました（エラー ${errors} 件：直すまで Unity でもブラウザでも動かせません）` :
      oldPath && oldPath !== result.path ? `${result.path} として保存しました（${oldPath} も残っています）` : `保存しました：${result.path}`, !!errors);
    return true;
  } catch (error) {
    toast('保存できません: ' + error.message, true);
    return false;
  }
}

async function removeFile() {
  if (!state.file || state.file.template) return;
  if (!confirm(`${state.file.path} を削除しますか？` + (state.server ? '（Scenarios/.trash に移動します）' : '（このブラウザから消えます）'))) return;
  try {
    await api('/api/scenarios/' + encodeURIComponent(state.file.path.replace(/\.json$/, '')), { method: 'DELETE' });
    state.saved = S.serialize(state.scenario);
    await refreshList();
    toast(state.server ? '削除しました（.trash に移動）' : '削除しました');
    newScenario();
  } catch (error) {
    toast('削除できません: ' + error.message, true);
  }
}

let playPoll = 0;
async function playInUnity() {
  const errors = S.validate(state.scenario, state.map).filter(p => p.level === 'error');
  if (errors.length) { toast(`エラー ${errors.length} 件を直してから試してください。`, true); return; }
  let path = state.file?.path;
  if (!state.file?.template && (isDirty() || !state.file)) {
    if (!(await save())) return;
    path = state.file.path;
  }
  try {
    await api('/api/play', { method: 'POST', body: JSON.stringify({ path }), headers: { 'Content-Type': 'application/json' } });
    toast('Unity に送りました。Unity エディタの反応を待っています…');
    clearInterval(playPoll);
    const started = Date.now();
    playPoll = setInterval(async () => {
      const { pending } = await api('/api/play').catch(() => ({ pending: true }));
      if (!pending) { clearInterval(playPoll); toast('Unity で再生を始めました。'); }
      else if (Date.now() - started > 15000) {
        clearInterval(playPoll);
        toast('Unity が反応しません。Unity エディタでこのプロジェクトを開き、再生中でないことを確認してください。', true);
      }
    }, 1000);
  } catch (error) {
    toast('送れません: ' + error.message, true);
  }
}

// ------------------------------------------------------------------ browser play, files
/** "▶ ブラウザで試す": the simulator (../index.html) picks the scenario up from localStorage. */
function playInBrowser() {
  const errors = S.validate(state.scenario, state.map).filter(p => p.level === 'error');
  if (errors.length) { toast(`エラー ${errors.length} 件を直してから試してください。`, true); return; }
  try { localStorage.setItem(PLAY_KEY, S.serialize(state.scenario)); }
  catch { toast('ブラウザに渡せません（保存領域を使えません）。', true); return; }
  const tab = window.open('../index.html?play=editor', 'vrlearn-sim');
  if (!tab) toast('新しいタブを開けません（ポップアップを許可してください）。', true);
  else toast('シミュレーターのタブで「開始」を押してください。');
}

function downloadJson() {
  const blob = new Blob([S.serialize(state.scenario)], { type: 'application/json' });
  const a = html('a', { href: URL.createObjectURL(blob), download: `${state.scenario.id}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || !confirmDiscard()) return;
  try {
    const scenario = S.normalize(JSON.parse(await file.text()));
    if (scenario.id.startsWith('builtin-')) scenario.id = nextFreeId(scenario.id.replace(/^builtin-/, 'custom-from-'));
    loadScenario(scenario, null);
    state.saved = '';
    updateHeader();
    toast(`${file.name} を読み込みました。保存すると「マイ場面」に入ります。`);
  } catch (error) {
    toast('読み込めません: ' + error.message, true);
  }
}

// ------------------------------------------------------------------ Quest
async function questCheck() {
  const box = $('questStatus');
  box.textContent = '確認中…';
  $('questSend').disabled = true;
  try {
    const status = await api('/api/quest');
    box.innerHTML = '';
    if (status.error) { box.append(html('div', { class: 'bad' }, status.error)); return; }
    box.append(html('div', {}, `アプリ: ${status.package ?? '(不明)'}`));
    const ready = status.devices.filter(d => d.state === 'device');
    if (!status.devices.length) box.append(html('div', { class: 'bad' }, 'Quest が見つかりません。USB でつなぐか、ワイヤレス adb で接続してください。'));
    for (const d of status.devices) {
      const note = d.state === 'device' ? html('span', { class: 'ok' }, '接続済み')
        : d.state === 'unauthorized' ? html('span', { class: 'bad' }, 'ヘッドセットで「USB デバッグを許可」を選んでください')
        : html('span', { class: 'bad' }, d.state);
      box.append(html('div', { class: 'device' }, `${d.model || 'Android'}（${d.serial}）`, note));
    }
    const mine = state.list.filter(e => !e.template);
    box.append(html('div', {}, `送る場面: ${mine.filter(e => !e.errors).length} 件` +
      (mine.some(e => e.errors) ? `（エラーのある ${mine.filter(e => e.errors).length} 件は送りません）` : '')));
    $('questSend').disabled = !ready.length;
  } catch (error) {
    box.textContent = '確認できません: ' + error.message;
  }
}

async function openQuestDialog() {
  $('questResult').innerHTML = '';
  $('questDialog').showModal();
  await questCheck();
}

async function questSend() {
  const result = $('questResult');
  if (isDirty() && confirm('保存していない変更があります。保存してから送りますか？')) {
    if (!(await save())) return;
  }
  $('questSend').disabled = true;
  result.textContent = '送っています…';
  try {
    const report = await api('/api/quest/sync', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    result.innerHTML = '';
    for (const r of report.results) {
      result.append(r.error
        ? html('div', { class: 'error' }, `${r.model || r.serial}: ${r.error}`)
        : html('div', {}, `${r.model || r.serial}: ${r.pushed.length} 件コピー` + (r.removed.length ? `、${r.removed.length} 件削除（${r.removed.join(', ')}）` : '')));
    }
    if (report.skipped.length) result.append(html('div', { class: 'error' }, 'エラーのため送らなかった場面: ' + report.skipped.map(s => s.id).join(', ')));
    if (report.results.some(r => !r.error))
      result.append(html('div', {}, 'Quest のタイトル画面で「カスタム」タブを開き、「読み直す」を押すと一覧に出ます。'));
  } catch (error) {
    result.innerHTML = '';
    result.append(html('div', { class: 'error' }, '送れません: ' + error.message));
  } finally {
    $('questSend').disabled = false;
  }
}

// ------------------------------------------------------------------ timeline
function estimatedTriggerTime() {
  const s = state.scenario;
  if (!S.hasTrigger(s)) return null;
  const speed = s.playerMode === 'bicycle' ? S.BICYCLE_SPEED : S.WALK_SPEED;
  // distance from the spawn to where the straight walk enters the trigger area
  const steps = 200;
  for (let n = 0; n <= steps; n++) {
    const f = n / steps;
    const p = [s.spawn.x + (s.goal.x - s.spawn.x) * f, s.spawn.z + (s.goal.z - s.spawn.z) * f];
    if (S.pointInArea(p, s.trigger)) return Math.round(Math.hypot(p[0] - s.spawn.x, p[1] - s.spawn.z) / speed * 10) / 10;
  }
  return null;
}

function triggerTime() {
  if (!S.hasTrigger(state.scenario) || !$('triggerOn').checked) return null;
  const t = parseFloat($('triggerTime').value);
  return Number.isFinite(t) ? t : null;
}

function updateTimeline() {
  const s = state.scenario;
  const hasTrigger = S.hasTrigger(s);
  $('triggerOn').disabled = !hasTrigger;
  $('triggerTime').disabled = !hasTrigger || $('triggerAuto').checked;
  $('triggerAuto').disabled = !hasTrigger;
  if (hasTrigger && $('triggerAuto').checked) {
    const estimate = estimatedTriggerTime();
    $('triggerTime').value = estimate ?? 5;
  }
  const tt = triggerTime();
  let horizon = 20;
  for (const v of s.vehicles) {
    if (v.route.length < 2) continue;
    const times = S.spawnTimes(v, tt, 60);
    if (times.length) horizon = Math.max(horizon, Math.min(60, times.at(-1) + S.timeToDistance(S.routeLength(v.route), v.speedKmh / 3.6)));
  }
  $('timeSlider').max = Math.ceil(horizon);
  const accident = s.vehicles.findIndex(v => v.accident);
  let info = hasTrigger ? (tt == null ? 'トリガーに入らない場合' : `トリガー進入 ${fmt(tt)} 秒`) : 'トリガーなし';
  if (accident >= 0) {
    const v = s.vehicles[accident];
    const c = S.conflictPoint(s, v);
    const start = v.start === S.START_TRIGGER ? tt : 0;
    if (c && start != null) info += ` ・ 事故車が体験者の線に着くのは ${fmt(start + v.delaySeconds + c.carSeconds)} 秒`;
  }
  $('timelineInfo').textContent = info;
}

function tick(now) {
  if (!state.playing) return;
  const dt = Math.min(0.1, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  state.time = Math.min(+$('timeSlider').max, state.time + dt);
  renderCars();
  if (state.time >= +$('timeSlider').max) togglePlay(false);
  else requestAnimationFrame(tick);
}

function togglePlay(on = !state.playing) {
  state.playing = on;
  $('btnTimePlay').textContent = on ? '⏸' : '▶';
  if (on) {
    if (state.time >= +$('timeSlider').max) state.time = 0;
    state.lastFrame = performance.now();
    requestAnimationFrame(tick);
  }
}

// ------------------------------------------------------------------ wiring
function onKey(event) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); save(); return; }
  if (typing) return;
  if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
  if (event.key === 'Enter' || event.key === 'Escape') {
    if (state.drawing != null) finishDrawing();
    else if (event.key === 'Escape') select(null);
    return;
  }
  if (event.key === ' ') { event.preventDefault(); togglePlay(); return; }
  if (event.key === 'v' || event.key === 'V') setTool('select');
  if (event.key === 'c' || event.key === 'C') setTool('draw');
  if (event.key === 'f' || event.key === 'F') fitScenario();
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const sel = state.selection;
    if (sel?.kind === 'vehicle' && sel.point != null) deletePoint(sel.index, sel.point);
    else if (sel?.kind === 'vehicle') deleteVehicle(sel.index);
  }
}

function wire() {
  const svg = $('map');
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('dblclick', onDoubleClick);
  svg.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('keydown', onKey);
  for (const id of ['layerSurfaces', 'layerLanes', 'layerWalls', 'layerSignals']) $(id).addEventListener('change', applyLayers);
  $('toolSelect').onclick = () => setTool('select');
  $('toolDraw').onclick = () => {
    if (state.selection?.kind === 'vehicle') startDrawing(state.selection.index);
    else setTool('draw');
  };
  $('btnFit').onclick = fitScenario;
  $('btnNew').onclick = newScenario;
  $('btnDuplicate').onclick = duplicate;
  $('btnSave').onclick = save;
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;
  $('btnDelete').onclick = removeFile;
  $('btnPlay').onclick = playInUnity;
  $('btnTry').onclick = playInBrowser;
  $('btnDownload').onclick = downloadJson;
  $('importFile').addEventListener('change', importJson);
  $('btnQuest').onclick = openQuestDialog;
  $('questRefresh').onclick = questCheck;
  $('questSend').onclick = questSend;
  $('questClose').onclick = () => $('questDialog').close();
  $('btnTimePlay').onclick = () => togglePlay();
  $('timeSlider').addEventListener('input', e => { state.time = +e.target.value; renderCars(); });
  for (const id of ['triggerOn', 'triggerAuto']) $(id).addEventListener('change', () => { updateTimeline(); renderCars(); });
  $('triggerTime').addEventListener('input', () => { updateTimeline(); renderCars(); });
  let lastSize = null;
  window.addEventListener('resize', () => {
    const rect = $('map').getBoundingClientRect();
    if (lastSize) { state.view.tx += (rect.width - lastSize.width) / 2; state.view.ty += (rect.height - lastSize.height) / 2; }
    lastSize = { width: rect.width, height: rect.height };
    applyView();
  });
  lastSize = $('map').getBoundingClientRect();
  window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
}

/** The local server answers only when the Unity project is next to this one (and on this computer). */
async function detectServer() {
  // the server only answers this computer: no probe (and no 404 in the console) on Pages or the LAN
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false;
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    return response.ok && (await response.json()).server === true;
  } catch { return false; }
}

async function main() {
  wire();
  state.server = await detectServer();
  document.body.classList.toggle('server', state.server);
  $('mode').textContent = state.server ? 'Unity プロジェクトに保存' : 'このブラウザに保存';
  $('mode').title = state.server ? 'VRLearn/Scenarios に保存します。Unity での再生と Quest への送信が使えます。'
    : 'マイ場面はこのブラウザだけに残ります。「⇩ JSON」で書き出せます。Unity と Quest には、ローカルで serve.mjs を動かして送ります。';
  try {
    state.map = await api('/api/map');
  } catch (error) {
    $('loading').textContent = '地図を読めません（VRLearn で Export Map For Scenario Editor を実行し、tools/sync.mjs で取り込んでください）: ' + error.message;
    return;
  }
  buildMapLayers();
  await refreshList();
  $('loading').hidden = true;
  // ?open=templates/builtin-01.json&select=vehicle:2&time=12&layers=surfaces — a shareable view
  const params = new URLSearchParams(location.search);
  let last = null;
  try { last = JSON.parse(localStorage.getItem('vrlearn.lastFile')); } catch { /* optional */ }
  const wanted = params.get('open') ?? last?.path;
  const entry = wanted && state.list.find(e => e.path === wanted);
  if (entry) await openFile(entry.path, entry.template);
  else if (state.list.length) await openFile(state.list[0].path, state.list[0].template);
  else loadScenario(S.newScenario(nextFreeId('custom')), null);
  const sel = params.get('select');
  if (sel) {
    const [kind, index, point] = sel.split(':');
    select(kind === 'vehicle' ? { kind, index: +index, point: point == null ? undefined : +point } : { kind });
  }
  for (const layer of (params.get('layers') ?? '').split(',').filter(Boolean)) {
    const box = $('layer' + layer[0].toUpperCase() + layer.slice(1));
    if (box) { box.checked = true; applyLayers(); }
  }
  if (params.has('time')) { state.time = +params.get('time'); renderCars(); }
}

// test hook (the page's state for automated checks)
window.__editor = { state, S };
main();
