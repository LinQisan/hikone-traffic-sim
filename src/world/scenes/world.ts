import type {Point, PlayerMode, Scenario, HazardPolicy, VehicleSpec, DrivingSpec} from '../../types/scenario.ts';
import type {RouteReference, WorldManifest, ResolvedWorld, Binding, Candidate, WorldSlot} from '../../types/world.ts';
import {errorMessage} from '../../utils/errors.ts';
// Open-world configuration (world/hikone.json): one shared corridor with background traffic flows
// and bindings that turn the ten built-in events into encounters which can occur while exploring.
// Routes are references into the version-1 event files, so the events stay the single source of
// geometry. Pure logic (node:test); the browser and the checks resolve the same way.
import { PLAYER_MODES } from '../../simulation/core/scenario.ts';

export const WORLD_FORMAT = 'hikone-world';
export const WORLD_VERSION = 1;
export const REQUIREMENTS = ['wrongWay'];

const clonePoint = (p: Point) => ({ x: p.x, z: p.z });

/** One route reference: { event, vehicle, from?, to? } (inclusive point indices) or { points }. */
function routePart(part: RouteReference, events: Map<string, Scenario>, where: string) {
  if (Array.isArray(part.points)) return part.points.map(clonePoint);
  const route = events.get(part.event)?.vehicles?.[part.vehicle]?.route;
  if (!route) throw new Error(`${where}: ${part.event} vehicles[${part.vehicle}] がありません。`);
  return route.slice(part.from ?? 0, (part.to ?? route.length - 1) + 1).map(clonePoint);
}

function joinParts(parts: Point[][]) {
  const out: Point[] = [];
  for (const part of parts) for (const p of part) {
    const last = out.at(-1);
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.05) out.push(p);
  }
  return out;
}

/**
 * The flow route up to where `start` joins it (within `tolerance` metres, heading within 35°),
 * followed by `route`. Null when the route does not start on the flow.
 */
export function prefixRoute(flowRoute: Point[], route: Point[], tolerance = 2.5) {
  const start = route[0], next = route[1];
  const heading = Math.atan2(next.x - start.x, next.z - start.z);
  let best = null;
  for (let i = 1; i < flowRoute.length; i++) {
    const a = flowRoute[i - 1], b = flowRoute[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    if (l2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.z - a.z) * dz) / l2));
    const distance = Math.hypot(start.x - a.x - dx * t, start.z - a.z - dz * t);
    const turn = Math.abs(((Math.atan2(dx, dz) - heading) * 180 / Math.PI + 540) % 360 - 180);
    if (distance <= tolerance && turn <= 35 && (!best || distance < best.distance)) best = { i, distance };
  }
  if (!best) return null;
  // Keep the flow's vertices before the joining segment, then hand over with a short approach.
  const head = flowRoute.slice(0, best.i).map(clonePoint);
  while (head.length > 1 && Math.hypot(head.at(-1)!.x - start.x, head.at(-1)!.z - start.z) < 6) head.pop();
  return joinParts([head, route.map(clonePoint)]);
}

/**
 * Resolve the manifest against the event definitions (Map id → normalized scenario).
 * Returns { flows, events, starts, recovery, props, ... } or throws listing every problem.
 */
