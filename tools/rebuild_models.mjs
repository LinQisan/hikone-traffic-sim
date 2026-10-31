#!/usr/bin/env node
// Rebuilds named models through every stage, in order, and stops at the first failure.
//   node tools/rebuild_models.mjs ART_WestMoat ART_ShigaCampus
//   node tools/rebuild_models.mjs ART_InnerMoatStreet --no-collision
// Blender exits 0 after a Python exception, so its output decides whether a stage passed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const collision = !args.includes('--no-collision');
const names = args.filter(arg => arg !== '--no-collision');
if (!names.length || names.some(name => name.startsWith('-'))) {
  console.error('usage: node tools/rebuild_models.mjs <model>… [--no-collision]');
  process.exit(2);
}
const root = new URL('..', import.meta.url).pathname;
const known = JSON.parse(readFileSync(`${root}models/index.json`, 'utf8')).models;
const authored = readFileSync(`${root}tools/castle_approach.py`, 'utf8');
for (const name of names) if (!known.includes(name) && !authored.includes(`'${name}'`)) {
  console.error(`${name}: not in models/index.json or a procedural author`);
  process.exit(2);
}

function stage(label, command, stageArgs) {
  const started = Date.now();
  const run = spawnSync(command, stageArgs, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.error || run.status !== 0 || /^Traceback|^Error: Python/m.test(output)) {
    console.error(output.slice(-4000));
    console.error(`${label} failed${run.error ? `: ${run.error.message}` : ''}`);
    process.exit(1);
  }
  console.log(`${label}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const blender = script => ['-b', '--factory-startup', '--python', script, '--', '--only', ...names];
stage('authors', 'blender', blender('tools/build_impressionist.py'));
stage('native programs', 'blender', blender('tools/build_native_models.py'));
stage('pack', process.execPath, ['tools/pack_models.mjs']);
if (collision) stage('collision', process.execPath, ['tools/build_collision.mjs']);
stage('generated data', process.execPath, ['--test', 'test/generated-data.test.mjs']);
