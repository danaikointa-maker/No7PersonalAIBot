// เวอร์ชันต้องตรงกันทุกที่ที่ผู้ใช้/ระบบเห็น
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MCP_CLIENT_INFO } from '../web/src/core/mcp.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const PKG_VERSION = JSON.parse(read('package.json')).version;

test('lockfile agrees with package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

test('MCP clientInfo and diagnostics use the package version', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(MCP_CLIENT_INFO.version, pkg.version);
  assert.ok(read('web/src/main.js').includes(`window.NO7_VERSION || '${pkg.version}'`), 'fallback ใน main.js ต้องตรงกับ package.json');
});

test('build injects the version from package.json (single source of truth)', () => {
  const vite = read('vite.config.js');
  assert.match(vite, /readFileSync\(new URL\('\.\/package\.json'/);
  assert.match(vite, /'window\.NO7_VERSION': JSON\.stringify\(pkg\.version\)/);
});

test('CHANGELOG and README describe the current version', () => {
  const changelog = read('CHANGELOG.md');
  assert.ok(changelog.includes(`## [${PKG_VERSION}]`), `CHANGELOG ต้องมีหัวข้อ ${PKG_VERSION}`);
  const [major, minor] = PKG_VERSION.split('.');
  assert.match(read('README.md'), new RegExp(`# No7 Personal AI Bot \`v${major}\\.${minor}\``));
});

test('package metadata has an author email for Debian package metadata', () => {
  const author = JSON.parse(read('package.json')).author;
  assert.equal(author.name, 'No7 Personal AI Bot');
  assert.match(author.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

test('desktop packaging icons exist in the formats referenced by the build config', () => {
  const build = JSON.parse(read('package.json')).build;
  for (const icon of [build.mac.icon, build.win.icon, build.linux.icon]) {
    assert.ok(fs.existsSync(path.join(ROOT, icon)), `ไม่พบไฟล์ไอคอน ${icon}`);
  }
  assert.equal(fs.readFileSync(path.join(ROOT, build.mac.icon)).toString('ascii', 0, 4), 'icns');
  assert.equal(fs.readFileSync(path.join(ROOT, build.win.icon)).readUInt16LE(2), 1);
  assert.equal(fs.readFileSync(path.join(ROOT, build.linux.icon)).toString('ascii', 1, 4), 'PNG');
});

test('release workflow triggers on version tags and builds all 3 platforms', () => {
  const rel = read('.github/workflows/release.yml');
  assert.match(rel, /tags: \['v\*'\]/);
  for (const runner of ['ubuntu-22.04', 'macos-15-intel', 'windows-latest']) {
    assert.ok(rel.includes(runner), `ขาด ${runner}`);
  }
  assert.match(rel, /npm run perf/);
  assert.match(rel, /latest\*\.yml/);
  assert.match(rel, /release_tag/);
  assert.match(rel, /tag_name: \$\{\{ inputs\.release_tag \|\| github\.ref_name \}\}/);
  assert.match(rel, /Sanitized packaging log/);
  assert.match(rel, /--linux deb/);
  assert.match(rel, /CSC_IDENTITY_AUTO_DISCOVERY/);
});
