// Scenario editor API, served by ../serve.mjs next to the static site when the VRLearn Unity
// project is on this computer (VRLEARN_ROOT, default ../VRLearn): it reads and writes the
// project's Scenarios/ folder, asks the open Unity Editor to play a file and copies scenarios onto
// a Quest through adb. Without the project (or on GitHub Pages) the editor keeps its files in the
// browser instead (editor/store.js answers the same calls). Only requests from this computer are
// answered; writes from other sites are refused.
//
//   GET    /api/status                 { server, root } — whether the project was found
//   GET    /api/map                    map.json of the Hikone map (from the project)
//   GET    /api/map/image              map.png of the Hikone map
//   GET    /api/scenarios              list of scenario files (+ validation summary)
//   GET    /api/scenario?path=…        one file (path relative to Scenarios/)
//   PUT    /api/scenarios/:id          save Scenarios/<id>.json (drafts with errors are allowed)
//   DELETE /api/scenarios/:id          move Scenarios/<id>.json to Scenarios/.trash/
//   POST   /api/play                   {path} → Scenarios/.play-request.json (Unity plays it)
//   GET    /api/play                   { pending } — whether Unity has not picked it up yet
//   GET    /api/quest                  adb path, app package, connected headsets
//   POST   /api/quest/sync             {serial?} → copy every valid scenario to the headset(s) (mirror)

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalize, serialize, validate, ID_PATTERN, HIKONE_MAP } from '../src/shared/scenario.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT = path.resolve(process.env.VRLEARN_ROOT || path.join(here, '..', '..', 'VRLearn'));
export const SCENARIOS = path.join(PROJECT, 'Scenarios');
/** The project is there: the API reads and writes its Scenarios/ folder. */
export const available = existsSync(path.join(PROJECT, 'ProjectSettings')) && existsSync(SCENARIOS);
const MAP_DIR = path.join(SCENARIOS, 'maps', HIKONE_MAP);
const PLAY_REQUEST = path.join(SCENARIOS, '.play-request.json');
const run = promisify(execFile);

let mapCache = null;
async function loadMap() {
  if (!mapCache) mapCache = JSON.parse(await fs.readFile(path.join(MAP_DIR, 'map.json'), 'utf8'));
  return mapCache;
}

