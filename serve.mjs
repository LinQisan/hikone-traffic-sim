// Static server for the web port (no dependencies): node serve.mjs [--port 8770] [--host 127.0.0.1]
// WebXR needs a secure context: http://localhost is one. For a Quest on USB:
//   adb reverse tcp:8770 tcp:8770   then open http://localhost:8770 in the Quest browser.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep) || /[\\/]\.|[\\/]tools[\\/]|[\\/]test[\\/]/.test(file.slice(root.length))) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    const body = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : e.code === 'EACCES' ? 403 : 500, { 'Content-Type': 'text/plain' });
    res.end(String(e.code ?? e.message));
  }
}).listen(port, host, () => console.log(`Hikone Traffic Simulator: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`));
