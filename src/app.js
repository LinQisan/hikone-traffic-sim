// VRLearn web port: title → walk/ride the scenario → contact (flash, freeze) → replay → feedback,
// or goal → success feedback. Desktop browsers (pointer lock + WASD) and phones/tablets (touch stick + drag).
import * as THREE from 'three';
import * as S from './shared/scenario.js';
import { toThree, yawToThree } from './coords.js';
import { buildMaterials, buildEnvironment, buildLight, model } from './world.js';
import { Ground } from './ground.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Recorder, accidentAnalysis, crossingAnalysis, accidentVerdict, successVerdict, yawTo,
  SECONDS_BEFORE_IMPACT, SECONDS_AFTER_IMPACT, BUFFER_SECONDS } from './analysis.js';
import { instance, BODY_MODEL, paintFor } from './vehicles.js';
import { Replay } from './replay.js';
import { painted, paint, PaintRenderer } from './style.js';
import { buildSignals } from './signals.js';
import { propReview } from './prop-review.js';
import { replayReviewFrames } from './replay-review.js';
import { PerformanceProbe } from './performance.js';
import { TouchControls, isTouchDevice } from './touch-controls.js';
import { AdaptiveResolution } from './resolution.js';
import { Obstacles } from './obstacles.js';

const $ = id => document.getElementById(id);
// loading screen (index.html): data files are the first 15 %, the models the next 75 %, building the rest
const loading = window.hikoneLoading ?? { step() {}, done() {}, fail() {} };
const progress = { files: [0, 0], models: [0, 0], base: 0 };
const showProgress = text => loading.step(text, progress.base
  + 0.15 * (progress.files[1] ? progress.files[0] / progress.files[1] : 0)
  + 0.75 * (progress.models[1] ? progress.models[0] / progress.models[1] : 0));
THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => { progress.models = [loaded, total]; showProgress(); };
const json = url => {
  progress.files[1]++;
  return fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); })
    .then(data => { progress.files[0]++; showProgress(); return data; });
};
const status = text => showProgress(text);
// screen-reader announcements of what happens (start, contact, goal, replay, results)
const announce = text => { const el = $('announce'); el.textContent = ''; requestAnimationFrame(() => { el.textContent = text; }); };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- set-up
// Dual-GPU laptops otherwise render on the integrated GPU (about half the frame rate here).
// Phones: no multisampling (dense screens, painted edges; it costs much of a mobile GPU's bandwidth).
const renderer = new THREE.WebGLRenderer({ antialias: !isTouchDevice(), powerPreference: 'high-performance' });
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
$('view').append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  sizeRenderer();
});

status('データを読み込んでいます… / Loading data…');
const [sceneData, signalData, layout, map, roadTiles, scenarioIndex, collision] = await Promise.all([
  json('data/scene.json'), json('data/signals.json'), json('data/layout.json'), json('data/map.json'), json('data/road_tiles.json'), json('data/scenarios/index.json'),
  json('data/collision.json')]);
const ground = new Ground(roadTiles);
const materials = buildMaterials(sceneData.materials);
const light = buildLight(scene, renderer, sceneData.light);
status('街の模型を読み込んでいます… / Loading the town…');
const env = await buildEnvironment(scene, layout, materials);
const vehicleModels = [...Object.values(BODY_MODEL), 'HK_Truck_Large', 'HK_Truck_Medium'];
await Promise.all(vehicleModels.map(name => model(name)));

status('街を組み立てています… / Building the town…');
// New closed signal models retain the source's installation matrices.
const signals = await buildSignals(scene, signalData, materials);
const occluders = new THREE.Group();
scene.add(occluders);
for (const w of sceneData.blackWalls) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w.size[0], w.size[1], Math.max(w.size[2], 0.05)), painted(new THREE.MeshStandardMaterial({ color: 0x7a8599, roughness: 1 })));
  wall.position.copy(toThree(w.x, w.y, w.z));
  wall.rotation.y = yawToThree(w.yaw);
  occluders.add(wall);
}

