// Verify that real desktop release files survive the Actions artifact upload/download round-trip.
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const isReleaseAsset = (name) => (
  /\.(?:exe|dmg|zip|appimage|deb|blockmap)$/i.test(name)
  || /^latest[^/]*\.yml$/i.test(name)
);

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function createReleaseManifest(directory, platform) {
  if (!/^[a-z0-9._-]+$/i.test(String(platform))) throw new Error('Invalid platform label');
  const root = path.resolve(directory);
  const names = (await fs.readdir(root))
    .filter((name) => isReleaseAsset(name))
    .sort((a, b) => a.localeCompare(b));
  if (!names.length) throw new Error(`No release assets found in ${root}`);

  const files = [];
  for (const name of names) {
    const filePath = path.join(root, name);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) continue;
    files.push({ name, bytes: stat.size, sha256: await sha256(filePath) });
  }
  if (!files.length) throw new Error(`No regular release assets found in ${root}`);

  const manifest = { schema: 1, platform: String(platform), files };
  const manifestPath = path.join(root, `checksums-${platform}.json`);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'w' });
  return manifestPath;
}

function assertAssetsAndMetadata(fileNames, textCache) {
  const names = new Set(fileNames);
  const has = (pattern) => fileNames.some((name) => pattern.test(name));
  if (!has(/\.deb$/i)) throw new Error('Linux .deb installer is missing');
  if (!has(/^No7\.AI-.*-mac\.zip$/i)) throw new Error('macOS ZIP installer is missing');
  if (!has(/^No7\.AI\.Setup\..*\.exe$/i)) throw new Error('Windows NSIS installer is missing');
  if (!has(/^No7\.AI\.(?!Setup\.).*\.exe$/i)) throw new Error('Windows portable installer is missing');

  for (const name of ['latest-linux.yml', 'latest-mac.yml', 'latest.yml']) {
    if (!names.has(name)) throw new Error(`Updater metadata is missing: ${name}`);
    const content = textCache.get(name) || '';
    const urls = [...content.matchAll(/^\s*(?:-\s*)?url:\s*["']?([^"'\s]+)["']?\s*$/gm)]
      .map((match) => match[1]);
    if (!urls.length) throw new Error(`${name}: no installer URLs found`);
    for (const asset of urls) {
      if (path.basename(asset) !== asset || !names.has(asset)) {
        throw new Error(`${name}: referenced asset is missing or unsafe: ${asset}`);
      }
    }
    const expectedExt = name === 'latest-linux.yml' ? '.deb' : name === 'latest-mac.yml' ? '.zip' : '.exe';
    if (!urls.some((asset) => asset.toLowerCase().endsWith(expectedExt))) {
      throw new Error(`${name}: no ${expectedExt} installer is referenced`);
    }
  }
}

export async function verifyReleaseArtifacts(directory) {
  const root = path.resolve(directory);
  const dirEntries = await fs.readdir(root, { withFileTypes: true });
  const regularFiles = new Set(dirEntries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const manifests = [...regularFiles].filter((name) => /^checksums-[a-z0-9._-]+\.json$/i.test(name)).sort();
  if (manifests.length !== 3) throw new Error(`Expected 3 platform checksum manifests, found ${manifests.length}`);

  const platforms = new Set();
  const verifiedNames = new Set();
  const textCache = new Map();
  for (const manifestName of manifests) {
    let manifest;
    try { manifest = JSON.parse(await fs.readFile(path.join(root, manifestName), 'utf8')); }
    catch (error) { throw new Error(`${manifestName}: invalid JSON (${error.message})`); }
    if (manifest?.schema !== 1 || typeof manifest.platform !== 'string' || !Array.isArray(manifest.files)) {
      throw new Error(`${manifestName}: unsupported manifest format`);
    }
    if (platforms.has(manifest.platform)) throw new Error(`Duplicate platform manifest: ${manifest.platform}`);
    platforms.add(manifest.platform);
    if (!manifest.files.length) throw new Error(`${manifestName}: empty file list`);

    for (const entry of manifest.files) {
      const { name, bytes, sha256: expected } = entry || {};
      if (typeof name !== 'string' || path.basename(name) !== name || !isReleaseAsset(name)) {
        throw new Error(`${manifestName}: unsafe or unsupported filename`);
      }
      if (verifiedNames.has(name)) throw new Error(`Artifact filename collision after merge: ${name}`);
      if (!regularFiles.has(name)) throw new Error(`${manifestName}: downloaded file is missing: ${name}`);
      const filePath = path.join(root, name);
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size !== bytes) throw new Error(`${name}: file size does not match ${manifestName}`);
      const actual = await sha256(filePath);
      if (!/^[a-f0-9]{64}$/i.test(expected || '') || actual !== expected.toLowerCase()) {
        throw new Error(`${name}: SHA-256 does not match ${manifestName}`);
      }
      if (/\.yml$/i.test(name)) textCache.set(name, await fs.readFile(filePath, 'utf8'));
      verifiedNames.add(name);
    }
  }

  assertAssetsAndMetadata([...verifiedNames], textCache);
  return { platforms: [...platforms].sort(), files: verifiedNames.size };
}

async function main(args) {
  const [command, directory, platform] = args;
  if (command === 'create' && directory && platform) {
    const output = await createReleaseManifest(directory, platform);
    console.log(`Created ${path.basename(output)} for release assets.`);
    return;
  }
  if (command === 'verify' && directory) {
    const result = await verifyReleaseArtifacts(directory);
    console.log(`Verified ${result.files} release files across ${result.platforms.length} platform manifests.`);
    return;
  }
  throw new Error('Usage: node tools/release-artifacts.js create <release-dir> <platform> | verify <artifacts-dir>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Release artifact verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
