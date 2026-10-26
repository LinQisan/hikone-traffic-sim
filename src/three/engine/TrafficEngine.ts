// VRLearn web port. Open exploration: one continuous session in the shared corridor, where the ten
// events occur as encounters (scenario-manager.js); contact → replay → feedback → continue.
// Practice: title → walk/ride one scenario → contact (flash, freeze) → replay → feedback, or goal →
// success feedback. Desktop browsers (pointer lock + WASD) and phones/tablets (touch stick + drag).
import * as THREE from 'three';
import * as S from '../../simulation/core/scenario.ts';
import { toThree, yawToThree } from '../scene/coords.ts';
import { buildMaterials, buildEnvironment, buildLight, model, resetModelCache } from '../scene/world.js';
import { Ground } from '../../simulation/collision/Ground.ts';
import { Player } from '../controls/Player.ts';
import { Traffic, makeRandom } from '../../simulation/traffic/Traffic.ts';
import { resolveWorld, worldScenario } from '../../world/scenes/world.ts';
import { ScenarioManager, OUTCOME_LABELS } from '../../simulation/events/ScenarioManager.ts';
import { SessionLog } from '../../simulation/metrics/SessionLog.ts';
import { DRIVER_BEHAVIOR_LABELS } from '../../simulation/traffic/driver.ts';
import { Recorder, accidentAnalysis, crossingAnalysis, accidentVerdict, successVerdict, yawTo,
  SECONDS_BEFORE_IMPACT, SECONDS_AFTER_IMPACT, BUFFER_SECONDS } from '../../simulation/metrics/analysis.ts';
import { instance, BODY_MODEL, paintFor, resetVehicleCache } from '../entities/vehicles.js';
import { Replay } from '../entities/replay.js';
import { paint, PaintRenderer } from '../materials/style.js';
import { buildSignals } from '../scene/signals.js';
import { propReview } from '../scene/prop-review.js';
import { replayReviewFrames } from '../scene/replay-review.js';
import { PerformanceProbe } from '../renderer/PerformanceProbe.ts';
import { TouchControls, isTouchDevice } from '../controls/TouchControls.ts';
import { AdaptiveResolution } from '../renderer/AdaptiveResolution.ts';
import { Obstacles } from '../../simulation/collision/Obstacles.ts';
import { setSunDirection, alignBlobShadow } from '../materials/blob-shadow.js';
import { webLayout } from '../../world/generators/web-layout.js';
import { parkedFor } from '../../world/generators/parked-layout.js';
import { geometryBytes } from '../scene/geometry-budget.js';
import { ambientMotion } from '../materials/ambient-motion.js';
import { buildWildlife } from '../entities/wildlife.js';
import { startup, startupMark, resetStartup } from '../renderer/startup.ts';
import { createScenarioReader } from '../../data/scenario-import.ts';

import type {Scenario, ScenarioEntry, ScenarioMap, PlayerMode, Point, Pose} from '../../types/scenario.ts';
import type {CollisionGrid, RoadTiles, TrafficCar, HeadFrame, Participant, Footprint, ReplayFrame} from '../../types/simulation.ts';
import type {Binding, EncounterRecord, ParkedPlacement} from '../../types/world.ts';
import type {IncidentRecord, SessionIncident} from '../../types/session.ts';
import type {SimulatorCommands, SimulatorStore, Screen} from '../../state/SimulatorStore.ts';
import {ResourceDisposer} from './resources.ts';
import {ResourceScope} from '../../utils/ResourceScope.ts';
import {resetBrushTexture} from '../materials/paint-texture.js';
import {resetBlobShadow} from '../materials/blob-shadow.js';
import {beginModelSession} from '../assets/models.js';
import {errorMessage} from '../../utils/errors.ts';
import {downloadBlob} from '../../utils/download.ts';
import {createScenePackage} from '../../export/scene-package.ts';
import type {SceneLayout} from '../../types/scene-package.ts';
import type {ModelDetail} from '../../types/assets.ts';

interface RunBase {
  entry: Pick<ScenarioEntry, 'id' | 'template'>;
  heightCm: number; weightKg: number; time: number; traffic: Traffic; recorder: Recorder;
  recordingHead: Partial<HeadFrame>; participant: Participant; cars: Map<number, THREE.Group>;
  carFrame: number; parked: THREE.Group; lastX: number; lastZ: number;
  impact: {time: number; car: TrafficCar; kmh: number; x?: number; z?: number; binding?: Binding | null} | null;
  impactUntil: number; frames: ReplayFrame[]; replaySource: 'impact' | 'summary';
}
interface PracticeRun extends RunBase {kind: 'practice'; scenario: Scenario}
interface ExplorationRun extends RunBase {
  kind: 'explore'; scenario: Pick<Scenario, 'name' | 'playerMode'>;
  log: SessionLog; travelled: number; rulesSeen: {red: number; unchecked: number; wrongWay: boolean};
  slotMeshes: Map<string, THREE.Group>; fixedFootprints: Footprint[]; toastUntil: number;
  manager: ScenarioManager; incident: IncidentRecord | null;
}
type Run = PracticeRun | ExplorationRun;
export interface EngineMount {view: HTMLElement; touchRoot: HTMLElement; replayRoot: HTMLElement; fps: HTMLElement; ui: SimulatorStore}
let activeScope: ResourceScope | null = null;
export function createTrafficEngine(mount: EngineMount) {
  if (activeScope && !activeScope.disposed) throw new Error('A traffic engine is already mounted');
  const scope = new ResourceScope();
  activeScope = scope; scope.own(() => {if (activeScope === scope) activeScope = null;});
  resetStartup();

  const ready = initialize(mount, scope).catch(error => {scope.dispose(); throw error;});
  return {ready, dispose: () => scope.dispose()};
}
async function initialize({view: viewRoot, touchRoot, replayRoot, fps: fpsRoot, ui}: EngineMount, scope: ResourceScope) {
const resources = new ResourceDisposer();
scope.own(() => {resetVehicleCache(resources.geometry, resources.material); resetModelCache(resources.geometry, resources.material); resetBrushTexture(); resetBlobShadow();});
startupMark('appModule');


const loading = {
  step(text?: string, progress?: number) { if (!scope.disposed) ui.patch('loading', {...(text ? {text} : {}), ...(progress == null ? {} : {progress: Math.max(ui.getSnapshot().loading.progress, Math.min(1, progress))})}); },
  done() { ui.patch('loading', {progress: 1, done: true}); },
};
const progress = {files: [0, 0], models: [0, 0], base: 0};
const showProgress = (text?: string) => loading.step(text, progress.base
  + 0.15 * (progress.files[1] ? progress.files[0] / progress.files[1] : 0)
  + 0.75 * (progress.models[1] ? progress.models[0] / progress.models[1] : 0));
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {progress.models = [loaded, total]; showProgress();};
scope.own(beginModelSession(manager, scope.signal));
const json = async <T,>(url: string): Promise<T> => {
  progress.files[1]++;
  const response = await fetch(url, {signal: scope.signal});
  if (!response.ok) throw new Error(url + ' ' + response.status);
  const data: T = await response.json();
  scope.check(); progress.files[0]++; showProgress(); return data;
};
const status = (text: string) => showProgress(text);
const announce = (text: string) => ui.announce(text);
const setState = (value: Screen) => {state = value; ui.screen(value);};
const flash = (on: boolean) => {if (ui.getSnapshot().presentation.flash !== on) ui.patch('presentation', {flash: on});};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
ambientMotion.setReducedMotion(reducedMotion.matches);
reducedMotion.addEventListener('change', e => { ambientMotion.setReducedMotion(e.matches); }, {signal: scope.signal});

// ---------------------------------------------------------------- set-up
// Dual-GPU laptops otherwise render on the integrated GPU (about half the frame rate here).
// Dense screens already resolve the painted edges. Multisampling a Retina canopy
// costs substantial integrated-GPU bandwidth, even when its triangle count is low.
startupMark('rendererStart');
const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice() && devicePixelRatio < 1.5,
  powerPreference: 'high-performance' });
