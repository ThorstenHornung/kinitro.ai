import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'

// The chat mirroring switch (PO 2026-10-16): probe mirror on|off, default on, persisted in .kinitro-ai-state.json.
// Off: no mirror-messaging call on any path (session start, prompt.submit, end of turn, compaction). On again: from the next turn, no backfill.
const STATE = '/w/b/.kinitro-ai-state.json'
const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
const mk = (on: any, files: [string, string][] = []) => {
  on('turn.complete', async () => ({ text: '' }))
  on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
  on('session.compact', async (_$: any, e: any) => ({ messages: e.messages.slice(-1), tokensBefore: 10, tokensAfter: 1 }))
  return makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n'], ...files]), cwd: '/w/b', root: '/w/b', sid: 'S7' })
}
const mirrorCalls = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'mirror-messaging')
const appends = (w: ReturnType<typeof makeWorld>) => mirrorCalls(w).filter((s) => s.args.action === 'append')
const start = ($: any) => $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
const compact = ($: any) => $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'a', toolUses: [] }, { role: 'assistant', text: 'b', toolUses: [] }] })
const turn = async ($: any, id: string, text: string) => {
  await $.prompt.submit({ text, origin: { kind: 'composer' } } as any)
  await $.turn.complete({ ...done, turnId: id, answer: 'answer ' + id } as any)
}

describe('chat mirroring switch', () => {
  test('default on: no flag stored, the turn is mirrored and the status says on', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await turn($, 'd1', 'typed')
    expect(appends(w).length).toBe(1)
    expect(appends(w)[0]!.args).toMatchObject({ turnId: 'd1', prompt: 'typed', answer: 'answer d1' })
    expect(await probe($, 'status')).toContain('Chat mirroring: on')
  })
  test('off: zero mirror-messaging calls at session start, prompt.submit, end of turn and compaction', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    const res = await probe($, 'mirror', { value: 'off' })
    expect(res).toContain('Chat mirroring: off')
    const before = w.sent.length
    await start($)
    await turn($, 'o1', 'first')
    await compact($)
    await turn($, 'o2', 'second')
    await probe($, 'status')
    expect(mirrorCalls(w)).toEqual([])
    expect(w.sent.length).toBeGreaterThanOrEqual(before)
    expect(w.files.get('/w/b/.kinitro-ai-outbox.json') ?? '[]').not.toContain('o1')
  })
  test('the status line names the state after each switch', async ($, on) => {
    mk(on)
    await probe($, 'reload')
    expect(await probe($, 'mirror', { value: 'off' })).toContain('Chat mirroring: off')
    expect(await probe($, 'status')).toContain('Chat mirroring: off')
    expect(await probe($, 'mirror', { value: 'on' })).toContain('Chat mirroring: on')
  })
  test('persisted: a new session reading the stored flag mirrors nothing', async ($, on) => {
    const w = mk(on, [[STATE, JSON.stringify({ mirror: 'off', todoHash: '', todoSid: '' })]])
    await start($)
    await probe($, 'reload')
    await turn($, 'p1', 'after restart')
    expect(mirrorCalls(w)).toEqual([])
    expect(await probe($, 'status')).toContain('Chat mirroring: off')
    expect(JSON.parse(w.files.get(STATE)!).mirror).toBe('off')
  })
  test('the switch writes the flag into the state file', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await probe($, 'mirror', { value: 'off' })
    expect(JSON.parse(w.files.get(STATE)!).mirror).toBe('off')
    await probe($, 'mirror', { value: 'on' })
    expect(JSON.parse(w.files.get(STATE)!).mirror).toBe('on')
  })
  test('on again resumes from the next turn, with no backfill of the turns while off', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await probe($, 'mirror', { value: 'off' })
    await turn($, 'r1', 'while off')
    await probe($, 'mirror', { value: 'on' })
    await turn($, 'r2', 'after on')
    const a = appends(w)
    expect(a.map((c) => c.args.turnId)).toEqual(['r2'])
    expect(JSON.stringify(a)).not.toContain('while off')
  })
})
