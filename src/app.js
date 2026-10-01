// VRLearn web port: title → walk/ride the scenario → contact (flash, freeze) → replay → feedback,
// or goal → success feedback. Desktop (pointer lock + WASD) or WebXR (Quest browser).
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
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
import { Panel } from './panel.js';

const $ = id => document.getElementById(id);
const json = url => fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
const status = text => { $('loading').textContent = text; };

// ---------------------------------------------------------------- set-up
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('view').append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 2500);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

status('データを読み込んでいます…');
const [sceneData, layout, map, roadTiles, scenarioIndex] = await Promise.all([
  json('data/scene.json'), json('data/layout.json'), json('data/map.json'), json('data/road_tiles.json'), json('data/scenarios/index.json')]);
const ground = new Ground(roadTiles);
const materials = buildMaterials(sceneData.materials);
const light = buildLight(scene, renderer, sceneData.light);
status('街を組み立てています…');
const env = await buildEnvironment(scene, layout, materials);
const vehicleModels = [...Object.values(BODY_MODEL), 'HK_Truck_Large', 'HK_Truck_Medium', 'WEB_Signal_Car', 'WEB_Signal_Pedestrian'];
await Promise.all(vehicleModels.map(model));

// fixed scene objects: traffic signals and the black walls that hide where cars appear
for (const s of sceneData.signals) {
  const signal = instance(s.kind === 'car' ? 'WEB_Signal_Car' : 'WEB_Signal_Pedestrian', materials);
  signal.position.copy(toThree(s.x, s.y, s.z));
  signal.rotation.y = yawToThree(s.yaw);
  scene.add(signal);
}
for (const w of sceneData.blackWalls) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w.size[0], w.size[1], Math.max(w.size[2], 0.05)), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  wall.position.copy(toThree(w.x, w.y, w.z));
  wall.rotation.y = yawToThree(w.yaw);
  scene.add(wall);
}

const player = new Player(camera, renderer, map, ground);
scene.add(player.rig);
const replay = new Replay(scene, materials, ground);
const panel = new Panel();
scene.add(panel.mesh);
const flash = $('flash');

