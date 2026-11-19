import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld } from './world'

// 0.26.0 (item 4.2.1-4672 P3): the plugin must work when session.start never ran (a host that does not send it, a module that
// started late). The first prompt.submit or tool.call of such a session runs the start path: probe registration, state read,
// activity decision. prompt.submit stays the only hook that injects the per-turn context.
describe('lazy start (P3)', () => {
  const mk = (on: any) => {
    const seen: string[] = [], registered: string[] = []
    on('tool.register', async (_$: any, e: any) => { registered.push(String(e.name)); return { value: undefined } })
    on('session.turns', async () => ({ value: 0 }))
    on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
    const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'LZ1' })
    return { w, seen, registered }
  }

  test('prompt.submit without session.start gives the start briefing and registers the probe', async ($, on) => {
    const { seen, registered } = mk(on)
    expect(registered).toEqual([])
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' } } as any)
    expect(registered).toEqual(['probe'])
    expect(seen[0]).toContain('[kinitro 0.26.1]')
    expect(seen[0]).toContain('instruction-coldstart of')   // the start section of the first turn
    expect(seen[0]).toContain('instruction-persona of')
  })

  test('a tool call of the own server without session.start also starts the session (the probe is registered once)', async ($, on) => {
    const { registered } = mk(on)
    await ($ as any).tool.call({ tool: 'mcp__plugin_kinitro_kinitro__list-domains' })
    await ($ as any).tool.call({ tool: 'mcp__plugin_kinitro_kinitro__list-domains' })
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' } } as any)
    expect(registered).toEqual(['probe'])
  })
})
