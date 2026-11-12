#!/usr/bin/env node
// Project sanity checker: syntax-check every JS file, verify key wiring,
// and confirm the demo-critical files are present. Run: npm run check
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

for (const f of markdownFiles) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    if (fence) {
      const close = lines[i].match(/^\s*(`+|~+)\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    const fenceMatch = lines[i].match(/^\s*(?:(?:[-+*]|\d+[.)])\s+)*(?:>\s*)*(`{3,}|~{3,})/);
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length, line: i + 1 };
      continue;
    }

    const plainLine = lines[i].replace(/`+[^`]*`+/g, '');
    for (const match of plainLine.matchAll(/!?(?:\[[^\]]*\])\(([^)]*)\)/g)) {
      const body = match[1].trim();
      const angle = body.match(/^<([^>]*)>/);
      const destination = angle ? angle[1] : body.match(/^[^\s]+/)?.[0];
      if (!destination || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) continue;
      const localPath = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
      if (!localPath) continue;
      const target = path.resolve(path.dirname(f), localPath);
      if (!fs.existsSync(target)) {
        failed++;
        console.error(`✗ broken Markdown link: ${path.relative(ROOT, f)}:${i + 1} → ${destination}`);
      }
    }
  }
  if (fence) {
    failed++;
    console.error(`✗ unclosed Markdown code fence: ${path.relative(ROOT, f)}:${fence.line}`);
  }
}

console.log(`\nchecked ${files.length} JS files and ${markdownFiles.length} Markdown files · ${failed ? `${failed} problem(s)` : 'all good ✅'}`);
process.exit(failed ? 1 : 0);
