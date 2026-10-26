// Copies upstream assets into ./data, retaining the browser-owned scenario model. The scenario editor
// (./editor) uses the map image and this project's events in data/editor/templates. Run after changing the environment, scenarios or the map:
//   node tools/sync.mjs            (VRLEARN_ROOT overrides ../VRLearn)
//   node tools/sync.mjs --events-only  (rebuild browser events and editor templates without Unity)
// Models come from tools/export_models.py (Blender); scene.json from the Unity menu
// Tools/VRLearn/Web/Export Scene For Web.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = process.env.VRLEARN_ROOT || path.join(path.dirname(web), 'VRLearn');
const data = path.join(web, 'data');
const eventsOnly = process.argv.includes('--events-only');
if (!eventsOnly && !fs.existsSync(path.join(root, 'ProjectSettings'))) {
  console.error(`VRLearn project not found at ${root} (set VRLEARN_ROOT)`);
  process.exit(1);
}

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, from), to);
  return to;
};

if (!eventsOnly) {
  copy('Assets/_Project/Hikone/Layout/hikone_layout.json', path.join(data, 'layout.json'));
  copy('Art/Hikone/road_tiles_geometry.json', path.join(data, 'road_tiles.json'));
  copy('Scenarios/maps/hikone-kyobashi/map.json', path.join(data, 'map.json'));
  copy('Scenarios/maps/hikone-kyobashi/map.png', path.join(data, 'map.png'));
  // Keep browser driver/environment extensions; Unity's optional bridge ignores those fields.
}

// One built-in authority for both the simulator and the editor; never restore Unity's old routes.
const editorTemplates = path.join(data, 'editor', 'templates');
fs.rmSync(editorTemplates, { recursive: true, force: true });
fs.mkdirSync(editorTemplates, { recursive: true });
const eventDir = path.join(web, 'events');
const templateNames = fs.readdirSync(eventDir).filter(f => /^builtin-\d+\.json$/.test(f)).sort();


// scenarios: the built-in templates and every custom file (maps/, hidden files and the schema skipped)
const scenarioDir = path.join(data, 'scenarios');
const customEntries = eventsOnly ? JSON.parse(fs.readFileSync(path.join(scenarioDir, 'index.json'), 'utf8')).filter(e => !e.template) : [];
if (!eventsOnly) fs.rmSync(scenarioDir, { recursive: true, force: true });
const list = [];
const lanes = [];
const laneRoutes = new Set();
const add = (text, file, template) => {
  const s = JSON.parse(text);
  if (s.format !== 'vrlearn-scenario') return;
  fs.mkdirSync(scenarioDir, { recursive: true });
  fs.writeFileSync(path.join(scenarioDir, file), text);
  if (template) {
    fs.writeFileSync(path.join(editorTemplates, file), text);
    s.vehicles.forEach((vehicle, index) => {
      const key = JSON.stringify(vehicle.route);
      if (laneRoutes.has(key)) return;
      laneRoutes.add(key);
      lanes.push({ id: `${s.id}-${index + 1}`, name: `${s.name} / ${vehicle.name}`,
        scenarioId: s.id, accident: !!vehicle.accident, points: vehicle.route });
    });
  }
  list.push({ file, id: s.id, name: s.name, nameEn: s.nameEn, setting: s.setting, playerMode: s.playerMode, template });
};
for (const f of templateNames) add(fs.readFileSync(path.join(eventDir, f), 'utf8'), f, true);
if (eventsOnly) list.push(...customEntries);
else for (const f of fs.readdirSync(path.join(root, 'Scenarios')).filter(f => f.endsWith('.json') && !f.startsWith('.') && f !== 'scenario.schema.json').sort())
  add(fs.readFileSync(path.join(root, 'Scenarios', f), 'utf8'), f, false);
fs.writeFileSync(path.join(editorTemplates, 'index.json'), JSON.stringify(templateNames, null, 2) + '\n');
fs.writeFileSync(path.join(data, 'editor', 'lanes.json'), JSON.stringify(lanes, null, 2) + '\n');
fs.writeFileSync(path.join(scenarioDir, 'index.json'), JSON.stringify(list, null, 2) + '\n');

const missing = ['scene.json', 'models/HK_RoadSurf_Cross.glb', 'models/WEB_Sedan.glb'].filter(f => !fs.existsSync(path.join(data, f)));
console.log(eventsOnly ? `rebuilt from events/: ${templateNames.length} browser events and editor templates` :
  `synced assets from ${root}; ${list.length} scenarios, ${templateNames.length} browser event templates`);
if (missing.length) console.warn('still missing (run the Unity exporter / tools/export_models.py):', missing.join(', '));
