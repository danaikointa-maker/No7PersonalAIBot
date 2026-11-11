// เวอร์ชันต้องตรงกันทุกที่ที่ผู้ใช้/ระบบเห็น
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MCP_CLIENT_INFO } from '../web/src/core/mcp.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('package.json is 2.0.0 and the lockfile agrees', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, '2.0.0');
  assert.equal(lock.version, '2.0.0');
  assert.equal(lock.packages[''].version, pkg.version);
});

test('MCP clientInfo and diagnostics use the package version', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(MCP_CLIENT_INFO.version, pkg.version);
  assert.match(read('web/src/main.js'), /window\.NO7_VERSION \|\| '2\.0\.0'/);
});

test('build injects the version from package.json (single source of truth)', () => {
  const vite = read('vite.config.js');
  assert.match(vite, /readFileSync\(new URL\('\.\/package\.json'/);
  assert.match(vite, /'window\.NO7_VERSION': JSON\.stringify\(pkg\.version\)/);
});

test('CHANGELOG and README describe the current major version', () => {
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, /## \[2\.0\.0\] — \d{4}-\d{2}-\d{2}/);
  assert.match(read('README.md'), /# No7 Personal AI Bot `v2\.0`/);
});

test('release workflow triggers on version tags and builds all 3 platforms', () => {
  const rel = read('.github/workflows/release.yml');
  assert.match(rel, /tags: \['v\*'\]/);
  for (const runner of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.ok(rel.includes(runner), `ขาด ${runner}`);
  }
  assert.match(rel, /npm run perf/);
  assert.match(rel, /latest\*\.yml/);
});
