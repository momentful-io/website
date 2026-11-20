import {
  readFile,
  readdir,
  lstat,
  realpath,
  mkdir,
  open,
  unlink,
} from 'node:fs/promises';
import { resolve, relative, dirname, sep, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { spawn } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export class DeployError extends Error {}
const fail = (message) => {
  throw new DeployError(message);
};

// Deliberately not a shell: no variable expansion, escapes, commands or multiline values.
export function parseEnv(source) {
  const values = Object.create(null);
  for (const [index, raw] of source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match)
      fail(
        `Invalid .env syntax on line ${index + 1}. Expected NAME=VALUE.`,
      );
    const [, key, input] = match;
    if (Object.hasOwn(values, key))
      fail(`Duplicate .env entry on line ${index + 1}.`);
    let value = input;
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.lastIndexOf(quote);
      if (end < 1 || !/^\s*(#.*)?$/.test(value.slice(end + 1)))
        fail(`Check the quotation marks on line ${index + 1} of .env.`);
      value = value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, '').trim();
    if (/[\x00-\x1f\x7f]/.test(value))
      fail(`Control characters are not allowed on line ${index + 1} of .env.`);
    values[key] = value;
  }
  return values;
}

export async function loadConfig(root) {
  let source;
  try {
    source = await readFile(resolve(root, '.env'), 'utf8');
  } catch {
    fail(
      'The local .env file is missing or unreadable. Copy .env.example to .env and fill in the settings locally.',
    );
  }
  return validateConfig(parseEnv(source), root);
}

export async function validateConfig(env, root) {
  const protocol = (env.DEPLOY_PROTOCOL || 'sftp').toLowerCase();
  if (protocol !== 'sftp' && protocol !== 'ftps')
    fail(
      'DEPLOY_PROTOCOL must be sftp or ftps. Unencrypted FTP is unsupported.',
    );
  const sftp = protocol === 'sftp';
  for (const key of [
    'DEPLOY_HOST',
    'DEPLOY_USER',
    'DEPLOY_REMOTE_DIR',
    ...(sftp ? ['DEPLOY_HOST_KEY_SHA256'] : []),
  ]) {
    if (!env[key]?.trim())
      fail(`Missing configuration: set ${key} in the local .env file.`);
  }
  const host = env.DEPLOY_HOST;
  if (
    !isIP(host) &&
    !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)
  )
    fail(
      'DEPLOY_HOST must be a hostname or IP address without a protocol or path.',
    );
  if (/\.invalid$/i.test(host))
    fail('DEPLOY_HOST still contains the example value.');
  const port = env.DEPLOY_PORT || (sftp ? '22' : '21');
  if (!/^\d+$/.test(port) || +port < 1 || +port > 65535)
    fail('DEPLOY_PORT must be between 1 and 65535.');
  if (sftp && !/^SHA256:[A-Za-z0-9+/]{43}=?$/.test(env.DEPLOY_HOST_KEY_SHA256))
    fail(
      'DEPLOY_HOST_KEY_SHA256 must contain the verified SHA256: fingerprint from the hosting provider. Placeholders, * and acceptnew are not allowed.',
    );
  const remote = env.DEPLOY_REMOTE_DIR;
  // FTP sub-accounts are usually locked to the website folder, which then appears as /.
  if (
    !remote.startsWith('/') ||
    remote.includes('\\') ||
    remote.split('/').some((part) => part === '.' || part === '..') ||
    (sftp && posix.normalize(remote) === '/')
  )
    fail(
      sftp
        ? 'DEPLOY_REMOTE_DIR must be an absolute website directory such as /public_html. Neither / nor .. is allowed.'
        : 'DEPLOY_REMOTE_DIR must be an absolute website directory such as /public_html. Use / if FTP access is restricted to the website directory. The .. component is not allowed.',
    );
  if (!sftp && (env.DEPLOY_PRIVATE_KEY || env.DEPLOY_PASSPHRASE))
    fail(
      'FTPS supports only DEPLOY_PASSWORD. Leave DEPLOY_PRIVATE_KEY and DEPLOY_PASSPHRASE empty.',
    );
  if (!!env.DEPLOY_PASSWORD === !!env.DEPLOY_PRIVATE_KEY)
    fail(
      'Set exactly one authentication option: DEPLOY_PASSWORD or DEPLOY_PRIVATE_KEY.',
    );
  const config = {
    protocol,
    host,
    port: +port,
    username: env.DEPLOY_USER,
    remote: posix.normalize(remote).replace(/(.)\/$/, '$1'),
  };
  if (sftp)
    config.fingerprint = Buffer.from(
      env.DEPLOY_HOST_KEY_SHA256.slice(7),
      'base64',
    );
  if (env.DEPLOY_PASSWORD) config.password = env.DEPLOY_PASSWORD;
  else {
    const keyPath = resolve(root, env.DEPLOY_PRIVATE_KEY);
    const project = resolve(root).toLowerCase();
    if (
      keyPath.toLowerCase() === project ||
      keyPath.toLowerCase().startsWith(project + sep)
    )
      fail(
        'DEPLOY_PRIVATE_KEY must point to a file outside the project directory.',
      );
    try {
      const actual = (await realpath(keyPath)).toLowerCase();
      if (actual === project || actual.startsWith(project + sep))
        fail(
          'DEPLOY_PRIVATE_KEY must point to a file outside the project directory.',
        );
      config.privateKey = await readFile(keyPath);
    } catch {
      fail(
        'The file specified by DEPLOY_PRIVATE_KEY is unreadable or is in a restricted directory.',
      );
    }
    if (env.DEPLOY_PASSPHRASE) config.passphrase = env.DEPLOY_PASSPHRASE;
  }
  return config;
}