// buildings, walls, trees and posts at body height, plus the parked vehicles of each run
const obstacles = new Obstacles(collision);
const player = new Player(camera, renderer, map, ground, obstacles);
player.reducedMotion = reducedMotion.matches;          // no roll of the view when the body falls
reducedMotion.addEventListener?.('change', e => { player.reducedMotion = e.matches; });
scene.add(player.rig);
scene.add(player.bicycle.root);
const replay = new Replay(scene, materials, ground);
const flash = $('flash');
const touchDevice = isTouchDevice();
document.body.classList.toggle('touch', touchDevice);
const touch = new TouchControls(player, renderer.domElement, $('touch'));
// P compares the mesh's baked paint with/without the fine bristle and coloured-light finish.
// The sculpted shapes, pigments and relief strokes remain visible in both modes.
const artRenderer = new PaintRenderer(renderer);
const setPainted = on => { paint.strength.value = on ? 1 : 0; };
addEventListener('keydown', e => {
  if (e.code === 'KeyP' && !e.target.closest?.('input, textarea')) setPainted(!paint.strength.value);
});

// ---------------------------------------------------------------- title
let selected = scenarioIndex.find(e => e.template) ?? scenarioIndex[0];
let customScenario = null;
function renderTitle(focusSelected = false) {
  const list = $('scenarios');
  list.replaceChildren();
  for (const group of [['組み込み / Built-in', scenarioIndex.filter(e => e.template)], ['カスタム / Custom', scenarioIndex.filter(e => !e.template)]]) {
    if (!group[1].length) continue;
    list.append(Object.assign(document.createElement('h3'), { textContent: group[0] }));
    for (const e of group[1]) {
      const b = document.createElement('button');
      const on = e === selected && !customScenario;
      b.type = 'button';
      b.className = 'tile' + (on ? ' on' : '');
      b.setAttribute('aria-pressed', String(on));
      const n = e.template ? e.id.replace('builtin-', '') + ' ' : '';
      const name = Object.assign(document.createElement('b'), { textContent: n + e.name });
      const sub = Object.assign(document.createElement('small'), { textContent: `${e.nameEn ?? ''} ・ ${S.MODE_LABELS[e.playerMode] ?? ''}` });
      b.append(name, sub);
      b.onclick = () => { selected = e; customScenario = null; renderTitle(true); };
      list.append(b);
      if (on && focusSelected) b.focus();
    }
  }
  $('selected').textContent = customScenario ? `${params.get('play') === 'editor' ? 'エディタから' : 'ファイル'}：${customScenario.name}` : `${selected.name}`;
}
$('file').onchange = async ev => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const s = S.normalize(JSON.parse(await file.text()));
    const errors = S.validate(s, map).filter(p => p.level === 'error').map(p => p.message);
    if (errors.length) throw new Error(errors.join('\n'));
    customScenario = s;
    renderTitle();
  } catch (e) { alert('読み込めません：\n' + e.message); }
};
$('start').onclick = () => start();
// "▶ ブラウザで試す" in the scenario editor (editor/): the scenario arrives through localStorage
if (params.get('play') === 'editor') {
  try {
    const s = S.normalize(JSON.parse(localStorage.getItem('vrlearn.editor.play')));
    const errors = S.validate(s, map).filter(p => p.level === 'error').map(p => p.message);
    if (errors.length) throw new Error(errors.join('\n'));
    customScenario = s;
  } catch (e) { console.warn('editor scenario not loaded:', e); }
}
renderTitle();
loading.done();
$('title').hidden = false;
$('start').focus({ preventScroll: true });

// ---------------------------------------------------------------- run
let state = 'title';
let run = null;

