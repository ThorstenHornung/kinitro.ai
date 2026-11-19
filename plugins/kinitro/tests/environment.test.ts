import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { kinitroPrefixesOf, resolveKinitroTools } from '../hooks/register'

// 0.26.0 (item 4.2.1-4672 P5): one plugin for Prod and Test. The session's environment (default Prod; KINITRO_AI_ENV=TEST or the probe
// action env) decides which own server is used; the tools of the other environment are refused.
// 0.26.1: the bundled server is the OAuth server B; the email-code server (kinitro_device) and the Test server (kinitro_test) are user-added connectors, adopted
const DEV = 'mcp__kinitro_device__'
const DEV_TEST = 'mcp__kinitro_test__'
const B = 'mcp__plugin_kinitro_kinitro__'
const seat = (p: string) => `${p}current-seat`
const DEVICE = { options: { signInPath: 'device' } }

describe('one plugin for Prod and Test (P5)', () => {
  test('default Prod resolves the bundled OAuth server and refuses the Test one', async ($, on) => {
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'E1', tools: [seat(B), seat(DEV_TEST)] })
    const s = await probe($, 'status')
    expect(s).toContain(`kinitro.ai tools: ${B}* (source: bundled plugin server)`)
    expect(JSON.parse(s).details[0]).toBe('kinitro 0.26.2')
    const r: any = await ($ as any).tool.call({ tool: `${DEV_TEST}list-nodes` })
    expect(String(r.deny)).toBe('kinitro.ai Prod is active in this session.')
  })

  test('env test (KINITRO_AI_ENV) adopts the Test server the tester added and refuses the Prod tools', async ($, on) => {
    const w = makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'E2', tools: [seat(B), seat(DEV_TEST), seat('mcp__kinitro_ai__'), 'mcp__kinitro_ai__list-nodes'], env: { KINITRO_AI_ENV: 'TEST' } })
    const s = await probe($, 'status')
    expect(s).toContain(`kinitro.ai tools: ${DEV_TEST}* (source: account connector (adopted))`)
    expect(JSON.parse(s).details[0]).toBe('kinitro TEST 0.26.2')
    const prod: any = await ($ as any).tool.call({ tool: `${B}list-nodes` })
    expect(String(prod.deny)).toBe('kinitro.ai Test is active in this session.')
    const conn: any = await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__list-nodes' })
    expect(String(conn.deny)).toBe('kinitro.ai Test is active in this session.')
    expect(w.sent).toEqual([])
  })

  test('the probe action env switches the session; the switch drops the key, the binding and the approval state', async ($, on) => {
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'E3' })
    w.verbs = { 'open-domain': () => ({ result: JSON.stringify({ status: 'ok', sessionKey: 'kss_env_key_1' }) }) }
    await ($ as any).tool.call({ tool: `${B}open-domain`, domain: 'dom-beta' })
    expect(await probe($, 'status')).toContain('session key held')
    const r: any = await $.tool.call({ tool: 'mcp__kinitro__probe', action: 'env', value: 'test' })
    expect(JSON.parse(String(r.result)).message).toBe('kinitro.ai Test is active in this session. Choose a domain with /kinitro.')
    const s = await probe($, 'status')
    expect(s).not.toContain('session key held')
    expect(s).toContain('session: none yet')
    expect(s).toContain('briefing: MISSING')
    expect(JSON.parse(s).details[0]).toBe('kinitro TEST 0.26.2')
    expect(w.files.get('/w/b/kinitro-ai-domain') ?? '').not.toContain('kss_')
    const back: any = await $.tool.call({ tool: 'mcp__kinitro__probe', action: 'env', value: 'prod' })
    expect(JSON.parse(String(back.result)).message).toBe('kinitro.ai Prod is active in this session. Choose a domain with /kinitro.')
    expect(JSON.parse(await probe($, 'status')).details[0]).toBe('kinitro 0.26.2')
  })

  test('the Test environment shows TEST in the prompt line; Prod shows no environment', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'E4' })
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    await $.tool.call({ tool: 'mcp__kinitro__probe', action: 'env', value: 'test' })
    await $.prompt.submit({ text: 'b', origin: { kind: 'composer' } } as any)
    expect(seen[0]).toMatch(/^\[kinitro 0\.26\.2\] /)
    expect(seen[1]).toMatch(/^\[kinitro TEST 0\.26\.2\] /)
  })

  test('Cowork with Test adopts mcp__kinitro_ai_Test__ and not mcp__kinitro_ai__', async ($, on) => {
    mock.clock(on)
    const names = ['mcp__kinitro_ai__current-seat', 'mcp__kinitro_ai_Test__current-seat', 'mcp__kinitro_ai_Test__list-nodes', 'mcp__kinitro_ai__list-nodes']
    const w = makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'E5', tools: names, env: { CLAUDE_CODE_ENTRYPOINT: 'remote_cowork', CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS: '1', KINITRO_AI_ENV: 'TEST' } })
    const s = await probe($, 'status')
    expect(s).toContain('kinitro.ai tools: mcp__kinitro_ai_Test__* (source: account connector (adopted))')
    const prod: any = await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__list-nodes' })
    expect(String(prod.deny)).toBe('kinitro.ai Test is active in this session.')
    await ($ as any).tool.call({ tool: 'mcp__kinitro_ai_Test__list-nodes' })
    expect(w.prefixes.every((p) => p === 'mcp__kinitro_ai_Test__')).toBe(true)
    expect(w.sent.some((x) => x.verb === 'list-nodes')).toBe(true)
  })

  test('0.26.2: the plugin\'s own control tools mcp__kinitro__probe and mcp__kinitro__wake are no connector, no seat and no second connection', () => {
    const names = ['mcp__kinitro__probe', 'mcp__kinitro__wake', 'mcp__kinitro-ai__probe', seat(B)]
    expect(kinitroPrefixesOf(names)).toEqual({ bundledProd: [B], bundledTest: [], connectorProd: [], connectorTest: [] })
    expect(resolveKinitroTools(names, 'oauth', 'PROD', true)).toEqual({ prefix: B, source: 'bundled' })
    expect(kinitroPrefixesOf(['mcp__kinitro__probe', 'mcp__kinitro__current-seat']).connectorProd).toEqual(['mcp__kinitro__'])   // the connector verbs still count
  })

  test('the lookup helper knows every prefix; the resolver takes the environment into account', () => {
    const names = [seat(DEV), seat(DEV_TEST), seat(B), 'mcp__claude_ai_Kinitro__x', 'mcp__kinitro_ai__x', 'mcp__Kinitro__x', 'mcp__claude_ai_Kinitro_Test__x', 'mcp__Kinitro_Test__x', 'mcp__kinitro_ai_Test__x', 'mcp__kinitro__probe', 'mcp__plugin_other_kinitro_ai__x']
    expect(kinitroPrefixesOf(names)).toEqual({
      bundledProd: [B], bundledTest: [],   // mcp__kinitro__probe is the plugin's own control tool, never a connector
      connectorProd: ['mcp__Kinitro__', 'mcp__claude_ai_Kinitro__', 'mcp__kinitro_device__', 'mcp__kinitro_ai__'],
      connectorTest: ['mcp__kinitro_test__', 'mcp__claude_ai_Kinitro_Test__', 'mcp__kinitro_ai_Test__'],
    })
    expect(resolveKinitroTools(names, 'oauth', 'PROD')).toEqual({ prefix: B, source: 'bundled' })
    expect(resolveKinitroTools(names, 'device', 'PROD', true)).toEqual({ prefix: DEV, source: 'connector-adopted' })
    expect(resolveKinitroTools(names, 'oauth', 'TEST', true)).toEqual({ prefix: DEV_TEST, source: 'connector-adopted' })
    expect(resolveKinitroTools(names.filter((n) => !n.startsWith('mcp__plugin_') && !n.includes('kinitro_test') && !n.includes('kinitro_device')), 'oauth', 'TEST', true)).toEqual({ prefix: 'mcp__Kinitro_Test__', source: 'connector-adopted' })
  })
})
