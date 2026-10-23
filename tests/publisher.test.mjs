// Guard for item 4.2.1-3696 criterion 3: the plugin names only the organisation and its website as publisher.
// Run from the repository root: node --test tests/publisher.test.mjs
// It sits outside plugins/kinitro-ai, so neither the plugin kit, an install nor the packager carries it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
// The text a reader sees: HTML tags and Markdown link targets removed.
const rendered = (rel) => read(rel).replace(/<[^>]*>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
const publisher = { name: 'Kinitro Consulting', url: 'https://kinitro.ai' };
const installPath = 'ThorstenHornung/kinitro.ai';

test('the plugin manifest names the organisation as author', () => {
  const manifest = JSON.parse(read('plugins/kinitro-ai/.claude-plugin/plugin.json'));
  assert.deepEqual(manifest.author, publisher);
});

test('the marketplace names the organisation as owner', () => {
  const marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.deepEqual(marketplace.owner, publisher);
});

test('the license and the readme name the organisation', () => {
  assert.ok(read('LICENSE').includes('Copyright (c) 2026 Kinitro Consulting. All rights reserved.'));
  assert.ok(rendered('README.md').includes('© 2026 Kinitro Consulting · kinitro.ai · support@kinitro.ai'));
  assert.ok(rendered('docs/for-partners.md').includes('contact Kinitro Consulting, support@kinitro.ai'));
});

test('no tracked file names the person', () => {
  const files = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
  const self = 'tests/publisher.test.mjs';
  const scanned = [];
  const offenders = [];
  let allowed = 0;
  for (const rel of files) {
    if (rel === 'CHANGELOG.md' || rel === self) continue;
    const buffer = readFileSync(join(root, rel));
    if (buffer.includes(0)) continue; // binary
    scanned.push(rel);
    buffer.toString('utf8').split(/\r?\n/).forEach((line, i) => {
      if (!/hornung/i.test(line)) return;
      if (line.includes(installPath)) allowed += 1;
      else offenders.push(`${rel}:${i + 1}`);
    });
  }
  // Positive control: an empty listing or a broken matcher must go red.
  for (const must of ['README.md', 'LICENSE', 'docs/for-partners.md']) {
    assert.ok(scanned.includes(must), `${must} was not scanned`);
  }
  assert.ok(allowed >= 1, 'the install-path line of the README was not counted');
  assert.deepEqual(offenders, []);
});
