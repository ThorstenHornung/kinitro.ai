import { expect, test } from 'claude-code/testing'
import { makeWorld, probe } from './world'

// one module for the whole file: a running session (no restart)
test('a new session in folder B gets B; a later cwd change to a folder with default C keeps B', async ($, on) => {
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n'], ['/w/c/.kinitro-ai-domain', 'gamma\n']]), cwd: '/w/b', root: '/w/b', sid: 'S2' })

  expect(await probe($, 'reload')).toContain('domain: beta')
  const rec = JSON.parse(w.files.get('/u/.kinitro-ai/sessions/S2.json')!)
  expect(rec.home).toBe('/w/b')
  expect(rec.domain).toBe('beta')

  w.cwd = '/w/c'; w.root = '/w/c'   // a `cd` moved the session (worst case: the root too)
  const st = await probe($, 'reload')
  expect(st).toContain('domain: beta')
  expect(st).not.toContain('domain: gamma')
  expect(w.calls.filter((c) => c.endsWith('@gamma'))).toEqual([])
  expect([...w.files.keys()].filter((f) => f.startsWith('/w/c/') && f !== '/w/c/.kinitro-ai-domain')).toEqual([])   // no files in the new folder
  expect(w.files.get('/w/b/kinitro-ai.log')).toMatch(/working folder changed to \/w\/c \(folder default gamma\); the session keeps beta/)
})
