import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld } from './world'

// 0.26.0 (item 4.2.1-4672 P5), replaces the 0.22 "build switched off" case: KINITRO_AI_ENV=TEST no longer switches the plugin off, it selects
// Test for the session. The Prod own server is then the INACTIVE environment's: its calls are refused (fail closed, so no answer and no
// session key of the other environment ever reaches the model), the marker names TEST.
describe('KINITRO_AI_ENV=TEST selects Test; the Prod own server is refused', () => {
  test('refuses the Prod own server calls (no raw session key can reach the model) and marks the prompt TEST', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SX', env: { KINITRO_AI_ENV: 'TEST' } })
    w.verbs = { 'open-domain': () => ({ result: JSON.stringify({ status: 'ok', sessionKey: 'kss_raw_key_1' }) }) }
    const r: any = await $.tool.call({ tool: 'mcp__plugin_kinitro_kinitro_ai__open-domain', domain: 'dom-beta' })
    expect(String(r.deny)).toContain('kinitro.ai Test is active in this session.')
    expect(JSON.stringify(r)).not.toContain('kss_')                 // the keyless open-domain never shows a raw key
    const l: any = await $.tool.call({ tool: 'mcp__kinitro_device__list-domains' })
    expect(String(l.deny)).toContain('is active in this session')
    expect(w.sent).toEqual([])                                       // nothing reached the server
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0] ?? '').toContain('[kinitro TEST 0.27.6]')
  })
})
