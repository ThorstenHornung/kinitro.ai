import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'

// 0.26.0 (item 4.2.1-4672 P3b): in Cowork (the cloud host) prompt.context and prompt.compose do NOT fire, so persona and working rules
// must arrive through prompt.submit: at the start moment and after a compaction, with the same dedupe key (contextKeyA) that prompt.context
// records, so no host gets them twice. A normal turn carries state only.
const COWORK_ENV = { CLAUDE_CODE_ENTRYPOINT: 'remote_cowork', CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS: '1' }
const TOOLS = ['mcp__Kinitro__current-seat', 'mcp__Kinitro__list-domains', 'mcp__Kinitro__open-domain']
const compact = ($: any) => $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'a', toolUses: [] }, { role: 'assistant', text: 'b', toolUses: [] }] })
const count = (text: string, part: string) => text.split(part).length - 1

const mk = (on: any, env: Record<string, string>, tools?: string[]) => {
  const seen: string[] = [], ctx = { turns: 0 }
  mock.clock(on)
  on('session.turns', async () => ({ value: ctx.turns }))
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n\n')); return { text: e.text } })
  on('session.compact', async (_$: any, e: any) => ({ messages: e.messages.slice(-1), tokensBefore: 10, tokensAfter: 1 }))
  makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'CP1', tools, env })
  return { seen, ctx }
}

describe('persona and working rules in Cowork (P3b)', () => {
  test('a Cowork-like world (no prompt.context events) gets persona and rules at the first prompt and after a compaction, not at a normal turn', async ($, on) => {
    const { seen, ctx } = mk(on, COWORK_ENV, TOOLS)
    await $.session.start({ isInteractive: false, surface: null, cwd: '/w/b' } as any).catch(() => undefined)
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    ctx.turns = 1; await $.prompt.submit({ text: 'b', origin: { kind: 'composer' } } as any)
    ctx.turns = 2; await $.prompt.submit({ text: 'c', origin: { kind: 'composer' } } as any)
    await compact($)
    ctx.turns = 3; await $.prompt.submit({ text: 'd', origin: { kind: 'composer' } } as any)
    ctx.turns = 4; await $.prompt.submit({ text: 'e', origin: { kind: 'composer' } } as any)
    expect(seen[0]).toContain('Persona (session start)')
    expect(seen[0]).toContain('instruction-persona of')
    expect(seen[0]).toContain('Working rules:')
    expect(seen[1]).not.toContain('instruction-persona of')   // a normal turn: state only
    expect(seen[2]).not.toContain('instruction-persona of')
    expect(seen[3]).toContain('Persona (after compaction)')   // the compacted moment
    expect(seen[3]).toContain('Working rules:')
    expect(seen[4]).not.toContain('instruction-persona of')
    // the status line is the marker (no band surface in Cowork)
    expect(seen[1]).toMatch(/^\[kinitro 0.27.7\] .*mirror on · context /)
  })

  test('no host gets them twice: where prompt.context fired and recorded the key, the first prompt does not repeat them; after a compaction the key is renewed once', async ($, on) => {
    const { seen, ctx } = mk(on, {}, undefined)
    on('prompt.context', async (_$: any, e: any) => ({ blocks: e.blocks }))
    await probe($, 'reload')
    const r: any = await ($ as any).prompt.context({ blocks: [] })
    expect(r.blocks.some((b: any) => b.name === 'kinitroBriefing' && b.text.includes('instruction-persona of'))).toBe(true)
    await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
    expect(seen[0]).not.toContain('instruction-persona of')   // the context block already carries it
    await compact($)
    ctx.turns = 2; await $.prompt.submit({ text: 'b', origin: { kind: 'composer' } } as any)
    ctx.turns = 3; await $.prompt.submit({ text: 'c', origin: { kind: 'composer' } } as any)
    expect(count(seen[1] ?? '', 'instruction-persona of')).toBe(1)
    expect(seen[2]).not.toContain('instruction-persona of')
  })
})
