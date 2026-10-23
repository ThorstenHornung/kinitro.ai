import { atom, update } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import { makeWorld } from './world'

// Item 4.2.1-3696 criterion 6 (PO 20.10.2026 10:22): in a session with isInteractive === false (claude -p, build and worker
// sessions) the plugin does nothing: it writes no file into the working folder, fetches no briefing, adds no context or note
// for the model and mirrors nothing. At most one log line goes into the person's folder (~/.kinitro-ai/headless.log), never
// into the working folder.
const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
const CWD_FILES = (files: Map<string, string>) => [...files.keys()].filter((f) => f.startsWith('/w/')).sort()
const headlessAtom = atom({ plugin: 'kinitro-ai', key: 'headless' } as const, false)

const mk = (on: any) => {
  const seen: string[] = [], registered: string[] = []
  on('tool.register', async (_$: any, e: any) => { registered.push(String(e.name)); return { value: undefined } })
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
  on('turn.complete', async () => ({ text: '' }))
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'H1' })
  return { w, seen, registered }
}
const run = async ($: any, interactive: boolean) => {
  await $.session.start({ isInteractive: interactive, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
  await $.prompt.submit({ text: 'Reply with the single word OK', origin: { kind: 'composer' } } as any)
  await $.turn.complete({ ...done, turnId: 't1', answer: 'OK' } as any)
}

describe('headless sessions (item 4.2.1-3696 criterion 6)', () => {
  test('H1: a headless start, prompt and turn leave the working folder unchanged and add nothing for the model', async ($, on) => {
    const { w, seen, registered } = mk(on)
    const before = new Map(w.files)
    await run($, false)
    expect(CWD_FILES(w.files)).toEqual(CWD_FILES(before))                         // no file in the working folder, not even a log
    expect([...w.files.keys()].filter((f) => !before.has(f))).toEqual(['/u/.kinitro-ai/headless.log'])   // the one log line, in the home folder
    expect(w.sent).toEqual([])                                                    // no briefing, no mirror, nothing sent
    expect(registered).toEqual([])                                                // no probe tool
    expect(seen.join('\n')).not.toContain('kinitro')                              // no context, no second-connection note
  })

  test('H1 control: the same run in an interactive session does the work (state file in the working folder, current-seat called)', async ($, on) => {
    const { w, seen, registered } = mk(on)
    await run($, true)
    expect(w.sent.length).toBeGreaterThan(0)
    expect(CWD_FILES(w.files).some((f) => f.includes('.kinitro-ai-') || f.endsWith('kinitro-ai.log'))).toBe(true)
    expect(registered).toContain('probe')
    expect(seen.join('\n')).toContain('kinitro-ai')
  })

  test('H2: the host state survives a restarted module: a session once seen headless stays inert', async ($, on) => {
    const { w, seen } = mk(on)
    const before = new Map(w.files)
    await update($, headlessAtom, () => true)                                     // what an earlier module of this session left in the host
    await $.prompt.submit({ text: 'again', origin: { kind: 'composer' } } as any)
    await $.turn.complete({ ...done, turnId: 't2', answer: 'OK' } as any)
    expect([...w.files.keys()].sort()).toEqual([...before.keys()].sort())
    expect(w.sent).toEqual([])
    expect(seen.join('\n')).not.toContain('kinitro')
  })

  test('H3: a headless call of the own server is passed through untouched (no key held, nothing added)', async ($, on) => {
    const { w } = mk(on)
    w.verbs = { 'list-domains': () => ({ result: JSON.stringify({ domains: [] }) }) }
    await $.session.start({ isInteractive: false, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
    await $.tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai__list-domains' })
    expect(w.sent.filter((s) => s.verb !== 'list-domains')).toEqual([])           // no open-domain to obtain a key
    expect(w.sent[0]!.args.domainRef).toBeUndefined()
  })
})
