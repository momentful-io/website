// Prepare the pinned npm distribution for the local editor, including local fonts.
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
  cp,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@sveltia/cms');
const target = resolve(root, 'cms/vendor');
const manifest = JSON.parse(await readFile(resolve(source, 'package.json')));
if (manifest.version !== '0.265.1') throw Error('Unexpected CMS version');
await mkdir(resolve(target, 'fonts'), { recursive: true });
await cp(resolve(source, 'dist/chunks'), resolve(target, 'chunks'), {
  recursive: true,
  filter: (path) => !path.endsWith('.map'),
});
await copyFile(resolve(source, 'LICENSE.txt'), resolve(target, 'LICENSE.txt'));
let code = await readFile(resolve(source, 'dist/sveltia-cms.js'), 'utf8');
const fonts = await readdir(resolve(source, 'npm/assets'));
for (const name of [
  'source-sans-3',
  'material-symbols-outlined',
  'noto-mono',
]) {
  const file = fonts.find(
    (file) => file.startsWith(name + '-latin-') && file.endsWith('.woff2'),
  );
  if (!file) throw Error(`Missing ${name}`);
  await copyFile(
    resolve(source, 'npm/assets', file),
    resolve(target, 'fonts', file),
  );
  // Preserve all upstream code except remote font URLs; originals remain in node_modules.
  code = code.replaceAll(
    new RegExp(
      `https://cdn\\.jsdelivr\\.net/fontsource/fonts/${name}[^"'\\s)]+?\\.woff2`,
      'g',
    ),
    `/editor/fonts/${file}`,
  );
}
await writeFile(
  resolve(target, 'sveltia-cms.js'),
  code.replace(/\/\/# sourceMappingURL=.*$/gm, ''),
);
for (const file of fonts.filter((file) => file.endsWith('LICENSE.txt')))
  await copyFile(
    resolve(source, 'npm/assets', file),
    resolve(target, 'fonts', file),
  );
await writeFile(
  resolve(target, 'VERSION.json'),
  JSON.stringify(
    {
      version: manifest.version,
      license: manifest.license,
      fontURLsLocalized: true,
    },
    null,
    2,
  ),
);