const params = new URLSearchParams(location.search);
const nativeQuality = params.get('quality') === 'high';
// Desktop resolution follows the GPU (resolution.js); fixed for measurements and quality=high.
const resolution = new AdaptiveResolution({ enabled: !nativeQuality && !params.has('benchmark') });
const sizeRenderer = () => {
  // A Retina/4K desktop otherwise spends most of its time on invisible subpixel detail.
  const ratio = nativeQuality ? Math.min(devicePixelRatio, 2)
    : Math.min(devicePixelRatio, 1.25, Math.sqrt(1_600_000 / (innerWidth * innerHeight))) * resolution.scale;
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
};
sizeRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.08;
viewRoot.append(renderer.domElement);
scope.own(() => {renderer.setAnimationLoop(null); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();});
const scene = new THREE.Scene();
scope.own(() => resources.scene(scene));
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 900);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  sizeRenderer();
}, {signal: scope.signal});

startupMark('rendererReady');
status('データを読み込んでいます… / Loading data…');
// walls.json: the water walls the participant cannot cross (map.json's surfaces are editor-only).
const [sceneData, layout, map, roadTiles, scenarioIndex, collision, worldManifest] = await Promise.all([
  json<{materials: {name: string; color: number[]; emissive?: boolean}[]; light: {direction: number[]}; scenarios: {id: number; parked: ParkedPlacement[]}[]}>('data/scene.json'), json<SceneLayout>('data/layout.json'), json<ScenarioMap>('data/walls.json'), json<RoadTiles>('data/road_tiles.json'), json<ScenarioEntry[]>('data/scenarios/index.json'),
  json<CollisionGrid>('data/collision.json'), json<import('../../types/world.ts').WorldManifest>('world/hikone.json')]);
scope.check();
startupMark('initialDataReady');
// The open world refers to the built-in events' routes; resolve it once against those files.
const world = resolveWorld(worldManifest, await Promise.all(scenarioIndex.filter(e => e.template)
  .map(e => json<Scenario>('data/scenarios/' + e.file).then(S.normalize))));
scope.check();
startupMark('dataReady');
const ground = new Ground(roadTiles);
const materials = buildMaterials(sceneData.materials);
const light = buildLight(scene, renderer, sceneData.light);
scope.own(() => light.dispose());
startupMark('lightReady');
setSunDirection(sceneData.light.direction);              // shadow pools of moving things fall like the town's shadows
status('街の模型を読み込んでいます… / Loading the town…');
const townLayout = webLayout(layout);
// Opt-in A/B inspection of the landmark's workload on the same camera and renderer settings.
const measuredLayout = params.has('benchmark') && params.get('landmarks') === 'off'
  ? { ...townLayout, items: townLayout.items.filter((item: {g: string}) => item.g !== 'WebLandmark') } : townLayout;
const env = await buildEnvironment(scene, measuredLayout, materials, ground);
scope.own(() => {resources.object(env.root); resources.texture(env.palette.texture); for (const material of env.palette.materials.values()) resources.material(material);});
scope.check();
const wildlife = buildWildlife(scene);
const vehicleModels = [...Object.values(BODY_MODEL), 'HK_Truck_Large', 'HK_Truck_Medium'];
await Promise.all(vehicleModels.map(name => model(name)));
startupMark('vehiclesReady');

status('街を組み立てています… / Building the town…');
// Five browser-owned installations, placed on the pavement beside their crossings.
const signals = await buildSignals(scene, materials);
scope.own(() => resources.object(signals.root));
scope.check();
startupMark('signalsReady');

// buildings, walls, trees and posts at body height, plus the parked vehicles of each run
const obstacles = new Obstacles(collision);
obstacles.setFixed(signals.poles);                      // the signal posts
const player = new Player(camera, renderer, map, ground, obstacles);
scope.own(() => player.dispose());
player.reducedMotion = reducedMotion.matches;          // no roll of the view when the body falls
reducedMotion.addEventListener('change', e => { player.reducedMotion = e.matches; }, {signal: scope.signal});
scene.add(player.rig);
scene.add(player.bicycle.root);
env.cameraObstacles.addRoot(signals.root);
const replay = new Replay(scene, materials, ground, env.cameraObstacles);
replay.setReducedMotion(reducedMotion.matches);
scope.own(() => replay.stop());
reducedMotion.addEventListener('change', e => { replay.setReducedMotion(e.matches); }, {signal: scope.signal});
const replayViewport = () => {
  if (!ui.getSnapshot().replay.visible) return;
  replay.setViewport(innerWidth / innerHeight, (innerHeight - replayRoot.getBoundingClientRect().top + 12) / innerHeight);
};
const replayObserver = new ResizeObserver(replayViewport);
replayObserver.observe(replayRoot); scope.own(() => replayObserver.disconnect());
addEventListener('resize', replayViewport, {signal: scope.signal});
const touchDevice = isTouchDevice();
ui.patch('presentation', {touch: touchDevice});
const touch = new TouchControls(player, renderer.domElement, touchRoot, active => ui.patch('presentation', {touchActive: active}));
scope.own(() => touch.dispose());
// P compares the mesh's baked paint with/without the fine bristle and coloured-light finish.
// The sculpted shapes, pigments and relief strokes remain visible in both modes.
const artRenderer = new PaintRenderer(renderer);
const setPainted = (on: boolean) => { paint.strength.value = on ? 1 : 0; };
addEventListener('keydown', e => {
  if (e.code === 'KeyP' && !(e.target as Element | null)?.closest?.('input, textarea')) setPainted(!paint.strength.value);
}, {signal: scope.signal});

// ---------------------------------------------------------------- title
let selected = scenarioIndex.find(e => e.template) ?? scenarioIndex[0];
let customScenario: Scenario | null = null;
let scenarioRequest = 0;
const readScenario = createScenarioReader(() => json<ScenarioMap>('data/map.json'));

