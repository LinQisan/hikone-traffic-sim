// Points server/editor-api.mjs at a throwaway VRLearn project (the real ProjectSettings.asset and an
// empty Scenarios/). Test files run in parallel, so sharing the real Scenarios/ let one file list
// another's half-written scenario; it also left test files in the Unity project. Import this before
// ../server/editor-api.mjs, which reads VRLEARN_ROOT when it loads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const real = path.resolve(process.env.VRLEARN_ROOT || path.join(here, '..', '..', 'VRLearn'));
const settings = path.join(real, 'ProjectSettings', 'ProjectSettings.asset');

if (fs.existsSync(settings) && fs.existsSync(path.join(real, 'Scenarios'))) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrlearn-project-'));
  fs.mkdirSync(path.join(root, 'ProjectSettings'));
  fs.copyFileSync(settings, path.join(root, 'ProjectSettings', 'ProjectSettings.asset'));
  fs.mkdirSync(path.join(root, 'Scenarios'));
  process.env.VRLEARN_ROOT = root;
  process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
}
