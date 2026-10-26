import type {Point, Area, VehicleSpec, Scenario, ScenarioDraft, VehicleDraft, ScenarioMap, ScenarioProblem, ProblemTarget, PlayerMode, Setting, DriverOverrides} from '../../types/scenario.ts';
import {errorMessage} from '../../utils/errors.ts';
// Browser-owned scenario model shared by both editor backends, the simulator and tests.
// Retains the Unity-compatible fields and serialization order; browser map bounds are local.
import { DRIVER_LIMITS, DRIVER_BEHAVIORS, DRIVER_BEHAVIOR_LABELS } from '../traffic/driver.ts';
export { DRIVER_LIMITS, DRIVER_BEHAVIORS, DRIVER_BEHAVIOR_LABELS };

export const FORMAT = 'vrlearn-scenario';
export const VERSION = 1;
export const HIKONE_MAP = 'hikone-kyobashi';
export const HIKONE_BOUNDS = { xMin: -220, zMin: -155, xMax: 200, zMax: 165 };
export const PLAYER_MODES: PlayerMode[] = ['walking', 'bicycle'];
export const SETTINGS: Setting[] = ['crossing', 'midblock', 'bicycle'];
export const START_BEGIN = 'begin';
export const START_TRIGGER = 'trigger';
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// Free-road editor timing hint only; runtime drivers own their acceleration.
export const CAR_ACCELERATION = 2.4;
export const WALK_SPEED = 1.2;      // m/s, for timing hints only
export const BICYCLE_SPEED = 4.0;

export const SETTING_LABELS = { crossing: '横断歩道・交差点', midblock: '道路の途中', bicycle: '自転車' };
export const MODE_LABELS = { walking: '歩行', bicycle: '自転車' };

const round = (v: number) => Math.round(v * 100) / 100;

/** Car bodies (mirrors ScenarioVehicle.Bodies): '' is the prefab's sedan. */
export const BODIES = ['', 'kei-tall', 'kei-hatch'];
export const BODY_LABELS = { '': 'セダン（標準）', 'kei-tall': '軽ハイトワゴン', 'kei-hatch': '軽ハッチバック' };

export function newVehicle(overrides: Partial<VehicleSpec> = {}): VehicleSpec {
  return {
    name: '車', model: 'Car_Left', body: '', route: [], speedKmh: 36, start: START_BEGIN, delaySeconds: 0,
    repeatMinSeconds: 0, repeatMaxSeconds: 0, stopOnTrigger: false, accident: false,
    overrideYaw: false, yaw: 0, ...overrides
  };
}

export function newScenario(id = 'new-scenario'): Scenario {
  return {
    format: FORMAT, version: VERSION, id, name: '新しい場面', nameEn: 'New scenario', setting: 'crossing',
    learningGoal: '', situation: '', point: '', map: HIKONE_MAP, playerMode: 'walking',
    spawn: { x: 40, z: 14 },
    goal: { x: 40, z: 32, width: 5, depth: 1, yaw: 0 },
    trigger: { x: 40, z: 19.5, width: 4, depth: 4, yaw: 0 },
    vehicles: []
  };
}

/** Fills missing fields the way JsonUtility does, so partial files behave like in Unity. */
export function normalize(raw: ScenarioDraft | null): Scenario {
  const base = newScenario(raw?.id ?? '');
  const s = { ...base, ...raw } as Scenario;
  s.spawn = { x: 0, z: 0, ...(raw?.spawn ?? {}) };
  s.goal = { x: 0, z: 0, width: 4, depth: 4, yaw: 0, ...(raw?.goal ?? {}) };
  s.trigger = { x: 0, z: 0, width: 0, depth: 0, yaw: 0, ...(raw?.trigger ?? {}) };
  s.vehicles = (raw?.vehicles ?? []).map(v => ({ ...newVehicle(), ...v, route: (v.route ?? []).map(p => ({ x: p.x ?? 0, z: p.z ?? 0 })) }));
  return s;
}