async function start(again = false) {
  let scenario, entry;
  if (again && run) { scenario = run.scenario; entry = run.entry; }
  else if (customScenario) { scenario = customScenario; entry = { template: false, id: customScenario.id }; }
  else { entry = selected; scenario = S.normalize(await json('data/scenarios/' + selected.file)); }
  cleanup();
  const clampInput = (id, min, max, fallback) => {
    const v = Math.round(Number($(id).value));
    const value = Number.isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : fallback;
    $(id).value = value;
    return value;
  };
  const heightCm = clampInput('height', 90, 210, 170), weightKg = clampInput('weight', 15, 150, 60);
  const builtIn = entry.template ? Number(entry.id.replace('builtin-', '')) - 1 : -1;
  run = {
    scenario, entry, heightCm, weightKg, time: 0,
    traffic: new Traffic(scenario, { seed: (Date.now() & 0xffffff) + 1, builtInMix: !!entry.template }),
    recorder: new Recorder(), cars: new Map(), parked: new THREE.Group(), impact: null,
  };
  // parked cars and trucks of a built-in scenario (Unity's ScenarioHost objects); they are solid
  const footprints = [];
  for (const p of (builtIn >= 0 ? sceneData.scenarios.find(x => x.id === builtIn)?.parked : null) ?? []) {
    const mesh = instance(p.kind === 'truck' ? p.model : BODY_MODEL.sedan, materials, { paint: paintFor(Math.round(p.x)) });
    footprints.push(footprint(mesh, p));
    mesh.position.copy(toThree(p.x, ground.heightAt(p.x, p.z), p.z));
    mesh.rotation.y = yawToThree(p.yaw);
    run.parked.add(mesh);
  }
  obstacles.setParked(footprints);
  scene.add(run.parked);
  const sp = scenario.spawn, gl = scenario.goal;
  player.place(sp.x, sp.z, yawTo(sp.x, sp.z, gl.x, gl.z), heightCm, scenario.playerMode, weightKg);
  run.lastX = sp.x; run.lastZ = sp.z;
  player.enabled = true;
  state = 'playing';
  $('title').hidden = true; $('results').hidden = true; $('replayui').hidden = true;
  $('hud').hidden = false;
  $('hudname').textContent = (entry.template ? entry.id.replace('builtin-', '') + ' ' : '') + scenario.name;
  const bike = scenario.playerMode === 'bicycle';
  $('hudhelp').textContent = touchDevice
    ? (bike ? 'スティック：上でこぐ・下でブレーキ・左右でハンドル ・ ドラッグで見回す' : 'スティックで移動 ・ ドラッグで見回す')
    : (bike ? 'W こぐ ・ S ブレーキ ・ A / D ハンドル ・ マウスか Q / E で見回す ・ R でやり直し ・ M でメニュー' : 'クリックで視点操作 ・ Q / E で見回す ・ WASD で移動 ・ R でやり直し ・ M でメニュー');
  touch.setActive(touchDevice);
  document.activeElement?.blur?.();                       // keys go to the game, not to a hidden button
  announce(`${$('hudname').textContent}。開始しました。${bike ? 'W でこぎ、A と D でハンドル。' : 'W で前へ、Q と E で見回します。'}`);
}

/** Ground footprint of a parked vehicle (Unity x, z, yaw; size [width, length]) from its model. */
const _box = new THREE.Box3(), _size = new THREE.Vector3(), _centre = new THREE.Vector3();
function footprint(mesh, p) {
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
  light.invalidate();
  if (!run) return;
  for (const mesh of run.cars.values()) scene.remove(mesh);
  scene.remove(run.parked);
}

function toTitle() {
  touch.setActive(false);
  flash.classList.remove('on');
  cleanup();
  run = null;
  state = 'title';
  player.enabled = false;
  document.exitPointerLock?.();
  $('hud').hidden = true; $('results').hidden = true; $('replayui').hidden = true;
  $('title').hidden = false;
  renderTitle(true);
}

function syncCars() {
  const live = new Set();
  for (const car of run.traffic.cars) {
    live.add(car.id);
    let mesh = run.cars.get(car.id);
    if (!mesh) {
      mesh = instance(BODY_MODEL[car.body] ?? BODY_MODEL.sedan, materials, { paint: paintFor(car.id * 7 + 3) });
      run.cars.set(car.id, mesh);
      scene.add(mesh);
    }
    mesh.position.copy(toThree(car.x, ground.heightAt(car.x, car.z), car.z));
    mesh.rotation.y = yawToThree(car.yaw);
  }
  for (const [id, mesh] of run.cars) if (!live.has(id)) { scene.remove(mesh); run.cars.delete(id); }
}

function onImpact(car) {
  run.traffic.freeze();
  run.impact = { time: run.time, car, kmh: car.currentSpeed * 3.6 };
  player.enabled = false;
  document.exitPointerLock?.();
  state = 'impact';
  // the view falls with the body; the replay starts once the recording covers 1.6 s after contact
  player.knockDown(car.yaw);
  touch.setActive(false);
  $('hud').hidden = true;
  run.impactUntil = run.time + SECONDS_AFTER_IMPACT;
  flash.classList.add('on');
  announce('車と接触しました。 / Contact with a car.');
  navigator.vibrate?.(300);
}

