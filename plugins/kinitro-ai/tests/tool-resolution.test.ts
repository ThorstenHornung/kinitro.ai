import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { AUTH_HINT, resolveKinitroTools } from '../hooks/register'
import { makeWorld, probe } from './world'

const B = 'mcp__plugin_kinitro-ai_kinitro_ai__'
const U = 'mcp__kinitro_ai__'
const C = 'mcp__claude_ai_Kinitro__'
const seat = (p: string) => `${p}current-seat`

describe('which kinitro.ai tools the plugin uses', () => {
  test('the bundled server wins over a user server and the claude.ai connector, whatever the order', () => {
    expect(resolveKinitroTools([seat(C), seat(U), seat(B)])).toEqual({ prefix: B, source: 'bundled' })
    expect(resolveKinitroTools([seat(B), seat(U), seat(C)])).toEqual({ prefix: B, source: 'bundled' })
  })
  test('the plugin\'s server under another server name still counts as bundled', () => {
    expect(resolveKinitroTools([seat(U), 'mcp__plugin_kinitro-ai_methos__current-seat'])).toEqual({ prefix: 'mcp__plugin_kinitro-ai_methos__', source: 'bundled' })
  })
  test('fallbacks: user server, then claude.ai connector, then any other kinitro/methos server', () => {
    expect(resolveKinitroTools([seat(C), seat(U)])).toEqual({ prefix: U, source: 'user' })
    expect(resolveKinitroTools([seat(C)])).toEqual({ prefix: C, source: 'connector' })
    expect(resolveKinitroTools(['mcp__my_methos__current-seat'])).toEqual({ prefix: 'mcp__my_methos__', source: 'other' })
  })
  test('nothing visible: servers without current-seat, unrelated servers, the probe tool and an empty list do not count', () => {
    expect(resolveKinitroTools([])).toBeUndefined()
    expect(resolveKinitroTools([`${B}authenticate`, `${U}list-nodes`, 'mcp__kinitro-ai__probe', 'mcp__other__current-seat'])).toBeUndefined()
  })
})

// The module's state persists in a file, so the integration cases are one test: the session changes as the user acts.
test('the session follows the tool list: nothing visible, a second connection only (not used), then the authenticated bundled server', async ($, on) => {
  const clock = mock.clock(on)
  const w = makeWorld(on, { files: new Map([['/w/.kinitro-ai-domain', 'beta\n']]), cwd: '/w', root: '/w', sid: 'T1', tools: [] })

  // nothing visible: the status and the failed binding say exactly what to do
  const none = await probe($, 'reload')
  expect(none).toContain(`kinitro.ai tools: none visible (${AUTH_HINT})`)
  expect(none).toContain(`MISSING (no kinitro.ai tools are visible in this session. ${AUTH_HINT}.`)
  const set: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'set-domain', domain: 'beta' })
  expect(String(set.text ?? set.result)).toContain(`"sayToUser":"No kinitro.ai tools are visible. ${AUTH_HINT}."`)

  // 0.24.0 (criterion 8, choice 1b): only the claude.ai connector: never used by the plugin, named as a second connection
  w.tools = [seat(C)]; w.prefixes.length = 0
  const conn = await probe($, 'reload')
  expect(conn).toContain(`kinitro.ai tools: none visible (${AUTH_HINT}) · not used: claude_ai_Kinitro (a second kinitro.ai connection)`)
  expect(conn).not.toContain('domain: beta')
  expect(w.prefixes).toEqual([])

  // the user authenticates the bundled server: it is used as soon as it is listed
  w.tools = [seat(C), seat(U), seat(B)]; w.prefixes.length = 0
  await clock.advance(61_000)
  const bundled = await probe($, 'reload')
  expect(bundled).toContain(`kinitro.ai tools: ${B}* (source: bundled plugin server)`)
  expect(new Set(w.prefixes)).toEqual(new Set([B]))
})
