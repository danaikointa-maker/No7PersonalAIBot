import test from 'node:test';
import assert from 'node:assert/strict';
import { healthUiCopy, healthSuggestion } from '../web/src/core/health-i18n.js';

test('health card copy switches between Thai and English', () => {
  assert.equal(healthUiCopy('th').title, 'สุขภาพข้อมูล');
  assert.equal(healthUiCopy('en').title, 'Data health');
  assert.equal(healthUiCopy('en').issues['overdue-tasks'], 'Overdue tasks');
  assert.equal(healthUiCopy('th').undo, '↶ ย้อนกลับการล้าง');
});

test('suggestions translate known prompts and preserve unknown text', () => {
  assert.equal(healthSuggestion('งานที่ยังไม่ได้กำหนดวันครบกำหนด', 'en'), 'Add due dates to active tasks where useful.');
  assert.equal(healthSuggestion('custom', 'en'), 'custom');
  assert.equal(healthSuggestion('custom', 'th'), 'custom');
});
