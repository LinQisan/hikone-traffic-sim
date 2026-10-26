// VRLearn scenario editor (browser). Data model and checks live in the shared scenario.js
// (a copy of VRLearn's ScenarioModel/scenario.js, see tools/sync.mjs). Files go through the local
// server (server/editor-api.mjs: the Unity project's Scenarios/, Unity play, Quest) when it runs,
// otherwise through store.js (this browser's localStorage).
import * as S from '../simulation/core/scenario.ts';
import { Traffic } from '../simulation/traffic/Traffic.ts';
import * as store from './store.ts';
import { toMapPixel, fromMapPixel, coordinateGrid, coordinateText, containsPoint, imagePlacement } from './map-coordinates.ts';

import type {EditorState, EditorMap, EditorEntry, EditorFile, Selection, EditorTool, QuestStatus, QuestReport} from '../types/editor.ts';
import type {Point, Area, Scenario, VehicleSpec, ScenarioProblem, ProblemTarget} from '../types/scenario.ts';
import {errorMessage} from '../utils/errors.ts';
import {downloadBlob} from '../utils/download.ts';
import {ResourceScope} from '../utils/ResourceScope.ts';

export function createEditorController() {
const scope = new ResourceScope();
let revision = 0, inspectorRevision = 0;
const listeners = new Set<() => void>();
const publish = () => {if (!scope.disposed) {revision++; for (const listener of listeners) listener();}};
const $ = <T extends Element = HTMLElement>(id: string): T => {const element = document.getElementById(id); if (!element) throw new Error('Missing editor element: ' + id); return element as unknown as T;};
const ui = {
  loading: '地図を読み込み中…', loaded: false, coords: '', toast: {text: '', error: false, visible: false},
  coordinateOpen: false, coordinateX: '', coordinateZ: '',
  layers: {layerGrid: true, layerSurfaces: false, layerLanes: true, layerWalls: false, layerSignals: true, snapLanes: true},
  triggerOn: true, triggerAuto: true, triggerTime: '', horizon: 40, timelineInfo: '',
  questOpen: false, questBusy: false, questStatus: null as QuestStatus | null, questError: '', questResult: null as QuestReport | null, questMessage: '',
};
const SVG = 'http://www.w3.org/2000/svg';
const PALETTE = ['#ff9f1c', '#2ec4b6', '#9b5de5', '#00bbf9', '#f15bb5', '#8ac926', '#fee440', '#4d7cfe'];
const ACCIDENT_COLOR = '#ff6b5e';
const PLAY_KEY = 'vrlearn.editor.play';      // read by the simulator's title (?play=editor)
const CAR_LENGTH = 4.4, CAR_WIDTH = 1.8;

const state: EditorState = {
  map: null,
  list: [],
  file: null,            // { path, template } of the loaded file; null = not saved yet
  scenario: S.newScenario('custom'),
  saved: '',             // serialized text as last loaded/saved (dirty check)
  selection: null,       // { kind: 'spawn'|'goal'|'trigger'|'vehicle', index?, point? }
  tab: 'meta',
  tool: 'select',
  drawing: null,         // index of the vehicle whose route is being drawn
  cursor: null,          // world position of the pointer
  reference: null,       // read-only map annotation, independent of the scenario and undo history
  view: { scale: 1, tx: 0, ty: 0 },
  undo: [], redo: [], lastEdit: { key: null, at: 0 },
  time: 0, playing: false, lastFrame: 0,
  problems: [],
  server: false          // true: the local server with the Unity project answers /api/…
};

// Initial placeholder is clean; loading the first file must not ask to discard it.
state.saved = S.serialize(state.scenario);

// ------------------------------------------------------------------ utilities
async function api<T>(path: string, options: {method?: string; body?: string; headers?: Record<string, string>} = {}): Promise<T> {
  if (!state.server) {const result = await store.request(path, options) as T; scope.check(); return result;}
  const response = await fetch(path, {...options, signal: scope.signal});
  const body = await response.json().catch(() => ({}));
  scope.check();
  if (!response.ok) throw new Error(body.error || response.statusText);
  return body;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string, error = false) {
  ui.toast = {text: message, error, visible: true}; publish();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => {ui.toast.visible = false; publish();}, 3500);
}
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent: Element | null = null): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  parent?.appendChild(node); return node;
};
const fmt = (v: number, digits = 1) => Number(v).toFixed(digits);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function getPath(path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, state.scenario);
}
function setPath(path: string, value: string | number | boolean) {
  const keys = path.split('.'), last = keys.pop()!;
  const target = keys.reduce<unknown>((object, key) => (object as Record<string, unknown>)[key], state.scenario);
  if (!target || typeof target !== 'object') throw new Error('Invalid scenario field: ' + path);
  (target as Record<string, unknown>)[last] = value;
}
function setField(path: string, value: string | number | boolean, after?: (value: string | number | boolean) => void) {
  pushUndo(path); setPath(path, value); after?.(value); onScenarioChanged({inspector: 'none'});
}
// ------------------------------------------------------------------ coordinates
const world = () => state.map!.world;
const ppm = () => state.map!.pixelsPerMeter;
const toPx = (x: number, z: number) => toMapPixel(state.map!, x, z);
const fromPx = (px: number, py: number) => fromMapPixel(state.map!, px, py);
function screenToWorld(event: MouseEvent) {
  const rect = $('map').getBoundingClientRect();
  const { scale, tx, ty } = state.view;
  return fromPx((event.clientX - rect.left - tx) / scale, (event.clientY - rect.top - ty) / scale);
}
/** Screen pixels → image pixels, so markers keep their size while zooming. */
const k = (px: number) => px / state.view.scale;

