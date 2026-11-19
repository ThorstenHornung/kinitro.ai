import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { COWORK_CONNECT, TEST_ADD } from '../hooks/register'

// 0.26.1: the Test server is no longer bundled (a tester adds it); Cowork texts never suggest the email-code sign-in; a later success clears
// the band note of an earlier failure; a reloaded module labels its first persona as session start.
const COWORK_ENV = { CLAUDE_CODE_ENTRYPOINT: 'remote_cowork', CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS: '1' }
const TEST_PREFIX = 'mcp__kinitro_ai_device_test__'
const VERBS = ['current-seat', 'list-domains', 'open-domain', 'list-nodes']
const json = (t: string) => JSON.parse(t)
const submit = ($: any, text = 'a') => $.prompt.submit({ text, origin: { kind: 'composer' } } as any)
const DEVICE = { options: { signInPath: 'device', email: 't@example.com' } }

describe('Test server a tester adds themselves (A)', () => {
  test('a user-level Test server is adopted on a terminal; the Prod connector is refused; the call reaches the server', DEVICE, async ($, on) => {
    const w = makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'N1', env: { KINITRO_AI_ENV: 'TEST' }, tools: [...VERBS.map((v) => TEST_PREFIX + v), 'mcp__kinitro_ai_device__list-nodes', 'mcp__kinitro_ai_device__current-seat'] })
    const s = await probe($, 'status')
    expect(s).toContain(`kinitro.ai tools: ${TEST_PREFIX}* (source: account connector (adopted))`)
    expect(json(s).connection).toEqual({ kind: 'account connector', prefix: TEST_PREFIX })
    const prod: any = await ($ as any).tool.call({ tool: 'mcp__kinitro_ai_device__list-nodes' })
    expect(String(prod.deny)).toBe('kinitro.ai Test is active in this session.')
    await ($ as any).tool.call({ tool: `${TEST_PREFIX}list-nodes` })
    expect(w.prefixes).toContain(TEST_PREFIX)
  })

  test('deviceServer for Test tries the bundled name first, then the user-level name kinitro_ai_device_test', DEVICE, async ($, on) => {
    const connects: string[] = [], called: string[] = []
    on('mcp.connect', async (_$: any, e: any) => { connects.push(String(e.server)); return { value: e.server === 'kinitro_ai_device_test' ? { isConnected: true, server: 'kinitro_ai_device_test' } : { isConnected: false, reason: 'unknown server' } } })
    on('mcp.call', async (_$: any, e: any) => { called.push(`${e.server}:${e.tool}`); return { value: { content: [{ type: 'text', text: JSON.stringify({ status: 'pending', sessionKey: 'kss_testkey1', approvalUrl: 'https://methos-test.example/a', expiresAt: new Date(Date.now() + 600000).toISOString(), email: 't***@example.com' }) }], isError: false } } })
    on('config.set', async (_$: any, e: any) => ({ value: e.value }))
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'N2', env: { KINITRO_AI_ENV: 'TEST' }, tools: [] })
    await $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' } as any).catch(() => undefined)
    await probe($, 'sign-in')
    expect(connects).toEqual(['plugin:kinitro-ai:kinitro_ai_device_test', 'kinitro_ai_device_test'])
    expect(called).toEqual(['kinitro_ai_device_test:sign-in'])
  })

  test('when neither Test server connects the problem says how a tester adds it', DEVICE, async ($, on) => {
    on('mcp.connect', async () => ({ value: { isConnected: false, reason: 'unknown server' } }))
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'N3', env: { KINITRO_AI_ENV: 'TEST' }, tools: [] })
    await $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' } as any).catch(() => undefined)
    const r = await probe($, 'sign-in')
    expect(r).toContain('claude mcp add --transport http -s user kinitro_ai_device_test https://methos-test.kinitro.ai/mcp/device')
    expect(r).toContain('custom connector')
    const st = json(await probe($, 'status'))
    expect(st.problems[0].fix).toBe(TEST_ADD)
  })

  test('Prod is unchanged: no Test text and the bundled name is tried alone', DEVICE, async ($, on) => {
    const connects: string[] = []
    on('mcp.connect', async (_$: any, e: any) => { connects.push(String(e.server)); return { value: { isConnected: false, reason: 'x' } } })
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'N4', tools: [] })
    await $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' } as any).catch(() => undefined)
    const r = await probe($, 'sign-in')
    expect(connects).toEqual(['kinitro_ai_device'])
    expect(r).not.toMatch(/Test|kinitro_ai_device_test/)
  })
})

