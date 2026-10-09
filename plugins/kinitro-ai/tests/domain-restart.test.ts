import { expect, test } from 'claude-code/testing'
import { makeWorld, probe } from './world'

// a fresh module = the hook process restarted after a `cd` (the live bug of 2026-10-09)
test('a session bound to A keeps A when its hook process restarts in a folder with default B', async ($, on) => {
  const w = makeWorld(on, {
    files: new Map([
      ['/u/.kinitro-ai/sessions/S1.json', JSON.stringify({ sessionId: 'S1', home: '/w/a', domain: 'alpha', startedAt: '2026-10-09T10:00:00Z' })],
      ['/w/a/.kinitro-ai-domain', 'alpha\n'],
      ['/w/b/.kinitro-ai-domain', 'beta\n'],
      ['/w/b/.kinitro-ai-briefing.json', JSON.stringify({ raw: '## Persona\nbeta', code: 'x', loadedAt: '2026-10-08T00:00:00Z', domainRef: 'beta' })],
    ]),
    cwd: '/w/b', root: '/w/b', sid: 'S1',
  })
  const st = await probe($, 'reload')
  expect(st).toContain('domain: alpha')
  expect(st).toContain('session home /w/a')
  expect(w.calls.filter((c) => c.endsWith('@beta'))).toEqual([])
  expect(w.files.get('/w/b/.kinitro-ai-domain')).toBe('beta\n')   // the other folder's default is left alone
  expect(w.files.has('/w/a/kinitro-ai.log')).toBe(true)
})
