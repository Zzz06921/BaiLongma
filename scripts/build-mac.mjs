#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronVersion = '33.4.11';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportedArchs = new Set(['x64', 'arm64', 'universal']);
const args = process.argv.slice(2).map((arg) => arg.replace(/^--/, ''));
const invalidArgs = args.filter((arg) => !supportedArchs.has(arg));

if (invalidArgs.length > 0) {
  console.error(`[build:mac] unsupported architecture: ${invalidArgs.join(', ')}`);
  console.error('[build:mac] supported architectures: x64, arm64, universal');
  process.exit(1);
}

if (args.includes('universal') && args.length > 1) {
  console.error('[build:mac] universal cannot be combined with x64 or arm64');
  process.exit(1);
}

const requestedArchs = args.filter((arg) => supportedArchs.has(arg));
const archs = requestedArchs.length > 0 ? requestedArchs : ['x64', 'arm64'];
const stagingArchs = archs.includes('universal') ? ['x64', 'arm64'] : archs;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[build:mac] ${command} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function betterSqliteBinaryPath() {
  return path.join(projectRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
}

function rebuildBetterSqlite(arch) {
  console.log(`[build:mac] rebuilding better-sqlite3 for ${arch}`);
  run('node', [
    './node_modules/@electron/rebuild/lib/cli.js',
    '-f',
    '-w',
    'better-sqlite3',
    '-v',
    electronVersion,
    '-a',
    arch,
  ]);

  const binary = betterSqliteBinaryPath();
  if (!existsSync(binary)) {
    console.error(`[build:mac] better-sqlite3 binary was not produced for ${arch}: ${binary}`);
    process.exit(1);
  }
  const destination = path.join(projectRoot, 'build', 'better-sqlite3', arch, 'better_sqlite3.node');
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(binary, destination);
  return destination;
}

function buildUniversalBetterSqlite() {
  const stagingRoot = path.join(projectRoot, 'build', 'better-sqlite3');
  rmSync(stagingRoot, { recursive: true, force: true });
  const x64Binary = rebuildBetterSqlite('x64');
  const arm64Binary = rebuildBetterSqlite('arm64');
  const output = betterSqliteBinaryPath();
  console.log('[build:mac] merging better-sqlite3 arm64 and x64 binaries');
  run('lipo', ['-create', x64Binary, arm64Binary, '-output', output]);
  run('lipo', ['-info', output]);
}

function stageUniversalPlaywrightBrowsers() {
  const stagingRoot = path.join(projectRoot, 'build', 'playwright-browsers');
  const universalDir = path.join(stagingRoot, 'mac-universal');
  rmSync(universalDir, { recursive: true, force: true });
  mkdirSync(universalDir, { recursive: true });

  for (const arch of ['x64', 'arm64']) {
    const source = path.join(stagingRoot, `mac-${arch}`);
    if (!existsSync(source)) {
      console.error(`[build:mac] missing staged Playwright browsers: ${source}`);
      process.exit(1);
    }
    cpSync(source, path.join(universalDir, arch), { recursive: true });
  }
}

run('node', ['scripts/prebuild-clean.mjs']);
run('node', [
  'scripts/prepare-playwright-browsers.mjs',
  '--platform=darwin',
  ...stagingArchs.map((arch) => `--arch=${arch}`),
]);

if (archs.includes('universal')) {
  stageUniversalPlaywrightBrowsers();
  console.log('[build:mac] building native macOS speech helper for universal');
  run('node', ['scripts/build-macos-speech.mjs', 'universal', '--required']);
  buildUniversalBetterSqlite();

  console.log('[build:mac] packaging universal DMG');
  run('node', [
    './node_modules/electron-builder/cli.js',
    '--mac',
    '--universal',
    '--publish',
    'never',
    '--config.npmRebuild=false',
  ]);
  process.exit(0);
}

for (const arch of archs) {
  console.log(`[build:mac] building native macOS speech helper for ${arch}`);
  run('node', ['scripts/build-macos-speech.mjs', arch, '--required']);

  console.log(`[build:mac] rebuilding better-sqlite3 for ${arch}`);
  run('node', [
    './node_modules/@electron/rebuild/lib/cli.js',
    '-f',
    '-w',
    'better-sqlite3',
    '-v',
    electronVersion,
    '-a',
    arch,
  ]);

  console.log(`[build:mac] packaging ${arch} DMG`);
  run('node', ['./node_modules/electron-builder/cli.js', '--mac', 'dmg', `--${arch}`]);
}
