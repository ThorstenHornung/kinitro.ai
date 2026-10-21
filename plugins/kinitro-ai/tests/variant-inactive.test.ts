import { describe, expect, test } from 'claude-code/testing'
import { makeWorld } from './world'

// Build variant (ruling R1, 21.10.2026), own file: the activation is read once per module, so the switched-off case gets its
// own module. KINITRO_AI_ENV=TEST switches the Production build off: every event passes through untouched, nothing refused.
describe('a build switched off by KINITRO_AI_ENV (TEST on the Production build)', () => {
  test('passes its own server calls through unchanged and injects nothing into the prompt', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SX', env: { KINITRO_AI_ENV: 'TEST' } })
    const r: any = await $.tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai__list-domains' })
    expect(r.deny).toBeUndefined()
    expect(w.sent.map((s) => s.verb)).toEqual(['list-domains'])   // reached the server as the model sent it
    expect(w.sent[0]!.args.domainRef).toBeUndefined()              // no key, no slug added
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0] ?? '').not.toContain('[kinitro-ai')
  })
})
