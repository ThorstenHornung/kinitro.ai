import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld } from './world'
import { headlessDecision } from '../hooks/register'

// Item 4.2.1-3696 criterion 6 (PO 20.10.2026 10:22): in a session with isInteractive === false (claude -p, build and worker
// sessions) the plugin does nothing: it writes no file into the working folder, fetches no briefing, adds no context or note
// for the model and mirrors nothing. At most one log line goes into the person's folder (~/.kinitro-ai/headless.log), never
// into the working folder.
const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
const CWD_FILES = (files: Map<string, string>) => [...files.keys()].filter((f) => f.startsWith('/w/')).sort()

const mk = (on: any, env?: Record<string, string>) => {
  const seen: string[] = [], registered: string[] = []
  on('tool.register', async (_$: any, e: any) => { registered.push(String(e.name)); return { value: undefined } })
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
  on('turn.complete', async () => ({ text: '' }))
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'H1', ...(env ? { env } : {}) })
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
    expect(registered).toEqual(['wake'])                                          // 0.26.0 (P2): no probe tool, only the wake tool
    expect(seen.join('\n')).not.toContain('kinitro')                              // no context, no second-connection note
  })

  test('H1 control: the same run in an interactive session does the work (state file in the working folder, current-seat called)', async ($, on) => {
    const { w, seen, registered } = mk(on)
    await run($, true)
    expect(w.sent.length).toBeGreaterThan(0)
    expect(CWD_FILES(w.files).some((f) => f.includes('.kinitro-ai-') || f.endsWith('kinitro-ai.log'))).toBe(true)
    expect(registered).toContain('probe')
    expect(seen.join('\n')).toContain('kinitro')
  })

  test('H2: the host state survives a restarted module: a session once seen headless stays inert', async ($, on) => {
    const { w, seen } = mk(on)
    const before = new Map(w.files)
    // what an earlier module of this session left in the host: the headless flag, read back through state.get
    on('state.get', (_$: any, e: any, next: any) => (e.key === 'headless' ? { value: { value: true, version: 1 } } : next(e)))
    await $.prompt.submit({ text: 'again', origin: { kind: 'composer' } } as any)
    await $.turn.complete({ ...done, turnId: 't2', answer: 'OK' } as any)
    expect([...w.files.keys()].sort()).toEqual([...before.keys()].sort())
    expect(w.sent).toEqual([])
    expect(seen.join('\n')).not.toContain('kinitro')
  })

  // H3: the session holds a key (host state), the model calls the plugin's own server. A headless session passes the call
  // through untouched (no key added); control: the same call in a session that is not headless carries the key.
  const callWithKey = async ($: any, on: any, headless: boolean) => {
    const { w } = mk(on)
    w.verbs = { 'list-domains': () => ({ result: JSON.stringify({ domains: [] }) }) }
    on('state.get', (_$: any, e: any, next: any) => {
      if (e.key === 'headless' && headless) return { value: { value: true, version: 1 } }
      if (e.key === 'sessionKey') return { value: { value: { sid: 'H1', key: 'kss_held_key' }, version: 1 } }
      return next(e)
    })
    await $.tool.call({ tool: 'mcp__plugin_kinitro_kinitro_ai__list-domains' })
    return w.sent
  }
  test('H3: a headless call of the own server is passed through untouched (no key added, nothing else sent)', async ($, on) => {
    const sent = await callWithKey($, on, true)
    expect(sent.map((s) => s.verb)).toEqual(['list-domains'])
    expect(sent[0]!.args.domainRef).toBeUndefined()
  })

  test('H3 control: the same call in a session that is not headless carries the held key', async ($, on) => {
    const sent = await callWithKey($, on, false)
    expect(sent.find((s) => s.verb === 'list-domains')!.args.domainRef).toBe('kss_held_key')
  })
})

// 0.26.0 (item 4.2.1-4672 P1, P2): the headless rule has the entrypoint in it, and an inert session has one tool, wake.
const WAKE = 'mcp__kinitro__wake'
const wake = ($: any, action: string): Promise<any> => $.tool.call({ tool: WAKE, action })
const textOf = (r: any) => String(r.text ?? r.result ?? '')
const sends = (w: any) => w.sent.filter((s: any) => s.verb === 'mirror-messaging' && s.args.action === 'append').length