export function hostVerifier(expected) {
  return (key) => {
    const actual = createHash('sha256').update(key).digest();
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  };
}

export async function collectFiles(output) {
  const base = await lstat(output);
  if (!base.isDirectory() || base.isSymbolicLink())
    fail('_site must be a local directory, not a symbolic link.');
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      // A misplaced credential/source file must stop deployment, rather than be silently sent.
      if (
        /^\.|^(?:cms|editor|node_modules|src|scripts|tests)$/i.test(
          entry.name,
        ) ||
        /\.(?:pem|ppk|key|env|md|mjs|cmd|ps1)$/i.test(entry.name)
      )
        fail(
          'Unexpected private or build-related file in _site. Check the build. No files were uploaded.',
        );
      const path = resolve(directory, entry.name);
      const info = await lstat(path);
      if (info.isSymbolicLink())
        fail('Symbolic links in _site are not allowed.');
      if (info.isDirectory()) await walk(path);
      else if (info.isFile())
        files.push({
          local: path,
          relative: relative(output, path).split(sep).join('/'),
        });
      else fail('Unsupported file type in _site.');
    }
  }
  await walk(output);
  if (!files.some((file) => file.relative === 'index.html'))
    fail('The build does not contain index.html. No files were uploaded.');
  return files.sort(
    (a, b) =>
      Number(a.relative.endsWith('.html')) -
        Number(b.relative.endsWith('.html')) ||
      a.relative.localeCompare(b.relative),
  );
}

export async function buildProduction(root) {
  await new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(root, 'scripts/build.mjs')],
      { cwd: root, stdio: 'ignore', windowsHide: true },
    );
    child.on('error', () =>
      reject(
        new DeployError('Could not start the production build.'),
      ),
    );
    child.on('exit', (code) =>
      code === 0
        ? done()
        : reject(
            new DeployError(
              'The production build failed. No server connection was made. Check the local build.',
            ),
          ),
    );
  });
}

function call(sftp, method, ...args) {
  return new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('SFTP timeout')), 120000);
    try {
      sftp[method](...args, (error, result) => {
        clearTimeout(timer);
        error ? reject(error) : done(result);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

async function checkSource(file, output) {
  const info = await lstat(file.local);
  const actual = await realpath(file.local);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    !actual.startsWith(output + sep)
  )
    throw Error('Unsafe source');
  return info;
}

export async function upload(config, files, output, Client) {
  const client = new Client();
  try {
    await new Promise((done, reject) => {
      client.on('error', reject);
      client.once('close', () => reject(new Error('Connection closed')));
      client.once('ready', async () => {
        try {
          const sftp = await call(client, 'sftp');
          // The configured base and every parent must already exist and must not be symlinks.
          const knownDirectories = new Set(['/']);
          async function directory(path, create) {
            if (knownDirectories.has(path)) return;
            await directory(posix.dirname(path), create);
            let info;
            try {
              info = await call(sftp, 'lstat', path);
            } catch (error) {
              if (!create || error.code !== 2) throw error;
              await call(sftp, 'mkdir', path, { mode: 0o755 });
              info = await call(sftp, 'lstat', path);
            }
            if (!info.isDirectory() || info.isSymbolicLink())
              throw Error('Unsafe directory');
            knownDirectories.add(path);
          }
          await directory(config.remote, false);
          for (const file of files) {
            const localInfo = await checkSource(file, output);
            const target = posix.join(config.remote, file.relative);
            await directory(posix.dirname(target), true);
            try {
              const existing = await call(sftp, 'lstat', target);
              if (!existing.isFile() || existing.isSymbolicLink())
                throw Error('Unsafe target');
            } catch (error) {
              if (error.code !== 2) throw error;
            }
            // No unlink, rm, rmdir, rename, shell commands or synchronization. Overwrite in place.
            await call(sftp, 'fastPut', file.local, target, { concurrency: 1 });
            const written = await call(sftp, 'lstat', target);
            if (
              !written.isFile() ||
              written.isSymbolicLink() ||
              written.size !== localInfo.size
            )
              throw Error('Incomplete upload');
          }
          done();
        } catch (error) {
          reject(error);
        }
      });
      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey,
        passphrase: config.passphrase,
        hostVerifier: hostVerifier(config.fingerprint),
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      });
    });
  } catch {
    fail(
      'SFTP failed. Check the host key, authentication, destination directory, permissions, and network locally. Some files may have been uploaded. No existing server files were deleted.',
    );
  } finally {
    client.destroy();
  }
}