function scenarioStatus(message = '', {error = false, busy = false} = {}) {ui.patch('menu', {status: message, error, busy});}
function cancelScenarioImport() {scenarioRequest++; scenarioStatus();}
function renderTitle(focusSelected = false) {
  ui.patch('menu', {entries: scenarioIndex, selectedId: customScenario ? null : selected.id,
    selectedName: customScenario?.name ?? selected.name, customName: customScenario?.name ?? null});
  if (focusSelected && !customScenario) ui.focus({scenario: selected.id});
}
async function importFile(file: File) {
  const request = ++scenarioRequest;
  scenarioStatus(`「${file.name}」と地図を確認しています…`, {busy: true});
  try {
    const scenario = await readScenario(await file.text());
    if (request !== scenarioRequest || scope.disposed) return;
    customScenario = scenario; renderTitle(); scenarioStatus('読み込みました。');
    if (state === 'title') ui.focus('start');
  } catch (error) {if (request === scenarioRequest && !scope.disposed) scenarioStatus(`「${file.name}」を読み込めません：\n${errorMessage(error)}`, {error: true});}
}
// "▶ ブラウザで試す" in the scenario editor (editor/): the scenario arrives through localStorage
let editorProblem = null;
if (params.get('play') === 'editor') {
  try {
    const text = localStorage.getItem('vrlearn.editor.play');
    if (!text) throw new Error('エディタから渡された場面がありません。エディタでもう一度「▶ ブラウザで試す」を押してください。');
    customScenario = await readScenario(text);
  } catch (e) { editorProblem = errorMessage(e); }
}
renderTitle();
loading.done();
startupMark('menuReady');
ui.screen('title');
if (editorProblem) {
  scenarioStatus('エディタの場面を開けません：\n' + editorProblem, { error: true });
  ui.focus('file');
} else if (customScenario) {
  ui.focus('start');
} else ui.focus('explore', true);

// ---------------------------------------------------------------- run
let state: Screen = 'title';
let activeRun: Run | null = null;
const requireRun = () => {if (!activeRun) throw new Error('No active simulation'); return activeRun;};
const requireExploration = () => {const run = requireRun(); if (run.kind !== 'explore') throw new Error('Not exploring'); return run;};
let resultsKind: 'success' | 'accident' | 'incident' | 'summary' | null = null;                      // 'success' | 'accident' (practice), 'incident' | 'summary' (exploration)

async function start(again = false) {
  let scenario, entry;
  if (again && activeRun?.kind === 'practice') { scenario = activeRun.scenario; entry = activeRun.entry; }
  else if (customScenario) { scenario = customScenario; entry = { template: false, id: customScenario.id }; }
  else { entry = selected; scenario = S.normalize(await json<Scenario>('data/scenarios/' + selected.file)); }
  scope.check();
  cleanup();
  const { heightCm, weightKg } = profile();
  const builtIn = entry.template ? Number(entry.id.replace('builtin-', '')) - 1 : -1;
  const run: PracticeRun = activeRun = {
    kind: 'practice', scenario, entry, heightCm, weightKg, time: 0,
    traffic: new Traffic(scenario, { seed: (Date.now() & 0xffffff) + 1, builtInMix: !!entry.template,
      canSee: (car, participant) => obstacles.clearSight(car, participant) }),
    recorder: new Recorder(), recordingHead: {}, participant: {x: 0, z: 0},
    cars: new Map(), carFrame: 0, parked: new THREE.Group(), impact: null,
    lastX: 0, lastZ: 0, impactUntil: 0, frames: [], replaySource: 'impact',
  };
  obstacles.setTraffic(run.traffic.cars);
  signals.update(0);
  // parked cars and trucks of a built-in scenario (Unity's ScenarioHost objects); they are solid
  const footprints = (builtIn >= 0 ? parkedFor(sceneData, builtIn) : []).map((p: ParkedPlacement) => parkedMesh(p).userData.footprint);
  obstacles.setParked(footprints);
  scene.add(run.parked);
  const sp = scenario.spawn, gl = scenario.goal;
  player.place(sp.x, sp.z, yawTo(sp.x, sp.z, gl.x, gl.z), heightCm, scenario.playerMode, weightKg);
  run.lastX = sp.x; run.lastZ = sp.z;
  player.enabled = true;
  setState('playing');
  ui.patch('results', {visible: false}); ui.patch('replay', {visible: false});
  ui.patch('hud', {visible: true, retry: true, name: (entry.template ? entry.id.replace('builtin-', '') + ' ' : '') + scenario.name});
  ui.patch('toast', {visible: false});
  const bike = scenario.playerMode === 'bicycle';
  ui.patch('hud', {help: touchDevice
    ? (bike ? 'スティック：上でこぐ・下でブレーキ・左右でハンドル ・ ドラッグで見回す' : 'スティックで移動 ・ ドラッグで見回す')
    : (bike ? 'W こぐ ・ S ブレーキ ・ A / D ハンドル ・ マウスか Q / E で見回す ・ R でやり直し ・ M でメニュー' : 'クリックで視点操作 ・ Q / E で見回す ・ WASD で移動 ・ R でやり直し ・ M でメニュー')});
  touch.setActive(touchDevice);
  (document.activeElement as HTMLElement | null)?.blur?.();                       // keys go to the game, not to a hidden button
  announce(`${ui.getSnapshot().hud.name}。開始しました。${bike ? 'W でこぎ、A と D でハンドル。' : 'W で前へ、Q と E で見回します。'}`);
}

/** Height and weight from the title inputs, clamped and written back. */
function profile() {
  const clampInput = (id: 'height' | 'weight', min: number, max: number, fallback: number) => {
    const v = Math.round(Number(ui.getSnapshot().profile[id]));
    const value = Number.isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : fallback;
    ui.patch('profile', {[id]: String(value)}); return value;
  };
  return {heightCm: clampInput('height', 90, 210, 170), weightKg: clampInput('weight', 15, 150, 60)};
}

