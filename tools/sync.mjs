// Copies the data the web port needs from the VRLearn Unity project into ./data (and the shared
// scenario model into ./src/shared). Run after changing the environment, scenarios or the map:
//   node tools/sync.mjs            (VRLEARN_ROOT overrides ../VRLearn)
// Models come from tools/export_models.py (Blender); scene.json from the Unity menu
// Tools/VRLearn/Web/Export Scene For Web.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = process.env.VRLEARN_ROOT || path.join(path.dirname(web), 'VRLearn');
const data = path.join(web, 'data');
if (!fs.existsSync(path.join(root, 'ProjectSettings'))) {
  console.error(`VRLearn project not found at ${root} (set VRLEARN_ROOT)`);
  process.exit(1);
}

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, from), to);
  return to;
};

copy('Assets/_Project/Hikone/Layout/hikone_layout.json', path.join(data, 'layout.json'));
copy('Art/Hikone/road_tiles_geometry.json', path.join(data, 'road_tiles.json'));
copy('Scenarios/maps/hikone-kyobashi/map.json', path.join(data, 'map.json'));
copy('ScenarioEditor/web/scenario.js', path.join(web, 'src', 'shared', 'scenario.js'));

const textures = 'Assets/_Project/Hikone/Textures';
for (const f of fs.readdirSync(path.join(root, textures)).filter(f => f.endsWith('.png')))
  copy(`${textures}/${f}`, path.join(data, 'textures', f));

// scenarios: the built-in templates and every custom file (maps/, hidden files and the schema skipped)
const scenarioDir = path.join(data, 'scenarios');
fs.rmSync(scenarioDir, { recursive: true, force: true });
const list = [];
const add = (rel, template) => {
  const text = fs.readFileSync(path.join(root, 'Scenarios', rel), 'utf8');
  const s = JSON.parse(text);
  if (s.format !== 'vrlearn-scenario') return;
  const file = path.basename(rel);
  fs.mkdirSync(scenarioDir, { recursive: true });
  fs.writeFileSync(path.join(scenarioDir, file), text);
  list.push({ file, id: s.id, name: s.name, nameEn: s.nameEn, setting: s.setting, playerMode: s.playerMode, template });
};
for (const f of fs.readdirSync(path.join(root, 'Scenarios', 'templates')).filter(f => f.endsWith('.json')).sort())
  add(`templates/${f}`, true);
for (const f of fs.readdirSync(path.join(root, 'Scenarios')).filter(f => f.endsWith('.json') && !f.startsWith('.') && f !== 'scenario.schema.json').sort())
  add(f, false);
fs.writeFileSync(path.join(scenarioDir, 'index.json'), JSON.stringify(list, null, 2) + '\n');

const missing = ['scene.json', 'models/HK_RoadSurf_Cross.glb', 'models/WEB_Sedan.glb'].filter(f => !fs.existsSync(path.join(data, f)));
console.log(`synced from ${root}: layout, road tiles, map, ${list.length} scenarios, textures, shared/scenario.js`);
if (missing.length) console.warn('still missing (run the Unity exporter / tools/export_models.py):', missing.join(', '));
