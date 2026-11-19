// Guard for item 4.2.1-3696 criterion 3: the plugin names only the organisation and its website as publisher.
// Run from the repository root: node --test tests/publisher.test.mjs
// It sits outside plugins/kinitro, so neither the plugin kit, an install nor the packager carries it.
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
  const manifest = JSON.parse(read('plugins/kinitro/.claude-plugin/plugin.json'));
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

// 0.26.1 (architect decision 15:08): the device endpoint /mcp/device ignores the claude.ai OAuth login, so the bundled Prod server `kinitro`
// is the normal endpoint /mcp with the OAuth client `claude` (no fixed callback port since 0.26.2: on claude.ai a fixed localhost port broke the login). The email-code device
// server is NOT bundled; a user adds it as `kinitro_device`. Pinned here because the plugin test kit loads no JSON import.
test('the plugin source bundles one server, kinitro: the normal endpoint with the OAuth client claude; no device server', () => {
  const raw = read('plugins/kinitro/.mcp.json');
  const servers = JSON.parse(raw).mcpServers;
  assert.deepEqual(Object.keys(servers), ['kinitro']);
  assert.deepEqual(servers.kinitro, { type: 'http', url: 'https://methos.kinitro.ai/mcp' });
  assert.ok(!/\/mcp\/device/.test(raw));
});

// 0.25.5: the Claude desktop app runs no plugin hooks, so the probe never exists there; the command must work without it.
test('/kinitro works without the probe: direct flow, no retry loop, no route question, bare /kinitro and connect mean domain', () => {
  // 0.26.1: assertions follow the 0.26 rewrite of commands/kinitro.md (same rules, new wording)
  const md = read('plugins/kinitro/commands/kinitro.md');
  assert.ok(md.includes('do not wait or retry: go straight to the Direct flow'));
  assert.ok(!md.includes('sleep 3') && !/up to 5 tries/.test(md));
  assert.ok(md.includes('no question about routes'));
  assert.ok(md.includes('mcp__plugin_kinitro_kinitro__<verb>') && md.includes('mcp__claude_ai_Kinitro__'));
  assert.ok(md.includes("Keep the answer's `sessionKey`"));
  assert.ok(md.includes('Never tell the user to run the command again'));
  assert.ok(md.includes('the bare word `domain` or `connect` or no arguments name none'));
  assert.ok(md.includes('"action": "set-domain"'));
});

// 0.25.5: no user-visible text or document sends a person to a localhost callback or tells them to authenticate in /mcp as the way in.
test('the sign-in default is the browser (OAuth) again: auto means oauth, SSH and remote sessions take the device path', () => {
  const src = read('plugins/kinitro/hooks/register.tsx');
  assert.ok(src.includes("return { path: 'oauth', reason: 'default: browser sign-in (OAuth) through the bundled server' }"));
  assert.ok(src.includes("path: 'device', reason: name"));
  assert.ok(!/localhost:\d+/.test(src));
});

// 0.26.1 (J): users cannot know the namespaced command and typing it by hand fails on claude.ai; plain-language requests are the entry point.
test('no user-facing text tells a user to type the namespaced command; the skill triggers on the plain phrasings and points at the command file', () => {
  for (const f of ['plugins/kinitro/README.md', 'plugins/kinitro/.claude-plugin/plugin.json', 'plugins/kinitro/skills/kinitro-attached/SKILL.md', 'plugins/kinitro/skills/kinitro-attached/references/surfaces.md']) {
    assert.ok(!/kinitro(-ai)?:kinitro/.test(read(f)), `${f} names the namespaced command`);
  }
  const skill = read('plugins/kinitro/skills/kinitro-attached/SKILL.md');
  const description = skill.split('\n')[2];
  for (const phrase of ['"kinitro status"', '"connect me to kinitro', '"switch to the Analyst seat"', '"mirror off"', '"refresh kinitro"', '"update the kinitro plugin"']) assert.ok(description.includes(phrase), phrase);
  assert.ok(skill.includes('commands/kinitro.md'));
  assert.ok(read('plugins/kinitro/.claude-plugin/plugin.json').includes('\\"/\\" menu'));
});