/** A parked vehicle (Unity x, z, yaw) added to run.parked; its footprint is in userData. */
function parkedMesh(p: ParkedPlacement, paintSeed = Math.round(p.x)) {
  const run = requireRun();
  const mesh = instance(p.kind === 'truck' ? p.model : BODY_MODEL.sedan, materials, { paint: paintFor(paintSeed) });
  mesh.userData.footprint = footprint(mesh, p);
  mesh.position.copy(toThree(p.x, ground.heightAt(p.x, p.z), p.z));
  mesh.rotation.y = yawToThree(p.yaw);
  run.parked.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- open exploration
const EXPLORE_STEP = 1 / 60;                 // longest simulation step; contact is checked after each
const modeChoice = () => ui.getSnapshot().profile.mode;
const shortName = (b?: Pick<Binding, 'name'> | null) => b?.name?.split('：').at(-1) ?? '';
const helpText = (bike: boolean) => touchDevice
  ? (bike ? 'スティック：上でこぐ・下でブレーキ・左右でハンドル ・ ドラッグで見回す' : 'スティックで移動 ・ ドラッグで見回す')
  : (bike ? 'W こぐ ・ S ブレーキ ・ A / D ハンドル ・ マウスか Q / E で見回す' : 'クリックで視点操作 ・ Q / E で見回す ・ WASD で移動');

function startExplore() {
  cleanup();
  const { heightCm, weightKg } = profile(), mode = modeChoice();
  const seed = (Date.now() & 0xffffff) + 1;
  const traffic = new Traffic(worldScenario(world, mode), { seed, builtInMix: true, maxCars: world.maxCars,
    canSee: (car, participant) => obstacles.clearSight(car, participant) });
  const log = new SessionLog({ world: world.id, mode, heightCm, weightKg, seed,
    note: 'Local practice record. Driver tendencies are simulation settings, not crash probabilities.' });
  const run: ExplorationRun = activeRun = {
    kind: 'explore', scenario: { name: '自由探索', playerMode: mode }, entry: { template: false, id: 'explore' },
    heightCm, weightKg, time: 0, traffic, recorder: new Recorder(), recordingHead: {}, participant: {x: 0, z: 0},
    cars: new Map(), carFrame: 0, parked: new THREE.Group(), impact: null, log, travelled: 0,
    rulesSeen: { red: 0, unchecked: 0, wrongWay: false }, slotMeshes: new Map(), toastUntil: 0,
    lastX: 0, lastZ: 0, impactUntil: 0, frames: [], replaySource: 'impact', fixedFootprints: [], incident: null,
    manager: new ScenarioManager(world, traffic, {random: makeRandom(seed ^ 0x5bd1e995),
      lineOfSight: (from, to) => obstacles.clearSight(from, to), log: (type, data) => log.add(type, data), onOutcome: encounterFeedback}),
  };
  obstacles.setTraffic(traffic.cars);
  signals.update(0);
  run.fixedFootprints = world.parked.map((p: ParkedPlacement) => parkedMesh(p).userData.footprint);
  for (const slot of run.manager.slots.values())
    run.slotMeshes.set(slot.id, parkedMesh({ kind: 'car', x: slot.x, z: slot.z, yaw: slot.yaw }, slot.paintSeed * 7 + 3));
  syncSlots(true);
  scene.add(run.parked);
  const sp = world.starts[mode];
  player.place(sp.x, sp.z, sp.yaw, heightCm, mode, weightKg);
  run.lastX = sp.x; run.lastZ = sp.z;
  log.add('start', { x: sp.x, z: sp.z, mode });
  enterPlay();
  announce(`自由探索を始めました（${S.MODE_LABELS[mode]}）。${mode === 'bicycle' ? 'W でこぎ、A と D でハンドル。' : 'W で前へ、Q と E で見回します。'}M で記録とメニュー。`);
}

/** Shows/hides parked slot cars as the encounters take them out and return them. */
function syncSlots(force = false) {
  const run = requireExploration();
  let changed = force;
  for (const [id, mesh] of run.slotMeshes) {
    const occupied = run.manager.slots.get(id)!.occupied;
    if (mesh.visible !== occupied) { mesh.visible = occupied; changed = true; }
  }
  if (changed) obstacles.setParked([...run.fixedFootprints,
    ...[...run.slotMeshes.values()].filter(m => m.visible).map(m => m.userData.footprint)]);
}

function enterPlay() {
  const run = requireExploration();
  player.enabled = true;
  setState('playing');
  ui.patch('results', {visible: false}); ui.patch('replay', {visible: false});
  const bike = run.scenario.playerMode === 'bicycle';
  ui.patch('hud', {visible: true, retry: false, name: `自由探索 ・ ${S.MODE_LABELS[run.scenario.playerMode]}`,
    help: helpText(bike) + (touchDevice ? '' : ' ・ M で記録とメニュー')});
  touch.setActive(touchDevice);
  (document.activeElement as HTMLElement | null)?.blur?.();
}

function toast(text: string, tone = '') {
  ui.patch('toast', {text, tone, visible: true}); requireExploration().toastUntil = requireExploration().time + 7;
}

/** Feedback once an encounter has ended without contact (contact goes through the replay). */
function encounterFeedback(record: EncounterRecord, b: Binding) {
  if (record.outcome === 'near-miss')
    toast(`ヒヤリ：${shortName(b)}（${record.minGap!.toFixed(1)} m まで接近）。${b.point}`, 'warn');
  else if (record.outcome === 'yielded') toast(`車があなたに気づいて減速しました（${shortName(b)}）。${b.point}`);
  else if (record.outcome === 'passed') toast(`${shortName(b)}：無事でした。${b.learningGoal}`, 'good');
}

/** Rule observations as they happen: they also change the hazard probability of new drivers. */
function ruleFeedback() {
  const run = requireExploration();
  const rules = run.traffic.participantRules, seen = run.rulesSeen, log = run.log;
  if (rules.redEntries > seen.red) {
    seen.red = rules.redEntries;
    log.add('red-entry', { x: player.x, z: player.z, probability: rules.probability });
  }
  if (rules.uncheckedEntries > seen.unchecked) {
    seen.unchecked = rules.uncheckedEntries;
    log.add('unchecked-entry', { x: player.x, z: player.z, probability: rules.probability });
    toast('左右を確かめずに車道へ出ました。出る前に両方向を見ましょう。', 'warn');
  }
  if (rules.wrongWay !== seen.wrongWay) {
    seen.wrongWay = rules.wrongWay;
    log.add(rules.wrongWay ? 'wrong-way-start' : 'wrong-way-end', { x: player.x, z: player.z });
    if (rules.wrongWay) toast('道路の右側（車と向かい合う向き）を走っています。自転車は左側を走りましょう。', 'warn');
  }
}

function exploreStep(h: number) {
  const run = requireExploration();
  run.time += h;
  player.update(h);
  const vx = (player.x - run.lastX) / h, vz = (player.z - run.lastZ) / h;
  run.travelled += Math.hypot(player.x - run.lastX, player.z - run.lastZ);
  run.lastX = player.x; run.lastZ = player.z;
  const participant = run.participant, rules = run.traffic.participantRules;
  participant.x = player.x; participant.z = player.z; participant.vx = vx; participant.vz = vz; participant.yaw = player.yaw;
  run.traffic.step(h, participant);
  run.manager.update(h, { participant, mode: run.scenario.playerMode, rules });
  run.recorder.capture(run.time, player.head(run.recordingHead), run.traffic.cars);
  run.log.sample(run.time, { x: player.x, z: player.z, yaw: player.yaw, rideYaw: player.mode === 'bicycle' ? player.rideYaw : null,
    speed: Math.hypot(vx, vz), onRoad: rules.onRoad, wrongWay: rules.wrongWay, walk: run.traffic.signalCycle.state.walk,
    risk: rules.score, probability: rules.probability });
  return run.traffic.hit(player.x, player.z);
}

/** Back to exploring after feedback: a contact moves the participant to a nearby clear pavement point. */
function resumeExplore() {
  const run = requireExploration();
  replay.stop();
  light.invalidate();
  flash(false);
  for (const mesh of run.cars.values()) mesh.visible = true;
  const mode = run.scenario.playerMode;
  if (run.impact) {
    const from = run.impact as Run['impact'] & Point;
    const clear = (p: Point) => !run.traffic.cars.some(c => Math.hypot(c.x - p.x, c.z - p.z) < 8) && obstacles.clearance(p.x, p.z, 0.4) > 0.4;
    const points = [...world.recovery].sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
    const p = points.find(clear) ?? points[0];
    player.place(p.x, p.z, player.yaw, run.heightCm, mode, run.weightKg);
    run.lastX = p.x; run.lastZ = p.z;
    run.log.add('recovery', { x: p.x, z: p.z, fromX: from.x, fromZ: from.z });
    run.impact = null;
  } else player.bicycle.root.visible = mode === 'bicycle';
  run.log.add('resume');
  enterPlay();
  announce('探索を続けます。 / Exploring again.');
}

function showSummary() {
  const run = requireExploration();
  touch.setActive(false);
  replay.stop();
  player.enabled = false;
  document.exitPointerLock?.();
  player.bicycle.root.visible = false;
  light.invalidate();
  if (state === 'playing') run.log.add('pause');
  // leaving during the fall: keep the contact clip recorded so far
  if (state === 'impact') {
    const t = run.impact!.time;
    run.log.incident(run.incident!, run.recorder.window(t - SECONDS_BEFORE_IMPACT, run.time, t));
  }
  setState('results');
  resultsKind = 'summary';
  ui.patch('replay', {visible: false}); ui.patch('hud', {visible: false}); ui.patch('toast', {visible: false});
  const rules = run.traffic.participantRules, { counts, outcomes } = run.manager.summary();
  const minutes = Math.floor(run.time / 60), seconds = Math.floor(run.time % 60);
  const names = new Map(world.events.map(b => [b.id, shortName(b)]));
  const lines = [
    `探索時間：${minutes} 分 ${seconds} 秒 ・ 移動距離：${Math.round(run.travelled)} m（${S.MODE_LABELS[run.scenario.playerMode]}）`,
    `出会った場面：${outcomes.filter(o => o.outcome !== 'deferred').length} 回（${Object.entries(counts).filter(([k]) => k !== 'deferred')
      .map(([k, n]) => `${OUTCOME_LABELS[k as keyof typeof OUTCOME_LABELS]} ${n}`).join('・') || 'まだありません'}）`,
    ...outcomes.filter(o => o.outcome !== 'deferred').slice(-6).map(o => `・ ${names.get(o.event)}：${OUTCOME_LABELS[o.outcome]}`),
    `交通確認：赤で進入 ${rules.redEntries} 回・双方向確認なし ${rules.uncheckedEntries} 回・逆方向の走行 ${rules.wrongWaySeconds.toFixed(1)} 秒`,
    '記録はこのブラウザのタブの中だけにあり、送信されません。閉じると消えます。「記録を保存」で JSON ファイルにできます。',
  ];
  const incidents = run.log.incidents.map((incident, index) => ({index, replayable: !!incident.frames,
    text: `接触 ${index + 1}：${incident.event ? names.get(incident.event) : '車の流れ'}（${incident.kmh.toFixed(0)} km/h）`}));
  ui.patch('results', {title: '探索の記録 / Session record', tone: '', lines, incidents,
    verdict: rules.redEntries + rules.uncheckedEntries + run.log.incidents.length === 0 && rules.wrongWaySeconds < 1
      ? 'ここまで交通ルールを守って移動できました。守っていても危ない車に出会うことはあります。確認を続けましょう。'
      : '危ない行動があると、危険な運転者に出会いやすくなります。止まる・見る・確かめるを続けましょう。'});
  setResultButtons();
  ui.patch('results', {visible: true}); ui.focus('rtitle', true);
  announce('探索の記録です。続けるか、メニューへ戻れます。');
}

function exportRecord() {
  const run = requireExploration();
  run.log.endedAt = new Date().toISOString();
  const blob = new Blob([JSON.stringify(run.log, null, 1)], { type: 'application/json' });
  downloadBlob(blob, `hikone-session-${run.log.header.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`);
  announce('記録ファイルを保存しました。 / Record saved.');
}

/** Ground footprint of a parked vehicle (Unity x, z, yaw; size [width, length]) from its model. */
const _box = new THREE.Box3(), _size = new THREE.Vector3(), _centre = new THREE.Vector3();
function footprint(mesh: THREE.Object3D, p: Pose): Footprint {
  mesh.updateMatrixWorld(true);                            // still at the origin, unrotated
  _box.setFromObject(mesh);
  _box.getSize(_size); _box.getCenter(_centre);
  const a = p.yaw * Math.PI / 180, cx = -_centre.x, cz = _centre.z;   // model centre, Unity axes
  return { x: p.x + cx * Math.cos(a) + cz * Math.sin(a), z: p.z - cx * Math.sin(a) + cz * Math.cos(a), yaw: p.yaw, size: [_size.x, _size.z] };
}

function cleanup() {
  replay.stop();
  player.bicycle.root.visible = false;
  obstacles.setParked([]);
  obstacles.setTraffic([]);
  light.invalidate();
  const run = activeRun;
  if (!run) return;
  for (const mesh of run.cars.values()) scene.remove(mesh);
  scene.remove(run.parked);
}

function toTitle() {
  touch.setActive(false);
  flash(false);
  ui.patch('toast', {visible: false});
  if (activeRun?.kind === 'explore') activeRun.log.add('end');
  cleanup();
  activeRun = null;
  setState('title');
  player.enabled = false;
  document.exitPointerLock?.();
  ui.patch('hud', {visible: false}); ui.patch('results', {visible: false}); ui.patch('replay', {visible: false});
  renderTitle(true);
}

function syncCars() {
  const run = requireRun();
  const frame = ++run.carFrame;
  for (const car of run.traffic.cars) {
    let mesh = run.cars.get(car.id);
    if (!mesh) {
      mesh = instance(BODY_MODEL[car.body] ?? BODY_MODEL.sedan, materials,
        { paint: paintFor(car.paintSeed != null ? car.paintSeed * 7 + 3 : car.id * 7 + 3), steerable: true, moving: true });
      run.cars.set(car.id, mesh);
      scene.add(mesh);
    }
    mesh.userData.trafficFrame = frame;
    toThree(car.x, ground.heightAt(car.x, car.z), car.z, mesh.position);   // in place: no per-frame garbage
    mesh.rotation.y = yawToThree(car.yaw);
    mesh.userData.steer?.(car.steer ?? 0);
    alignBlobShadow(mesh);
  }
  for (const [id, mesh] of run.cars) if (mesh.userData.trafficFrame !== frame) { scene.remove(mesh); run.cars.delete(id); }
}

function onImpact(car: TrafficCar) {
  const run = requireRun();
  // Practice freezes its finite scenario; the open world keeps its traffic running through the fall.
  if (run.kind === 'explore') {
    const encounter = run.manager.onContact(car);
    run.impact = { time: run.time, car, kmh: car.currentSpeed * 3.6, x: player.x, z: player.z, binding: encounter?.binding ?? null };
    run.incident = { time: Math.round(run.time * 100) / 100, car: car.id, kmh: run.impact!.kmh, x: player.x, z: player.z,
      event: encounter?.binding.id ?? null, instance: encounter?.id ?? null, driverBehavior: car.driver.behavior,
      violation: car.violation, mode: run.scenario.playerMode };
    ui.patch('toast', {visible: false});
  } else {
    run.traffic.freeze();
    run.impact = { time: run.time, car, kmh: car.currentSpeed * 3.6 };
  }
  player.enabled = false;
  document.exitPointerLock?.();
  setState('impact');
  // the view falls with the body; the replay starts once the recording covers 1.6 s after contact
  player.knockDown(car.yaw);
  touch.setActive(false);
  ui.patch('hud', {visible: false});
  run.impactUntil = run.time + SECONDS_AFTER_IMPACT;
  flash(true);
  announce('車と接触しました。 / Contact with a car.');
  navigator.vibrate?.(300);
}

function beginReplay() {
  const run = requireRun();
  flash(false);
  const t = run.impact!.time;
  if (run.kind !== 'explore') run.recorder.stop();
  run.frames = run.recorder.window(t - SECONDS_BEFORE_IMPACT, t + SECONDS_AFTER_IMPACT, t);
  if (run.kind === 'explore') run.log.incident(run.incident!, run.frames);
  run.replaySource = 'impact';
  for (const mesh of run.cars.values()) mesh.visible = false;
  player.bicycle.root.visible = false;
  ui.patch('replay', {visible: true, title: run.scenario.playerMode === 'bicycle'
    ? '自転車のリプレイ / Bicycle replay' : '事故のリプレイ / Accident replay', next: 'スキップ / Skip',
    hint: '最後まで再生して停止します。スキップをクリックすると結果へ進みます。'});
  playReplay(run.frames, t, run.impact!.car.id);
}

/** A kept contact clip of this session, from the session record. */
function replayIncident(incident: SessionIncident) {
  const run = requireRun();
  ui.patch('results', {visible: false});
  run.replaySource = 'summary';
  for (const mesh of run.cars.values()) mesh.visible = false;
  player.bicycle.root.visible = false;
  ui.patch('replay', {visible: true, title: '接触のリプレイ / Contact replay', next: 'スキップ / Skip'});
  playReplay(incident.frames!, incident.time, incident.car);
}

function playReplay(frames: ReplayFrame[], t: number, carId: number) {
  const run = requireRun();
  ui.flush(); replayViewport();
  replay.start(frames, t, carId, run.heightCm, run.scenario.playerMode, run.weightKg, run.parked);
  light.invalidate();
  setState('replay');
  announce('リプレイです。俯瞰か運転者の視点で見られます。 / Replay.');
  ui.focus('next', true);
  ui.patch('hud', {visible: false});
}

function showResults(success: boolean) {
  const run = requireRun();
  touch.setActive(false);
  replay.stop();
  player.bicycle.root.visible = false;
  light.invalidate();
  setState('results');
  ui.patch('replay', {visible: false}); ui.patch('hud', {visible: false});
  resultsKind = success ? 'success' : run.kind === 'explore' ? 'incident' : 'accident';
  // An exploration contact is explained with the encounter's own event text, if it was one.
  const b = run.impact?.binding;
  const s = run.kind === 'explore' ? { ...run.scenario, situation: b?.situation ?? '探索中に、車の流れの中の車と接触しました。',
    point: b?.point ?? '道路に出る前と渡っている間は、左右と車の動きを確かめ続けましょう。' } : run.scenario;
  const bicycle = s.playerMode === 'bicycle';
  let title, lines, verdict;
  if (success) {
    const c = crossingAnalysis(run.recorder.window(run.time - BUFFER_SECONDS, run.time));
    title = bicycle ? 'ゴール！ 安全に走れました' : 'ゴール！ 安全に渡れました';
    verdict = successVerdict(c, bicycle);
    lines = [
      `左の確認：${c.checkedLeft ? c.left.toFixed(1) + ' 秒' : '少なめ'}`,
      `右の確認：${c.checkedRight ? c.right.toFixed(1) + ' 秒' : '少なめ'}`,
      `いちばん近づいた車：${c.closest >= 0 && c.closest < 40 ? c.closest.toFixed(1) + ' m' : '近くに車なし'}`,
      `このシナリオで学ぶこと：${run.kind === 'practice' ? run.scenario.learningGoal ?? '' : ''}`,
    ];
  } else {
    const a = accidentAnalysis(run.frames, run.impact!.time, run.impact!.car.id);
    title = b ? `事故が起きました：${shortName(b)}` : '事故が起きました / What happened';
    verdict = accidentVerdict(a);
    lines = [
      `何が起きたか：${s.situation ?? ''}`,
      `安全確認のポイント：${s.point ?? ''}`,
      `車の速度（接触時）：${a.vehicleKmh.toFixed(1)} km/h`,
      `車の違反記録：${DRIVER_BEHAVIOR_LABELS[run.impact!.car.violation as keyof typeof DRIVER_BEHAVIOR_LABELS] ?? '記録なし'}`,
      `あなたの速度：${a.participantKmh.toFixed(1)} km/h`,
      `車の方を見ていた時間：${a.secondsLooking.toFixed(1)} 秒`,
      `最後に車を見たのは：${a.lookedAtVehicle ? `接触の ${a.lastLookBeforeImpact.toFixed(1)} 秒前` : '見ていません'}`,
    ];
  }
  const rules = run.traffic.participantRules;
  lines.push(`今回の交通確認：赤で進入 ${rules.redEntries} 回・双方向確認なし ${rules.uncheckedEntries} 回・逆方向の走行 ${rules.wrongWaySeconds.toFixed(1)} 秒`);
  ui.patch('results', {title, tone: success ? 'ok' : 'ng', lines, verdict, incidents: []});
  setResultButtons();
  ui.patch('results', {visible: true}); ui.focus('rtitle', true);
  announce(`${title}。${verdict}`);
}

function next() {
  if (state !== 'replay') return;
  if (requireRun().replaySource === 'summary') showSummary(); else showResults(false);
}
function setResultButtons() {
  const explore = requireRun().kind === 'explore';
  ui.patch('results', {retry: explore ? '探索を続ける / Continue (R)' : 'もう一度体験 / Try again (R)',
    titleAction: explore && resultsKind === 'incident' ? '記録とメニュー / Record (Enter)' : 'タイトルへ / Title (Enter)',
    canExport: resultsKind === 'summary'});
}
const retryAction = () => {if (activeRun?.kind === 'explore') resumeExplore(); else void start(true);};
const titleAction = () => {if (activeRun?.kind === 'explore' && resultsKind === 'incident') showSummary(); else toTitle();};
function setReplayView(view: 'overview' | 'driver') {replay.setView(view); ui.patch('replay', {view});}
// back to the menu at any time: during the run, the fall and the replay
let lockReleased = 0;
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) lockReleased = performance.now(); }, {signal: scope.signal});
const mouseLockedRecently = () => performance.now() - lockReleased < 400;
// Exploration first shows its record (continue, save, or menu); practice goes straight to the menu.
const leaveToMenu = () => {
  if (!['playing', 'impact', 'replay'].includes(state)) return;
  if (activeRun?.kind === 'explore') { flash(false); showSummary(); return; }
  toTitle(); announce('メニューに戻りました。 / Back to the menu.');
};
addEventListener('keydown', e => {
  if (e.repeat) return;
  // a focused button or field handles its own Enter/Space; shortcuts must not fire a second action
  if ((e.target as Element | null)?.closest?.('button, input, textarea, select') && ['Enter', 'Space', 'NumpadEnter'].includes(e.code)) return;
  // Advancing the replay requires explicitly activating its Next/Skip button.
  if (e.code === 'KeyM' && !(e.target as Element | null)?.closest?.('input, textarea')) leaveToMenu();
  // Esc while the mouse is free (the first Esc only releases pointer lock)
  else if (e.code === 'Escape' && !document.pointerLockElement && !mouseLockedRecently()) leaveToMenu();
  else if (state === 'replay' && e.code === 'KeyB') replay.restart();
  else if (state === 'replay' && e.code === 'KeyV') setReplayView(replay.view === 'driver' ? 'overview' : 'driver');
  else if (state === 'results' && e.code === 'KeyR') retryAction();
  else if (state === 'results' && e.code === 'Enter') titleAction();
  else if (state === 'playing' && e.code === 'KeyR' && activeRun?.kind !== 'explore') start(true);      // operator abort: restart
}, {signal: scope.signal});

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect(document); scope.own(() => timer.dispose());
const probe = new PerformanceProbe(fpsRoot, renderer, new URLSearchParams(location.search).has('benchmark'),
  () => ({ geometryBytes: env.geometryBytes + geometryBytes(wildlife.root), sceneBufferBytes: geometryBytes(scene, true),
    placements: env.objects, meshes: env.root.children.length }));
