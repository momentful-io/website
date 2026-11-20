import Eleventy from '@11ty/eleventy';
import { createServer } from 'node:http';
import { readFile, mkdir, stat, copyFile, readdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHelp, helpFiles } from './help.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
await import('./prepare-cms.mjs');
const work = resolve(root, '.local');
const port = Number(process.env.MOMENTFUL_EDITOR_PORT || 8090);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error('Invalid editor port');
const origin = `http://127.0.0.1:${port}`;
const output = resolve(work, 'editor-preview');
await mkdir(work, { recursive: true });
// Sveltia's local folder picker requires this empty marker; no Git history is created.
await mkdir(resolve(root, '.git'), { recursive: true });
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.md': 'text/plain; charset=utf-8',
};
let ready = false;
let revision = 0;
let closing = false;
let sourceWatcher;
let configWatcher;
let buildTimer;
let buildTask;
let rebuildPending = false;
async function rebuild() {
  rebuildPending = true;
  if (buildTask) return buildTask;
  // A fresh build discovers added/removed projects and removes obsolete preview pages.
  buildTask = (async () => {
    while (rebuildPending && !closing) {
      rebuildPending = false;
      ready = false;
      try {
        await rm(output, { recursive: true, force: true });
        const site = new Eleventy('src', '.local/editor-preview', {
          source: 'cli',
          config(config) {
            config.setUseTemplateCache(false);
          },
        });
        await site.write();
        revision++;
        ready = true;
      } catch (error) {
        console.error('Preview build:', error);
      }
    }
  })();
  try {
    await buildTask;
  } finally {
    buildTask = undefined;
  }
}
function scheduleRebuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    rebuild().catch((error) => console.error('Preview build:', error));
  }, 200);
}
async function stop() {
  if (closing) return;
  closing = true;
  clearTimeout(buildTimer);
  sourceWatcher?.close();
  configWatcher?.close();
  await buildTask;
  server.close();
  process.exit(0);
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
  );
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) {
    res.writeHead(403);
    return res.end();
  }
  const path = new URL(req.url, origin).pathname;
  if (path === '/__status') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({ app: 'momentful-editor', root, ready, revision }),
    );
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  try {
    const fixed = {
      '/start/': 'cms/index.html',
      '/editor/': 'cms/editor.html',
      '/editor/config.mjs': 'cms/config.mjs',
      '/editor/sveltia-cms.js': 'cms/vendor/sveltia-cms.js',
      '/legal/LICENSE': 'LICENSE',
      '/legal/LICENSE-CONTENT': 'LICENSE-CONTENT',
      '/legal/NOTICE': 'NOTICE',
    };
    for (const name of helpFiles) fixed['/help/' + name.slice(0, -3)] = name;
    let file;
    if (fixed[path]) file = resolve(root, fixed[path]);
    else if (
      path.startsWith('/editor/chunks/') ||
      path.startsWith('/editor/fonts/')
    ) {
      const vendor = resolve(root, 'cms/vendor');
      file = resolve(
        vendor,
        '.' + decodeURIComponent(path.slice('/editor'.length)),
      );
      if (!file.startsWith(vendor + sep)) throw Error('Invalid path');
    } else {
      file = resolve(output, '.' + decodeURIComponent(path));
      if (file !== output && !file.startsWith(output + sep))
        throw Error('Invalid path');
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    }
    let content = await readFile(file);
    let type = types[extname(file)] || 'application/octet-stream';
    if (path.startsWith('/legal/') && fixed[path])
      type = 'text/plain; charset=utf-8';
    if (path.startsWith('/help/') && fixed[path]) {
      content = renderHelp(content.toString(), { sourcePath: fixed[path] });
      type = 'text/html; charset=utf-8';
    }
    if (file.startsWith(output + sep) && extname(file) === '.html') {
      // Preview-only refresh; never written into the production artifact or CMS.
      content = content
        .toString()
        .replace(
          '</body>',
          `<script>const revision=${revision};setInterval(async()=>{try{const s=await fetch('/__status').then(r=>r.json());if(s.ready&&s.revision!==revision)location.reload();}catch{}},1000);</script></body>`,
        );
    }
    res.writeHead(200, {
      'Content-Type': extname(file) === '.png' ? 'image/png' : type,
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found. If starting, wait a moment and refresh.');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise((done) => server.listen(port, '127.0.0.1', done));
try {
  const backup = resolve(
    work,
    'content-backups',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  const markdown = async (folder) =>
    (await readdir(resolve(root, 'src', folder)))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `${folder}/${name}`);
  for (const name of [
    ...(await markdown('pages')),
    '_data/site.json',
    ...(await markdown('projects')),
  ]) {
    const target = resolve(backup, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, 'src', name), target);
  }
  sourceWatcher = watch(
    resolve(root, 'src'),
    { recursive: true },
    scheduleRebuild,
  );
  configWatcher = watch(resolve(root, 'eleventy.config.js'), scheduleRebuild);
  await rebuild();
  if (!ready) throw Error('Initial preview build failed');
  console.log(`Editor ready: ${origin}/start/`);
  console.log('Editor is running in the foreground. Press Ctrl+C to stop.');
} catch (error) {
  console.error(error);
  await stop();
}