/** Resolves a path inside a root folder; null for anything that escapes it. */
function inside(root, relative) {
  const full = path.resolve(root, relative);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

async function listScenarios() {
  const map = await loadMap().catch(() => null);
  const result = [];
  for (const [folder, template] of [['', false], ['templates', true]]) {
    const dir = path.join(SCENARIOS, folder);
    let names = [];
    try { names = (await fs.readdir(dir)).filter(n => n.endsWith('.json') && !n.startsWith('.') && !n.endsWith('.schema.json')); }
    catch { continue; }
    for (const name of names.sort()) {
      const rel = folder ? `${folder}/${name}` : name;
      const entry = { path: rel, template };
      try {
        const scenario = normalize(JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')));
        const problems = validate(scenario, map);
        Object.assign(entry, {
          id: scenario.id, name: scenario.name, playerMode: scenario.playerMode, setting: scenario.setting,
          errors: problems.filter(p => p.level === 'error').length,
          warnings: problems.filter(p => p.level === 'warning').length
        });
      } catch (error) {
        Object.assign(entry, { id: name.replace(/\.json$/, ''), name: '(読めません)', errors: 1, warnings: 0, unreadable: String(error.message) });
      }
      result.push(entry);
    }
  }
  return result;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveFile(res, file) {
  try {
    send(res, 200, await fs.readFile(file), path.extname(file) === '.png' ? 'image/png' : 'application/json; charset=utf-8');
  } catch {
    send(res, 404, { error: 'not found' });
  }
}


// ------------------------------------------------------------------ Quest (adb)

/** adb: $ADB, then PATH, the Android SDK, then the adb bundled with any installed Unity editor. */
export async function findAdb() {
  if (process.env.ADB) return process.env.ADB;
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  try { await run(exe, ['version']); return exe; } catch { /* not on PATH */ }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const candidates = [path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', exe),
    path.join(home, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', exe)];
  for (const hub of ['/Applications/Unity/Hub/Editor', 'C:\\Program Files\\Unity\\Hub\\Editor']) {
    const versions = await fs.readdir(hub).catch(() => []);
    for (const v of versions.sort().reverse()) {
      candidates.push(path.join(hub, v, 'PlaybackEngines', 'AndroidPlayer', 'SDK', 'platform-tools', exe));
      candidates.push(path.join(hub, v, 'Editor', 'Data', 'PlaybackEngines', 'AndroidPlayer', 'SDK', 'platform-tools', exe));
    }
  }
  for (const c of candidates) if (await fs.access(c).then(() => true, () => false)) return c;
  return null;
}

/** Android package id of the app (ProjectSettings), e.g. com.moxuanxuerain.vrlearn. */
export async function packageId() {
  const text = await fs.readFile(path.join(PROJECT, 'ProjectSettings', 'ProjectSettings.asset'), 'utf8');
  return text.match(/applicationIdentifier:\s*\n(?:\s+\S+:.*\n)*?\s+Android:\s*(\S+)/)?.[1] ?? null;
}

async function adb(adbPath, args) {
  const { stdout } = await run(adbPath, args, { timeout: 20000 });
  return stdout;
}

export async function listDevices(adbPath) {
  const out = await adb(adbPath, ['devices', '-l']);
  return out.split('\n').slice(1).map(l => l.trim()).filter(Boolean).map(line => {
    const [serial, state, ...rest] = line.split(/\s+/);
    const model = rest.find(r => r.startsWith('model:'))?.slice(6).replace(/_/g, ' ') ?? '';
    return { serial, state, model };
  });
}

async function questStatus() {
  const adbPath = await findAdb();
  const pkg = await packageId().catch(() => null);
  if (!adbPath) return { adb: null, package: pkg, devices: [], error: 'adb が見つかりません（Unity の Android サポートか Android SDK を入れてください）。' };
  try {
    return { adb: adbPath, package: pkg, devices: await listDevices(adbPath) };
  } catch (error) {
    return { adb: adbPath, package: pkg, devices: [], error: 'adb を実行できません: ' + error.message };
  }
}

/**
 * Makes the headset's scenario folder match the PC: pushes every valid scenario in Scenarios/
 * (templates excluded) and removes headset files that no longer exist on the PC.
 */
async function syncQuest(serial) {
  const status = await questStatus();
  if (!status.adb) throw Object.assign(new Error(status.error), { status: 409 });
  if (!status.package) throw Object.assign(new Error('アプリの package id を ProjectSettings から読めません。'), { status: 500 });
  const targets = status.devices.filter(d => d.state === 'device' && (!serial || d.serial === serial));
  if (!targets.length) throw Object.assign(new Error('接続されている Quest がありません（USB かワイヤレス adb で接続し、ヘッドセットで USB デバッグを許可してください）。'), { status: 409 });

  const list = (await listScenarios()).filter(e => !e.template);
  const valid = list.filter(e => e.errors === 0);
  const skipped = list.filter(e => e.errors > 0).map(e => ({ id: e.id, errors: e.errors }));
  const remote = `/sdcard/Android/data/${status.package}/files/Scenarios`;
  const results = [];
  for (const device of targets) {
    const result = { serial: device.serial, model: device.model, pushed: [], removed: [], error: null };
    try {
      const installed = await adb(status.adb, ['-s', device.serial, 'shell', 'pm', 'path', status.package]);
      if (!installed.trim()) throw new Error(`アプリ（${status.package}）がこの Quest に入っていません。`);
      await adb(status.adb, ['-s', device.serial, 'shell', 'mkdir', '-p', remote]);
      const existing = (await adb(status.adb, ['-s', device.serial, 'shell', 'ls', remote]).catch(() => ''))
        .split(/\s+/).filter(n => /^[a-z0-9][a-z0-9_-]{0,39}\.json$/.test(n));
      for (const e of valid) {
        await adb(status.adb, ['-s', device.serial, 'push', path.join(SCENARIOS, e.path), `${remote}/${e.path}`]);
        result.pushed.push(e.id);
      }
      const keep = new Set(valid.map(e => e.path));
      for (const name of existing.filter(n => !keep.has(n))) {
        await adb(status.adb, ['-s', device.serial, 'shell', 'rm', '-f', `${remote}/${name}`]);
        result.removed.push(name.replace(/\.json$/, ''));
      }
    } catch (error) {
      result.error = String(error.message ?? error);
    }
    results.push(result);
  }
  return { remote, skipped, results };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Answers /api/… requests; false for every other path (the static site serves those). */
export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  if (!p.startsWith('/api/')) return false;
  // phones on the LAN (serve.mjs --host 0.0.0.0) get the browser-only editor
  if (!available || !LOOPBACK.has(req.socket.remoteAddress)) { send(res, 404, { error: 'no editor server' }); return true; }
  // another site open in the browser must not write files or run adb
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && origin !== `http://${req.headers.host}`) { send(res, 403, { error: 'cross-origin request' }); return true; }
  try {
    await route(req, res, url, p);
  } catch (error) {
    send(res, error.status ?? 500, { error: String(error.message ?? error) });
  }
  return true;
}

async function route(req, res, url, p) {
  if (p === '/api/status' && req.method === 'GET') return send(res, 200, { server: true, root: PROJECT });
  if (p === '/api/map/image' && req.method === 'GET') return serveFile(res, path.join(MAP_DIR, (await loadMap()).image));
  if (p === '/api/map' && req.method === 'GET') return send(res, 200, await loadMap());
  if (p === '/api/scenarios' && req.method === 'GET') return send(res, 200, await listScenarios());
  if (p === '/api/scenario' && req.method === 'GET') {
    const file = inside(SCENARIOS, url.searchParams.get('path') ?? '');
    if (!file || !file.endsWith('.json')) return send(res, 400, { error: 'bad path' });
    return serveFile(res, file);
  }
  const match = p.match(/^\/api\/scenarios\/([^/]+)$/);
  if (match && req.method === 'PUT') {
    const id = match[1];
    if (!ID_PATTERN.test(id)) return send(res, 400, { error: 'id は英小文字・数字・-・_ の 1〜40 文字にしてください。' });
    if (id.startsWith('builtin-')) return send(res, 400, { error: '"builtin-" で始まる id はひな形用です。別の id にしてください。' });
    const scenario = normalize(JSON.parse(await readBody(req)));
    if (scenario.id !== id) return send(res, 400, { error: 'id がファイル名と一致しません。' });
    const text = serialize(scenario);
    await fs.writeFile(path.join(SCENARIOS, `${id}.json`), text, 'utf8');
    const problems = validate(scenario, await loadMap().catch(() => null));
    return send(res, 200, { path: `${id}.json`, problems });
  }
  if (match && req.method === 'DELETE') {
    const id = match[1];
    if (!ID_PATTERN.test(id)) return send(res, 400, { error: 'bad id' });
    const trash = path.join(SCENARIOS, '.trash');
    await fs.mkdir(trash, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.rename(path.join(SCENARIOS, `${id}.json`), path.join(trash, `${id}-${stamp}.json`));
    return send(res, 200, { trashed: true });
  }
  if (p === '/api/play' && req.method === 'POST') {
    const { path: rel } = JSON.parse(await readBody(req));
    const file = inside(SCENARIOS, rel ?? '');
    if (!file || !file.endsWith('.json')) return send(res, 400, { error: 'bad path' });
    await fs.access(file);
    await fs.writeFile(PLAY_REQUEST, JSON.stringify({ path: rel, requestedAt: new Date().toISOString() }), 'utf8');
    return send(res, 200, { requested: rel });
  }
  if (p === '/api/play' && req.method === 'GET') {
    const pending = await fs.access(PLAY_REQUEST).then(() => true, () => false);
    return send(res, 200, { pending });
  }
  if (p === '/api/quest' && req.method === 'GET') return send(res, 200, await questStatus());
  if (p === '/api/quest/sync' && req.method === 'POST') {
    const body = await readBody(req);
    const { serial } = body ? JSON.parse(body) : {};
    return send(res, 200, await syncQuest(serial));
  }
  send(res, 404, { error: 'not found' });
}