// ---------------------------------------------------------------- title
let selected = scenarioIndex.find(e => e.template) ?? scenarioIndex[0];
let customScenario = null;
function renderTitle() {
  const list = $('scenarios');
  list.replaceChildren();
  for (const group of [['組み込み / Built-in', scenarioIndex.filter(e => e.template)], ['カスタム / Custom', scenarioIndex.filter(e => !e.template)]]) {
    if (!group[1].length) continue;
    list.append(Object.assign(document.createElement('h3'), { textContent: group[0] }));
    for (const e of group[1]) {
      const b = document.createElement('button');
      b.className = 'tile' + (e === selected && !customScenario ? ' on' : '');
      const n = e.template ? e.id.replace('builtin-', '') + ' ' : '';
      b.innerHTML = `<b>${n}${e.name}</b><small>${e.nameEn ?? ''} ・ ${S.MODE_LABELS[e.playerMode] ?? ''}</small>`;
      b.onclick = () => { selected = e; customScenario = null; renderTitle(); };
      list.append(b);
    }
  }
  $('selected').textContent = customScenario ? `ファイル：${customScenario.name}` : `${selected.name}`;
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
const vr = VRButton.createButton(renderer);
vr.id = 'vr';
$('vrslot').append(vr);
renderer.xr.addEventListener('sessionstart', () => { if (state === 'title') start(); else { panel.placeInFront(camera); } });
renderTitle();
$('loading').hidden = true;
$('title').hidden = false;

// ---------------------------------------------------------------- run
let state = 'title';
let run = null;

async function start(again = false) {
  let scenario, entry;
  if (again && run) { scenario = run.scenario; entry = run.entry; }
  else if (customScenario) { scenario = customScenario; entry = { template: false, id: customScenario.id }; }
  else { entry = selected; scenario = S.normalize(await json('data/scenarios/' + selected.file)); }
  cleanup();
  const heightCm = Number($('height').value) || 170;
  const builtIn = entry.template ? Number(entry.id.replace('builtin-', '')) - 1 : -1;
  run = {
    scenario, entry, heightCm, time: 0,
    traffic: new Traffic(scenario, { seed: (Date.now() & 0xffffff) + 1, builtInMix: !!entry.template }),
    recorder: new Recorder(), cars: new Map(), parked: new THREE.Group(), impact: null,
  };
  // parked cars and trucks of a built-in scenario (Unity's ScenarioHost objects)
  for (const p of (builtIn >= 0 ? sceneData.scenarios.find(x => x.id === builtIn)?.parked : null) ?? []) {
    const mesh = instance(p.kind === 'truck' ? p.model : BODY_MODEL.sedan, materials, { paint: paintFor(Math.round(p.x)) });
    mesh.position.copy(toThree(p.x, ground.heightAt(p.x, p.z), p.z));
    mesh.rotation.y = yawToThree(p.yaw + (p.kind === 'car' ? 0 : 0));
    run.parked.add(mesh);
  }
  scene.add(run.parked);
  const sp = scenario.spawn, gl = scenario.goal;
  player.place(sp.x, sp.z, yawTo(sp.x, sp.z, gl.x, gl.z), heightCm);
  player.enabled = true;
  state = 'playing';
  $('title').hidden = true; $('results').hidden = true; $('replayui').hidden = true;
  $('hud').hidden = false;
  $('hudname').textContent = (entry.template ? entry.id.replace('builtin-', '') + ' ' : '') + scenario.name;
  panel.mesh.visible = false;
}

function cleanup() {
  replay.stop();
  if (!run) return;
  for (const mesh of run.cars.values()) scene.remove(mesh);
  scene.remove(run.parked);
}

function toTitle() {
  cleanup();
  run = null;
  state = 'title';
  player.enabled = false;
  document.exitPointerLock?.();
  $('hud').hidden = true; $('results').hidden = true; $('replayui').hidden = true;
  panel.mesh.visible = false;
  $('title').hidden = false;
  if (renderer.xr.isPresenting) renderer.xr.getSession().end();
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
  run.impactUntil = run.time + 1.2;
  flash.classList.add('on');
  for (const source of renderer.xr.getSession()?.inputSources ?? [])
    source.gamepad?.hapticActuators?.[0]?.pulse?.(1, 400);
}

function beginReplay() {
  flash.classList.remove('on');
  const t = run.impact.time;
  run.recorder.stop();
  run.frames = run.recorder.window(t - SECONDS_BEFORE_IMPACT, t + SECONDS_AFTER_IMPACT, t);
  for (const mesh of run.cars.values()) mesh.visible = false;
  replay.start(run.frames, t, run.impact.car.id, run.heightCm);
  state = 'replay';
  $('hud').hidden = true;
  $('replayui').hidden = false;
  if (renderer.xr.isPresenting) { panel.placeInFront(camera); panel.mesh.visible = true; }
}

function showResults(success) {
  replay.stop();
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
  if (renderer.xr.isPresenting) {
    panel.placeInFront(camera);
    panel.draw({ title, lines: [...lines, verdict], hint: 'B / Y：もう一度体験　　A / X・トリガー：タイトルへ', accent: success ? '#4ade80' : '#ff6b5e' });
    panel.mesh.visible = true;
  }
}

$('next').onclick = () => { if (state === 'replay') showResults(false); };
$('again').onclick = () => { if (state === 'replay') replay.restart(); };
$('retry').onclick = () => start(true);
$('totitle').onclick = () => toTitle();
addEventListener('keydown', e => {
  if (state === 'replay' && (e.code === 'Enter' || e.code === 'Space')) showResults(false);
  else if (state === 'replay' && e.code === 'KeyB') replay.restart();
  else if (state === 'results' && e.code === 'KeyR') start(true);
  else if (state === 'results' && e.code === 'Enter') toTitle();
  else if (state === 'playing' && e.code === 'KeyR') start(true);      // operator abort: restart
});

// XR buttons: A/X (4) and the trigger = primary, B/Y (5) = secondary
const pressed = new Set();
function xrButtons() {
  for (const source of renderer.xr.getSession()?.inputSources ?? []) {
    const b = source.gamepad?.buttons ?? [];
    for (const [i, action] of [[0, 'primary'], [4, 'primary'], [5, 'secondary']]) {
      const key = source.handedness + i, down = !!b[i]?.pressed;
      if (down && !pressed.has(key)) {
        pressed.add(key);
        if (state === 'replay') action === 'primary' ? showResults(false) : replay.restart();
        else if (state === 'results') action === 'primary' ? toTitle() : start(true);
      } else if (!down) pressed.delete(key);
    }
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let fpsTime = 0, fpsFrames = 0;
function tick(dt) {
  if (renderer.xr.isPresenting) xrButtons();
  if (state === 'playing') {
    run.time += dt;
    player.update(dt);
    const s = run.scenario;
    if (S.hasTrigger(s) && run.traffic.triggerTime == null && S.pointInArea([player.x, player.z], s.trigger)) run.traffic.trigger();
    run.traffic.step(dt);
    syncCars();
    run.recorder.capture(run.time, player.head(), run.traffic.cars);
    const hit = run.traffic.hit(player.x, player.z);
    if (hit) onImpact(hit);
    else if (S.pointInArea([player.x, player.z], s.goal)) { player.enabled = false; document.exitPointerLock?.(); showResults(true); }
  } else if (state === 'impact') {
    run.time += dt;
    player.update(dt);
    run.recorder.capture(run.time, player.head(), run.traffic.cars);
    if (run.time >= run.impactUntil) beginReplay();
  } else if (state === 'replay') {
    const label = replay.update(dt);
    $('rtime').textContent = label;
    $('next').textContent = replay.atEnd ? '結果へ進む / Next' : 'スキップ / Skip';
    if (renderer.xr.isPresenting) {
      replay.render(renderer);
      panel.draw({ title: '事故のリプレイ / Accident replay', image: replay.target.texture, lines: [label],
        hint: replay.atEnd ? 'A / X・トリガー：結果へ進む　　B / Y：もう一度再生' : 'A / X・トリガー：スキップ　　B / Y：もう一度再生' });
    }
  } else if (state !== 'results') {
    player.update(dt);
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  tick(dt);
  light.follow(toThree(player.x, 0, player.z));
  const view = state === 'replay' && !renderer.xr.isPresenting ? replay.camera : camera;
  if (view === replay.camera) { replay.camera.aspect = innerWidth / innerHeight; replay.camera.updateProjectionMatrix(); }
  renderer.render(scene, view);
  fpsFrames++; fpsTime += dt;
  if (fpsTime > 1) { $('fps').textContent = `${Math.round(fpsFrames / fpsTime)} fps ・ ${renderer.info.render.calls} draw calls`; fpsTime = 0; fpsFrames = 0; }
});
// debugging and tests
window.vrlearn = {
  scene, camera, renderer, player, env, ground, start, toTitle,
  select(id) { selected = scenarioIndex.find(e => e.id === id) ?? selected; customScenario = null; renderTitle(); },
  get run() { return run; }, get state() { return state; },
  /** Advance the game by `seconds` at a fixed step (tests; works while the tab is in the background). */
  simulate(seconds, step = 1 / 60) { for (let t = 0; t < seconds; t += step) tick(step); },
};