function vehicleColor(v: VehicleSpec, i: number) { return v.accident ? ACCIDENT_COLOR : PALETTE[i % PALETTE.length]; }

// ------------------------------------------------------------------ undo / dirty
function snapshot() { return JSON.stringify(state.scenario); }
function pushUndo(key: string | null = null) {
  const now = performance.now();
  if (key && key === state.lastEdit.key && now - state.lastEdit.at < 900) { state.lastEdit.at = now; return; }
  state.lastEdit = { key, at: now };
  state.undo.push(snapshot());
  if (state.undo.length > 200) state.undo.shift();
  state.redo = [];
}
function undo() {
  if (!state.undo.length) return;
  stopDrawing();
  state.redo.push(snapshot());
  state.scenario = JSON.parse(state.undo.pop()!);
  state.lastEdit = { key: null, at: 0 };
  fixSelection();
  refreshAll();
}
function redo() {
  if (!state.redo.length) return;
  stopDrawing();
  state.undo.push(snapshot());
  state.scenario = JSON.parse(state.redo.pop()!);
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
  const svg = $<SVGSVGElement>('map');
  svg.innerHTML = '';
  const viewport = el('g', { id: 'viewport' }, svg);
  const revision = state.map!.imageRevision ?? '';
  const imageUrl = new URL(state.map!.imageUrl ?? '../api/map/image', location.href);
  imageUrl.searchParams.set('v', revision);
  el('image', { href: imageUrl.href, x: 0, y: 0, preserveAspectRatio: 'none',
    width: state.map!.imageWidth, height: state.map!.imageHeight, id: 'mapImage' }, viewport);
  if (state.map!.detail) {
    const detail = state.map!.detail, url = new URL('../data/' + detail.file, document.baseURI);
    url.searchParams.set('v', revision);
    el('image', { ...imagePlacement(state.map!, detail), href: url.href, preserveAspectRatio: 'none', id: 'mapDetail' }, viewport);
  }

  const surfaces = el('g', { id: 'layerSurfacesG' }, viewport);
  for (const surface of state.map!.surfaces) {
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
  for (const lane of state.map!.lanes) {
    el('polyline', { points: lane.points.map(p => toPx(p.x, p.z).join(',')).join(' '), class: 'lane',
      'vector-effect': 'non-scaling-stroke', 'stroke-width': 1.5, 'marker-end': 'url(#arrow)' }, lanes)
      .appendChild(document.createElementNS(SVG, 'title')).textContent = lane.id + ' — ' + lane.name;
  }
  const walls = el('g', { id: 'layerWallsG' }, viewport);
  let water = '';
  for (const wall of state.map!.walls) {
    const pts = [];
    for (let i = 0; i < wall.polygon.length; i += 2) pts.push(toPx(wall.polygon[i], wall.polygon[i + 1]).join(','));
    let area = 0;
    for (let i = 0; i < wall.polygon.length; i += 2) {
      const next = (i + 2) % wall.polygon.length;
      area += wall.polygon[i] * wall.polygon[next + 1] - wall.polygon[next] * wall.polygon[i + 1];
    }
    if (area < 0) pts.reverse(); // Same winding makes overlapping fragments a filled union.
    if (pts.length) water += 'M' + pts.join('L') + 'Z';
  }
  // One filled union keeps the forbidden-water hint without exposing collision triangulation.
  el('path', { d: water, class: 'wall', 'fill-rule': 'nonzero' }, walls);
  el('g', { id: 'placeLabels', 'aria-hidden': 'true' }, viewport);
  el('g', { id: 'layerSignalsG' }, viewport);
  el('g', { id: 'overlay' }, viewport);
  el('g', { id: 'cars' }, viewport);
  el('g', { id: 'referencePoint', 'aria-hidden': 'true' }, viewport);
  el('g', { id: 'coordinateGrid', class: 'coordinate-grid', 'aria-hidden': 'true' }, svg);
  applyLayers();
}

function applyLayers() {
  $('layerSurfacesG').style.display = ui.layers.layerSurfaces ? '' : 'none';
  $('layerLanesG').style.display = ui.layers.layerLanes ? '' : 'none';
  $('layerWallsG').style.display = ui.layers.layerWalls ? '' : 'none';
  $('layerSignalsG').style.display = ui.layers.layerSignals ? '' : 'none';
  renderCoordinateGrid();
}

function renderCoordinateGrid() {
  const g = $('coordinateGrid');
  if (!g || !state.map) return;
  g.replaceChildren();
  if (!ui.layers.layerGrid) return;
  const { width, height } = $('map').getBoundingClientRect();
  const grid = coordinateGrid(state.map, state.view, width, height);
  let lines = '', axes = '';
  for (const [axis, ticks] of [['x', grid.x], ['z', grid.z]] as const) for (const tick of ticks) {
    const line = axis === 'x' ? `M${tick.pixel},24V${height}` : `M44,${tick.pixel}H${width}`;
    if (tick.value === 0) axes += line;
    else lines += line;
  }
  el('path', { d: lines, class: 'coordinate-lines' }, g);
  el('path', { d: axes, class: 'coordinate-axes' }, g);
  el('rect', { x: 0, y: 0, width, height: 24, class: 'coordinate-ruler' }, g);
  el('rect', { x: 0, y: 24, width: 44, height: Math.max(0, height - 24), class: 'coordinate-ruler' }, g);
  for (const tick of grid.x) if (tick.pixel > 60 && tick.pixel < width - 36)
    el('text', { x: tick.pixel, y: 16, 'text-anchor': 'middle' }, g).textContent = String(tick.value);
  for (const tick of grid.z) if (tick.pixel > 44 && tick.pixel < height - 16)
    el('text', { x: 37, y: tick.pixel + 4, 'text-anchor': 'end' }, g).textContent = String(tick.value);
  el('text', { x: width - 8, y: 16, 'text-anchor': 'end' }, g).textContent = 'X →';
  el('text', { x: 7, y: 16 }, g).textContent = 'Z ↑';
  $('map').dataset.gridStep = String(grid.step);
}

function renderReference() {
  const g = $('referencePoint');
  g.replaceChildren();
  if (!state.reference) return;
  const [x, y] = toPx(state.reference.x, state.reference.z);
  el('circle', { cx: x, cy: y, r: k(8), class: 'reference-pin', 'stroke-width': k(2) }, g);
  el('path', { d: `M${x - k(15)},${y}H${x + k(15)}M${x},${y - k(15)}V${y + k(15)}`,
    class: 'reference-cross', 'stroke-width': k(1.5) }, g);
  const screenX = x * state.view.scale + state.view.tx;
  const left = screenX > $('map').getBoundingClientRect().width - 210;
  el('text', { x: x + k(left ? -16 : 16), y: y - k(15), 'text-anchor': left ? 'end' : 'start',
    'font-size': k(12), class: 'label reference-label' }, g)
    .textContent = coordinateText(state.reference).replace(' (m)', '');
}

function referencePoint(point: Point, centre = false) {
  if (!containsPoint(state.map!, point)) {
    toast('地図の範囲内の X・Z 座標を指定してください。', true);
    return;
  }
  state.reference = { x: +point.x.toFixed(2), z: +point.z.toFixed(2) };
  ui.coordinateOpen = true; ui.coordinateX = fmt(state.reference.x, 2); ui.coordinateZ = fmt(state.reference.z, 2); publish();
  if (centre) {
    const rect = $('map').getBoundingClientRect(), [x, y] = toPx(point.x, point.z);
    state.view.scale = Math.max(state.view.scale, 12 / ppm());
    state.view.tx = rect.width / 2 - x * state.view.scale;
    state.view.ty = rect.height / 2 - y * state.view.scale;
    applyView();
  } else renderReference();
  toast('地点を指定しました：' + coordinateText(state.reference));
}

async function copyCoordinates() {
  if (!state.reference) return;
  try {
    await navigator.clipboard.writeText(coordinateText(state.reference));
    toast('座標をコピーしました。');
  } catch {
    $('coordinateValue').focus();
    $<HTMLInputElement>('coordinateValue').select();
    toast('座標を選択しました。Ctrl+C / ⌘C でコピーしてください。');
  }
}

function renderSignals() {
  const g = $('layerSignalsG');
  g.innerHTML = '';
  for (const s of state.map!.signals) {
    const [x, y] = toPx(s.x, s.z);
    el('rect', { x: x - k(4), y: y - k(4), width: k(8), height: k(8), class: 'signal', 'stroke-width': k(1) }, g)
      .appendChild(document.createElementNS(SVG, 'title')).textContent = s.name;
  }
}

function renderPlaces() {
  const g = $('placeLabels');
  g.replaceChildren();
  if (state.view.scale * ppm() > 2) return;
  for (const place of state.map!.places ?? []) {
    const [x, y] = toPx(place.x, place.z);
    el('text', { x, y: y - k(13), 'text-anchor': 'middle', 'font-size': k(13), class: 'label' }, g).textContent = place.name;
  }
}

function applyView() {
  const { scale, tx, ty } = state.view;
  $('viewport').setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  renderSignals();
  renderOverlay();
  renderCars();
  renderCoordinateGrid();
  renderReference();
  renderPlaces();
}

function fitTo(points: Point[], padding = 40) {
  const rect = $('map').getBoundingClientRect();
  const px = points.map(p => toPx(p.x, p.z));
  const xs = px.map(p => p[0]), ys = px.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 25 * ppm()), h = Math.max(maxY - minY, 25 * ppm());
  const scale = Math.min((rect.width - padding * 2) / w, (rect.height - padding * 2) / h, 24 / ppm());
  state.view = { scale, tx: rect.width / 2 - scale * (minX + maxX) / 2, ty: rect.height / 2 - scale * (minY + maxY) / 2 };
  applyView();
}