describe('headless rule and wake tool (item 4.2.1-4672 P1, P2)', () => {
  test('P1: the pure rule: inert only with isInteractive false and an unset or sdk entrypoint; KINITRO_AI_MODE overrides both ways', () => {
    expect(headlessDecision(false, undefined, undefined)).toEqual({ inert: true, reason: 'inert (interactive=false, entrypoint=unset)' })
    expect(headlessDecision(false, 'sdk-cli', undefined)).toEqual({ inert: true, reason: 'inert (interactive=false, entrypoint=sdk-cli)' })
    expect(headlessDecision(false, 'remote_cowork', undefined)).toEqual({ inert: false, reason: 'active (interactive=false, entrypoint=remote_cowork)' })
    expect(headlessDecision(true, 'cli', undefined).inert).toBe(false)
    expect(headlessDecision(false, 'sdk-cli', 'on').inert).toBe(false)
    expect(headlessDecision(true, 'cli', 'off').inert).toBe(true)
  })

  test('P1: the headless log line names the reason', async ($, on) => {
    mock.clock(on)
    const { w } = mk(on, { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' })
    await run($, false)
    expect(w.files.get('/u/.kinitro-ai/headless.log')).toContain('inert (interactive=false, entrypoint=sdk-cli)')
  })

  test('P1: entrypoint remote_cowork with isInteractive false is active (probe registered, work done, reason in the log)', async ($, on) => {
    mock.clock(on)
    const { w, seen, registered } = mk(on, { CLAUDE_CODE_ENTRYPOINT: 'remote_cowork' })
    await run($, false)
    expect(registered).toContain('probe')
    expect(registered).not.toContain('wake')
    expect(w.sent.length).toBeGreaterThan(0)
    expect(seen.join('\n')).toContain('kinitro')
    expect(w.files.has('/u/.kinitro-ai/headless.log')).toBe(false)
    expect(w.files.get('/w/b/kinitro-ai.log')).toContain('active (interactive=false, entrypoint=remote_cowork)')
  })

  test('P1: KINITRO_AI_MODE=on makes an sdk session active', async ($, on) => {
    mock.clock(on)
    const { w, seen, registered } = mk(on, { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', KINITRO_AI_MODE: 'on' })
    await run($, false)
    expect(registered).toContain('probe')
    expect(w.sent.length).toBeGreaterThan(0)
    expect(seen.join('\n')).toContain('kinitro')
  })

  test('P1: KINITRO_AI_MODE=off makes an interactive session inert', async ($, on) => {
    mock.clock(on)
    const { w, seen, registered } = mk(on, { KINITRO_AI_MODE: 'off' })
    await run($, true)
    expect(registered).toEqual(['wake'])
    expect(w.sent).toEqual([])
    expect(seen.join('\n')).not.toContain('kinitro')
  })

  test('P2: wake on activates the session: the briefing comes back in the answer, the probe is registered, the mirror works', async ($, on) => {
    mock.clock(on)
    const { w, seen, registered } = mk(on)
    await $.session.start({ isInteractive: false, surface: null, cwd: '/w/b' } as any).catch(() => undefined)
    expect(registered).toEqual(['wake'])
    const r = await wake($, 'on')
    expect(textOf(r)).toContain('instruction-persona of')   // the briefing text, since no further prompt may come
    expect(registered).toContain('probe')
    await $.prompt.submit({ text: 'work', origin: { kind: 'composer' } } as any)
    expect(seen.join('\n')).toContain('kinitro')
    await $.turn.complete({ ...done, turnId: 't1', answer: 'OK' } as any)
    expect(sends(w)).toBe(1)
  })

  test('P2: wake off silences an active session: no briefing in the prompt, no mirror; the probe action on brings it back', async ($, on) => {
    mock.clock(on)
    const { w, seen } = mk(on)
    await $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' } as any).catch(() => undefined)
    await $.prompt.submit({ text: 'one', origin: { kind: 'composer' } } as any)
    await $.turn.complete({ ...done, turnId: 't1', answer: 'OK' } as any)
    expect(seen[0]).toContain('kinitro')
    const before = sends(w)
    expect(before).toBe(1)
    expect(textOf(await wake($, 'off'))).toContain('off')
    await $.prompt.submit({ text: 'two', origin: { kind: 'composer' } } as any)
    await $.turn.complete({ ...done, turnId: 't2', answer: 'OK' } as any)
    expect(seen[1] ?? '').not.toContain('kinitro')
    expect(sends(w)).toBe(before)
    expect(textOf(await $.tool.call({ tool: 'mcp__kinitro__probe', action: 'on' }))).toContain('"status":"on"')
    await $.prompt.submit({ text: 'three', origin: { kind: 'composer' } } as any)
    expect(seen[2]).toContain('kinitro')
  })

  test('P2: the wake state is host-held: a restarted module of a woken session stays active', async ($, on) => {
    const { w, seen } = mk(on)
    on('state.get', (_$: any, e: any, next: any) => (e.key === 'headless' ? { value: { value: true, version: 1 } } : e.key === 'wakeMode' ? { value: { value: 'on', version: 1 } } : next(e)))
    await $.prompt.submit({ text: 'again', origin: { kind: 'composer' } } as any)
    expect(w.sent.length).toBeGreaterThan(0)
    expect(seen.join('\n')).toContain('kinitro')
  })
})
