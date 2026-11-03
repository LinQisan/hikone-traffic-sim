// node bench.mjs <dist-dir> <label> [desktop|mobile] [views,comma]
// Serves a frozen production build, disables the vsync cap and records fixed views plus a flight
// round the loop, so frame time is measured rather than clipped to 16.7 ms.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {chromium} from 'playwright-core';

const [root, label, profile = 'desktop', only] = process.argv.slice(2);
const dist = path.resolve(root);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.gz': 'application/gzip', '.png': 'image/png', '.bin': 'application/octet-stream'};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let file = path.resolve(dist, decodeURIComponent(url.pathname.slice(1)) || 'index.html');
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    await pipeline(createReadStream(file), response);
  } catch {if (!response.headersSent) response.writeHead(404); response.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({channel: 'chrome', headless: true,
  args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--ignore-gpu-blocklist', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']});
const mobile = profile === 'mobile';
const context = await browser.newContext(mobile
  ? {viewport: {width: 844, height: 390}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce'}
  : {viewport: {width: 1280, height: 800}, deviceScaleFactor: 1, reducedMotion: 'reduce'});
const page = await context.newPage();
await page.route('**/*', route => route.continue());
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {if (message.text().startsWith('SPIKES')) console.log(message.text()); if (message.type() === 'error') errors.push(message.text());});
const cdp = await context.newCDPSession(page);
if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});

const started = Date.now();
await page.goto(origin + '?benchmark=1&quality=high&view=street', {waitUntil: 'domcontentloaded'});
await page.waitForFunction(() => !!window.vrlearn?.env, null, {timeout: 300000});
await page.waitForFunction(() => window.vrlearn.startup.stages.firstFrame != null, null, {timeout: 120000});
const loadMs = Date.now() - started;
const startup = await page.evaluate(() => {
  const gl = window.vrlearn.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  const s = window.vrlearn.startup.stages;
  return {gpu: debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL), stages: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v)])),
    wireBytes: window.vrlearn.startup.models.reduce((n, m) => n + (m.wireBytes || 0), 0)};
});

