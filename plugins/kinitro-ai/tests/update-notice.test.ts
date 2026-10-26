import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { compareVersions, publishedVersion, updateNotice } from '../hooks/register'
import { makeWorld, probe } from './world'

// Update notice (PO 2026-10-16): at the first prompt the plugin reads the published marketplace.json on the download page
// (at most once per 24 h, 2.5 s, silent on error) and tells a newer version in one line.
const STATE = '/w/b/.kinitro-ai-state.json'
const PAGE = 'https://methos.kinitro.ai/download/plugins/claude/'
const market = (version: string) => JSON.stringify({ name: 'kinitro-ai', plugins: [{ name: 'kinitro-ai', source: './plugins/kinitro-ai', version }] })
const mk = (on: any, answer: () => unknown, files: [string, string][] = [], turns = 0) => {
  const seen: string[] = [], fetched: string[] = []
  on('session.turns', async () => ({ value: turns }))
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
  on('http.fetch', async (_$: any, e: any) => { fetched.push(e.url); return { value: await answer() } })
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n'], ...files]), cwd: '/w/b', root: '/w/b', sid: 'S9' })
  return { w, seen, fetched }
}
const ok = (version: string) => () => ({ status: 200, ok: true, headers: {}, text: market(version) })
const start = ($: any) => $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)

describe('update notice', () => {
  test('compare and parse', async () => {
    expect(compareVersions('0.23.3', '0.23.2')).toBeGreaterThan(0)
    expect(compareVersions('0.23.2', '0.23.2')).toBe(0)
    expect(compareVersions('0.9.9', '0.23.1')).toBeLessThan(0)
    expect(compareVersions('1.0', '0.99.99')).toBeGreaterThan(0)
    expect(publishedVersion(market('0.24.0'))).toBe('0.24.0')
    expect(publishedVersion(JSON.stringify({ plugins: [{ name: 'other', version: '9.0.0' }] }))).toBeUndefined()
    expect(updateNotice('0.23.2', '0.23.2', PAGE)).toBeUndefined()
  })
  test('higher: one line at the first prompt, from the download page', async ($, on) => {
    const { seen, fetched } = mk(on, ok('0.26.0'))
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(fetched).toEqual([PAGE + 'marketplace.json'])
    expect(seen[0]).toContain(`kinitro-ai 0.26.0 is available (you run 0.25.8). Claude Code: run /kinitro update. Cowork/Desktop: re-upload the plugin from ${PAGE}.`)
  })
  test('equal: no notice', async ($, on) => {
    const { seen, fetched } = mk(on, ok('0.23.2'))
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(fetched.length).toBe(1)
    expect(seen[0]).not.toContain('is available')
  })
  test('lower: no notice', async ($, on) => {
    const { seen, fetched } = mk(on, ok('0.22.0'))
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(fetched.length).toBe(1)
    expect(seen[0]).not.toContain('is available')
  })
  test('fetch failure: no notice, the prompt goes on, the failure is logged', async ($, on) => {
    const { w, seen } = mk(on, () => { throw new Error('ENOTFOUND methos.kinitro.ai') })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(seen.length).toBe(1)
    expect(seen[0]).not.toContain('is available')
    expect(w.files.get('/w/b/kinitro-ai.log')).toMatch(/update check failed: /)
  })
  test('no answer within the deadline: the prompt is not blocked, no notice, logged as timeout', async ($, on) => {
    const waits: number[] = []
    on('clock.sleep', async (_$: any, e: any) => { waits.push(e.ms); return { value: undefined } })   // the deadline passes at once
    const { w, seen } = mk(on, () => new Promise(() => {}))
    await probe($, 'reload')
    const r = await Promise.race([$.prompt.submit({ text: 'a' } as any).then(() => 'returned'), new Promise((res) => setTimeout(() => res('blocked'), 2000))])
    expect(r).toBe('returned')
    expect(waits).toContain(2500)
    expect(seen[0]).not.toContain('is available')
    expect(w.files.get('/w/b/kinitro-ai.log')).toMatch(/update check failed: timeout after 2500 ms/)
  })
  test('HTTP error status: no notice, logged', async ($, on) => {
    const { w, seen } = mk(on, () => ({ status: 404, ok: false, headers: {}, text: 'not found' }))
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(seen[0]).not.toContain('is available')
    expect(w.files.get('/w/b/kinitro-ai.log')).toMatch(/update check failed: HTTP 404/)
  })
  test('at most once per 24 h: a recent check is not repeated, its version still gives the notice', async ($, on) => {
    const { seen, fetched } = mk(on, ok('0.30.0'), [[STATE, JSON.stringify({ updateCheckedAt: Date.now() - 3600_000, updateLatest: '0.26.0' })]])
    await start($)
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(fetched).toEqual([])
    expect(seen[0]).toContain('kinitro-ai 0.26.0 is available')
  })
  test('a check older than 24 h fetches again and stores the time and version', async ($, on) => {
    const { w, fetched } = mk(on, ok('0.23.2'), [[STATE, JSON.stringify({ updateCheckedAt: Date.now() - 25 * 3600_000, updateLatest: '0.24.0' })]])
    await start($)
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(fetched.length).toBe(1)
    const st = JSON.parse(w.files.get(STATE)!)
    expect(st.updateLatest).toBe('0.23.2')
    expect(Math.abs(Date.now() - st.updateCheckedAt)).toBeLessThan(3600_000)
  })
  test('not at a later prompt', async ($, on) => {
    const { seen, fetched } = mk(on, ok('0.26.0'), [], 3)
    await probe($, 'reload')
    await $.prompt.submit({ text: 'a' } as any)
    expect(fetched).toEqual([])
    expect(seen[0]).not.toContain('is available')
  })
})