// FTPS = FTP with explicit TLS (AUTH TLS). basic-ftp aborts if TLS is refused, verifies the
// certificate, encrypts data connections too and never falls back to plain FTP.
export async function uploadFtps(config, files, output, Client) {
  const client = new Client(120000);
  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      secure: true,
      secureOptions: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    });
    // FTP has no lstat; directory listings are the only source for type and symlink information.
    const listings = new Map();
    async function entries(path) {
      if (!listings.has(path))
        listings.set(
          path,
          new Map(
            (await client.list(path)).map((entry) => [
              posix.basename(entry.name),
              entry,
            ]),
          ),
        );
      return listings.get(path);
    }
    const knownDirectories = new Set(['/']);
    async function directory(path, create) {
      if (knownDirectories.has(path)) return;
      const parent = posix.dirname(path);
      await directory(parent, create);
      const name = posix.basename(path);
      let entry = (await entries(parent)).get(name);
      if (!entry) {
        if (!create) throw Error('Missing directory');
        await client.send(`MKD ${path}`);
        listings.delete(parent);
        entry = (await entries(parent)).get(name);
      }
      if (!entry?.isDirectory || entry.isSymbolicLink)
        throw Error('Unsafe directory');
      knownDirectories.add(path);
    }
    await directory(config.remote, false);
    for (const file of files) {
      const localInfo = await checkSource(file, output);
      const target = posix.join(config.remote, file.relative);
      if (/[\x00-\x1f\x7f]/.test(target)) throw Error('Unsafe name');
      const parent = posix.dirname(target);
      await directory(parent, true);
      const existing = (await entries(parent)).get(posix.basename(target));
      if (existing && (!existing.isFile || existing.isSymbolicLink))
        throw Error('Unsafe target');
      // No DELE, RMD, RNFR/RNTO or synchronization. Overwrite in place.
      await client.uploadFrom(file.local, target);
      if ((await client.size(target)) !== localInfo.size)
        throw Error('Incomplete upload');
    }
  } catch {
    fail(
      'FTPS failed. Check the certificate, authentication, destination directory, permissions, and network locally. Some files may have been uploaded. No existing server files were deleted.',
    );
  } finally {
    client.close();
  }
}

export async function deploy({
  root = projectRoot,
  check = false,
  build = buildProduction,
  Client,
  log = console.log,
} = {}) {
  const config = await loadConfig(root);
  const work = resolve(root, '.local');
  await mkdir(work, { recursive: true });
  const lockPath = resolve(work, 'deployment.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch {
    fail(
      'A deployment or check is already running. If a previous run was interrupted, remove .local/deployment.lock only after confirming that no deployment or check is running.',
    );
  }
  try {
    log('Configuration validated. Creating a fresh production build ...');
    await build(root);
    const output = resolve(root, '_site');
    const files = await collectFiles(output);
    const ftps = config.protocol === 'ftps';
    const label = ftps ? 'FTPS' : 'SFTP';
    if (!Client) {
      try {
        ({ Client } = await import(ftps ? 'basic-ftp' : 'ssh2'));
      } catch {
        fail(
          `The ${label} module is missing. Install the project dependencies with npm ci.`,
        );
      }
    }
    if (check) {
      log(
        `Local check passed (${label}): ${files.length} website files. No server connection, no upload.`,
      );
      return;
    }
    log(
      `Build succeeded. Uploading ${files.length} website files over ${label} ...`,
    );
    await (ftps ? uploadFtps : upload)(config, files, output, Client);
    log(
      'DEPLOYMENT SUCCESSFUL. Review the published website in your browser.',
    );
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    args.some((arg) => !['--check', '--help'].includes(arg))
  ) {
    console.error('Use --check (local only) or --help.');
    process.exitCode = 1;
  } else if (args.includes('--help'))
    console.log(
      'With no options, run a fresh build and upload the contents of _site over SFTP or FTPS (DEPLOY_PROTOCOL). --check validates the configuration and build locally without connecting to the server. Configure deployment in .env in the project directory.',
    );
  else
    try {
      await deploy({ check: args.includes('--check') });
    } catch (error) {
      console.error(
        error instanceof DeployError
          ? error.message
          : 'Local deployment error. Check the configuration, file permissions, and dependencies.',
      );
      process.exitCode = 1;
    }
}
