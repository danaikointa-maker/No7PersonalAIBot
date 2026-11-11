import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomically } from '../server/atomic-json.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'no7-atomic-'));
}

test('atomic JSON write replaces an existing file with complete data', () => {
  const dir = tempDir();
  try {
    const target = path.join(dir, 'state.json');
    fs.writeFileSync(target, '{"old":true}');
    assert.equal(writeJsonAtomically(target, { next: ['complete'] }), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { next: ['complete'] });
    assert.deepEqual(fs.readdirSync(dir), ['state.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('atomic JSON rename failure preserves previous file and cleans temporary data', () => {
  const dir = tempDir();
  try {
    const target = path.join(dir, 'state.json');
    fs.writeFileSync(target, '{"old":true}');
    const fsApi = Object.create(fs);
    fsApi.renameSync = () => { throw new Error('rename failed'); };
    assert.equal(writeJsonAtomically(target, { next: true }, fsApi), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { old: true });
    assert.deepEqual(fs.readdirSync(dir), ['state.json']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