function beginReplay() {
  flash.classList.remove('on');
  const t = run.impact.time;
  run.recorder.stop();
  run.frames = run.recorder.window(t - SECONDS_BEFORE_IMPACT, t + SECONDS_AFTER_IMPACT, t);
  for (const mesh of run.cars.values()) mesh.visible = false;
  player.bicycle.root.visible = false;
  replay.start(run.frames, t, run.impact.car.id, run.heightCm, run.scenario.playerMode, run.weightKg);
  light.invalidate();
  state = 'replay';
  announce('リプレイです。俯瞰か運転者の視点で見られます。 / Replay.');
  $('next').focus({ preventScroll: true });
  $('hud').hidden = true;
  $('replayui').hidden = false;
  $('replayname').textContent = run.scenario.playerMode === 'bicycle'
    ? '自転車のリプレイ / Bicycle replay' : '事故のリプレイ / Accident replay';
}

function showResults(success) {
  touch.setActive(false);
  replay.stop();
  player.bicycle.root.visible = false;
  light.invalidate();
  state = 'results';
  $('replayui').hidden = true; $('hud').hidden = true;
  const s = run.scenario, bicycle = S.MODE_LABELS[s.playerMode] === '自転車' || s.playerMode === 'bicycle';
  let title, lines, verdict;
  if (success) {
    const c = crossingAnalysis(run.recorder.window(run.time - BUFFER_SECONDS, run.time));
    title = bicycle ? 'ゴール！ 安全に走れました' : 'ゴール！ 安全に渡れました';
    verdict = successVerdict(c, bicycle);
    lines = [
      `左の確認：${c.checkedLeft ? c.left.toFixed(1) + ' 秒' : '少なめ'}`,
      `右の確認：${c.checkedRight ? c.right.toFixed(1) + ' 秒' : '少なめ'}`,
      `いちばん近づいた車：${c.closest >= 0 && c.closest < 40 ? c.closest.toFixed(1) + ' m' : '近くに車なし'}`,
      `このシナリオで学ぶこと：${s.learningGoal ?? ''}`,
    ];
  } else {
    const a = accidentAnalysis(run.frames, run.impact.time, run.impact.car.id);
    title = '事故が起きました / What happened';
    verdict = accidentVerdict(a);
    lines = [
      `何が起きたか：${s.situation ?? ''}`,
      `安全確認のポイント：${s.point ?? ''}`,
      `車の速度（接触時）：${a.vehicleKmh.toFixed(1)} km/h`,
      `あなたの速度：${a.participantKmh.toFixed(1)} km/h`,
      `車の方を見ていた時間：${a.secondsLooking.toFixed(1)} 秒`,
      `最後に車を見たのは：${a.lookedAtVehicle ? `接触の ${a.lastLookBeforeImpact.toFixed(1)} 秒前` : '見ていません'}`,
    ];
  }
  $('rtitle').textContent = title;
  $('rtitle').className = success ? 'ok' : 'ng';
  $('rlines').replaceChildren(...lines.map(l => Object.assign(document.createElement('p'), { textContent: l })));
  $('rverdict').textContent = verdict;
  $('results').hidden = false;
  $('rtitle').focus({ preventScroll: true });
  announce(`${title}。${verdict}`);
}