export function resolveWorld(manifest: WorldManifest, eventList: Scenario[]): ResolvedWorld {
  const events = new Map(eventList.map(e => [e.id, e]));
  const problems: string[] = [];
  const attempt = <T>(where: string, f: () => T): T | null => { try { return f(); } catch (e) { problems.push(errorMessage(e).startsWith(where) ? errorMessage(e) : `${where}: ${errorMessage(e)}`); return null; } };
  if (manifest?.format !== WORLD_FORMAT || manifest.version !== WORLD_VERSION)
    throw new Error(`world: format ${WORLD_FORMAT} version ${WORLD_VERSION} ではありません。`);
  for (const mode of PLAYER_MODES) if (!manifest.starts?.[mode]) problems.push(`starts.${mode} がありません。`);
  const flows = new Map<string, VehicleSpec & {id: string}>();
  for (const f of manifest.flows ?? []) {
    const where = `flows.${f.id}`;
    if (flows.has(f.id)) { problems.push(`${where}: id が重複しています。`); continue; }
    const route = attempt(where, () => joinParts(f.route.map(part => routePart(part, events, where))));
    if (!route) continue;
    if (route.length < 2) { problems.push(`${where}: 経路が短すぎます。`); continue; }
    const [lo, hi] = f.repeat ?? [];
    if (!(lo > 0 && hi >= lo)) problems.push(`${where}: repeat は [最小, 最大] 秒（0 より大きい）にしてください。`);
    flows.set(f.id, {
      id: f.id, name: f.name ?? f.id, model: 'Car_Left', body: '', route, speedKmh: f.speedKmh ?? 36,
      start: 'begin', delaySeconds: f.delay ?? 0, repeatMinSeconds: lo, repeatMaxSeconds: hi,
      stopOnTrigger: false, accident: false, overrideYaw: false, yaw: 0, flow: f.id,
    });
  }
  const slots = new Map<string, WorldSlot>();
  for (const slot of manifest.props?.slots ?? []) {
    const route = events.get(slot.event)?.vehicles?.[slot.vehicle]?.route;
    if (!route) { problems.push(`props.slots.${slot.id}: ${slot.event} vehicles[${slot.vehicle}] がありません。`); continue; }
    slots.set(slot.id, { id: slot.id, x: route[0].x, z: route[0].z,
      yaw: Math.atan2(route[1].x - route[0].x, route[1].z - route[0].z) * 180 / Math.PI });
  }
  const bindings: Binding[] = []; const seen = new Set<string>();
  for (const b of manifest.events ?? []) {
    const where = `events.${b.id}`, event = events.get(b.id);
    if (!event) { problems.push(`${where}: イベント定義がありません。`); continue; }
    if (seen.has(b.id)) { problems.push(`${where}: 重複しています。`); continue; }
    seen.add(b.id);
    if (!b.zone || !(b.zone.width > 0 && b.zone.depth > 0)) problems.push(`${where}: zone が必要です。`);
    if (b.requires && !REQUIREMENTS.includes(b.requires)) problems.push(`${where}: requires「${b.requires}」は使えません。`);
    const modes = b.modes ?? [event.playerMode];
    if (!modes.every(m => PLAYER_MODES.includes(m))) problems.push(`${where}: modes が不正です。`);
    const candidates: Candidate[] = [];
    (b.candidates ?? []).forEach((c, i) => {
      const at = `${where}.candidates[${i}]`;
      const vehicle = c.vehicle != null ? event.vehicles[c.vehicle] : null;
      if (c.vehicle != null && !vehicle) { problems.push(`${at}: vehicles[${c.vehicle}] がありません。`); return; }
      const spec = { ...(vehicle ?? {}), accident: vehicle ? !!vehicle.accident : true, event: b.id, name: vehicle?.name ?? '事故車' };
      if (c.flow) {
        const flow = flows.get(c.flow);
        if (!flow) { problems.push(`${at}: flow「${c.flow}」がありません。`); return; }
        if (c.anchor !== 'participant' && !Number.isFinite(c.anchor?.x)) { problems.push(`${at}: anchor が必要です。`); return; }
        candidates.push({ kind: 'flow', anchor: c.anchor!, spec: { ...spec, route: flow.route,
          speedKmh: vehicle?.speedKmh ?? flow.speedKmh, entrySpeedKmh: undefined } });
      } else if (c.slot) {
        if (!slots.has(c.slot)) { problems.push(`${at}: slot「${c.slot}」がありません。`); return; }
        candidates.push({ kind: 'slot', slot: c.slot, spec: { ...spec, route: vehicle!.route.map(clonePoint), entrySpeedKmh: 0 } as DrivingSpec });
      } else if (c.prefix) {
        const flow = flows.get(c.prefix);
        const route = flow && vehicle && prefixRoute(flow.route, vehicle.route);
        if (!route) { problems.push(`${at}: prefix「${c.prefix}」に経路の始点がつながりません。`); return; }
        candidates.push({ kind: 'route', anchor: clonePoint(vehicle!.route[0]), spec: { ...spec, route, entrySpeedKmh: undefined } as DrivingSpec });
      } else problems.push(`${at}: flow / prefix / slot のどれかが必要です。`);
    });
    if (!candidates.length) problems.push(`${where}: candidates がありません。`);
    bindings.push({
      id: b.id, group: b.group ?? b.id, modes, zone: b.zone, heading: b.heading ?? null,
      headingTolerance: b.headingTolerance ?? 70, requires: b.requires ?? null, candidates,
      chance: b.chance ?? manifest.encounterChance ?? 0.55, cooldown: b.cooldown ?? 60,
      name: event.name, nameEn: event.nameEn, learningGoal: event.learningGoal, point: event.point,
      situation: event.situation, setting: event.setting,
    });
  }
  const redEntryResponse = manifest.redEntryResponse ?? null;
  if (redEntryResponse) {
    if (!Array.isArray(redEntryResponse.flows) || !redEntryResponse.flows.length
      || redEntryResponse.flows.some(id => !flows.has(id))) problems.push('redEntryResponse.flows: 車の流れの参照が不正です。');
    for (const [key, lo, hi] of [['speedKmh', 5, 80], ['reactionTimeSeconds', 0.2, 2.5],
      ['maxBrakingMps2', 2, 9], ['maxVehicles', 1, 2], ['cooldownSeconds', 1, 60], ['timeoutSeconds', 0, 10]] as const)
      if (!(Number.isFinite(redEntryResponse[key]) && redEntryResponse[key] >= lo && redEntryResponse[key] <= hi))
        problems.push(`redEntryResponse.${key}: ${lo}〜${hi} にしてください。`);
    if (!Number.isInteger(redEntryResponse.maxVehicles)) problems.push('redEntryResponse.maxVehicles: 整数にしてください。');
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return {
    id: manifest.id, map: manifest.map, starts: manifest.starts, recovery: manifest.recovery ?? [],
    maxCars: manifest.maxCars ?? 16, hidden: { farMeters: 75, nearMeters: 25, viewHalfAngle: 80,
      stopLineMargin: 35, searchMeters: 320, ...manifest.hiddenAdmission },
    noAdmission: manifest.noAdmission ?? [], parked: manifest.props?.parked ?? [], slots,
    flows: [...flows.values()], events: bindings, redEntryResponse,
  };
}

/** The scenario-shaped object Traffic expects for the shared background flows. */
export function worldScenario(world: ResolvedWorld, mode: PlayerMode, hazardPolicy?: HazardPolicy | null) {
  return { id: world.id, map: world.map, playerMode: mode, hazardPolicy, vehicles: world.flows };
}
