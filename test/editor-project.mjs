// Each test process owns a minimal project fixture, including in CI without Unity installed.
// Never read or write a real Unity project. Import this before ../server/editor-api.mjs,
// which reads VRLEARN_ROOT when it loads.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrlearn-project-'));
fs.mkdirSync(path.join(root, 'ProjectSettings'));
fs.writeFileSync(path.join(root, 'ProjectSettings', 'ProjectSettings.asset'),
  'PlayerSettings:\n  applicationIdentifier:\n    Android: com.moxuanxuerain.vrlearn\n');
fs.mkdirSync(path.join(root, 'Scenarios'));
process.env.VRLEARN_ROOT = root;
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
