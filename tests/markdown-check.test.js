import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectMarkdownFiles } from '../tools/markdown-check.js';

async function markdownFixture(t, content, name = 'README.md') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'no7-markdown-check-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return { root, file };
}

test('Markdown checker accepts valid relative/root links and ignores external, inline-code, and fenced examples', async (t) => {
  const { root, file } = await markdownFixture(t, [
    '[relative](docs/setup.md)',
    '[root-relative](/docs/setup.md)',
    '[external](https://example.com/docs)',
    '[anchor](#usage)',
    'Inline code: `[example](missing.md)`',
    '```markdown',
    '[fenced example](missing.md)',
    '```',
    '1. ```bash',
    '   [list example](missing.md)',
    '   ```',
  ].join('\n'));
  await fs.mkdir(path.join(root, 'docs'));
  await fs.writeFile(path.join(root, 'docs/setup.md'), '# Setup');

  assert.deepEqual(inspectMarkdownFiles(root, [file]), []);
});

test('Markdown checker reports missing links and images with source line numbers', async (t) => {
  const { root, file } = await markdownFixture(t, [
    'Intro',
    '[broken](docs/missing.md)',
    '![missing image](assets/no.svg)',
  ].join('\n'));

  assert.deepEqual(inspectMarkdownFiles(root, [file]), [
    { file: 'README.md', line: 2, message: 'broken Markdown link: docs/missing.md' },
    { file: 'README.md', line: 3, message: 'broken Markdown link: assets/no.svg' },
  ]);
});

test('Markdown checker requires closing fences at least as long as the opener', async (t) => {
  const { root, file } = await markdownFixture(t, [
    '````md',
    '[not checked](missing.md)',
    '```',
  ].join('\n'));

  assert.deepEqual(inspectMarkdownFiles(root, [file]), [
    { file: 'README.md', line: 1, message: 'unclosed Markdown code fence' },
  ]);
});

test('Markdown checker reports malformed percent-encoding instead of crashing', async (t) => {
  const { root, file } = await markdownFixture(t, '[bad](docs/%E0%A4%A.md)');

  assert.deepEqual(inspectMarkdownFiles(root, [file]), [
    { file: 'README.md', line: 1, message: 'invalid URL encoding in Markdown link: docs/%E0%A4%A.md' },
  ]);
});
