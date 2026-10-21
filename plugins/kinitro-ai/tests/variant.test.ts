import { describe, expect, test } from 'claude-code/testing'
import { activeIn, AUTH_HINT, inactiveText, resolveKinitroTools, secondConnections } from '../hooks/register'
import { VARIANT } from '../hooks/variant'
import { makeWorld, probe } from './world'

// Build variant (PO 21.10.2026): one source, two plugins. The source carries the Production values; the Test build
// (kinitro-ai-test) is written by the packager. These tests pin the Production names and the activation rule.
describe('build variant', () => {
  test('the source is the Production build with the names of 0.24.1', () => {
    expect(VARIANT).toEqual({ name: 'kinitro-ai', env: 'PROD', showEnv: false, downloadBase: 'https://methos.kinitro.ai/download/plugins/claude/', files: '.kinitro-ai', command: 'kinitro' })
    expect(AUTH_HINT).toBe('Open /mcp, choose plugin:kinitro-ai:kinitro_ai and Authenticate')
  })
  test('activation: PROD unless KINITRO_AI_ENV says TEST; TEST only then', () => {
    expect(activeIn('PROD', undefined)).toBe(true)
    expect(activeIn('PROD', '')).toBe(true)
    expect(activeIn('PROD', 'prod')).toBe(true)
    expect(activeIn('PROD', ' test ')).toBe(false)
    expect(activeIn('TEST', undefined)).toBe(false)
    expect(activeIn('TEST', 'PROD')).toBe(false)
    expect(activeIn('TEST', 'Test')).toBe(true)
    expect(inactiveText('kinitro-ai-test', 'TEST', undefined)).toBe('kinitro-ai-test (TEST) is off in this session (KINITRO_AI_ENV=unset); use the kinitro.ai Production tools of this session, or start a session with KINITRO_AI_ENV=TEST.')
  })
  test('the other build\'s server is no second connection; a user server and the connector still are', () => {
    const T = 'mcp__plugin_kinitro-ai-test_kinitro_ai__current-seat'
    expect(secondConnections([T, 'mcp__plugin_kinitro-ai_kinitro_ai__current-seat'])).toEqual([])
    expect(secondConnections([T, 'mcp__kinitro_ai__current-seat', 'mcp__claude_ai_Kinitro__current-seat'])).toEqual(['mcp__kinitro_ai__', 'mcp__claude_ai_Kinitro__'])
    expect(resolveKinitroTools([T])?.source).toBe('other')   // never 'bundled': the Production build does not take the Test server
  })
  test('Production names of the local files and the prompt line are unchanged', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SV' })
    expect(await probe($, 'reload')).toContain('domain: beta')
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0]).toMatch(/^\[kinitro-ai 0\.24\.1\] context /)
    expect(w.files.has('/u/.kinitro-ai/sessions/SV.json')).toBe(true)
    expect(w.files.has('/w/b/kinitro-ai.log')).toBe(true)
  })
})
