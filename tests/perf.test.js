// Performance budget gate — กัน bundle/โมดูลบวมเกินโดยไม่รู้ตัว
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  DEFAULT_BUDGET, loadBudget, measureSource, measureDist, checkBudget, formatReport,
} from '../tools/perf.js';

const ROOT = path.resolve(import.meta.dirname, '..');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'no7-perf-'));
}

test('measureSource counts modules, largest file and html size', () => {
  const dir = tmpDir();
  const src = path.join(dir, 'src');
  fs.mkdirSync(path.join(src, 'core'), { recursive: true });
  fs.writeFileSync(path.join(src, 'a.js'), 'x'.repeat(2000));
  fs.writeFileSync(path.join(src, 'core', 'b.js'), 'y'.repeat(500));
  fs.writeFileSync(path.join(src, 'notes.md'), 'ignored');
  const html = path.join(dir, 'index.html');
  fs.writeFileSync(html, '<html></html>');

  const m = measureSource({ dir: src, htmlPath: html });
  assert.equal(m.modules, 2);
  assert.equal(m.totalBytes, 2500);
  assert.equal(m.largest.file.endsWith('a.js'), true);
  assert.equal(m.largestKb, 2);
  assert.equal(m.htmlKb, 0);
});

test('measureDist handles a missing build and reports gzip sizes', () => {
  assert.deepEqual(measureDist({ dir: path.join(tmpDir(), 'nope') }), {
    built: false, jsFiles: 0, totalGzipBytes: 0, totalGzipKb: 0, files: [],
  });

  const dir = tmpDir();
  const code = 'console.log("hi");'.repeat(100);
  fs.writeFileSync(path.join(dir, 'main-abc.js'), code);
  fs.writeFileSync(path.join(dir, 'avatar-def.js'), 'x'.repeat(100));
  fs.writeFileSync(path.join(dir, 'main.css'), '.a{color:red}');
  const d = measureDist({ dir });
  assert.equal(d.built, true);
  assert.equal(d.jsFiles, 2);
  assert.equal(d.allFiles, 3);
  assert.equal(d.mainFile, 'main-abc.js');
  assert.equal(d.mainGzipKb, Math.round((zlib.gzipSync(Buffer.from(code), { level: 9 }).length / 1024) * 10) / 10);
  assert.equal(d.cssFiles, 1);
  assert.ok(d.cssGzipKb >= 0);
});

test('checkBudget passes and fails at the right limits', () => {
  const source = { modules: 10, totalKb: 100, largestKb: 50, htmlKb: 20, largest: null };
  const dist = { built: false };
  const budget = { source: { maxFileKb: 60, maxTotalKb: 200, maxModules: 20, maxHtmlKb: 30 }, dist: DEFAULT_BUDGET.dist };

  const ok = checkBudget({ source, dist, budget });
  assert.equal(ok.ok, true);
  assert.equal(ok.skippedDist, true);

  const tooBig = checkBudget({ source: { ...source, largestKb: 99 }, dist, budget });
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.checks.find((c) => c.name.includes('ไฟล์ใหญ่สุด')).ok, false);

  const withDist = checkBudget({
    source,
    dist: { built: true, jsFiles: 2, allFiles: 3, mainGzipKb: 500, totalGzipKb: 600, cssGzipKb: 10, files: [] },
    budget,
  });
  assert.equal(withDist.ok, false);
  assert.equal(withDist.checks.filter((c) => !c.ok).length, 2, 'bundle หลัก + รวม ต้องเกิน');
});

test('loadBudget merges partial files and survives invalid JSON', () => {
  const dir = tmpDir();
  const partial = path.join(dir, 'budget.json');
  fs.writeFileSync(partial, JSON.stringify({ source: { maxModules: 3 } }));
  const merged = loadBudget(partial);
  assert.equal(merged.source.maxModules, 3);
  assert.equal(merged.source.maxFileKb, DEFAULT_BUDGET.source.maxFileKb);
  assert.equal(merged.dist.maxMainGzipKb, DEFAULT_BUDGET.dist.maxMainGzipKb);

  const broken = path.join(dir, 'broken.json');
  fs.writeFileSync(broken, '{not json');
  assert.deepEqual(loadBudget(broken), DEFAULT_BUDGET);
});

test('formatReport prints a table and the verdict', () => {
  const result = checkBudget({
    source: { modules: 1, totalKb: 1, largestKb: 1, htmlKb: 1, largest: { file: 'a.js' } },
    dist: { built: false },
    budget: { source: { maxFileKb: 10, maxTotalKb: 10, maxModules: 10, maxHtmlKb: 10 }, dist: DEFAULT_BUDGET.dist },
  });
  const text = formatReport(result);
  assert.match(text, /Performance budget/);
  assert.match(text, /✅ อยู่ใน budget ทั้งหมด/);
  assert.match(text, /a\.js/);
  assert.match(text, /ข้ามการวัด bundle/);
});

test('the real project stays within its committed budget', () => {
  const budget = loadBudget(path.join(ROOT, 'perf-budget.json'));
  const result = checkBudget({
    source: measureSource({
      dir: path.join(ROOT, 'web', 'src'),
      htmlPath: path.join(ROOT, 'web', 'index.html'),
    }),
    budget,
  });
  assert.equal(result.ok, true, formatReport(result));
  assert.ok(result.source.modules >= 30, `ควรมีโมดูลจริง (ได้ ${result.source.modules})`);
  assert.ok(result.source.totalKb > 100);
});
