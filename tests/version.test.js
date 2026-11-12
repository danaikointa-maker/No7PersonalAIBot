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
  const resourceDir = build.directories?.buildResources || 'build';
  const iconPath = (platform) => path.join(ROOT, resourceDir, build[platform].icon);
  for (const platform of ['mac', 'win', 'linux']) {
    assert.ok(fs.existsSync(iconPath(platform)), `ไม่พบไฟล์ไอคอน ${build[platform].icon}`);
  }
  const macPng = fs.readFileSync(iconPath('mac'));
  assert.equal(macPng.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.ok(macPng.readUInt32BE(16) >= 512 && macPng.readUInt32BE(20) >= 512, 'macOS PNG ต้องมีความละเอียดอย่างน้อย 512×512');
  assert.equal(build.mac.identity, null, 'CI build เป็น unsigned ได้โดยไม่เรียก keychain สำหรับ signing');
  assert.equal(fs.readFileSync(iconPath('win')).readUInt16LE(2), 1);
  assert.equal(fs.readFileSync(iconPath('linux')).toString('ascii', 1, 4), 'PNG');
});

test('release workflow round-trips real installer artifacts and validates update metadata before publish', () => {
  const release = read('.github/workflows/release.yml');
  assert.match(release, /Create checksum manifest for release files/);
  assert.match(release, /merge-multiple: true/);
  assert.match(release, /Verify installer artifact round-trip/);
  assert.match(release, /node tools\/release-artifacts\.js verify artifacts/);
  assert.match(release, /release\/checksums-\$\{\{ matrix\.os \}\}\.json/);
  assert.match(release, /artifacts\/\*\*\/\*\.blockmap/);
});

test('CI packages, inspects, and round-trips the real Linux DEB installer', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /Package Linux desktop installer/);
  assert.match(ci, /dpkg-deb --extract/);
  assert.match(ci, /resources\/app\.asar/);
  assert.match(ci, /Upload real Linux installer[\s\S]*upload-artifact@v7/);
  assert.match(ci, /Download real Linux installer[\s\S]*download-artifact@v8/);
  assert.match(ci, /Verify downloaded Linux installer checksum[\s\S]*sha256sum/);
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
  assert.match(rel, /target: '--mac zip'/);
  assert.equal(JSON.parse(read('package.json')).build.mac.identity, null);
});