function fitScenario() {
  const s = state.scenario;
  const pts = [s.spawn, s.goal, ...(S.hasTrigger(s) ? [s.trigger] : []), ...s.vehicles.flatMap(v => v.route)];
  fitTo(pts.length > 2 ? pts : [{ x: world().xMin, z: world().zMin }, { x: world().xMax, z: world().zMax }]);
}

function fitMap() {
  fitTo([{ x: world().xMin, z: world().zMin }, { x: world().xMax, z: world().zMax }], 52);
}

// ------------------------------------------------------------------ overlay (scenario objects)
function areaShape(g: Element, area: Area, kind: 'goal' | 'trigger') {
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
    const v = s.vehicles[state.drawing!];
    const target = snapped(state.cursor);
    if (v?.route.length) {
      const [x1, y1] = toPx(v.route.at(-1)!.x, v.route.at(-1)!.z);
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

let preview: Traffic | null = null, previewKey = '';
function renderCars() {
  const g = $('cars');
  if (!g || !state.scenario) return;
  g.innerHTML = '';
  const key = S.serialize(state.scenario) + triggerTime();
  if (!preview || key !== previewKey || state.time < preview.time) {
    preview = new Traffic(state.scenario, { seed: 7 }); previewKey = key;
  }
  while (preview.time + 1e-9 < state.time) {
    if (triggerTime() != null && preview.time >= triggerTime()!) preview.trigger();
    preview.step(Math.min(1 / 30, state.time - preview.time));
  }
  for (const car of preview.cars) {
    const v = state.scenario.vehicles[car.vehicle];
    const [x, y] = toPx(car.x, car.z);
    el('rect', { x: -CAR_WIDTH / 2 * ppm(), y: -CAR_LENGTH / 2 * ppm(), width: CAR_WIDTH * ppm(), height: CAR_LENGTH * ppm(),
      rx: 0.4 * ppm(), fill: vehicleColor(v, car.vehicle), class: 'car', 'stroke-width': k(1.2),
      transform: `translate(${x},${y}) rotate(${car.yaw})` }, g);
  }
  const tt = triggerTime();
  // UI changes at tenths of a second; preview traffic still advances at its existing rate.
  if (Math.floor(state.time * 10) !== lastUITime) {lastUITime = Math.floor(state.time * 10); publish();}
  if (tt != null && state.time >= tt && S.hasTrigger(state.scenario)) {
    // mark the fired trigger
    const [x, y] = toPx(state.scenario.trigger.x, state.scenario.trigger.z);
    el('circle', { cx: x, cy: y, r: k(6), fill: 'var(--trigger)' }, g);
  }
}

// ------------------------------------------------------------------ pointer interaction
let drag: ({type: 'pan'; sx: number; sy: number; view: EditorState['view']; reference: boolean; point: Point; moved: boolean} | {type: string; start: Point; orig: Scenario; moved: boolean}) | null = null;
let lastUITime = -1;

function snapped(p: Point, event: Pick<MouseEvent, 'altKey'> | null = null) {
  if (!ui.layers.snapLanes || event?.altKey) return { x: p.x, z: p.z };
  const hit = S.snapToLane(state.map!, p.x, p.z, 3);
  return hit ? { x: hit.x, z: hit.z, lane: hit.lane } : { x: p.x, z: p.z };
}

function onPointerDown(event: PointerEvent) {
  if (event.button === 2) return;
  const svg = $<SVGSVGElement>('map');
  svg.focus();
  const p = screenToWorld(event);
  const target = (event.target as Element | null)?.closest<SVGElement>('[data-drag]');

  if (state.tool === 'coordinates' || (!target && state.tool !== 'draw')) {
    drag = { type: 'pan', sx: event.clientX, sy: event.clientY, view: { ...state.view },
      reference: state.tool === 'coordinates', point: p, moved: false };
    svg.classList.add('panning');
    svg.setPointerCapture(event.pointerId);
    return;
  }
  if (state.tool === 'draw' && !(target && target.dataset.drag?.startsWith('point:'))) {
    addDrawPoint(snapped(p, event));
    return;
  }
  if (!target?.dataset.drag) return;
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

function onPointerMove(event: PointerEvent) {
  const p = screenToWorld(event);
  state.cursor = p;
  const kind = surfaceKindAt(p);
  ui.coords = `x ${fmt(p.x, 2)}　z ${fmt(p.z, 2)}` + (kind ? `　${kind}` : '');
  publish();
  if (!drag) {
    if (state.drawing != null) renderOverlay();
    return;
  }
  if ('sx' in drag) {
    if (Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > 4) drag.moved = true;
    state.view.tx = drag.view.tx + event.clientX - drag.sx;
    state.view.ty = drag.view.ty + event.clientY - drag.sy;
    $('viewport').setAttribute('transform', `translate(${state.view.tx},${state.view.ty}) scale(${state.view.scale})`);
    renderCoordinateGrid();
    renderPlaces();
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
    const a = s[t.split('-')[0] as 'goal' | 'trigger'];
    const r = a.yaw * Math.PI / 180;
    const ux = p.x - a.x, uz = p.z - a.z;
    a.width = Math.max(0.5, 2 * Math.abs(ux * Math.cos(r) - uz * Math.sin(r)));
    a.depth = Math.max(0.5, 2 * Math.abs(ux * Math.sin(r) + uz * Math.cos(r)));
  } else if (t.endsWith('-rotate')) {
    const a = s[t.split('-')[0] as 'goal' | 'trigger'];
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

function onPointerUp(event: PointerEvent) {
  if (drag?.type === 'pan') $('map').classList.remove('panning');
  if (drag && 'reference' in drag && drag.reference && !drag.moved && event.type !== 'pointercancel') referencePoint(drag.point);
  if (drag?.moved && drag.type !== 'pan') onScenarioChanged();
  drag = null;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const rect = $('map').getBoundingClientRect();
  zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
}

/** Zooms by `factor` keeping the map point under (mx, my) (pixels in the map; default: its centre) still. */
function zoomAt(factor: number, mx: number | null = null, my: number | null = null) {
  const rect = $('map').getBoundingClientRect();
  mx ??= rect.width / 2; my ??= rect.height / 2;
  const scale = Math.min(72 / ppm(), Math.max(0.03, state.view.scale * factor));
  const f = scale / state.view.scale;
  state.view = { scale, tx: mx - (mx - state.view.tx) * f, ty: my - (my - state.view.ty) * f };
  applyView();
}

function onDoubleClick(event: MouseEvent) {
  if (state.tool === 'coordinates') return;
  if (state.drawing != null) { finishDrawing(true); return; }
  const target = (event.target as Element | null)?.closest<SVGElement>('[data-drag]');
  if (!target || !target.dataset.drag?.startsWith('route:')) return;
  // insert a point on the nearest segment
  const i = +target.dataset.drag!.split(':')[1];
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

function onContextMenu(event: MouseEvent) {
  event.preventDefault();
  if (state.tool === 'coordinates') return;
  if (state.drawing != null) { finishDrawing(); return; }
  const target = (event.target as Element | null)?.closest<SVGElement>('[data-drag]');
  if (target?.dataset.drag?.startsWith('point:')) {
    const [, i, n] = target.dataset.drag!.split(':').map(Number);
    deletePoint(i, n);
  }
}

function surfaceKindAt(p: Point) {
  if (!state.map) return '';
  const names = { carriageway: '車道', ramp: 'スロープ', sidewalk: '歩道', ground: '地面' };
  for (const kind of ['carriageway', 'ramp', 'sidewalk', 'ground'])
    if (S.distanceToSurface(state.map, p.x, p.z, [kind]) === 0) return names[kind as keyof typeof names];
  return '';
}

// ------------------------------------------------------------------ editing commands
function select(selection: Selection | null) {
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

function startDrawing(index: number) {
  state.drawing = index;
  setTool('draw');
  select({ kind: 'vehicle', index });
  publish();
  onScenarioChanged();
}

function addDrawPoint(p: Point) {
  if (state.drawing == null) {
    // "車を描く" with nothing selected: start a new vehicle at this click
    addVehicle();
  }
  const v = state.scenario.vehicles[state.drawing!];
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
  stopDrawing();
  if (v && v.route.length < 2) {
    state.scenario.vehicles.splice(i, 1);
    state.selection = null;
    toast('ルートには 2 点以上が必要なので、この車は取り消しました。');
  }
  onScenarioChanged({ inspector: 'full' });
}

function stopDrawing() {
  state.drawing = null;
  publish();
  setTool('select');
}

function deletePoint(i: number, n: number) {
  const v = state.scenario.vehicles[i];
  if (v.route.length <= 2) { toast('ルートには 2 点以上が必要です。車ごと消す場合は「この車を削除」。', true); return; }
  pushUndo();
  v.route.splice(n, 1);
  state.selection = { kind: 'vehicle', index: i };
  onScenarioChanged({ inspector: 'full' });
}

function deleteVehicle(i: number) {
  if (!state.scenario.vehicles[i]) return;
  pushUndo();
  if (state.drawing === i) stopDrawing();
  else if (state.drawing != null && state.drawing > i) state.drawing--;
  state.scenario.vehicles.splice(i, 1);
  const sel = state.selection;
  if (sel?.kind === 'vehicle') {
    if (sel.index === i) state.selection = null;
    else if (sel.index > i) sel.index--;
  }
  onScenarioChanged({ inspector: 'full' });
  const buttons = $('inspector').querySelectorAll<HTMLElement>('.vehicle-select');
  (buttons[Math.min(i, buttons.length - 1)] ?? $('btnAddVehicle'))?.focus();
}

function setTool(tool: EditorTool) {
  if (tool !== 'draw' && state.drawing != null) finishDrawing();
  state.tool = tool;
  if (tool === 'coordinates') ui.coordinateOpen = true;
  publish();
  $('map').classList.toggle('drawing', tool === 'draw');
  $('map').classList.toggle('locating', tool === 'coordinates');
}

/** Central change hook. inspector: 'values' (sync inputs), 'full' (rebuild), 'none'. */
function onScenarioChanged({ inspector = 'values' } = {}) {
  inspectorRevision++;
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

// React consumes these low-frequency notifications; map drawing stays native SVG.
function renderInspector() {inspectorRevision++; publish();}
function syncInspectorValues() {inspectorRevision++; publish();}
function toggleTrigger(on: boolean) {
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

// ------------------------------------------------------------------ problems, header, list
function updateProblems() {
  const s = state.scenario;
  state.problems = S.validate(s, state.map);
  publish();
}

function focusTarget(target?: ProblemTarget | null) {
  if (!target) return;
  const s = state.scenario;
  if (target.kind === 'meta') { state.tab = 'meta'; state.selection = null; renderInspector(); return; }
  if (target.kind === 'vehicle') select({ kind: 'vehicle', index: target.index!, point: target.point });
  else select({ kind: target.kind });
  const p = target.kind === 'vehicle'
    ? (target.point != null ? s.vehicles[target.index!].route[target.point] : s.vehicles[target.index!].route[0])
    : s[target.kind as 'spawn' | 'goal' | 'trigger'];
  if (!p) return;
  const rect = $('map').getBoundingClientRect();
  const [px, py] = toPx(p.x, p.z);
  state.view.tx = rect.width / 2 - px * state.view.scale;
  state.view.ty = rect.height / 2 - py * state.view.scale;
  applyView();
}

function updateHeader() {
  document.title = `${isDirty() ? '● ' : ''}${state.scenario.name} — シナリオエディタ`; publish();
}
function renderList() {publish();}

async function refreshList() {
  state.list = await api<EditorEntry[]>('/api/scenarios');
  renderList();
}

// ------------------------------------------------------------------ files
function confirmDiscard() {
  return !isDirty() || confirm('保存していない変更があります。破棄しますか？');
}

function loadScenario(scenario: Scenario, file: EditorFile | null) {
  state.scenario = S.normalize(scenario);
  state.file = file;
  state.saved = file ? S.serialize(state.scenario) : '';
  state.undo = []; state.redo = [];
  state.selection = null;
  state.time = 0; state.playing = false;
  state.tab = 'meta';
  stopDrawing();
  fitScenario();
  refreshAll();
  ui.triggerAuto = true;
  updateTimeline();
}

async function openFile(path: string, template: boolean) {
  if (!confirmDiscard()) return;
  try {
    const scenario = await api<Scenario>('/api/scenario?path=' + encodeURIComponent(path));
    loadScenario(scenario, { path, template });
    try { localStorage.setItem('vrlearn.lastFile', JSON.stringify({ path, template })); } catch { /* optional */ }
  } catch (error) {
    toast('開けません: ' + errorMessage(error), true);
  }
}

function nextFreeId(base: string) {
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
    const result = await api<{path: string; problems: ScenarioProblem[]}>('/api/scenarios/' + encodeURIComponent(s.id), { method: 'PUT', body: S.serialize(s), headers: { 'Content-Type': 'application/json' } });
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
    toast('保存できません: ' + errorMessage(error), true);
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
    toast('削除できません: ' + errorMessage(error), true);
  }
}

let playPoll: ReturnType<typeof setInterval> | undefined;
async function playInUnity() {
  const errors = S.validate(state.scenario, state.map).filter(p => p.level === 'error');
  if (errors.length) { toast(`エラー ${errors.length} 件を直してから試してください。`, true); return; }
  let path = state.file?.path;
  // Browser templates belong to this project; save a custom copy before sending one to Unity.
  if (state.file?.template || isDirty() || !state.file) {
    if (!(await save())) return;
    path = state.file!.path;
  }
  try {
    await api('/api/play', { method: 'POST', body: JSON.stringify({ path }), headers: { 'Content-Type': 'application/json' } });
    toast('Unity に送りました。Unity エディタの反応を待っています…');
    clearInterval(playPoll);
    const started = Date.now();
    playPoll = setInterval(async () => {
      const { pending } = await api<{pending: boolean}>('/api/play').catch(() => ({ pending: true }));
      if (!pending) { clearInterval(playPoll); toast('Unity で再生を始めました。'); }
      else if (Date.now() - started > 15000) {
        clearInterval(playPoll);
        toast('Unity が反応しません。Unity エディタでこのプロジェクトを開き、再生中でないことを確認してください。', true);
      }
    }, 1000);
  } catch (error) {
    toast('送れません: ' + errorMessage(error), true);
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
  downloadBlob(blob, `${state.scenario.id}.json`);
}

async function importJson(file: File | undefined) {
  if (!file || !confirmDiscard()) return;
  try {
    const scenario = S.parseScenario(await file.text());
    if (scenario.id.startsWith('builtin-')) scenario.id = nextFreeId(scenario.id.replace(/^builtin-/, 'custom-from-'));
    loadScenario(scenario, null);
    state.saved = '';
    updateHeader();
    toast(`${file.name} を読み込みました。保存すると「マイ場面」に入ります。`);
  } catch (error) {
    toast('読み込めません: ' + errorMessage(error), true);
  }
}

// ------------------------------------------------------------------ Quest
async function questCheck() {
  ui.questBusy = true; ui.questStatus = null; ui.questError = ''; publish();
  try {ui.questStatus = await api<QuestStatus>('/api/quest');}
  catch (error) {ui.questError = '確認できません: ' + errorMessage(error);}
  finally {ui.questBusy = false; publish();}
}
async function openQuestDialog() {ui.questResult = null; ui.questMessage = ''; ui.questOpen = true; publish(); await questCheck();}
async function questSend() {
  if (isDirty() && confirm('保存していない変更があります。保存してから送りますか？') && !(await save())) return;
  ui.questBusy = true; ui.questMessage = '送っています…'; publish();
  try {ui.questResult = await api<QuestReport>('/api/quest/sync', {method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}}); ui.questMessage = '';}
  catch (error) {ui.questMessage = '送れません: ' + errorMessage(error);}
  finally {ui.questBusy = false; publish();}
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
  if (!S.hasTrigger(state.scenario) || !ui.triggerOn) return null;
  const t = parseFloat(ui.triggerTime);
  return Number.isFinite(t) ? t : null;
}

function updateTimeline() {
  const s = state.scenario;
  const hasTrigger = S.hasTrigger(s);
  if (hasTrigger && ui.triggerAuto) ui.triggerTime = String(estimatedTriggerTime() ?? 5);
  const tt = triggerTime();
  let horizon = 20;
  for (const v of s.vehicles) {
    if (v.route.length < 2) continue;
    const times = S.spawnTimes(v, tt, 60);
    if (times.length) horizon = Math.max(horizon, Math.min(60, times.at(-1)! + S.timeToDistance(S.routeLength(v.route), v.speedKmh / 3.6)));
  }
  ui.horizon = Math.ceil(horizon);
  const accident = s.vehicles.findIndex(v => v.accident);
  let info = hasTrigger ? (tt == null ? 'トリガーに入らない場合' : `トリガー進入 ${fmt(tt)} 秒`) : 'トリガーなし';
  if (accident >= 0) {
    const v = s.vehicles[accident];
    const c = S.conflictPoint(s, v);
    const start = v.start === S.START_TRIGGER ? tt : 0;
    if (c && start != null) info += ` ・ 事故車が体験者の線に着くのは ${fmt(start + v.delaySeconds + c.carSeconds)} 秒`;
  }
  ui.timelineInfo = info; publish();
}

function tick(now: number) {
  if (!state.playing) return;
  const dt = Math.min(0.1, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  state.time = Math.min(ui.horizon, state.time + dt);
  renderCars();
  if (state.time >= ui.horizon) togglePlay(false);
  else previewFrame = requestAnimationFrame(tick);
}

function togglePlay(on = !state.playing) {
  state.playing = on;
  cancelAnimationFrame(previewFrame); publish();
  if (on) {
    if (state.time >= ui.horizon) state.time = 0;
    state.lastFrame = performance.now();
    previewFrame = requestAnimationFrame(tick);
  }
}

// ------------------------------------------------------------------ wiring
function onKey(event: KeyboardEvent) {
  if (!ui.loaded) return;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === 's') { event.preventDefault(); save(); return; }
  if (typing) return;
  if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
  if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
  if (event.key === 'Enter' && state.tool === 'coordinates' && document.activeElement === $('map') && state.map) {
    event.preventDefault();
    const rect = $('map').getBoundingClientRect();
    referencePoint(fromPx((rect.width / 2 - state.view.tx) / state.view.scale,
      (rect.height / 2 - state.view.ty) / state.view.scale));
    return;
  }
  if (event.key === 'Enter' || event.key === 'Escape') {
    if (state.drawing != null) finishDrawing();
    else if (event.key === 'Escape') { select(null); setTool('select'); }
    return;
  }
  if (event.key === ' ') { event.preventDefault(); togglePlay(); return; }
  if (event.key === 'v' || event.key === 'V') setTool('select');
  if (event.key === 'c' || event.key === 'C') setTool('draw');
  if (event.key === 'p' || event.key === 'P') { setTool('coordinates'); $('map').focus(); }
  if (event.key === 'f' || event.key === 'F') fitScenario();
  if (event.key === 'g' || event.key === 'G') fitMap();
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const sel = state.selection;
    if (sel?.kind === 'vehicle') event.preventDefault();
    if (sel?.kind === 'vehicle' && sel.point != null) deletePoint(sel.index, sel.point);
    else if (sel?.kind === 'vehicle') deleteVehicle(sel.index);
  }
}

let previewFrame = 0;
function wire() {
  const svg = $<SVGSVGElement>('map'), options = {signal: scope.signal};
  svg.addEventListener('pointerdown', onPointerDown, options);
  svg.addEventListener('pointermove', onPointerMove, options);
  svg.addEventListener('pointerup', onPointerUp, options);
  svg.addEventListener('pointercancel', onPointerUp, options);
  svg.addEventListener('wheel', onWheel, {...options, passive: false});
  svg.addEventListener('dblclick', onDoubleClick, options);
  svg.addEventListener('contextmenu', onContextMenu, options);
  document.addEventListener('keydown', onKey, options);
  document.addEventListener('pointerdown', event => {const menu = document.querySelector<HTMLDetailsElement>('.layers'); if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;}, options);
  let lastSize: {width: number; height: number} = svg.getBoundingClientRect();
  window.addEventListener('resize', () => {
    const rect = svg.getBoundingClientRect();
    state.view.tx += (rect.width - lastSize.width) / 2; state.view.ty += (rect.height - lastSize.height) / 2;
    lastSize = rect; if (state.map) applyView();
  }, options);
  window.addEventListener('beforeunload', event => {if (isDirty()) {event.preventDefault(); event.returnValue = ''; }}, options);
}

/** The local server answers only when the Unity project is next to this one (and on this computer). */
async function detectServer() {
  // the server only answers this computer: no probe (and no 404 in the console) on Pages or the LAN
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false;
  try {
    const response = await fetch('/api/status', {cache: 'no-store', signal: scope.signal});
    return response.ok && (await response.json()).server === true;
  } catch { return false; }
}

async function main() {
  wire();
  state.server = await detectServer();
  scope.check(); publish();
  try {
    state.map = await api<EditorMap>('/api/map'); scope.check();
  } catch (error) {
    ui.loading = '地図を読めません（VRLearn で Export Map For Scenario Editor を実行し、tools/sync.mjs で取り込んでください）: ' + errorMessage(error);
    publish(); return;
  }
  buildMapLayers();
  setTool('select');
  await refreshList();
  ui.loaded = true; publish();
  // ?open=templates/builtin-01.json&select=vehicle:2&time=12&layers=surfaces — a shareable view
  const params = new URLSearchParams(location.search);
  let last = null;
  try { last = JSON.parse(localStorage.getItem('vrlearn.lastFile') ?? 'null'); } catch { /* optional */ }
  const wanted = params.get('open') ?? last?.path;
  const entry = wanted && state.list.find(e => e.path === wanted);
  if (entry) await openFile(entry.path, entry.template);
  else if (state.list.length) await openFile(state.list[0].path, state.list[0].template);
  else loadScenario(S.newScenario(nextFreeId('custom')), null);
  const sel = params.get('select');
  if (sel) {
    const [kind, index, point] = sel.split(':');
    select(kind === 'vehicle' ? { kind, index: +index, point: point == null ? undefined : +point } : (['spawn', 'goal', 'trigger'].includes(kind) ? {kind: kind as 'spawn' | 'goal' | 'trigger'} : null));
  }
  for (const layer of (params.get('layers') ?? '').split(',').filter(Boolean)) {
    const key = ('layer' + layer[0].toUpperCase() + layer.slice(1)) as keyof typeof ui.layers;
    if (key in ui.layers) {ui.layers[key] = true; applyLayers(); publish();}
  }
  if (params.has('time')) { state.time = Number(params.get('time')); renderCars(); }
  if (params.has('overview')) fitMap();
  if (params.get('x')?.trim() && params.get('z')?.trim())
    referencePoint({ x: Number(params.get('x')), z: Number(params.get('z')) }, true);
}

const actions = {
  pushUndo, onScenarioChanged, renderInspector, select, addVehicle, deleteVehicle, startDrawing, toggleTrigger,
  newScenario, duplicate, save, undo, redo, removeFile, playInUnity, playInBrowser, downloadJson, importJson,
  openFile, focusTarget, copyCoordinates, openQuestDialog, questCheck, questSend,
  closeQuest: () => {ui.questOpen = false; publish();},
  tool: (tool: EditorTool) => {if (tool === 'draw' && state.selection?.kind === 'vehicle') startDrawing(state.selection.index); else setTool(tool); if (tool === 'coordinates') $('map').focus();},
  fitScenario, fitMap, zoom: (factor: number) => zoomAt(factor),
  layer: (key: keyof typeof ui.layers, value: boolean) => {ui.layers[key] = value; if (state.map) applyLayers(); publish();},
  coordinate: (axis: 'coordinateX' | 'coordinateZ', value: string) => {ui[axis] = value; publish();},
  coordinateOpen: (open: boolean) => {if (ui.coordinateOpen !== open) {ui.coordinateOpen = open; publish();}},
  locate: () => {if (state.map) referencePoint({x: Number(ui.coordinateX), z: Number(ui.coordinateZ)}, true);},
  time: (time: number) => {state.time = time; renderCars(); publish();}, togglePlay,
  trigger: (key: 'triggerOn' | 'triggerAuto' | 'triggerTime', value: boolean | string) => {if (key === 'triggerTime') ui[key] = String(value); else ui[key] = !!value; updateTimeline(); renderCars();},
};
const debug = {state, S};
return {state, ui, actions, get inspectorRevision() {return inspectorRevision;}, getPath, setField, isDirty,
  getSnapshot: () => revision, subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
  mount() {window.__editor = debug; return main().catch(error => {if (!scope.disposed) {ui.loading = errorMessage(error); publish();}});},
  dispose() {scope.dispose(); state.playing = false; cancelAnimationFrame(previewFrame); clearTimeout(toastTimer); clearInterval(playPoll); listeners.clear(); if (window.__editor === debug) delete window.__editor;},
};
}
export type EditorController = ReturnType<typeof createEditorController>;
declare global {interface Window {__editor?: {state: EditorState; S: typeof S}}}
