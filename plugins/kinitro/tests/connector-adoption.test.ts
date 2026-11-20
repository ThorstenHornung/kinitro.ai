import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { resolveKinitroTools } from '../hooks/register'

// 0.26.0 (item 4.2.1-4672 P4): in Cowork the plugin's own servers are not started (CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS=1), so the plugin
// adopts the first listed account connector of the active environment as its own connection and treats it like the bundled server.
const COWORK_ENV = { CLAUDE_CODE_ENTRYPOINT: 'remote_cowork', CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS: '1' }
const NAMES = ['mcp__claude_ai_Kinitro__current-seat', 'mcp__kinitro_ai__current-seat', 'mcp__kinitro_ai__open-domain', 'mcp__kinitro_ai__list-nodes', 'mcp__Kinitro__current-seat', 'mcp__Kinitro__echo']   // 0.26.3: the connector of the bundled server kinitro_ai is adopted first; the legacy spellings follow
const KEY = 'kss_cowork_key_1'

const setup = (on: any, env: Record<string, string> = COWORK_ENV, tools: string[] = NAMES) => {
  mock.clock(on)
  const w = makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'C1', tools, env })
  w.verbs = {
    'open-domain': () => ({ result: JSON.stringify({ status: 'ok', sessionKey: KEY }) }),
    'list-nodes': (a) => ({ result: JSON.stringify({ nodes: [], echo: a.domainRef ?? null }) }),
    echo: (a) => ({ result: JSON.stringify({ echo: a.domainRef ?? null }) }),
  }
  return w
}
const text = (r: any) => String(r.result ?? r.text ?? r.deny ?? '')

describe('connector adoption in Cowork (P4)', () => {
  test('the first listed connector of the active environment is adopted, in the documented order', async ($, on) => {
    setup(on)
    const s = await probe($, 'status')
    expect(s).toContain('kinitro.ai tools: mcp__kinitro_ai__* (source: account connector (adopted))')
    expect(s).not.toContain('not used:')   // the adopted connector is no second connection
  })

  test('without the Cowork markers nothing is adopted and the connector is not touched (Claude Code keeps the 0.24 rule)', async ($, on) => {
    const w = setup(on, {})
    expect(await probe($, 'status')).toContain('kinitro.ai tools: none visible')
    await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__list-nodes', domainRef: 'theirs' })
    expect(w.sent.find((x) => x.verb === 'list-nodes')!.args.domainRef).toBe('theirs')   // passed through untouched
  })

  test('the hook adds the held key to the model\'s calls; the open-domain answer loses its key, which stays host-side', async ($, on) => {
    const w = setup(on)
    const opened: any = await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__open-domain', domain: 'dom-beta' })
    expect(text(opened)).not.toContain('kss_')
    expect(text(opened)).not.toContain('sessionKey')
    expect(await probe($, 'status')).toContain('session key held')
    await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__list-nodes' })
    const sent = w.sent.filter((x) => x.verb === 'list-nodes')
    expect(sent[sent.length - 1]!.args.domainRef).toBe(KEY)
  })

  test('a key the model passes itself is kept, adopted host-side when none is held, and scrubbed from answers', async ($, on) => {
    const w = setup(on)
    w.verbs!['list-nodes'] = (a) => ({ result: JSON.stringify({ nodes: [], note: `your key ${a.domainRef}` }) })
    const first: any = await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__list-nodes', domainRef: 'kss_model_own_9' })
    expect(w.sent.filter((x) => x.verb === 'list-nodes')[0]!.args.domainRef).toBe('kss_model_own_9')   // the model's key is kept
    expect(text(first)).not.toContain('kss_')                                                          // and scrubbed from the answer
    await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__list-nodes' })
    expect(w.sent.filter((x) => x.verb === 'list-nodes')[1]!.args.domainRef).toBe('kss_model_own_9')   // adopted host-side: the next call carries it
  })

  test('a foreign connector of the same environment is passed through untouched; the other environment\'s connector is refused', async ($, on) => {
    const w = setup(on, COWORK_ENV, [...NAMES, 'mcp__kinitro_ai_Test__current-seat', 'mcp__kinitro_ai_Test__list-nodes'])
    await ($ as any).tool.call({ tool: 'mcp__kinitro_ai__open-domain', domain: 'dom-beta' })
    await ($ as any).tool.call({ tool: 'mcp__Kinitro__echo', domainRef: 'theirs' })
    expect(w.sent.find((x) => x.verb === 'echo')!.args.domainRef).toBe('theirs')   // not the adopted one: no key added
    const test: any = await ($ as any).tool.call({ tool: 'mcp__kinitro_ai_Test__list-nodes' })
    expect(text(test)).toBe('kinitro.ai Prod is active in this session.')
  })

  test('the resolver adopts only with the flag and prefers the bundled server when both exist', () => {
    expect(resolveKinitroTools(NAMES, 'device', 'PROD', false)?.source).not.toBe('connector-adopted')
    expect(resolveKinitroTools(NAMES, 'oauth', 'PROD', true)).toEqual({ prefix: 'mcp__kinitro_ai__', source: 'connector-adopted' })
    const both = [...NAMES, 'mcp__plugin_kinitro_kinitro_ai__current-seat']
    expect(resolveKinitroTools(both, 'oauth', 'PROD', true)).toEqual({ prefix: 'mcp__plugin_kinitro_kinitro_ai__', source: 'bundled' })   // 0.26.1: the bundled server is the OAuth one
    // the device path takes the server the user added (kinitro_device) first, before any other connector
    expect(resolveKinitroTools([...NAMES, 'mcp__kinitro_device__current-seat'], 'device', 'PROD', true)).toEqual({ prefix: 'mcp__kinitro_device__', source: 'connector-adopted' })
  })
})