$('next').onclick = () => { if (state === 'replay') showResults(false); };
$('again').onclick = () => { if (state === 'replay') replay.restart(); };
// replay viewpoint: from above, or through the windscreen of the car (the driver's view)
function setReplayView(view) {
  replay.setView(view);
  for (const [id, v] of [['viewover', 'overview'], ['viewdriver', 'driver']]) {
    $(id).classList.toggle('on', replay.view === v);
    $(id).setAttribute('aria-pressed', String(replay.view === v));
  }
}
$('viewover').onclick = () => setReplayView('overview');
$('viewdriver').onclick = () => setReplayView('driver');
$('retry').onclick = () => start(true);
$('hudretry').onclick = () => { if (state === 'playing') start(true); };
$('totitle').onclick = () => toTitle();
// back to the menu at any time: during the run, the fall and the replay
let lockReleased = 0;
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) lockReleased = performance.now(); });
const mouseLockedRecently = () => performance.now() - lockReleased < 400;
const leaveToMenu = () => { if (['playing', 'impact', 'replay'].includes(state)) { toTitle(); announce('メニューに戻りました。 / Back to the menu.'); } };
$('hudmenu').onclick = leaveToMenu;
$('replaymenu').onclick = leaveToMenu;
addEventListener('keydown', e => {
  if (e.repeat) return;
  // a focused button or field handles its own Enter/Space; shortcuts must not fire a second action
  if (e.target.closest?.('button, input, textarea, select') && ['Enter', 'Space', 'NumpadEnter'].includes(e.code)) return;
  // Advancing the replay requires explicitly activating its Next/Skip button.
  if (e.code === 'KeyM' && !e.target.closest?.('input, textarea')) leaveToMenu();
  // Esc while the mouse is free (the first Esc only releases pointer lock)
  else if (e.code === 'Escape' && !document.pointerLockElement && !mouseLockedRecently()) leaveToMenu();
  else if (state === 'replay' && e.code === 'KeyB') replay.restart();
  else if (state === 'replay' && e.code === 'KeyV') setReplayView(replay.view === 'driver' ? 'overview' : 'driver');
  else if (state === 'results' && e.code === 'KeyR') start(true);
  else if (state === 'results' && e.code === 'Enter') toTitle();
  else if (state === 'playing' && e.code === 'KeyR') start(true);      // operator abort: restart
});

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect(document);
const probe = new PerformanceProbe($('fps'), renderer, new URLSearchParams(location.search).has('benchmark'),
  { geometryBytes: env.geometryBytes, placements: env.objects, meshes: env.root.children.length });
const lightPosition = new THREE.Vector3();
let debugCamera = null;
let fpsTime = 0, fpsFrames = 0;
function tick(dt) {
  if (state === 'playing') {
    run.time += dt;
    player.update(dt);
    const s = run.scenario;
    if (S.hasTrigger(s) && run.traffic.triggerTime == null && S.pointInArea([player.x, player.z], s.trigger)) run.traffic.trigger();
    // the participant's position and velocity time the event's accident car (traffic.js "meet")
    const vx = (player.x - run.lastX) / dt, vz = (player.z - run.lastZ) / dt;
    run.lastX = player.x; run.lastZ = player.z;
    run.traffic.step(dt, { x: player.x, z: player.z, vx, vz });
    syncCars();
    run.recorder.capture(run.time, player.head(), run.traffic.cars);
    const hit = run.traffic.hit(player.x, player.z);
    if (hit) onImpact(hit);
    else if (S.pointInArea([player.x, player.z], s.goal)) { player.enabled = false; document.exitPointerLock?.(); showResults(true); }
  } else if (state === 'impact') {
    run.time += dt;
    run.traffic.step(dt);                      // only a car that does not stop (noStop) still moves
    syncCars();
    // a short red flash at contact, then it fades (CSS) so the fall itself stays visible
    if (run.time - run.impact.time > 0.2) flash.classList.remove('on');
    player.update(dt);
    run.recorder.capture(run.time, player.head(), run.traffic.cars);
    if (run.time >= run.impactUntil) beginReplay();
  } else if (state === 'replay') {
    const label = replay.update(dt);
    if ($('rtime').textContent !== label) $('rtime').textContent = label;
    const next = replay.atEnd ? '結果へ進む / Next' : 'スキップ / Skip';
    if ($('next').textContent !== next) $('next').textContent = next;
    const hint = replay.atEnd ? '再生終了。Next をクリックして結果へ進んでください。'
      : '最後まで再生して停止します。スキップをクリックすると結果へ進みます。';
    if ($('rhint').textContent !== hint) $('rhint').textContent = hint;
  } else if (state !== 'results') {
    player.update(dt);
  }
}