const lightPosition = new THREE.Vector3();
let debugCamera: (THREE.PerspectiveCamera | THREE.OrthographicCamera) & {aspect?: number} | null = null;
let previewSignals: Awaited<ReturnType<typeof buildSignals>> | null = null, previewSignalTime = 0;
let fpsTime = 0, fpsFrames = 0;
function tick(dt: number) {
  const run = activeRun!;
  if (state === 'playing' && run.kind === 'explore') {
    const steps = Math.max(1, Math.ceil(dt / EXPLORE_STEP - 1e-6));
    for (let i = 0; i < steps; i++) {
      const hit = exploreStep(dt / steps);
      if (hit) { onImpact(hit); break; }
    }
    syncCars();
    syncSlots();
    if (state === 'playing') {
      ruleFeedback();
      if (ui.getSnapshot().toast.visible && run.time > run.toastUntil) ui.patch('toast', {visible: false});
    }
  } else if (state === 'playing' && run.kind === 'practice') {
    run.time += dt;
    player.update(dt);
    const s = run.scenario;
    if (S.hasTrigger(s) && run.traffic.triggerTime == null && S.pointInArea([player.x, player.z], s.trigger)) run.traffic.trigger();
    // Drivers perceive actual movement; departures run on their own clocks.
    const vx = (player.x - run.lastX) / dt, vz = (player.z - run.lastZ) / dt;
    run.lastX = player.x; run.lastZ = player.z;
    const participant = run.participant;
    participant.x = player.x; participant.z = player.z; participant.vx = vx; participant.vz = vz; participant.yaw = player.yaw;
    run.traffic.step(dt, participant);
    syncCars();
    run.recorder.capture(run.time, player.head(run.recordingHead), run.traffic.cars);
    const hit = run.traffic.hit(player.x, player.z);
    if (hit) onImpact(hit);
    else if (S.pointInArea([player.x, player.z], s.goal)) { player.enabled = false; document.exitPointerLock?.(); showResults(true); }
  } else if (state === 'impact') {
    run.time += dt;
    // practice: only a car that does not stop (noStop) still moves; exploration: drivers see the fall
    run.traffic.step(dt, run.kind === 'explore' ? run.participant : null);
    syncCars();
    // a short red flash at contact, then it fades (CSS) so the fall itself stays visible
    if (run.time - run.impact!.time > 0.2) flash(false);
    player.update(dt);
    run.recorder.capture(run.time, player.head(run.recordingHead), run.traffic.cars);
    if (run.time >= run.impactUntil) beginReplay();
  } else if (state === 'replay') {
    const label = replay.update(dt);
    if (ui.getSnapshot().replay.time !== label || ui.getSnapshot().replay.next !== (replay.atEnd ? '結果へ進む / Next' : 'スキップ / Skip')) ui.patch('replay', {time: label, next: replay.atEnd ? '結果へ進む / Next' : 'スキップ / Skip',
      hint: replay.atEnd ? '再生終了。Next をクリックして結果へ進んでください。'
        : '最後まで再生して停止します。スキップをクリックすると結果へ進みます。'});
  } else if (state !== 'results') {
    player.update(dt);
  }
  // Replay uses its recorded simulation time, so slow motion and rewind keep the same signals.
  const signalTime = state === 'replay' ? replay.time : run ? run.time : (previewSignalTime += dt);
  const signalState = signals.update(signalTime);
  previewSignals?.update(signalTime);
  const label = signalState.walk === 'green' ? '歩行者信号：全方向 青' : signalState.walk === 'flash'
    ? '歩行者信号：全方向 青点滅（渡り始めない）' : '歩行者信号：全方向 赤';
  if (state === 'playing' && ui.getSnapshot().hud.signal !== label) ui.patch('hud', {signal: label});
}

