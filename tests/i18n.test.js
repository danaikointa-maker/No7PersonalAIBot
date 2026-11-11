import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LANGS, DICT, DEFAULT_LANG, isSupportedLang, langOf, detectLang, t, applyI18n, viewTitle,
} from '../web/src/core/i18n.js';

/** DOM ปลอมสำหรับ applyI18n (ไม่ต้องพึ่ง jsdom) */
function fakeDom(nodes) {
  return {
    nodes,
    querySelectorAll(selector) {
      const attr = selector.replace(/[[\]]/g, '');
      return nodes.filter((n) => n.attrs?.[attr] !== undefined);
    },
  };
}

function fakeNode({ text = '', placeholder = '', title = '', i18n, i18nPlaceholder, i18nTitle }) {
  const attrs = {};
  if (i18n) attrs['data-i18n'] = i18n;
  if (i18nPlaceholder) attrs['data-i18n-placeholder'] = i18nPlaceholder;
  if (i18nTitle) attrs['data-i18n-title'] = i18nTitle;
  const node = {
    attrs,
    textContent: text,
    dataset: { i18n, i18nPlaceholder, i18nTitle },
    setAttribute(name, value) {
      if (name === 'placeholder') this.placeholder = value;
      if (name === 'title') this.title = value;
    },
    getAttribute(name) { return name === 'placeholder' ? this.placeholder : this.title; },
    placeholder,
    title,
  };
  return node;
}

test('every language has the same keys', () => {
  const th = Object.keys(DICT.th).sort();
  const en = Object.keys(DICT.en).sort();
  assert.deepEqual(en, th, 'คีย์ th/en ต้องตรงกัน');
  assert.ok(th.length >= 50, `ควรมีอย่างน้อย 50 คีย์ (มี ${th.length})`);
  for (const key of th) {
    assert.ok(DICT.th[key].length > 0, `th.${key} ว่าง`);
    assert.ok(DICT.en[key].length > 0, `en.${key} ว่าง`);
  }
});

test('langOf falls back to the default language', () => {
  assert.equal(DEFAULT_LANG, 'th');
  assert.equal(langOf('en'), 'en');
  assert.equal(langOf('th'), 'th');
  assert.equal(langOf('fr'), 'th');
  assert.equal(langOf(undefined), 'th');
  assert.equal(isSupportedLang('en'), true);
  assert.equal(isSupportedLang('ja'), false);
  assert.deepEqual(Object.keys(LANGS), ['th', 'en']);
});

test('detectLang guesses from the browser locale', () => {
  assert.equal(detectLang('en-US'), 'en');
  assert.equal(detectLang('en'), 'en');
  assert.equal(detectLang('th-TH'), 'th');
  assert.equal(detectLang(''), 'th');
  assert.equal(detectLang(undefined), 'th');
});

test('t() translates, interpolates and falls back', () => {
  assert.equal(t('nav.chat', { lang: 'en' }), '💬 Chat');
  assert.equal(t('nav.chat', { lang: 'th' }), '💬 แชท');
  assert.equal(t('nav.chat', { lang: 'xx' }), '💬 แชท', 'ภาษาที่ไม่รองรับ → ไทย');
  assert.equal(t('missing.key'), 'missing.key');
  assert.equal(t('missing.key', { fallback: 'fallback!' }), 'fallback!');
  assert.equal(t('missing.key', { lang: 'en', fallback: 'Thing' }), 'Thing');
  assert.equal(t('tasks.title', { lang: 'en', vars: { x: 1 } }), DICT.en['tasks.title']);
});

test('viewTitle maps each view and degrades gracefully', () => {
  assert.equal(viewTitle('chat', 'en'), 'Chat with No7');
  assert.equal(viewTitle('settings', 'th'), 'ตั้งค่า');
  assert.equal(viewTitle('nope', 'en'), 'nope');
  assert.equal(viewTitle('desktop', 'en'), 'Desktop');
});

test('applyI18n rewrites text, placeholder and title', () => {
  const nodes = [
    fakeNode({ text: '💬 แชท', i18n: 'nav.chat' }),
    fakeNode({ placeholder: 'พิมพ์…', i18nPlaceholder: 'chat.placeholder' }),
    fakeNode({ title: 'พูด', i18nTitle: 'chat.mic' }),
    fakeNode({ text: 'ไม่ถูกแตะ' }),
  ];
  const dom = fakeDom(nodes);
  const count = applyI18n(dom, 'en');
  assert.equal(count, 3);
  assert.equal(nodes[0].textContent, '💬 Chat');
  assert.equal(nodes[1].placeholder, 'Type or talk to No7…');
  assert.equal(nodes[2].title, 'Talk (push to talk)');
  assert.equal(nodes[3].textContent, 'ไม่ถูกแตะ');

  applyI18n(dom, 'th');
  assert.equal(nodes[0].textContent, '💬 แชท');
  assert.equal(nodes[1].placeholder, 'พิมพ์หรือพูดกับ No7…');
  assert.equal(applyI18n(null, 'en'), 0, 'ไม่มี DOM = ไม่ throw');
});
