import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import {ResourceScope} from '../src/utils/ResourceScope.ts';
import {ResourceDisposer} from '../src/three/engine/resources.ts';
import {SimulatorStore} from '../src/state/SimulatorStore.ts';
import {beginModelSession, loadNativeModel} from '../src/three/assets/models.js';
import {createScenePackage} from '../src/export/scene-package.ts';

test('engine scope cancels work, releases every owner once and handles late construction', () => {
  const scope = new ResourceScope(), released = [];
  scope.own(() => released.push('first'));
  scope.own(() => {released.push('failed'); throw new Error('fixture');});
  scope.own(() => released.push('last'));
  assert.throws(() => scope.dispose(), AggregateError);
  assert.equal(scope.signal.aborted, true);
  assert.deepEqual(released, ['last', 'failed', 'first']);
  scope.dispose();
  scope.own(() => released.push('late'));
  assert.deepEqual(released, ['last', 'failed', 'first', 'late']);
  assert.throws(() => scope.check(), {name: 'AbortError'});
});

test('application teardown deduplicates shared scene and prototype resources', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  let geometries = 0, materials = 0;
  geometry.addEventListener('dispose', () => geometries++); material.addEventListener('dispose', () => materials++);
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  const disposer = new ResourceDisposer();
  disposer.scene(scene); disposer.geometry(geometry); disposer.material(material); disposer.scene(scene);
  assert.equal(geometries, 1); assert.equal(materials, 1); assert.equal(scene.children.length, 0);
});

test('UI snapshots notify only for changes and retain unrelated slice references', () => {
  let commits = 0, updates = 0;
  const store = new SimulatorStore(notify => {commits++; notify();});
  const menu = store.getSnapshot().menu;
  const unsubscribe = store.subscribe(() => updates++);
  store.patch('hud', {signal: 'green'});
  const hud = store.getSnapshot().hud;
  for (let frame = 0; frame < 120; frame++) store.patch('hud', {signal: 'green'});
  assert.equal(updates, 1); assert.equal(store.getSnapshot().hud, hud); assert.equal(store.getSnapshot().menu, menu);
  store.flush(); assert.equal(commits, 1); assert.equal(updates, 2);
  unsubscribe(); store.screen('playing'); assert.equal(updates, 2);
  store.patch('profile', {height: '159', weight: '52'}); store.reset();
  assert.equal(store.getSnapshot().profile.height, '159');
  assert.equal(store.getSnapshot().profile.weight, '52');
  assert.equal(store.getSnapshot().screen, 'loading');
});

test('scene package keeps saved semantics, explicit coordinates and independent asset references', () => {
  const world = JSON.parse(fs.readFileSync(new URL('../world/hikone.json', import.meta.url)));
  const scenario = JSON.parse(fs.readFileSync(new URL('../events/builtin-01.json', import.meta.url)));
  const layout = {version: 1, items: [{a: 'WEB_Sedan', p: [47.2, 0.01, 16.1], r: 90, s: [1, 1, 1], g: 'Fixture'}]};
  const pkg = createScenePackage(layout, [scenario], world);
  assert.equal(pkg.signals.periodSeconds, 87); assert.equal(pkg.signals.installations.length, 5);
  assert.equal(pkg.version, 1); assert.equal(pkg.coordinates.glbMirrorAxis, 'X');
  assert.deepEqual(pkg.scenarios[0], scenario); assert.deepEqual(pkg.world, world);
  assert.equal(pkg.entities[0].asset, 'WEB_Sedan'); assert.equal(pkg.assets[0].glb.high, 'assets/WEB_Sedan.glb');
  pkg.entities[0].position[0] = 0; pkg.scenarios[0].vehicles[0].speedKmh++;
  assert.equal(layout.items[0].p[0], 47.2); assert.notEqual(pkg.scenarios[0].vehicles[0].speedKmh, scenario.vehicles[0].speedKmh);
  assert.throws(() => createScenePackage({version: 1, items: [{...layout.items[0], a: '../secret'}]}, [], world), /Invalid asset/);
});

test('cancellation also aborts the no-worker model transport fallback', async () => {
  const previous = globalThis.fetch, abort = new AbortController();
  let requested = false;
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    requested = true;
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled fixture', 'AbortError')), {once: true});
  });
  const release = beginModelSession(new THREE.LoadingManager(), abort.signal);
  try {
    const pending = loadNativeModel('WEB_Sedan');
    abort.abort();
    await assert.rejects(pending, {name: 'AbortError'});
    assert.equal(requested, true);
  } finally {release(); globalThis.fetch = previous;}
});