let firstRenderedFrame = true;
renderer.setAnimationLoop(() => {
  timer.update();
  const elapsed = timer.getDelta();
  const dt = Math.min(elapsed, 0.1);
  // Resize before drawing: a canvas resized after its frame is drawn shows one blank frame.
  if (resolution.frame(elapsed, performance.now(), document.hidden)) sizeRenderer();
  const updateStart = performance.now();
  tick(dt);
  light.animate(document.hidden ? 0 : dt);
  wildlife.update(ambientMotion.time.value);
  if (debugCamera) lightPosition.copy(debugCamera.position).setY(0);
  else if (state === 'replay') lightPosition.copy(replay.focus).setY(0);
  else lightPosition.set(-player.x, 0, player.z);
  // the shadow map holds only still things: it is redrawn when the view re-centres, never because
  // something moves (cars, bicycles and the replay figure have shadow pools, blob-shadow.js)
  light.follow(lightPosition);
  const view = debugCamera ?? (state === 'replay' ? replay.activeCamera : camera);
  const aspect = innerWidth / innerHeight;
  if (view.aspect !== aspect) {
    view.aspect = aspect;
    if (view instanceof THREE.OrthographicCamera) {
      const half=(view.top-view.bottom)/2;
      view.left=-half*aspect; view.right=half*aspect;
    }
    view.updateProjectionMatrix();
  }
  if (env.updateLOD(view, null, light.shadowCamera)) light.invalidate();
  env.casters(light.sun.shadow.needsUpdate);              // the shadow-only casters exist only for shadow frames
  const updateMs = performance.now() - updateStart;
  if (firstRenderedFrame) startupMark('firstRenderStart');
  artRenderer.render(scene, view);
  if (firstRenderedFrame) { startupMark('firstFrame'); firstRenderedFrame = false; }
  probe.frame(elapsed, updateMs);
  fpsFrames++; fpsTime += elapsed;
  if (fpsTime > 1) { ui.patch('presentation', {fps: `${Math.round(fpsFrames / fpsTime)} fps ・ ${artRenderer.calls} draw calls ・ ${Math.round(resolution.scale * 100)}%`}); fpsTime = 0; fpsFrames = 0; }
});
// debugging and tests
const debug = {
  scene, camera, renderer, player, obstacles, env, signals, ground, wildlife, start, toTitle, resolution, replay, benchmark: probe, startup,
  select(id: string) { cancelScenarioImport(); selected = scenarioIndex.find(e => e.id === id) ?? selected; customScenario = null; renderTitle(); },
  get run() { return activeRun; }, get state() { return state; }, world, startExplore,
  setMode(mode: PlayerMode) {ui.patch('profile', {mode});},
  setPainted,
  async exportScene() {
    const scenarios = await Promise.all(scenarioIndex.filter(entry => entry.template).map(entry => json<Scenario>('data/scenarios/' + entry.file)));
    return createScenePackage(townLayout, scenarios, worldManifest);
  },
  async exportAsset(name: string, detail: ModelDetail = 'high') {
    scope.check();
    const {exportNativeAsset} = await import('../../export/NativeAssetExporter.ts');
    return exportNativeAsset(name, detail, new URL('.', document.baseURI), scope.signal);
  },
  /** Contact with the nearest car now (checking the fall and the replay without driving into one). */
  knock() {
    if (state !== 'playing') return;
    const run = requireRun();
    const near = [...run.traffic.cars].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
    if (near) onImpact(near);
  },
  /** Look from (x, y, z) at (tx, ty, tz) in Unity coordinates (comparisons with Unity screenshots); null to stop. */
  debugView(x: number | null, y = 0, z = 0, tx = 0, ty = 0, tz = 0, fov = 60) {
    if (x == null) {debugCamera = null; ui.patch('presentation', {inspection: false}); return;}
    if (!(debugCamera instanceof THREE.PerspectiveCamera)) debugCamera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 900);
    debugCamera.fov = fov;
    debugCamera.updateProjectionMatrix();
    debugCamera.position.copy(toThree(x, y, z));
    debugCamera.lookAt(toThree(tx, ty, tz));
    light.follow(toThree(x, 0, z));
    ui.patch('presentation', {inspection: true});
  },
  /** Advance the game by `seconds` at a fixed step (tests; works while the tab is in the background). */
  simulate(seconds: number, step = 1 / 60) { for (let t = 0; t < seconds; t += step) tick(step); },
};

