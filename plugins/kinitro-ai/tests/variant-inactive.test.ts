import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld } from './world'

// Build variant (ruling R1, 21.10.2026), own file: the activation is read once per module, so the switched-off case gets its
// own module. KINITRO_AI_ENV=TEST switches the Production build off: its own server's calls are refused (fail closed,
// review F1), every other event passes through untouched.
describe('a build switched off by KINITRO_AI_ENV (TEST on the Production build)', () => {
  test('refuses its own server calls (no raw session key can reach the model) and injects nothing into the prompt', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SX', env: { KINITRO_AI_ENV: 'TEST' } })
    w.verbs = { 'open-domain': () => ({ result: JSON.stringify({ status: 'ok', sessionKey: 'kss_raw_key_1' }) }) }
    const r: any = await $.tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai__open-domain', domain: 'dom-beta' })
    expect(String(r.deny)).toContain('kinitro-ai (PROD) is switched off in this session')
    expect(JSON.stringify(r)).not.toContain('kss_')                 // the keyless open-domain never shows a raw key
    const l: any = await $.tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai__list-domains' })
    expect(String(l.deny)).toContain('is switched off')
    expect(w.sent).toEqual([])                                       // nothing reached the server
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0] ?? '').not.toContain('[kinitro-ai')
  })
})