/** Errors at a text-input boundary, before a draft can replace the current scenario or be saved. */
export class ScenarioInputError extends Error {
  problems: ScenarioProblem[];
  readonly code = 'INVALID_SCENARIO'; readonly status = 400;
  constructor(problems: ScenarioProblem[]) {
    super(problems.map(problem => problem.message).join('\n'));
    this.name = 'ScenarioInputError';
    this.problems = problems;
  }
}

/** Parse external JSON safely; semantic errors remain editable drafts in the editor. */
export function parseScenario(text: string): Scenario {
  let raw: unknown;
  try { raw = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
  catch (error) { throw new ScenarioInputError([{ level: 'error', path: '$', message: 'JSON を読み取れません：' + errorMessage(error) }]); }
  const problems: ScenarioProblem[] = [];
  const add = (path: string, expected: string) => problems.push({ level: 'error', path, message: `${path} は${expected}にしてください。` });
  const object = (value: unknown, path: string, required = false): value is Record<string, unknown> => {
    if (value == null && !required) return false;
    if (value == null || typeof value !== 'object' || Array.isArray(value)) { add(path, 'オブジェクト'); return false; }
    return true;
  };
  const fields = (value: Record<string, unknown>, path: string, names: string[], type: string, label: string, nullable = false) => {
    for (const name of names) if (value[name] !== undefined && !(nullable && value[name] === null)
      && (typeof value[name] !== type || type === 'number' && !Number.isFinite(value[name])))
      add(path ? `${path}.${name}` : name, label);
  };
  const point = (value: unknown, path: string, area = false, required = false) => {
    if (object(value, path, required)) fields(value, path, area ? ['x', 'z', 'width', 'depth', 'yaw'] : ['x', 'z'], 'number', '有限の数値');
  };
  if (object(raw, '$', true)) {
    fields(raw, '', ['format', 'id', 'name', 'setting', 'map', 'playerMode'], 'string', '文字列');
    fields(raw, '', ['nameEn', 'learningGoal', 'situation', 'point'], 'string', '文字列', true);
    fields(raw, '', ['version'], 'number', '有限の数値');
    point(raw.spawn, 'spawn'); point(raw.goal, 'goal', true); point(raw.trigger, 'trigger', true);
    if (object(raw.environment, 'environment')) fields(raw.environment, 'environment', ['visibilityMeters', 'roadGrip'], 'number', '有限の数値', true);
    if (object(raw.hazardPolicy, 'hazardPolicy')) fields(raw.hazardPolicy, 'hazardPolicy', ['safeProbability', 'unsafeProbability'], 'number', '有限の数値', true);
    if (raw.vehicles != null && !Array.isArray(raw.vehicles)) add('vehicles', '配列');
    else for (const [i, vehicle] of (raw.vehicles ?? []).entries()) {
      const path = `vehicles[${i}]`;
      if (!object(vehicle, path, true)) continue;
      fields(vehicle, path, ['name', 'body'], 'string', '文字列', true);
      fields(vehicle, path, ['model', 'start'], 'string', '文字列');
      fields(vehicle, path, ['speedKmh', 'delaySeconds', 'repeatMinSeconds', 'repeatMaxSeconds', 'yaw'], 'number', '有限の数値');
      fields(vehicle, path, ['entrySpeedKmh'], 'number', '有限の数値', true);
      fields(vehicle, path, ['stopOnTrigger', 'accident', 'overrideYaw'], 'boolean', 'true または false');
      fields(vehicle, path, ['noStop'], 'boolean', 'true または false', true);
      if (object(vehicle.driver, path + '.driver')) {
        fields(vehicle.driver, path + '.driver', Object.keys(DRIVER_LIMITS), 'number', '有限の数値', true);
        fields(vehicle.driver, path + '.driver', ['behavior'], 'string', '文字列', true);
      }
      if (vehicle.route != null && !Array.isArray(vehicle.route)) add(path + '.route', '配列');
      else for (const [j, p] of (vehicle.route ?? []).entries()) point(p, `${path}.route[${j}]`, false, true);
    }
  }
  if (problems.length) throw new ScenarioInputError(problems);
  return normalize(raw as ScenarioDraft);
}

/** JSON in Unity's field order, 4-space indent, centimetre precision (diff-friendly). */
export function serialize(s: Scenario) {
  const pt = (p: Point) => ({ x: round(p.x), z: round(p.z) });
  const area = (a: Area) => ({ x: round(a.x), z: round(a.z), width: round(a.width), depth: round(a.depth), yaw: round(a.yaw) });
  const ordered: Record<string, unknown> = {
    format: s.format, version: s.version, id: s.id, name: s.name, nameEn: s.nameEn, setting: s.setting,
    learningGoal: s.learningGoal, situation: s.situation, point: s.point, map: s.map, playerMode: s.playerMode,
    spawn: pt(s.spawn), goal: area(s.goal), trigger: area(s.trigger),
    vehicles: s.vehicles.map(v => ({
      name: v.name, model: v.model, body: v.body ?? '', route: v.route.map(pt), speedKmh: round(v.speedKmh), start: v.start,
      delaySeconds: round(v.delaySeconds), repeatMinSeconds: round(v.repeatMinSeconds),
      repeatMaxSeconds: round(v.repeatMaxSeconds), stopOnTrigger: !!v.stopOnTrigger, accident: !!v.accident,
      overrideYaw: !!v.overrideYaw, yaw: round(v.yaw),
      ...(v.entrySpeedKmh != null ? { entrySpeedKmh: round(v.entrySpeedKmh) } : {}),
      ...(v.noStop != null ? { noStop: !!v.noStop } : {}),
      ...(v.driver ? { driver: { ...Object.fromEntries((Object.keys(DRIVER_LIMITS) as (keyof typeof DRIVER_LIMITS)[])
        .filter(key => v.driver![key] != null).map(key => [key, round(v.driver![key]!)])),
        ...(v.driver.behavior != null ? { behavior: v.driver.behavior } : {}) } } : {})
    }))
  };
  if (s.environment) ordered.environment = { ...s.environment };
  if (s.hazardPolicy) ordered.hazardPolicy = { ...s.hazardPolicy };
  return JSON.stringify(ordered, null, 4) + '\n';
}

export const hasTrigger = (s: Pick<Scenario, 'trigger'>) => s.trigger && s.trigger.width > 0 && s.trigger.depth > 0;
export const isRepeating = (v: Pick<VehicleSpec, 'repeatMaxSeconds'>) => v.repeatMaxSeconds > 0;
export const vehicleLabel = (v: Partial<VehicleSpec>, i: number) => `vehicles[${i}]` + (v?.name ? `（${v.name}）` : '');

// ------------------------------------------------------------------ validation
// problem = { level: 'error' | 'warning', message, target?: { kind, index?, point? } }

function inside(x: number, z: number) {
  return x >= HIKONE_BOUNDS.xMin && x <= HIKONE_BOUNDS.xMax && z >= HIKONE_BOUNDS.zMin && z <= HIKONE_BOUNDS.zMax;
}

/** Structural checks; browser map bounds are owned locally. */
export function validateStructure(s: Scenario): ScenarioProblem[] {
  const errors: ScenarioProblem[] = [];
  const add = (message: string, target?: ProblemTarget) => errors.push({ level: 'error', message, target });
  const checkInside = (label: string, x: number, z: number, target: ProblemTarget) => {
    if (!inside(x, z)) add(`${label} (${fmt(x)}, ${fmt(z)}) が地図の外です。`, target);
  };
  if (s.format !== FORMAT) add(`format は "${FORMAT}" である必要があります。`);
  if (!(s.version >= 1 && s.version <= VERSION)) add(`version ${s.version} には対応していません（最大 ${VERSION}）。`);
  if (!s.id || !ID_PATTERN.test(s.id)) add('id は英小文字・数字・-・_ の 1〜40 文字にしてください。', { kind: 'meta' });
  if (!s.name || !s.name.trim()) add('name（場面の名前）がありません。', { kind: 'meta' });
  if (s.map !== HIKONE_MAP) add(`map は "${HIKONE_MAP}" のみ対応しています。`);
  if (!PLAYER_MODES.includes(s.playerMode)) add('playerMode は walking か bicycle です。', { kind: 'meta' });
  if (!SETTINGS.includes(s.setting)) add('setting は crossing / midblock / bicycle のいずれかです。', { kind: 'meta' });
  checkInside('spawn', s.spawn.x, s.spawn.z, { kind: 'spawn' });
  checkInside('goal', s.goal.x, s.goal.z, { kind: 'goal' });
  if (s.goal.width < 0.5 || s.goal.depth < 0.5) add('goal の幅・奥行きは 0.5 m 以上にしてください。', { kind: 'goal' });
  if (Math.hypot(s.goal.x - s.spawn.x, s.goal.z - s.spawn.z) < 3) add('spawn と goal は 3 m 以上離してください。', { kind: 'goal' });
  if (hasTrigger(s)) checkInside('trigger', s.trigger.x, s.trigger.z, { kind: 'trigger' });
  if (s.hazardPolicy != null && (typeof s.hazardPolicy !== 'object' || Array.isArray(s.hazardPolicy)))
    add('hazardPolicy は抽選率を指定するオブジェクトにしてください。', { kind: 'meta' });
  else if (s.hazardPolicy) {
    const safe = s.hazardPolicy.safeProbability ?? 0.03, unsafe = s.hazardPolicy.unsafeProbability ?? 0.6;
    if (!(Number.isFinite(safe) && Number.isFinite(unsafe) && safe >= 0 && unsafe >= safe && unsafe <= 1))
      add('危険車の抽選率は 0 ≤ 通常時 ≤ 危険行動時 ≤ 1 にしてください。', { kind: 'meta' });
  }
  for (const [key, lo, hi] of [['visibilityMeters', 5, 150], ['roadGrip', 0.2, 1]] as const) {
    const value = s.environment?.[key];
    if (value != null && !(Number.isFinite(value) && value >= lo && value <= hi))
      add(`environment.${key} は ${lo}〜${hi} です。`, { kind: 'meta' });
  }
  s.vehicles.forEach((v, i) => {
    const label = vehicleLabel(v, i);
    const target: ProblemTarget = { kind: 'vehicle', index: i };
    if (!v.route || v.route.length < 2) add(label + ': route には 2 点以上が必要です。', target);
    else v.route.forEach((p, k) => checkInside(label + '.route', p.x, p.z, { ...target, point: k }));
    if (!(v.speedKmh >= 5 && v.speedKmh <= 80)) add(label + ': speedKmh は 5〜80 です。', target);
    for (const [key, [lo, hi]] of Object.entries(DRIVER_LIMITS) as [keyof typeof DRIVER_LIMITS, [number, number]][]) {
      const value = v.driver?.[key];
      if (value != null && !(Number.isFinite(value) && value >= lo && value <= hi))
        add(`${label}: driver.${key} は ${lo}〜${hi} です。`, target);
    }
    if (v.driver?.behavior != null && !DRIVER_BEHAVIORS.includes(v.driver.behavior))
      add(`${label}: driver.behavior が対応する運転行動ではありません。`, target);
    if (v.entrySpeedKmh != null && !(Number.isFinite(v.entrySpeedKmh) && v.entrySpeedKmh >= 0 && v.entrySpeedKmh <= 80))
      add(`${label}: entrySpeedKmh は 0〜80 です。`, target);
    if (!BODIES.includes(v.body ?? '')) add(label + ': body は 空（セダン）・kei-tall・kei-hatch のいずれかです。', target);
    if (v.start !== START_BEGIN && v.start !== START_TRIGGER) add(label + ': start は begin か trigger です。', target);
    if (!(v.delaySeconds >= 0 && v.delaySeconds <= 120)) add(label + ': delaySeconds は 0〜120 秒です。', target);
    if (v.repeatMinSeconds < 0 || v.repeatMaxSeconds < v.repeatMinSeconds) add(label + ': repeatMinSeconds ≤ repeatMaxSeconds にしてください。', target);
    if (isRepeating(v) && v.repeatMinSeconds < 1) add(label + ': 繰り返し間隔は 1 秒以上にしてください。', target);
    if ((v.start === START_TRIGGER || v.stopOnTrigger) && !hasTrigger(s)) add(label + ': trigger を使うには trigger エリアが必要です。', target);
  });
  return errors;
}

/** Checks against the exported map (Scenarios/maps/…/map.json): surfaces, walls, models, timing sense. */
export function validateOnMap(s: Scenario, map?: ScenarioMap | null): ScenarioProblem[] {
  const problems: ScenarioProblem[] = [];
  const add = (level: ScenarioProblem['level'], message: string, target?: ProblemTarget) => problems.push({ level, message, target });
  if (!map) return problems;
  // the participant walks and rides on the road tiles (the "ground" plane also lies under the moat)
  const road = ['carriageway', 'ramp', 'sidewalk'];
  if (distanceToSurface(map, s.spawn.x, s.spawn.z, road) > 0.5) add('error', '出発点が道路・歩道の上にありません（建物・堀の上など）。', { kind: 'spawn' });
  if (distanceToSurface(map, s.goal.x, s.goal.z, road) > 0.5) add('error', 'ゴールが道路・歩道の上にありません。', { kind: 'goal' });
  if (crossesWall(map, s.spawn, s.goal)) add('warning', '出発点からゴールまでの間に見えない壁があります。まっすぐには歩けません。', { kind: 'goal' });
  if (hasTrigger(s) && !segmentHitsArea(s.spawn, s.goal, s.trigger)) add('warning', '出発点→ゴールの直線がトリガーを通りません。体験者が入らないかもしれません。', { kind: 'trigger' });
  if (s.vehicles.length === 0) add('warning', '車がありません。');
  s.vehicles.forEach((v, i) => {
    const label = vehicleLabel(v, i);
    const target: ProblemTarget = { kind: 'vehicle', index: i };
    if (map.vehicleModels && !map.vehicleModels.includes(v.model)) add('error', `${label}: 車種 ${v.model} はありません（${map.vehicleModels.join(', ')}）。`, target);
    let sidewalk = false;
    (v.route ?? []).forEach((p, k) => {
      if (distanceToSurface(map, p.x, p.z, road) > 1.5) add('error', `${label}: 点 ${k + 1} が道路の上にありません。`, { ...target, point: k });
      else if (distanceToSurface(map, p.x, p.z, ['carriageway', 'ramp']) > 0.5) sidewalk = true;
    });
    if (sidewalk) add('warning', `${label}: 歩道の上を通ります（駐車場などの出入口なら問題ありません）。`, target);
  });
  return problems;
}

export function validate(s: Scenario, map?: ScenarioMap | null): ScenarioProblem[] {
  return [...validateStructure(s), ...validateOnMap(s, map)];
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

// ------------------------------------------------------------------ geometry (world x/z metres)

export function distanceToSurface(map: ScenarioMap, x: number, z: number, kinds: string[]) {
  let best = Infinity;
  for (const surface of map.surfaces) {
    if (!kinds.includes(surface.kind)) continue;
    const t = surface.triangles;
    for (let i = 0; i < t.length; i += 6) {
      const a = [t[i], t[i + 1]], b = [t[i + 2], t[i + 3]], c = [t[i + 4], t[i + 5]];
      if (pointInTriangle([x, z], a, b, c)) return 0;
      best = Math.min(best, segmentDistance([x, z], a, b), segmentDistance([x, z], b, c), segmentDistance([x, z], c, a));
    }
  }
  return best;
}

export function pointInTriangle(p: number[], a: number[], b: number[], c: number[]) {
  const cross = (o: number[], u: number[], v: number[]) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  const d1 = cross(p, a, b), d2 = cross(p, b, c), d3 = cross(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

export function closestOnSegment(p: number[], a: number[], b: number[]) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  return [a[0] + t * dx, a[1] + t * dz];
}

export function segmentDistance(p: number[], a: number[], b: number[]) {
  const q = closestOnSegment(p, a, b);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

function segmentsIntersect(p1: number[], p2: number[], q1: number[], q2: number[]) {
  const d = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Intersection point of segments p1p2 and q1q2 as fraction along p, or null. */
export function segmentIntersection(p1: number[], p2: number[], q1: number[], q2: number[]) {
  const r = [p2[0] - p1[0], p2[1] - p1[1]], s = [q2[0] - q1[0], q2[1] - q1[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-9) return null;
  const qp = [q1[0] - p1[0], q1[1] - p1[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / denom;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, point: [p1[0] + t * r[0], p1[1] + t * r[1]] } : null;
}

export function crossesWall(map: Pick<ScenarioMap, 'walls'>, from: Point, to: Point) {
  const a = [from.x, from.z], b = [to.x, to.z];
  for (const wall of map.walls ?? []) {
    const p = wall.polygon;
    for (let i = 0; i < p.length; i += 2) {
      const j = (i + 2) % p.length;
      if (segmentsIntersect(a, b, [p[i], p[i + 1]], [p[j], p[j + 1]])) return true;
    }
  }
  return false;
}

/** Corners of a rotated ground area (yaw clockwise from +z, like Unity). */
export function areaCorners(area: Area) {
  const r = area.yaw * Math.PI / 180;
  const ax = [Math.cos(r), -Math.sin(r)];      // local +x in world (x, z)
  const az = [Math.sin(r), Math.cos(r)];       // local +z in world
  const hw = area.width / 2, hd = area.depth / 2;
  return [[-hw, -hd], [-hw, hd], [hw, hd], [hw, -hd]].map(([u, v]) =>
    [area.x + u * ax[0] + v * az[0], area.z + u * ax[1] + v * az[1]]);
}

export function pointInArea(p: number[], area: Area) {
  const r = area.yaw * Math.PI / 180;
  const dx = p[0] - area.x, dz = p[1] - area.z;
  const u = dx * Math.cos(r) - dz * Math.sin(r);
  const v = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(u) <= area.width / 2 && Math.abs(v) <= area.depth / 2;
}

export function segmentHitsArea(from: Point, to: Point, area: Area) {
  const a = [from.x, from.z], b = [to.x, to.z];
  if (pointInArea(a, area) || pointInArea(b, area)) return true;
  const c = areaCorners(area);
  return c.some((p, i) => segmentsIntersect(a, b, p, c[(i + 1) % 4]));
}

/** Nearest point on any lane within maxDistance metres, or null. */
export function snapToLane(map: ScenarioMap, x: number, z: number, maxDistance = 3) {
  let best = null;
  for (const lane of map.lanes ?? []) {
    for (let i = 0; i + 1 < lane.points.length; i++) {
      const a = [lane.points[i].x, lane.points[i].z], b = [lane.points[i + 1].x, lane.points[i + 1].z];
      const q = closestOnSegment([x, z], a, b);
      const d = Math.hypot(x - q[0], z - q[1]);
      if (d <= maxDistance && (!best || d < best.distance)) best = { x: q[0], z: q[1], distance: d, lane: lane.id };
    }
  }
  return best;
}

// ------------------------------------------------------------------ timing

export function routeLength(route: Point[]) {
  let length = 0;
  for (let i = 1; i < route.length; i++) length += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return length;
}

/** Free-road timing estimate, excluding driver variation, signals and hazards. */
export function distanceAt(t: number, speed: number) {
  if (t <= 0) return 0;
  const tAccel = speed / CAR_ACCELERATION;
  return t <= tAccel ? 0.5 * CAR_ACCELERATION * t * t : 0.5 * speed * tAccel + speed * (t - tAccel);
}

export function timeToDistance(d: number, speed: number) {
  const tAccel = speed / CAR_ACCELERATION;
  const dAccel = 0.5 * speed * tAccel;
  return d <= dAccel ? Math.sqrt(2 * d / CAR_ACCELERATION) : tAccel + (d - dAccel) / speed;
}

/** Position and heading along a route at distance d (null past the end). */
export function pointAlong(route: Point[], d: number) {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= seg || i === route.length - 1) {
      if (d > seg + 1e-6) return null;
      const f = seg < 1e-6 ? 0 : d / seg;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI };
    }
    d -= seg;
  }
  return null;
}

/**
 * When each car appears, given when the participant enters the trigger (triggerTime = null: never).
 * Repeating cars use the middle of their interval so the preview is deterministic.
 */
export function spawnTimes(v: VehicleSpec, triggerTime: number | null, horizon = 60) {
  const first = v.start === START_TRIGGER ? (triggerTime == null ? null : triggerTime + v.delaySeconds) : v.delaySeconds;
  if (first == null) return [];
  const times = [];
  const interval = isRepeating(v) ? (v.repeatMinSeconds + v.repeatMaxSeconds) / 2 : 0;
  for (let t = first; t <= horizon; t += interval) {
    if (v.stopOnTrigger && triggerTime != null && t >= triggerTime) break;
    times.push(t);
    if (!interval) break;
  }
  return times;
}

/** Legacy free-road estimate; interactive editor playback uses Traffic instead. */
export function carsAt(s: Scenario, t: number, triggerTime: number | null) {
  const cars: {index: number; x: number; z: number; yaw: number}[] = [];
  s.vehicles.forEach((v, index) => {
    if (!v.route || v.route.length < 2) return;
    const speed = v.speedKmh / 3.6;
    for (const t0 of spawnTimes(v, triggerTime)) {
      if (t < t0) continue;
      const p = pointAlong(v.route, distanceAt(t - t0, speed));
      if (p) cars.push({ index, ...p });
    }
  });
  return cars;
}

/**
 * Where a car's route crosses the participant's straight spawn→goal line, and when (seconds after
 * the car appears), plus when a participant walking/riding from the trigger reaches that point.
 */
export function conflictPoint(s: Scenario, v: VehicleSpec) {
  if (!v.route || v.route.length < 2) return null;
  const a = [s.spawn.x, s.spawn.z], b = [s.goal.x, s.goal.z];
  let along = 0;
  for (let i = 1; i < v.route.length; i++) {
    const p = [v.route[i - 1].x, v.route[i - 1].z], q = [v.route[i].x, v.route[i].z];
    const hit = segmentIntersection(p, q, a, b);
    const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (hit) {
      const carSeconds = timeToDistance(along + hit.t * seg, v.speedKmh / 3.6);
      const from = hasTrigger(s) ? [s.trigger.x, s.trigger.z] : a;
      const personSpeed = s.playerMode === 'bicycle' ? BICYCLE_SPEED : WALK_SPEED;
      const personSeconds = Math.hypot(hit.point[0] - from[0], hit.point[1] - from[1]) / personSpeed;
      return { x: hit.point[0], z: hit.point[1], carSeconds, personSeconds };
    }
    along += seg;
  }
  return null;
}