// Repeatable art-review viewpoints, separate from scenario spawns and recordings.
const review = new URLSearchParams(location.search);
const reviewViews: Record<string, [number, number, number, number, number, number, number]> = {
  street: [55, 2.15, 23, 0, 2.8, 27, 62],
  'street-east': [30, 2.15, 26, 80, 2.8, 26, 62],
  'street-corner': [32, 2.15, 34, 49, 3.2, 14, 63],
  'display-surroundings': [43.7, 1.8, 20.7, 47.4, 2.05, 15.3, 59],
  'street-west-corner': [33, 3.0, 34, 16, 3.3, 10, 62],
  'moat-overhead': [64, 95, -18, 60, 0.15, 35, 52],
  'road-network': [22, 130, -28, 22, 0.15, 42, 74],
  'moat-detail': [66, 52, -2, 64, 0.15, 34, 52],
  'bridge-detail': [23.2, 2.2, 32, 30, 1.2, 44, 52],
  'north-bank': [32, 2.1, 53, 30, 4.0, 91, 68],
  'water-sky': [-35, 3.3, 51, -46, 8, 94, 65],
  'wildlife': [-49, 1.8, 42, -45, 2.5, 57, 62],
  'water-birds': [-36, 1, 49, -39, -1.1, 52, 43],
  'crows': [-29, 15, 37, -18, 25, 60, 65],
  'castle-road': [33, 2.1, 12, 36, 3.5, -65, 66],
  'castle-road-north': [36.6, 1.6, -3, 30, 3.6, 14, 66],
  'parking-frontage': [-30, 2.2, 26, -78, 2.5, 16.5, 60],
  'castle-panorama': [32, 2.1, 34, -264, 61, 395, 60],
  'castle-detail': [-241.5, 67, 357, -264, 60.5, 395, 52],
  'castle-site': [-130, 205, 240, -264, 35, 395, 60],
  'castle-compound': [-70, 260, 215, -265, 26, 420, 64],
  'castle-paths': [-70, 260, 215, -265, 26, 420, 64],
  'castle-underpass': [-162.89, 19.65, 328.98, -149.52, 22, 327.42, 68],
  'castle-tenbin': [-115, 48, 295, -159, 31, 342, 54],
  'castle-west-turret': [-390, 64, 435, -446, 46, 478, 52],
  university: [-790, 100, 110, -725, 5, 300, 72],
  'university-west-gate': [-778, 2.1, 154, -778, 3, 178, 68],
  'university-neighborhood': [-900, 125, 90, -730, 0, 210, 68],
  'university-gate': [-590.3, 2.1, 182, -647, 5, 188, 68],
  'university-context': [-720, 300, 120, -490, 0, 370, 58],
  'school-moat-lane': [-528.224, 1.7, 262.826, -528.996, 3, 291.662, 78],
  'school-open-lot': [-496.23, 1.7, 250.48, -263.89, 21, 395.92, 72],
  'school-neighborhood': [-645, 115, 160, -495, 0, 310, 68],
  'school-map': [-550.491, 500, 315.021, -550.491, 0, 315.021, 45],
  'university-hall': [-605, 5, 183, -656, 8, 199, 58],
  'west-connection': [-180, 14, 28, -450, 8, 80, 65],
  'castle-approach': [105, 180, 50, -105, 0.15, 230, 62],
  'saigo-gate': [1.5, 2.0, 123, -8, 2.8, 130, 65],
  'otemon-bridge': [-177, 7, 193, -157, 3.0, 239, 62],
  architecture: [51.7, 2.4, 29, 51.7, 4.0, 14, 55],
  foliage: [38, 2.0, 36, 26, 5.0, 46, 65],
  bridge: [32, 2.0, 37, 32, 3.0, 65, 62],
  'signals-layout': [56, 24, 49, 33, 1.5, 26, 52],
  'signals-photo': [52.8, 1.65, 21.8, 22, 16, 25.3, 64],
};
window.vrlearn = debug;
scope.own(() => {if (window.vrlearn === debug) delete window.vrlearn;});
const propCamera = await propReview(review.get('view'), scene, materials);
// A review may finish after cancellation. Normal teardown remains in LIFO order so private
// player/replay owners remove and release their meshes before shared scene resources.
if (scope.disposed) resources.scene(scene);
scope.check();
if (propCamera) {
  previewSignals = scene.getObjectByName('PropReview')!.userData.signals ?? null;
  env.root.visible = signals.root.visible = false;
  debug.debugView(...(propCamera as [number, number, number, number, number, number, number]));
} else if (reviewViews[review.get('view') ?? '']) {
  debug.debugView(...reviewViews[review.get('view') ?? '']);
  if (review.get('view') === 'school-map') {
    const half=156543.03392*Math.cos(35.2772*Math.PI/180)/2**18*848/2;
    debugCamera=new THREE.OrthographicCamera(-half*innerWidth/innerHeight,half*innerWidth/innerHeight,half,-half,.1,1000);
    debugCamera.position.copy(toThree(-550.491,500,315.021));
    // Geographic north, after the scene's 32-degree map rotation and X mirror.
    debugCamera.up.set(Math.sin(32*Math.PI/180),0,Math.cos(32*Math.PI/180));
    debugCamera.lookAt(toThree(-550.491,0,315.021));
    scene.fog = null;
  }
}
// Ad hoc comparison with a photograph: ?cam=x,y,z,tx,ty,tz[,fov] in map metres.
else if (review.get('cam')) debug.debugView(...(review.get('cam')!.split(',').map(Number) as [number, number, number, number, number, number, number?]));
if (review.get('finish') === 'off') setPainted(false);
if (review.get('view') === 'ride') {
  selected = scenarioIndex.find(e => e.id === 'builtin-07') ?? selected;
  await start();
  player.pitch = -12; player.apply();
}
if (['replay', 'replay-bicycle'].includes(review.get('view') ?? '')) {
  // Exercise the real recording/replay flow and its controls, using an inspection recording.
  const bicycle = review.get('view') === 'replay-bicycle';
  if (bicycle) selected = scenarioIndex.find(e => e.id === 'builtin-07') ?? selected;
  await start();
  const demo = replayReviewFrames(bicycle);
  const run = requireRun();
  for (const frame of demo.frames) run.recorder.capture(frame.t, frame.head, frame.cars);
  run.time = demo.impact;
  onImpact({ ...demo.car, currentSpeed: 4.5 } as TrafficCar);
  beginReplay();
}

scope.check();
const commands: SimulatorCommands = {
  start, explore: startExplore, select: id => {debug.select(id); ui.focus({scenario: selected.id});}, importFile,
  next, retry: retryAction, title: titleAction, menu: leaveToMenu, replayAgain: () => {if (state === 'replay') replay.restart();},
  setReplayView, exportRecord, replayIncident: index => {const incident = requireExploration().log.incidents[index]; if (incident?.frames) replayIncident(incident);},
};
return {commands, debug};
}
export type TrafficEngine = Awaited<ReturnType<typeof initialize>>;
declare global {interface Window {vrlearn?: TrafficEngine['debug']}}
