import { rm, readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const output = resolve(root, '_site');
const manifest = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
);
// Refuse to clean anything except this project's fixed output directory.
if (
  manifest.name !== 'momentful-io' ||
  dirname(output) !== root ||
  basename(output) !== '_site'
) {
  throw new Error('Run the build from the Momentful I/O project root.');
}
await rm(output, { recursive: true, force: true });
const result = spawnSync(
  process.execPath,
  [resolve(root, 'node_modules/@11ty/eleventy/cmd.cjs')],
  { stdio: 'inherit', cwd: root },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
