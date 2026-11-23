import { expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld } from './world'

// 0.27.0, item 4.2.1-4696: the record carries a heartbeat on every user turn, so kinitro-cloud —
// the command-hook plugin for sessions without a hooks module — can tell a live session from a
// leftover record and stay silent while this plugin briefs.
const submit = ($: any, text = 'a') => $.prompt.submit({ text, origin: { kind: 'composer' } } as any)

test('a user turn stamps turnAt in the session record', async ($, on) => {
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9' })
  on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))

  await submit($)

  const rec = JSON.parse(w.files.get('/u/.kinitro-ai/sessions/S9.json')!)
  expect(typeof rec.turnAt).toBe('string')
  expect(rec.turnAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})

test('a copy that briefs nothing writes no heartbeat, so the other plugin may brief instead', async ($, on) => {
  const w = makeWorld(on, {
    files: new Map([
      ['/w/b/.kinitro-ai-domain', 'beta\n'],
      ['/u/.kinitro-ai/sessions/S10.json', JSON.stringify({ sessionId: 'S10', home: '/w/b', domain: 'beta', startedAt: '2026-11-23T09:00:00Z' })],
    ]),
    cwd: '/w/b', root: '/w/b', sid: 'S10',
    tools: [],   // no kinitro connection at all: this copy briefs nothing this turn
  })
  on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))

  await submit($)

  const rec = JSON.parse(w.files.get('/u/.kinitro-ai/sessions/S10.json')!)
  expect(rec.turnAt).toBeUndefined()
})
