#!/usr/bin/env node
// Project sanity checker: syntax-check every JS file, verify key wiring,
// and confirm the demo-critical files are present. Run: npm run check
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { inspectMarkdownFiles } from './markdown-check.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', 'release', '.git', 'android', 'ios']);
const files = [];
const markdownFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else {
      if (/\.(c|m)?js$/.test(entry.name)) files.push(p);
      if (/\.md$/i.test(entry.name)) markdownFiles.push(p);
    }
  }
}
walk(ROOT);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`✗ syntax: ${path.relative(ROOT, f)}\n${e.stderr?.toString() || e.message}`);
  }
}

const required = [
  'package.json',
  'vite.config.js',
  'capacitor.config.json',
  'web/index.html',
  'web/overlay.html',
  'web/src/main.js',
  'web/src/core/state.js',
  'web/src/core/memory.js',
  'web/src/core/tools.js',
  'web/src/core/ai-providers.js',
  'web/src/core/voice.js',
  'web/src/core/personas.js',
  'web/src/ui/avatar.js',
  'desktop/main.js',
  'desktop/preload.cjs',
  'server/server.js',
  'docs/ARCHITECTURE.md',
  'docs/BUILD.md',
];
for (const r of required) {
  if (!fs.existsSync(path.join(ROOT, r))) {
    failed++;
    console.error(`✗ missing: ${r}`);
  }
}

for (const issue of inspectMarkdownFiles(ROOT, markdownFiles)) {
  failed++;
  console.error(`✗ ${issue.message}: ${issue.file}:${issue.line}`);
}

console.log(`\nchecked ${files.length} JS files and ${markdownFiles.length} Markdown files · ${failed ? `${failed} problem(s)` : 'all good ✅'}`);
process.exit(failed ? 1 : 0);