renderer.setAnimationLoop(() => {
  timer.update();
  const elapsed = timer.getDelta();
  const dt = Math.min(elapsed, 0.1);
  // Resize before drawing: a canvas resized after its frame is drawn shows one blank frame.
  if (resolution.frame(elapsed, performance.now(), document.hidden)) sizeRenderer();
  const updateStart = performance.now();
  tick(dt);
  if (debugCamera) lightPosition.copy(debugCamera.position).setY(0);
  else if (state === 'replay') lightPosition.copy(replay.focus).setY(0);
  else lightPosition.set(-player.x, 0, player.z);
  const moving = state === 'playing' && (run.cars.size > 0 || player.mode === 'bicycle' && player.speed > 0)
    || state === 'replay' && !replay.atEnd;
  light.follow(lightPosition, moving, updateStart);
  const view = debugCamera ?? (state === 'replay' ? replay.activeCamera : camera);
  const aspect = innerWidth / innerHeight;
  if (view.aspect !== aspect) { view.aspect = aspect; view.updateProjectionMatrix(); }
  if (env.updateLOD(view, null, light.shadowCamera)) light.invalidate();
  const updateMs = performance.now() - updateStart;
  artRenderer.render(scene, view);
  probe.frame(elapsed, updateMs);
  fpsFrames++; fpsTime += elapsed;
  if (fpsTime > 1) { $('fps').textContent = `${Math.round(fpsFrames / fpsTime)} fps ・ ${artRenderer.calls} draw calls ・ ${Math.round(resolution.scale * 100)}%`; fpsTime = 0; fpsFrames = 0; }
});
// debugging and tests
window.vrlearn = {
  scene, camera, renderer, player, obstacles, env, signals, ground, start, toTitle, resolution, replay,
  select(id) { selected = scenarioIndex.find(e => e.id === id) ?? selected; customScenario = null; renderTitle(); },
  get run() { return run; }, get state() { return state; },
  setPainted,
  /** Contact with the nearest car now (checking the fall and the replay without driving into one). */
  knock() {
    if (state !== 'playing') return;
    const near = [...run.traffic.cars].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
    if (near) onImpact(near);
  },
  /** Look from (x, y, z) at (tx, ty, tz) in Unity coordinates (comparisons with Unity screenshots); null to stop. */
  debugView(x, y, z, tx, ty, tz, fov = 60) {
    if (x == null) { debugCamera = null; return; }
    debugCamera ??= new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 500);
    debugCamera.fov = fov;
    debugCamera.position.copy(toThree(x, y, z));
    debugCamera.lookAt(toThree(tx, ty, tz));
    light.follow(toThree(x, 0, z));
    for (const id of ['title', 'hud', 'results', 'replayui']) $(id).hidden = true;
  },
  /** Advance the game by `seconds` at a fixed step (tests; works while the tab is in the background). */
  simulate(seconds, step = 1 / 60) { for (let t = 0; t < seconds; t += step) tick(step); },
};

// Repeatable art-review viewpoints, separate from scenario spawns and recordings.
const review = new URLSearchParams(location.search);
const reviewViews = {
  street: [55, 2.15, 23, 0, 2.8, 27, 62],
  architecture: [51.7, 2.4, 29, 51.7, 4.0, 14, 55],
  foliage: [38, 2.0, 36, 26, 5.0, 46, 65],
  bridge: [32, 2.0, 37, 32, 3.0, 65, 62],
};
const propCamera = propReview(review.get('view'), scene, materials);
if (propCamera) {
  env.root.visible = signals.root.visible = occluders.visible = false;
  window.vrlearn.debugView(...propCamera);
} else if (reviewViews[review.get('view')]) window.vrlearn.debugView(...reviewViews[review.get('view')]);
if (review.get('finish') === 'off') setPainted(false);
if (review.get('view') === 'ride') {
  selected = scenarioIndex.find(e => e.id === 'builtin-07');
  await start();
  player.pitch = -12; player.apply();
}
if (['replay', 'replay-bicycle'].includes(review.get('view'))) {
  // Exercise the real recording/replay flow and its controls, using an inspection recording.
  const bicycle = review.get('view') === 'replay-bicycle';
  if (bicycle) selected = scenarioIndex.find(e => e.id === 'builtin-07');
  await start();
  const demo = replayReviewFrames(bicycle);
  for (const frame of demo.frames) run.recorder.capture(frame.t, frame.head, frame.cars);
  run.time = demo.impact;
  onImpact({ ...demo.car, currentSpeed: 4.5 });
  beginReplay();
}
