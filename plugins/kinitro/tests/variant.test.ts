import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { activeIn, AUTH_HINT, devicePrefixFor, resolveKinitroTools, secondConnections } from '../hooks/register'
import { VARIANT } from '../hooks/variant'
import { makeWorld, probe } from './world'

// Build variant (PO 21.10.2026): one source, two plugins. The source carries the Production values; the Test build
// (kinitro-ai-test) is written by the packager. These tests pin the Production names and the activation rule.
describe('build variant', () => {
  test('the source is the Production build with the names of 0.24.1 and, from 0.24.2, the PROD marker', () => {
    expect(VARIANT).toEqual({ name: 'kinitro',   // 0.26.1 rename; the files prefix keeps .kinitro-ai so existing local state carries over
       env: 'PROD', showEnv: true, downloadBase: 'https://methos.kinitro.ai/download/plugins/claude/', files: '.kinitro-ai', command: 'kinitro' })
    expect(AUTH_HINT).toBe('Type /kinitro domain to sign in')
  })
  test('activation (R1): both builds on by default; KINITRO_AI_ENV switches one off', () => {
    expect(activeIn('PROD', undefined)).toBe(true)
    expect(activeIn('PROD', '')).toBe(true)
    expect(activeIn('PROD', 'prod')).toBe(true)
    expect(activeIn('PROD', ' test ')).toBe(false)
    expect(activeIn('TEST', undefined)).toBe(true)
    expect(activeIn('TEST', '')).toBe(true)
    expect(activeIn('TEST', ' prod ')).toBe(false)
    expect(activeIn('TEST', 'Test')).toBe(true)
  })
  test('the other build\'s server is no second connection; a user server and the connector still are', () => {
    const T = 'mcp__plugin_kinitro-ai-test_kinitro_ai__current-seat'
    expect(secondConnections([T, 'mcp__plugin_kinitro_kinitro_ai__current-seat'])).toEqual([])
    expect(secondConnections([T, 'mcp__kinitro_ai__current-seat', 'mcp__claude_ai_Kinitro__current-seat'])).toEqual(['mcp__kinitro_ai__', 'mcp__claude_ai_Kinitro__'])
    expect(resolveKinitroTools([T])?.source).toBe('other')   // never 'bundled': the Production build does not take the Test server
  })
  test('Production names of the local files are unchanged; the prompt line carries no environment for Prod (P5)', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SV' })
    expect(await probe($, 'reload')).toContain('domain: beta')
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0]).toMatch(/^\[kinitro 0.27.6\] .*context /)   // 0.26.0 (P5): Prod shows no environment; Test shows [kinitro TEST 0.26.3]
    expect(w.files.has('/u/.kinitro-ai/sessions/SV.json')).toBe(true)
    expect(w.files.has('/w/b/kinitro-ai.log')).toBe(true)
  })
  // Item 4.2.1-3910 (Architect ruling Q4, 25.10.2026): each build's device prefix matches only its own device server; the
  // Production device URL is pinned in tests/publisher.test.mjs (the kit loads no JSON import); the Test build's URL is
  // proven by the Novatect packager test only.
  test('0.27.0: the device server is user-added and never plugin-scoped; the bundled server is the OAuth server kinitro_ai', () => {
    expect(devicePrefixFor('kinitro')).toBe('mcp__kinitro_device__')
    expect(devicePrefixFor('kinitro-ai-test')).toBe('mcp__kinitro_device__')
    const own = (prefix: string, name: string) => name.startsWith(prefix)
    expect(own(devicePrefixFor('kinitro'), 'mcp__plugin_kinitro_kinitro_ai__current-seat')).toBe(false)
    expect(own(devicePrefixFor('kinitro'), 'mcp__kinitro_device__current-seat')).toBe(true)
  })
})
