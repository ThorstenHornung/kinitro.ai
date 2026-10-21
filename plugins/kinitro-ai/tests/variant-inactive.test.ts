import { describe, expect, test } from 'claude-code/testing'
import { makeWorld } from './world'

// Build variant (PO 21.10.2026), own file: the activation is read once per module, so the inactive case gets its own module.
describe('an inactive build (KINITRO_AI_ENV=TEST on the Production build)', () => {
  test('refuses its own server and its probe, passes the prompt through untouched', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SX', env: { KINITRO_AI_ENV: 'TEST' } })
    const r: any = await $.tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai__list-domains' })
    expect(String(r.deny ?? r.text ?? r.result)).toContain('kinitro-ai (PROD) is off in this session (KINITRO_AI_ENV=TEST)')
    const pr: any = await $.tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'status' })
    expect(String(pr.deny)).toContain('kinitro-ai (PROD) is off in this session')
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0] ?? '').not.toContain('[kinitro-ai')
    expect(w.calls).toEqual([])
  })
})