describe('Cowork texts (B)', () => {
  test('no kinitro tools in Cowork: the connector steps, never the email-code sign-in; the details line names the connector login', async ($, on) => {
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'C1', env: COWORK_ENV, tools: [] })
    const raw = await probe($, 'status')
    const st = json(raw)
    expect(st.problems[0].fix).toBe(COWORK_CONNECT)
    expect(COWORK_CONNECT).toBe('Connect the kinitro.ai connector of the kinitro-ai plugin on claude.ai: Plugins > Kinitro ai > Connectors > kinitro_ai_device > Connect. Choose Sign in now, then Use your own OAuth client with client ID claude, then sign in on the kinitro.ai page. Then start a new chat.')
    expect(st.details).toContain('sign-in: connector login on claude.ai')
    expect(st.details.some((l: string) => /^sign-in path:/.test(l))).toBe(false)
    expect(st.details.join('\n')).toContain(`kinitro.ai tools: none visible (${COWORK_CONNECT})`)
    expect(raw).not.toMatch(/email-code|email code/i)
    const si = await probe($, 'sign-in')
    expect(si).toContain(COWORK_CONNECT)
    expect(si).not.toMatch(/email-code|email code/i)
  })

  test('control: a terminal still names the email-code sign-in', DEVICE, async ($, on) => {
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'C2', tools: [] })
    const raw = await probe($, 'status')
    expect(raw).toMatch(/email-code/)
    expect(raw).toContain('sign-in path: device')
  })
})

describe('stale band note (C)', () => {
  test('a later successful binding clears the note of a failed one; control: the note is there before', async ($, on) => {
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'B1' })
    w.verbs = { 'current-seat': () => ({ result: 'boom', isError: true }) }
    await probe($, 'set-domain', { domain: 'beta' })
    expect(json(await probe($, 'status')).details.join('\n')).toMatch(/band note: kinitro\.ai could not bind beta/)
    w.verbs = {}
    await probe($, 'reload')
    expect(json(await probe($, 'status')).details.join('\n')).toContain('band note: -')
  })
})

describe('persona label after a reload (D)', () => {
  test('a stale compaction flag of another session and a reloaded module give the session-start label; a real compaction still says after compaction', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n\n')); return { text: e.text } })
    on('session.turns', async () => ({ value: 3 }))
    on('session.compact', async (_$: any, e: any) => ({ messages: e.messages.slice(-1), tokensBefore: 10, tokensAfter: 1 }))
    makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n'], ['/w/b/.kinitro-ai-state.json', JSON.stringify({ compactedPending: true, compactSid: 'OLD', compactions: 1 })]]), cwd: '/w/b', root: '/w/b', sid: 'R1' })
    await submit($)
    expect(seen[0]).toContain('Persona (session start)')
    expect(seen[0]).not.toContain('after compaction')
    await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'a', toolUses: [] }, { role: 'assistant', text: 'b', toolUses: [] }] })
    await submit($, 'b')
    expect(seen[1]).toContain('Persona (after compaction)')
  })
})

describe('the other environment is present (I) and namespaced commands (H)', () => {
  test('Prod active, only the Test connector in the chat: the problem says so, not the generic add text', async ($, on) => {
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'O1', env: COWORK_ENV, tools: VERBS.map((v) => TEST_PREFIX + v) })
    const st = json(await probe($, 'status'))
    expect(st.problems[0].problem).toBe('The kinitro.ai Prod connector (kinitro_ai_device) is not in this chat; only the Test connector is.')
    expect(st.problems[0].fix).toBe("Switch kinitro_ai_device on in this chat's + > Plugins menu, or start a new chat.")
    expect(JSON.stringify(st.problems)).not.toContain('Connect the kinitro.ai connector')
  })

  test('Test active, only the Prod connector listed: the problem names the Test server and how to add it', DEVICE, async ($, on) => {
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'O2', env: { KINITRO_AI_ENV: 'TEST' }, tools: VERBS.map((v) => `mcp__kinitro_ai_device__${v}`) })
    const st = json(await probe($, 'status'))
    expect(st.problems[0].problem).toContain('only the Prod connector is')
    expect(st.problems[0].fix).toBe(TEST_ADD)
  })

  test('Cowork texts never name a typed slash command; a terminal names plain /kinitro', async ($, on) => {
    const w = makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'H1', env: COWORK_ENV, tools: [] })
    const r: any = await $.tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'env', value: 'test' })
    expect(JSON.parse(String(r.result)).message).toBe('kinitro.ai Test is active in this session. Choose a domain by asking "connect me to kinitro" or picking "kinitro" from the "/" menu.')
    void w
  })
  test('control: a terminal says /kinitro', async ($, on) => {
    makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'H2' })
    const r: any = await $.tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'env', value: 'test' })
    expect(JSON.parse(String(r.result)).message).toBe('kinitro.ai Test is active in this session. Choose a domain with /kinitro.')
  })
})
