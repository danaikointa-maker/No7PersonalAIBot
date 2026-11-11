import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOM, escapeCsv, toCsv, dateStamp, datedFilename,
  weeklyCsv, digestCsv, reportMarkdown, downloadText,
} from '../web/src/core/report-export.js';
import { buildWeekly } from '../web/src/core/weekly.js';
import { buildDigest } from '../web/src/core/digest.js';

test('escapeCsv quotes commas, quotes and newlines', () => {
  assert.equal(escapeCsv('ธรรมดา'), 'ธรรมดา');
  assert.equal(escapeCsv('a,b'), '"a,b"');
  assert.equal(escapeCsv('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsv('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCsv(null), '');
  assert.equal(escapeCsv(0), '0');
});

test('escapeCsv neutralises spreadsheet formulas', () => {
  assert.equal(escapeCsv('=1+1'), "'=1+1");
  assert.equal(escapeCsv('@cmd'), "'@cmd");
  assert.equal(escapeCsv('-2'), "'-2");
});

test('toCsv supports objects with a header and arrays', () => {
  const csv = toCsv([{ a: 1, b: 'x,y' }], { header: ['A', 'B'] });
  assert.equal(csv, 'A,B\r\n1,"x,y"');
  assert.equal(toCsv([['a', 'b'], [1, 2]]), 'a,b\r\n1,2');
});

test('dateStamp and datedFilename use the local date', () => {
  const ts = new Date(2026, 10, 10, 15, 30).getTime();
  assert.equal(dateStamp(ts), '2026-11-10');
  assert.equal(datedFilename('No7 Weekly', 'CSV', ts), 'no7-weekly-2026-11-10.csv');
  assert.equal(datedFilename('', '.md', ts), 'report-2026-11-10.md');
});

test('weeklyCsv starts with BOM, has Thai headers and includes metric + section rows', () => {
  const weekly = buildWeekly({
    tasks: [{ id: 't1', title: 'งานเสร็จ', done: true, updatedAt: new Date().toISOString(), priority: 2 }],
    events: [], facts: [], samples: [], now: Date.now(), lang: 'th',
  });
  const csv = weeklyCsv(weekly);
  assert.ok(csv.startsWith(BOM), 'มี BOM');
  assert.match(csv, /^﻿หมวด,รายการ,รายละเอียด/);
  assert.match(csv, /สรุปตัวเลข,งานที่ทำเสร็จ,1/);
  assert.ok(csv.split('\r\n').length > 5);
  assert.ok(!csv.includes('undefined'));
});

test('weeklyCsv quotes a task title containing a comma', () => {
  const weekly = { counts: {}, sections: [{ title: 'งาน', items: [{ label: 'ซื้อนม, ไข่' }] }] };
  assert.match(weeklyCsv(weekly), /"ซื้อนม, ไข่"/);
});

test('digestCsv carries the headline and section items', () => {
  const digest = buildDigest({ tasks: [], events: [], memories: [], now: Date.now(), lang: 'th' });
  const csv = digestCsv(digest);
  assert.ok(csv.startsWith(BOM));
  assert.match(csv, /ภาพรวม,หัวข้อ,/);
});

test('reportMarkdown renders title, counts table and sections', () => {
  const weekly = buildWeekly({
    tasks: [{ id: 't1', title: 'งานเสร็จ', done: true, updatedAt: new Date().toISOString(), priority: 2 }],
    events: [], facts: [], samples: [], now: Date.now(), lang: 'th',
  });
  const md = reportMarkdown(weekly, { kind: 'weekly', lang: 'th', now: Date.now() });
  assert.match(md, /^# รายงานสัปดาห์/);
  assert.match(md, /\| ตัวชี้วัด \| ค่า \|/);
  assert.match(md, /เสร็จแล้ว \| 1/);
  assert.match(md, /^## /m);
  assert.match(md, /_No7 · สร้างเมื่อ/);
});

test('reportMarkdown supports English and digest mode', () => {
  const digest = buildDigest({ tasks: [], events: [], memories: [], now: Date.now(), lang: 'en' });
  const md = reportMarkdown(digest, { kind: 'digest', lang: 'en' });
  assert.match(md, /^# Today/);
  assert.match(md, /generated/);
  assert.ok(!md.includes('ตัวชี้วัด'));
});

test('downloadText returns false without a browser environment', () => {
  assert.equal(downloadText('x.txt', 'hello'), false);
});
