import { describe, expect, test } from 'claude-code/testing'
import { classifyOrigin, planTurn } from '../hooks/register'
import { makeWorld, probe } from './world'

const PERSON = ['composer', 'bridge', 'slack-ping', 'sdk']
const AGENT = ['peer', 'peer-send-message', 'coordinator', 'projects-relay', 'observer']
const DROP = ['task-notification', 'scheduled-trigger', 'auto-continuation', 'observer-activity', 'unclassified', 'channel', 'plugin']

describe('classifyOrigin (rule P2)', () => {
  test('each of the 16 kinds gives its class', async () => {
    expect(PERSON.length + AGENT.length + DROP.length).toBe(16)
    for (const k of PERSON) expect([k, classifyOrigin(k)]).toEqual([k, 'person'])
    for (const k of AGENT) expect([k, classifyOrigin(k)]).toEqual([k, 'agent'])
    for (const k of DROP) expect([k, classifyOrigin(k)]).toEqual([k, 'drop'])
  })
  test('an unknown kind is dropped; no kind is the person (P5)', async () => {
    expect(classifyOrigin('something-new')).toBe('drop')
    expect(classifyOrigin(undefined)).toBe('person')
  })
})

describe('planTurn (rule P3, P4 and the algorithm)', () => {
  const P = (text: string) => ({ from: 'person' as const, text })
  const A = (text: string) => ({ from: 'agent' as const, text })
  test('answer without a prompt: one entry with an empty prompt (automatic notices are dropped, each kind)', async () => {
    expect(planTurn([], 't1', 'done')).toEqual([{ turnId: 't1', prompt: '', answer: 'done' }])
  })
  test('nothing at all: no entry', async () => {
    expect(planTurn([], 't1', '')).toEqual([])
  })
  test('turn with tool calls queues prompt and answer only', async () => {
    const e = planTurn([P('fix it')], 't1', 'fixed')
    expect(e).toEqual([{ turnId: 't1', prompt: 'fix it', answer: 'fixed' }])
    expect(Object.keys(e[0]!).sort()).toEqual(['answer', 'prompt', 'turnId'])
  })
  test("another agent's message is sent as agent", async () => {
    expect(planTurn([A('hello from peer')], 't1', 'ok')).toEqual([{ turnId: 't1', prompt: 'hello from peer', promptFrom: 'agent', answer: 'ok' }])
  })
  test('a notice in a running turn does not replace the typed prompt (the dropped one never reaches pending)', async () => {
    // prompt.submit keeps only person and agent classes (P3); the typed prompt alone is pending
    expect(classifyOrigin('task-notification')).toBe('drop')
    expect(planTurn([P('typed')], 't1', 'answer')).toEqual([{ turnId: 't1', prompt: 'typed', answer: 'answer' }])
  })
  test('two prompts in one turn keep their order and the answer stands on the last', async () => {
    expect(planTurn([P('one'), A('two'), P('three')], 't1', 'ans')).toEqual([
      { turnId: 't1', prompt: 'one', answer: '' },
      { turnId: 't1:p2', prompt: 'two', promptFrom: 'agent', answer: '' },
      { turnId: 't1:p3', prompt: 'three', answer: 'ans' },
    ])
  })
})

describe('turn.complete raised through the engine', () => {
  const mk = (on: any) => { on('turn.complete', async () => ({ text: '' })); return makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9' }) }
  const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
  test('sub agent turn queues nothing', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await $.turn.complete({ ...done, turnId: 'sa1', answer: 'sub agent report', agentId: 'agent-x' } as any)
    expect(w.sent.filter((s) => s.verb === 'mirror-messaging')).toEqual([])
  })
  test('main agent turn without a prompt: one call with an empty prompt', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await $.turn.complete({ ...done, turnId: 'm1', answer: 'my answer' } as any)
    const calls = w.sent.filter((s) => s.verb === 'mirror-messaging')
    expect(calls.length).toBe(1)
    expect(calls[0]!.args).toMatchObject({ prompt: '', answer: 'my answer', turnId: 'm1' })
    expect('promptFrom' in calls[0]!.args).toBe(false)
  })
})

describe('prompt.submit raised through the engine (rule P3, P4, P5)', () => {
  // A terminal handler lets the test raise prompt.submit with an origin and an agent id, as the engine does.
  const mk = (on: any) => {
    on('turn.complete', async () => ({ text: '' }))
    on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
    return makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9' })
  }
  const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
  const submit = ($: any, text: string, origin?: { kind: string }, agentId?: string) =>
    $.prompt.submit({ text, ...(origin ? { origin } : {}), ...(agentId ? { agentId } : {}) } as any)
  const appends = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'mirror-messaging' && s.args.action === 'append')
  test('a typed prompt then a task notification in one turn: one append with the typed prompt', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'typed words', { kind: 'composer' })
    await submit($, 'a notice text', { kind: 'task-notification' })
    await $.turn.complete({ ...done, turnId: 'e1', answer: 'ans1' } as any)
    const c = appends(w)
    expect(c.length).toBe(1)
    expect(c[0]!.args).toMatchObject({ prompt: 'typed words', answer: 'ans1', turnId: 'e1' })
  })
  test('a turn that holds only a notice: the answer is stored with an empty prompt', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'wake up', { kind: 'scheduled-trigger' })
    await $.turn.complete({ ...done, turnId: 'e2', answer: 'ans2' } as any)
    const c = appends(w)
    expect(c.length).toBe(1)
    expect(c[0]!.args).toMatchObject({ prompt: '', answer: 'ans2' })
    expect(JSON.stringify(c[0]!.args)).not.toContain('wake up')
  })
  test('a prompt from another agent is sent with promptFrom agent', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'hello from a peer', { kind: 'peer' })
    await $.turn.complete({ ...done, turnId: 'e3', answer: 'ans3' } as any)
    expect(appends(w)[0]!.args).toMatchObject({ prompt: 'hello from a peer', promptFrom: 'agent', answer: 'ans3' })
  })
  test('a sub agent prompt is not kept; a prompt with no origin counts as the person', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'sub agent prompt', { kind: 'composer' }, 'agent-x')
    await submit($, 'engine without origin')
    await $.turn.complete({ ...done, turnId: 'e4', answer: 'ans4' } as any)
    const c = appends(w)
    expect(c.length).toBe(1)
    expect(c[0]!.args).toMatchObject({ prompt: 'engine without origin', answer: 'ans4' })
  })
  test('the log carries the origin kind and class but never the prompt text', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'SECRETWORDS-123', { kind: 'composer' })
    await $.turn.complete({ ...done, turnId: 'e5', answer: 'ans5' } as any)
    const log = w.files.get('/w/b/kinitro-ai.log') ?? ''
    expect(log).toContain('origin=composer class=person')
    expect(log.includes('SECRETWORDS-123')).toBe(false)
  })
})
