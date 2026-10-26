// Package native construction recipes for transport, without baking or changing their geometry.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../models/', import.meta.url));
export async function packModels(directory = root) {
  const index = JSON.parse(await fs.readFile(path.join(directory, 'index.json'), 'utf8'));
  const packed = path.join(directory, 'packed');
  await fs.mkdir(packed, { recursive: true });
  const manifest = { format: 'hikone-native-runtime', version: 1, files: {} };
  let sourceBytes = 0, compressedBytes = 0;
  for (const name of index.models) for (const detail of ['high', 'low']) {
    const filename = `${name}${detail === 'low' ? '.lod' : ''}.json`;
    const source = await fs.readFile(path.join(directory, filename));
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 20);
    const target = path.join(packed, hash + '.json.gz');
    let stats = await fs.stat(target).catch(() => null);
    if (!stats) {
      const body = gzipSync(source, { level: 6 });
      await fs.writeFile(target, body); stats = { size: body.length };
    }
    manifest.files[`${name}/${detail}`] = { url: `models/packed/${hash}.json.gz`,
      rawUrl: `models/${filename}?v=${hash}`, sourceBytes: source.length, compressedBytes: stats.size };
    sourceBytes += source.length; compressedBytes += stats.size;
  }
  const output = JSON.stringify(manifest) + '\n', file = path.join(directory, 'runtime.json');
  if (await fs.readFile(file, 'utf8').catch(() => '') !== output) await fs.writeFile(file, output);
  return { models: index.models.length, sourceBytes, compressedBytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packModels();
  console.log(`Native transport: ${result.models} models, ${(result.sourceBytes / 1e6).toFixed(2)} MB → ${(result.compressedBytes / 1e6).toFixed(2)} MB`);
}
