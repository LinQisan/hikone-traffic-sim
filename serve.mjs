// Compatibility entry point. npm run dev is the usual Vite command.
import { createServer } from 'vite';
const arg = name => { const i = process.argv.indexOf('--' + name); return i < 0 ? undefined : process.argv[i + 1]; };
const server = await createServer({ server: {
  ...(arg('host') ? { host: arg('host') } : {}),
  ...(arg('port') || process.env.PORT ? { port: Number(arg('port') || process.env.PORT) } : {}),
} });
await server.listen();
server.printUrls();
