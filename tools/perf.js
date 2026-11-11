#!/usr/bin/env node
// Performance budget — วัดขนาดจริง (ซอร์ส + bundle ที่ build แล้ว) แล้วเทียบเพดาน
// ใช้ใน CI และในเครื่อง: `npm run perf`
//
// หลักการ: ตัวเลขต้องวัดได้จริง ไม่ใช่ความรู้สึก — ถ้าเกิน budget ให้ exit 1 พร้อมบอกว่าอะไรเกิน
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_FILE = path.join(ROOT, 'perf-budget.json');
const SRC_DIR = path.join(ROOT, 'web', 'src');
const DIST_ASSETS = path.join(ROOT, 'dist', 'assets');

export const DEFAULT_BUDGET = {
  source: {
    maxFileKb: 120,        // ไฟล์เดี่ยวใหญ่สุด (KB)
    maxTotalKb: 700,       // รวมทุกไฟล์ใน web/src
    maxModules: 60,        // จำนวนโมดูล JS
    maxHtmlKb: 80,         // web/index.html
  },
  dist: {
    maxMainGzipKb: 150,    // bundle หลัก (gzip)
    maxTotalGzipKb: 300,   // ทุก asset .js (gzip)
    maxCssGzipKb: 40,
    maxFiles: 60,
  },
};

export function loadBudget(file = BUDGET_FILE) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      source: { ...DEFAULT_BUDGET.source, ...(raw.source || {}) },
      dist: { ...DEFAULT_BUDGET.dist, ...(raw.dist || {}) },
    };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

/** วัดซอร์สใน web/src */
export function measureSource({ dir = SRC_DIR, htmlPath = path.join(ROOT, 'web', 'index.html') } = {}) {
  const files = walk(dir).filter((f) => f.endsWith('.js'));
  const sizes = files.map((f) => ({
    file: path.relative(ROOT, f),
    bytes: fs.statSync(f).size,
  })).sort((a, b) => b.bytes - a.bytes);
  const totalBytes = sizes.reduce((s, x) => s + x.bytes, 0);
  const htmlBytes = (() => { try { return fs.statSync(htmlPath).size; } catch { return 0; } })();
  return {
    modules: files.length,
    totalBytes,
    totalKb: kb(totalBytes),
    largest: sizes[0] || null,
    largestKb: sizes[0] ? kb(sizes[0].bytes) : 0,
    htmlKb: kb(htmlBytes),
    files: sizes,
  };
}

/** วัด dist/assets (ต้อง `npm run build` ก่อน) */
export function measureDist({ dir = DIST_ASSETS } = {}) {
  if (!fs.existsSync(dir)) return { built: false, jsFiles: 0, totalGzipBytes: 0, totalGzipKb: 0, files: [] };
  const files = fs.readdirSync(dir);
  const jsFiles = files.filter((f) => f.endsWith('.js'));
  const cssFiles = files.filter((f) => f.endsWith('.css'));
  const measured = [];
  for (const f of jsFiles) {
    const buf = fs.readFileSync(path.join(dir, f));
    measured.push({ file: f, rawBytes: buf.length, gzipBytes: zlib.gzipSync(buf, { level: 9 }).length });
  }
  measured.sort((a, b) => b.gzipBytes - a.gzipBytes);
  let cssGzip = 0;
  for (const f of cssFiles) cssGzip += zlib.gzipSync(fs.readFileSync(path.join(dir, f)), { level: 9 }).length;
  const totalGzipBytes = measured.reduce((s, x) => s + x.gzipBytes, 0);
  return {
    built: true,
    jsFiles: jsFiles.length,
    cssFiles: cssFiles.length,
    files: measured.map((m) => ({ file: m.file, rawKb: kb(m.rawBytes), gzipKb: kb(m.gzipBytes) })),
    mainGzipKb: measured.length ? kb(measured[0].gzipBytes) : 0,
    mainFile: measured[0]?.file || '',
    totalGzipKb: kb(totalGzipBytes),
    cssGzipKb: kb(cssGzip),
    allFiles: files.length,
  };
}

/** เทียบกับ budget → { ok, checks: [{name, value, limit, unit, ok}] } */
export function checkBudget({ source, dist, budget = DEFAULT_BUDGET } = {}) {
  const src = source || measureSource();
  const d = dist || measureDist();
  const checks = [
    { name: 'source: ไฟล์ใหญ่สุด', value: src.largestKb, limit: budget.source.maxFileKb, unit: 'KB' },
    { name: 'source: รวมทุกโมดูล', value: src.totalKb, limit: budget.source.maxTotalKb, unit: 'KB' },
    { name: 'source: จำนวนโมดูล', value: src.modules, limit: budget.source.maxModules, unit: 'ไฟล์' },
    { name: 'source: index.html', value: src.htmlKb, limit: budget.source.maxHtmlKb, unit: 'KB' },
  ];
  if (d.built) {
    checks.push(
      { name: 'dist: bundle หลัก (gzip)', value: d.mainGzipKb, limit: budget.dist.maxMainGzipKb, unit: 'KB' },
      { name: 'dist: JS รวม (gzip)', value: d.totalGzipKb, limit: budget.dist.maxTotalGzipKb, unit: 'KB' },
      { name: 'dist: CSS (gzip)', value: d.cssGzipKb, limit: budget.dist.maxCssGzipKb, unit: 'KB' },
      { name: 'dist: จำนวนไฟล์', value: d.allFiles, limit: budget.dist.maxFiles, unit: 'ไฟล์' },
    );
  }
  return {
    ok: checks.every((c) => c.value <= c.limit),
    skippedDist: !d.built,
    checks: checks.map((c) => ({ ...c, ok: c.value <= c.limit })),
    source: src,
    dist: d,
  };
}

export function formatReport(result) {
  const lines = ['📦 Performance budget', ''];
  lines.push('| รายการ | วัดได้ | เพดาน | ผล |');
  lines.push('|---|---:|---:|:--:|');
  for (const c of result.checks) {
    lines.push(`| ${c.name} | ${c.value} ${c.unit} | ${c.limit} ${c.unit} | ${c.ok ? '✅' : '❌'} |`);
  }
  if (result.skippedDist) lines.push('', 'ℹ️ ยังไม่มี dist/ — ข้ามการวัด bundle (รัน `npm run build` เพื่อวัดจริง)');
  if (result.source?.largest) lines.push('', `ไฟล์ใหญ่สุด: ${result.source.largest.file} (${result.source.largestKb} KB)`);
  lines.push('', result.ok ? '✅ อยู่ใน budget ทั้งหมด' : '❌ มีรายการเกิน budget');
  return lines.join('\n');
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkBudget({ budget: loadBudget() });
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}
