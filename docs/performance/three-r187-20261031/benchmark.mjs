// Run against two frozen production builds; Playwright is an external audit tool.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node benchmark.mjs <audit-directory>
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const audit = path.resolve(process.argv[2] || '.git/three-r187-audit');
const prefix = '/hikone-traffic-sim/';
let revision = 'r186';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.gz': 'application/gzip', '.png': 'image/png'};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) {response.writeHead(404).end(); return;}
    const relative = decodeURIComponent(url.pathname.slice(prefix.length));
    const root = path.join(audit, revision + '-dist');
    let file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root + path.sep)) {response.writeHead(403).end(); return;}
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    await pipeline(createReadStream(file), response);
  } catch {if (!response.headersSent) response.writeHead(404); response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1,
  reducedMotion: 'reduce', serviceWorkers: 'block'});
// Routing disables the browser HTTP cache for both conditions.
await page.route('**/*', route => route.continue());
const errors = [], results = [];
page.on('pageerror', error => errors.push({revision, message: String(error)}));
page.on('console', message => {if (message.type() === 'error') errors.push({revision, message: message.text()});});
page.on('response', response => {if (response.status() >= 400) errors.push({revision, status: response.status(), url: response.url()});});
const views = {junction: [55, 2.15, 23, 0, 2.8, 27, 62], promenade: [153, 1.7, 39.4, 196, 2.4, 51, 68]};
try {
  let device;
  for (const [run, version] of ['r186', 'r187', 'r187', 'r186', 'r186', 'r187'].entries()) {
    revision = version;
    await page.goto(origin + prefix + '?benchmark=1&view=street', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !!window.vrlearn?.env, null, {timeout: 120000});
    device ??= await page.evaluate(() => {
      const gl = window.vrlearn.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null};
    });
    for (const [view, camera] of Object.entries(views)) {
      await page.evaluate(camera => {window.vrlearn.debugView(...camera); window.vrlearn.benchmark.reset();}, camera);
      await page.waitForFunction(() => !!window.vrlearn.benchmark.report, null, {timeout: 45000});
      const probe = await page.evaluate(() => window.vrlearn.benchmark.report);
      results.push({revision, run, view, camera, probe});
      console.log(JSON.stringify({revision, run, view, fps: probe.fps, p95Ms: probe.p95Ms, calls: probe.calls}));
      if (results.filter(result => result.revision === revision && result.view === view).length === 1)
        await page.screenshot({path: path.join(audit, `${revision}-${view}.png`)});
    }
  }
  const samples = {};
  const metrics = ['fps', 'p95Ms', 'calls', 'triangles', 'sceneBufferBytes', 'geometryBytes', 'heapBytes',
    'geometries', 'textures', 'programs', 'readyMs', 'resourceTransferBytes', 'resourceBodyBytes'];
  for (const view of Object.keys(views)) for (const version of ['r186', 'r187']) {
    const rows = results.filter(result => result.view === view && result.revision === version);
    samples[view + '/' + version] = Object.fromEntries(metrics.map(metric => {
      const values = rows.map(row => row.probe[metric]).filter(value => typeof value === 'number').sort((a, b) => a - b);
      return [metric, values.length ? values[Math.floor(values.length / 2)] : null];
    }));
  }
  const report = {date: new Date().toISOString(), baselineHead: (await fs.readFile(path.join(audit, 'baseline-head.txt'), 'utf8')).trim(),
    browser: browser.version(), cpu: execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], {encoding: 'utf8'}).trim(),
    memoryBytes: Number(execFileSync('sysctl', ['-n', 'hw.memsize'], {encoding: 'utf8'})), device,
    viewport: [1280, 800], deviceScaleFactor: 1, reducedMotion: true, dynamicResolution: false,
    samePage: true, production: true, prefix, sequence: ['r186', 'r187', 'r187', 'r186', 'r186', 'r187'],
    warmupSeconds: 2, sampleSeconds: 8, samples, results, errors,
    limits: ['Desktop headless Chrome only; no real phone, Safari, Firefox or Quest.',
      'FPS follows animation callbacks; no GPU timestamp or total GPU-memory measurement.',
      'sceneBufferBytes counts geometry backing buffers, heapBytes is an unstable JS-heap snapshot.',
      'readyMs and transfers are page-cumulative diagnostic values; the paired views share one load.']};
  await fs.writeFile(path.join(audit, 'benchmark.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length) throw new Error(JSON.stringify(errors));
} finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