// Fixed views: [x, y, z, tx, ty, tz, fov] in map metres.
const VIEWS = {
  junction: [55, 2.15, 23, 0, 2.8, 27, 62],
  moatEast: [-336, 1.7, 216, -200, 2.5, 216, 66],
  nishiCorner: [-590, 1.7, 256, -575, 3, 240, 66],
  campus: [-778, 2.1, 154, -778, 3, 178, 68],
  castleRoad: [33, 2.1, 12, 36, 3.5, -65, 66],
  northRoad: [150, 1.7, 428, 60, 2.5, 345, 66],
  eastStreet: [300, 1.7, 40, 345, 2.5, 300, 66],
  panorama: [32, 2.1, 34, -264, 61, 395, 60],
  overview: [-720, 300, 120, -490, 0, 370, 58],
};
const LOOP = [[60, 26], [-100, 26], [-330, 210], [-575, 250], [-620, 190], [-780, 160], [-600, 300], [-330, 330], [-60, 430], [150, 432], [300, 300], [300, 60], [60, 26]];
const measure = (camera, seconds) => page.evaluate(async ({camera, seconds}) => {
  const v = window.vrlearn, r = v.renderer;
  v.debugView(...camera);
  await new Promise(done => {let n = 0; const f = () => ++n > 45 ? done() : requestAnimationFrame(f); requestAnimationFrame(f);});
  const ms = [], calls = [], tris = [];
  let last = performance.now(); const end = last + seconds * 1000;
  await new Promise(done => {const f = () => {const t = performance.now(); ms.push(t - last); last = t; calls.push(r.info.render.calls); tris.push(r.info.render.triangles); t < end ? requestAnimationFrame(f) : done();}; requestAnimationFrame(f);});
  const s = ms.slice(2).sort((a, b) => a - b), q = p => +s[Math.floor(s.length * p)].toFixed(2), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  return {frames: s.length, fps: +(1000 / mean(s)).toFixed(1), p50: q(.5), p95: q(.95), p99: q(.99), max: +s.at(-1).toFixed(1), calls: Math.round(mean(calls)), triangles: Math.round(mean(tris))};
}, {camera, seconds});
const flight = seconds => page.evaluate(async ({LOOP, seconds}) => {
  const v = window.vrlearn, r = v.renderer, lengths = [0];
  for (let i = 1; i < LOOP.length; i++) lengths.push(lengths[i - 1] + Math.hypot(LOOP[i][0] - LOOP[i - 1][0], LOOP[i][1] - LOOP[i - 1][1]));
  const total = lengths.at(-1), at = d => {
    let i = 1; while (lengths[i] < d) i++;
    const k = (d - lengths[i - 1]) / (lengths[i] - lengths[i - 1]), [a, b] = [LOOP[i - 1], LOOP[i]];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const ms = [], calls = [], tris = [], t0 = performance.now(); let last = t0;
  await new Promise(done => {const f = () => {
    const t = performance.now(), u = (t - t0) / (seconds * 1000);
    ms.push(t - last); last = t; calls.push(r.info.render.calls); tris.push(r.info.render.triangles);
    if (u >= 1) return done();
    const [x, z] = at(u * total), [tx, tz] = at(Math.min(total, u * total + 25));
    v.debugView(x, 1.7, z, tx, 2.2, tz, 66);
    requestAnimationFrame(f);}; requestAnimationFrame(f);});
  const spikes = ms.map((m, i) => [Math.round(m), i]).filter(x => x[0] > 40).sort((a,b)=>b[0]-a[0]).slice(0, 12); console.log('SPIKES', JSON.stringify(spikes), r.info.programs.length);
  const s = ms.slice(5).sort((a, b) => a - b), q = p => +s[Math.floor(s.length * p)].toFixed(2), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  return {metres: Math.round(total), frames: s.length, fps: +(1000 / mean(s)).toFixed(1), p50: q(.5), p95: q(.95), p99: q(.99), max: +s.at(-1).toFixed(1), over33: s.filter(x => x > 33.4).length, calls: Math.round(mean(calls)), maxCalls: Math.max(...calls), triangles: Math.round(mean(tris)), maxTriangles: Math.max(...tris)};
}, {LOOP, seconds});

const report = {label, profile, date: new Date().toISOString(), loadMs, startup, views: {}};
const memory = () => page.evaluate(() => {const v = window.vrlearn, i = v.renderer.info; return {
  geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, sceneBufferMB: +(v.benchmark.report?.sceneBufferBytes / 1e6 || 0).toFixed(1),
  heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(0) : null};});
const names = only ? only.split(',') : Object.keys(VIEWS);
if (process.env.FLIGHTS) { const keys = () => page.evaluate(() => window.vrlearn.renderer.info.programs.map(p => p.name + ':' + p.cacheKey.replace(/[^,]*,/g, m => m.length < 9 ? m : '').slice(0, 300))); const before = await keys(); for (let i = 0; i < +process.env.FLIGHTS; i++) console.log(JSON.stringify(await flight(25))); const after = await keys(); console.log('NEW', after.filter(k => !before.includes(k))); await browser.close(); server.close(); process.exit(0); }
for (const pass of [0, 1]) for (const name of names) {
  const result = await measure(VIEWS[name], 4);
  if (!pass) {report.views[name] = result; continue;}
  // The lower of two passes: anything heavy elsewhere only slows a sample down.
  if (result.p50 < report.views[name].p50) report.views[name] = result;
  console.log(name.padEnd(12), JSON.stringify(report.views[name]));
}
if (!only) {
  report.flight = await flight(mobile ? 60 : 40);
  console.log('flight      ', JSON.stringify(report.flight));
  await page.evaluate(() => {window.vrlearn.benchmark.reset();});
  await page.waitForFunction(() => !!window.vrlearn.benchmark.report, null, {timeout: 60000}).catch(() => {});
  report.memory = await memory();
}
report.errors = errors.slice(0, 8);
console.log('load', loadMs, 'ms', JSON.stringify(startup), JSON.stringify(report.memory), 'errors', errors.length);
await fs.writeFile(path.join(path.dirname(new URL(import.meta.url).pathname), `result-${label}-${profile}.json`), JSON.stringify(report, null, 1));
await browser.close(); server.close();
