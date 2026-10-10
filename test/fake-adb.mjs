#!/usr/bin/env node
// Stand-in for adb in tests: one headset whose /sdcard lives in $FAKE_ADB_ROOT.
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.FAKE_ADB_ROOT;
const installed = process.env.FAKE_ADB_INSTALLED !== '0';
let args = process.argv.slice(2);
if (args[0] === '-s') args = args.slice(2);
const local = p => path.join(root, p.replace(/^\/sdcard/, 'sdcard'));
fs.appendFileSync(path.join(root, 'calls.log'), args.join(' ') + '\n');

const [cmd, ...rest] = args;
if (cmd === 'version') console.log('Android Debug Bridge version 1.0.41 (fake)');
else if (cmd === 'devices') console.log('List of devices attached\n1WMHH000000000 device usb:1-1 product:hollywood model:Quest_3 device:eureka\n');
else if (cmd === 'push') { fs.mkdirSync(path.dirname(local(rest[1])), { recursive: true }); fs.copyFileSync(rest[0], local(rest[1])); console.log('1 file pushed'); }
else if (cmd === 'shell') {
  const [sub, ...a] = rest;
  if (sub === 'pm') console.log(installed ? 'package:/data/app/base.apk' : '');
  else if (sub === 'mkdir') fs.mkdirSync(local(a.at(-1)), { recursive: true });
  else if (sub === 'ls') console.log(fs.existsSync(local(a[0])) ? fs.readdirSync(local(a[0])).join('\n') : '');
  else if (sub === 'rm') fs.rmSync(local(a.at(-1)), { force: true });
} else { console.error('unknown ' + args.join(' ')); process.exit(1); }
