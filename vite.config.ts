import { defineConfig } from 'vite';
import type {Plugin, ViteDevServer, PreviewServer} from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './server/editor-api.mjs';
import { packModels } from './tools/pack_models.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

function editorApi(server: Pick<ViteDevServer | PreviewServer, 'middlewares'>) {
  server.middlewares.use((req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    const resourcePath = pathname.replace(/^\/node_modules\/\.vite\//, '/node_modules/vite-cache/');
    if (/\/(?:\.[^/]*|server|tools|test)(?:\/|$)/.test(resourcePath)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    Promise.resolve(handle(req, res)).then(handled => { if (!handled) next(); }).catch(next);
  });
}

// Keep generated data in its authoritative location. Only the deployable resources are copied;
// source generators, tests, local settings and the historical GLB archive stay out of dist.
function resources(): Plugin {
  let out = '', building = false;
  return {
    name: 'hikone-resources',
    async configResolved(config) {
      if (config.isWorker) return;
      out = path.resolve(config.root, config.build.outDir); building = config.command === 'build';
      await packModels();
    },
    configureServer: editorApi,
    configurePreviewServer: editorApi,
    async closeBundle() {
      if (!building) return;
      for (const dir of ['data', 'models', 'world']) {
        await fs.cp(path.join(root, dir), path.join(out, dir), { recursive: true,
          filter: source => !source.startsWith(path.join(root, 'data', 'models')) });
      }
      for (const name of await fs.readdir(root)) {
        if (name.endsWith('.md')) await fs.copyFile(path.join(root, name), path.join(out, name));
      }
      await fs.cp(path.join(root, 'docs'), path.join(out, 'docs'), { recursive: true,
        filter: source => !/\.(html|css|js)$/.test(source) });
      for (const [module, name] of [['three', 'THREE'], ['react', 'REACT'], ['react-dom', 'REACT-DOM']])
        await fs.copyFile(path.join(root, 'node_modules', module, 'LICENSE'), path.join(out, name + '-LICENSE.txt'));
      await fs.writeFile(path.join(out, '.nojekyll'), '');
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), resources()],
  server: { host: '127.0.0.1', port: 8770, strictPort: true,
    fs: { deny: ['.git/**', '.claude/**', '**/.env*', '**/*.pem', 'server/**', 'test/**', 'tools/**'] } },
  preview: { host: '127.0.0.1', port: 8770, strictPort: true },
  build: {
    target: 'esnext',
    rolldownOptions: {
      input: ['index.html', 'editor/index.html', 'docs/index.html', 'docs/tutorial.html',
        'docs/how-to.html', 'docs/reference.html', 'docs/architecture.html', 'docs/pipeline.html'].map(file => path.join(root, file)),
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/](?!examples[\\/]jsm[\\/]exporters[\\/])/ }] } },
    },
  },
});
