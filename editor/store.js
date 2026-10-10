// Browser-only storage for the scenario editor (GitHub Pages, or no VRLearn project next to this
// one): answers the same /api/… calls as server/editor-api.mjs. "My scenarios" live in this
// browser's localStorage; the map and the Unity templates are static files under ../data.
// Unity play and Quest sync need the local server and are not offered here.
import { normalize, serialize, validate, ID_PATTERN } from '../src/shared/scenario.js';

const KEY = 'vrlearn.editor.scenarios';      // { [id]: serialized scenario }
const TRASH = 'vrlearn.editor.trash';        // the last deleted files, newest first
const DATA = new URL('../data/', import.meta.url);

const fail = (status, error) => Object.assign(new Error(error), { status });

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw fail(507, 'ブラウザに保存できません（プライベートモードか、保存領域がいっぱいです）。「⇩ JSON」で書き出してください。'); }
}

async function json(rel) {
  const response = await fetch(new URL(rel, DATA));
  if (!response.ok) throw fail(response.status, `${rel}: ${response.statusText}`);
  return response.json();
}

let mapCache = null;
async function loadMap() {
  if (!mapCache) mapCache = { ...(await json('map.json')), imageUrl: new URL('map.png', DATA).href };
  return mapCache;
}

let templateCache = null;
let templateEntries = null;
async function templates() {
  templateCache ??= json('editor/templates/index.json');
  return templateCache;
}

function summary(scenario, map) {
  const problems = validate(scenario, map);
  return {
    id: scenario.id, name: scenario.name, playerMode: scenario.playerMode, setting: scenario.setting,
    errors: problems.filter(p => p.level === 'error').length,
    warnings: problems.filter(p => p.level === 'warning').length
  };
}

async function list() {
  const map = await loadMap().catch(() => null);
  const result = [];
  for (const [id, text] of Object.entries(read(KEY, {})).sort(([a], [b]) => a.localeCompare(b))) {
    const entry = { path: `${id}.json`, template: false };
    try { Object.assign(entry, summary(normalize(JSON.parse(text)), map)); }
    catch (error) { Object.assign(entry, { id, name: '(読めません)', errors: 1, warnings: 0, unreadable: String(error.message) }); }
    result.push(entry);
  }
  // templates never change while the page is open: summarised once
  templateEntries ??= Promise.all((await templates()).map(async name => {
    const entry = { path: `templates/${name}`, template: true };
    try { Object.assign(entry, summary(normalize(await json('editor/templates/' + name)), map)); }
    catch (error) { Object.assign(entry, { id: name.replace(/\.json$/, ''), name: '(読めません)', errors: 1, warnings: 0, unreadable: String(error.message) }); }
    return entry;
  }));
  return [...result, ...(await templateEntries).map(e => ({ ...e }))];
}

/** Same contract as the server: resolves with the JSON body, rejects with { message, status }. */
export async function request(path, options = {}) {
  const url = new URL(path, 'http://editor');
  const p = url.pathname;
  const method = options.method ?? 'GET';
  if (p === '/api/status') return { server: false };
  if (p === '/api/map' && method === 'GET') return loadMap();
  if (p === '/api/scenarios' && method === 'GET') return list();
  if (p === '/api/scenario' && method === 'GET') {
    const rel = url.searchParams.get('path') ?? '';
    const template = rel.match(/^templates\/([a-z0-9_-]+\.json)$/);
    if (template) return json('editor/templates/' + template[1]);
    const own = rel.match(/^([a-z0-9_-]+)\.json$/);
    const text = own && read(KEY, {})[own[1]];
    if (!text) throw fail(404, 'not found');
    return JSON.parse(text);
  }
  const match = p.match(/^\/api\/scenarios\/([^/]+)$/);
  if (match && method === 'PUT') {
    const id = decodeURIComponent(match[1]);
    if (!ID_PATTERN.test(id)) throw fail(400, 'id は英小文字・数字・-・_ の 1〜40 文字にしてください。');
    if (id.startsWith('builtin-')) throw fail(400, '"builtin-" で始まる id はひな形用です。別の id にしてください。');
    const scenario = normalize(JSON.parse(options.body));
    if (scenario.id !== id) throw fail(400, 'id がファイル名と一致しません。');
    const files = read(KEY, {});
    files[id] = serialize(scenario);
    write(KEY, files);
    return { path: `${id}.json`, problems: validate(scenario, await loadMap().catch(() => null)) };
  }
  if (match && method === 'DELETE') {
    const id = decodeURIComponent(match[1]);
    const files = read(KEY, {});
    if (!(id in files)) throw fail(404, 'not found');
    write(TRASH, [{ id, text: files[id], deletedAt: new Date().toISOString() }, ...read(TRASH, [])].slice(0, 20));
    delete files[id];
    write(KEY, files);
    return { trashed: true };
  }
  throw fail(404, 'このブラウザ版ではできません（ローカルで serve.mjs を動かしてください）。');
}
