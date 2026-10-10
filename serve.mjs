// Static server for the web port (no dependencies): node serve.mjs [--port 8770] [--host 127.0.0.1]
// For a phone or tablet on the same network: node serve.mjs --host 0.0.0.0, then open
// http://<this computer's IP>:8770 on the device.
// /api/… is the scenario editor's server (server/editor-api.mjs): only when the VRLearn project is
// found (VRLEARN_ROOT, default ../VRLearn) and only for requests from this computer.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as editorApi from './server/editor-api.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const port = Number(arg('port', process.env.PORT || 8770));
const host = arg('host', '127.0.0.1');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

http.createServer(async (req, res) => {
  try {
    if (await editorApi.handle(req, res)) return;
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep) || /[\\/]\.|[\\/]tools[\\/]|[\\/]test[\\/]|[\\/]server[\\/]/.test(file.slice(root.length))) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500, { 'Content-Type': 'text/plain' });
    res.end(String(e.code ?? e.message));
  }
}).listen(port, host, () => {
  const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`;
  console.log(`Hikone Traffic Simulator: ${base}`);
  console.log(`Scenario editor: ${base}editor/ ` + (editorApi.available ? `(files in ${editorApi.SCENARIOS})` : '(VRLearn project not found: files stay in the browser)'));
});
