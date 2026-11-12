import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReleaseManifest, verifyReleaseArtifacts } from '../tools/release-artifacts.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'no7-release-roundtrip-'));
  const sources = [
    {
      platform: 'ubuntu-22.04',
      files: {
        'no7-personal-ai-bot.deb': 'linux installer bytes',
        'latest-linux.yml': 'version: 2.42.2\nfiles:\n  - url: no7-personal-ai-bot.deb\n',
      },
    },
    {
      platform: 'macos-15-intel',
      files: {
        'No7.AI-2.42.2-mac.zip': 'mac installer bytes',
        'latest-mac.yml': 'version: 2.42.2\nfiles:\n  - url: No7.AI-2.42.2-mac.zip\n',
      },
    },
    {
      platform: 'windows-latest',
      files: {
        'No7.AI.Setup.2.42.2.exe': 'windows setup bytes',
        'No7.AI.2.42.2.exe': 'windows portable bytes',
        'latest.yml': 'version: 2.42.2\nfiles:\n  - url: No7.AI.Setup.2.42.2.exe\n',
      },
    },
  ];
  const merged = path.join(root, 'artifacts');
  await fs.mkdir(merged);
  for (const source of sources) {
    const dir = path.join(root, source.platform);
    await fs.mkdir(dir);
    for (const [name, content] of Object.entries(source.files)) await fs.writeFile(path.join(dir, name), content);
    const manifest = await createReleaseManifest(dir, source.platform);
    for (const name of [...Object.keys(source.files), path.basename(manifest)]) {
      await fs.copyFile(path.join(dir, name), path.join(merged, name));
    }
  }
  return { root, merged };
}

async function cleanup(root) {
  await fs.rm(root, { recursive: true, force: true });
}

test('release artifact verifier checks checksums, platform installers, and metadata references after merge', async () => {
  const { root, merged } = await fixture();
  try {
    const result = await verifyReleaseArtifacts(merged);
    assert.deepEqual(result.platforms, ['macos-15-intel', 'ubuntu-22.04', 'windows-latest']);
    assert.equal(result.files, 7);
  } finally { await cleanup(root); }
});

test('release artifact verifier rejects a file changed during artifact round-trip', async () => {
  const { root, merged } = await fixture();
  try {
    await fs.appendFile(path.join(merged, 'no7-personal-ai-bot.deb'), 'corruption');
    await assert.rejects(() => verifyReleaseArtifacts(merged), /file size does not match|SHA-256 does not match/);
  } finally { await cleanup(root); }
});

test('release artifact verifier refuses metadata that points to a missing asset', async () => {
  const { root, merged } = await fixture();
  try {
    const metadata = path.join(merged, 'latest.yml');
    await fs.writeFile(metadata, 'version: 2.42.2\nfiles:\n  - url: missing-installer.exe\n');
    const manifest = path.join(merged, 'checksums-windows-latest.json');
    const payload = JSON.parse(await fs.readFile(manifest, 'utf8'));
    const record = payload.files.find((file) => file.name === 'latest.yml');
    const bytes = await fs.readFile(metadata);
    record.bytes = bytes.length;
    record.sha256 = createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(manifest, `${JSON.stringify(payload, null, 2)}\n`);
    await assert.rejects(() => verifyReleaseArtifacts(merged), /referenced asset is missing or unsafe/);
  } finally { await cleanup(root); }
});
