import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'

// Item 4.2.1-4075: the prompts a person types reach the agent's kinitro.ai chat once, before the answer of their turn; a prompt that
// came from the kinitro.ai chat is not mirrored again; schedules, loops, wake-ups, task notifications and system reminders are not
// mirrored; with mirroring off nothing is.
const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
const PROMPTS = '/w/b/.kinitro-ai-prompts.json'
const mk = (on: any, files: Array<[string, string]> = [], inbox: Array<Record<string, unknown>> = [], atClose?: ($: any, e: any) => Promise<void>) => {
  on('turn.complete', async ($: any, e: any) => { await atClose?.($, e); return { text: '' } })
  on('prompt.submit', async (_$: any, e: any) => ({ text: e.text }))
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n'], ...files]), cwd: '/w/b', root: '/w/b', sid: 'S9' })
  w.verbs = {
    'mirror-messaging': (args) => ({ result: JSON.stringify(args.action === 'fetch' ? { status: 'ok', messages: args.cursor ? [] : inbox, nextCursor: 'c1' } : { status: 'ok', rowIds: ['r1', 'r2'] }) }),
  }
  return w
}
const submit = ($: any, text: string, kind?: string) => $.prompt.submit({ text, ...(kind ? { origin: { kind } } : {}) } as any)
const complete = ($: any, id: string, answer = 'ans ' + id) => $.turn.complete({ ...done, turnId: id, answer } as any)
const appends = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'mirror-messaging' && s.args.action === 'append')
const mirrorCalls = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'mirror-messaging')

describe('criterion 1: a typed prompt is mirrored once, before the answer of its turn', () => {
  test('one append carries the typed prompt and the answer of the turn (the prompt row comes first)', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'please fix the build', 'composer')
    await complete($, 't1')
    const c = appends(w)
    expect(c.length).toBe(1)
    expect(c[0]!.args).toMatchObject({ prompt: 'please fix the build', answer: 'ans t1', turnId: 't1' })
    await probe($, 'status')
    expect(appends(w).length).toBe(1)
  })
  test('the prompt is written down when it is typed, not only when the turn ends', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'first words', 'bridge')
    const st = JSON.parse(w.files.get(PROMPTS) ?? '{}')
    expect(st.sid).toBe('S9')
    expect((st.prompts ?? []).map((p: any) => p.text)).toEqual(['first words'])
    await complete($, 't2')
    expect(JSON.parse(w.files.get(PROMPTS)!).prompts).toEqual([])
  })
  test('a plugin restart between the prompt and the end of the turn keeps the prompt', async ($, on) => {
    const w = mk(on, [[PROMPTS, JSON.stringify({ sid: 'S9', prompts: [{ from: 'person', text: 'typed before the restart' }], auto: false })]])
    await probe($, 'reload')
    await complete($, 't3')
    expect(appends(w)[0]!.args).toMatchObject({ prompt: 'typed before the restart', answer: 'ans t3', turnId: 't3' })
  })
  test('the prompts file of another session is not used', async ($, on) => {
    const w = mk(on, [[PROMPTS, JSON.stringify({ sid: 'OTHER', prompts: [{ from: 'person', text: 'not mine' }], auto: false })]])
    await probe($, 'reload')
    await complete($, 't4')
    expect(JSON.stringify(appends(w).map((c) => c.args))).not.toContain('not mine')
  })
  test('a prompt that arrives while the finished turn is closing belongs to the next turn', async ($, on) => {
    const w = mk(on, [], [], async (_$, e) => { if (e.turnId === 'r1') await new Promise((r) => setTimeout(r, 60)) })
    await probe($, 'reload')
    await submit($, 'first prompt', 'bridge')
    const closing = complete($, 'r1')
    await new Promise((r) => setTimeout(r, 10))
    await submit($, 'typed during the close', 'bridge')
    await closing
    await complete($, 'r2')
    const c = appends(w)
    expect(c.map((x) => [x.args.turnId, x.args.prompt])).toEqual([['r1', 'first prompt'], ['r2', 'typed during the close']])
  })
  test('a typed prompt and a task notification in one turn: the typed prompt once', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'typed', 'bridge')
    await submit($, 'a task finished', 'task-notification')
    await complete($, 't5')
    expect(appends(w).map((c) => c.args.prompt)).toEqual(['typed'])
  })
})

describe('criterion 2: a prompt that came from the kinitro.ai chat is not mirrored a second time', () => {
  const chat = (text: string) => [{ text, from: 'person', at: new Date().toISOString(), sessionId: 'kinitro-web' }]
  test('the text of a message in the chat inbox, arriving as a prompt: no prompt is mirrored (the answer still is)', async ($, on) => {
    const w = mk(on, [], chat('Please  check the invoices'))
    await probe($, 'reload')
    await submit($, 'please check the invoices', 'bridge')
    await complete($, 'i1')
    const c = appends(w)
    expect(c.length).toBe(1)
    expect(c[0]!.args).toMatchObject({ prompt: '', answer: 'ans i1' })
    expect(JSON.stringify(c)).not.toContain('invoices')
  })
  test('one chat message covers one prompt: the same words typed again are mirrored', async ($, on) => {
    const w = mk(on, [], chat('go on'))
    await probe($, 'reload')
    await submit($, 'go on', 'bridge')
    await complete($, 'i2')
    await submit($, 'go on', 'bridge')
    await complete($, 'i3')
    expect(appends(w).map((c) => [c.args.turnId, c.args.prompt])).toEqual([['i2', ''], ['i3', 'go on']])
  })
  test('words typed in the terminal are the person own words, also when the chat holds the same text', async ($, on) => {
    const w = mk(on, [], chat('same words'))
    await probe($, 'reload')
    await submit($, 'same words', 'composer')
    await complete($, 'i4')
    expect(appends(w)[0]!.args).toMatchObject({ prompt: 'same words' })
  })
  test('a different prompt is mirrored even with chat messages waiting', async ($, on) => {
    const w = mk(on, [], chat('something else'))
    await probe($, 'reload')
    await submit($, 'my own prompt', 'bridge')
    await complete($, 'i5')
    expect(appends(w)[0]!.args).toMatchObject({ prompt: 'my own prompt' })
  })
})

describe('criterion 3: the text of schedules, loops, wake-ups, notices and system reminders is not mirrored (their answers are)', () => {
  for (const kind of ['scheduled-trigger', 'auto-continuation', 'task-notification', 'observer-activity']) {
    test(`a turn that holds only a ${kind} prompt: the answer is mirrored with an empty prompt, the prompt text is not`, async ($, on) => {
      const w = mk(on)
      await probe($, 'reload')
      await submit($, 'sweep the queue', kind)
      await complete($, 's1', 'sweep done')
      expect(appends(w).map((c) => [c.args.prompt, c.args.answer])).toEqual([['', 'sweep done']])
      expect(JSON.stringify(w.sent)).not.toContain('sweep the queue')
    })
  }
  test('a turn that holds only a system reminder: answer only, no reminder text', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, '<system-reminder>The task tools have not been used recently.</system-reminder>', 'bridge')
    await complete($, 's2')
    expect(appends(w).map((c) => [c.args.prompt, c.args.answer])).toEqual([['', 'ans s2']])
    expect(JSON.stringify(w.sent)).not.toContain('task tools')
  })
  test('an autonomous-loop sentinel text is not mirrored, whatever its origin (the answer is)', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, '<<autonomous-loop-dynamic>>', 'bridge')
    await complete($, 's3')
    expect(appends(w).map((c) => [c.args.prompt, c.args.answer])).toEqual([['', 'ans s3']])
  })
  test('a wake-up and a typed prompt in one turn: the typed prompt is mirrored, the wake-up text is not', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'wake up and sweep', 'scheduled-trigger')
    await submit($, 'actually, do this instead', 'composer')
    await complete($, 's4')
    const c = appends(w)
    expect(c.length).toBe(1)
    expect(c[0]!.args).toMatchObject({ prompt: 'actually, do this instead' })
    expect(JSON.stringify(c)).not.toContain('sweep')
  })
  test('the automatic turn keeps its answer and the turn after it is not held back', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await submit($, 'sweep', 'scheduled-trigger')
    await complete($, 's5')
    await submit($, 'a real question', 'bridge')
    await complete($, 's6')
    expect(appends(w).map((c) => [c.args.turnId, c.args.prompt])).toEqual([['s5', ''], ['s6', 'a real question']])
  })
  test('an engine that raises no prompt.submit for a turn still sends the answer alone (item 3439)', async ($, on) => {
    const w = mk(on)
    await probe($, 'reload')
    await complete($, 's7')
    expect(appends(w)[0]!.args).toMatchObject({ prompt: '', answer: 'ans s7' })
  })
  test('the status line counts the automatic prompts that were not mirrored', async ($, on) => {
    mk(on)
    await probe($, 'reload')
    await submit($, 'sweep', 'scheduled-trigger')
    await complete($, 's8')
    expect(await probe($, 'status')).toContain('1 automatic prompts')
  })
})

describe('criterion 4: mirroring off mirrors nothing', () => {
  test('no mirror-messaging call, and the typed words are not written to the prompts file', async ($, on) => {
    const w = mk(on, [], [{ text: 'chat words', from: 'person', at: new Date().toISOString() }])
    await probe($, 'reload')
    await probe($, 'mirror', { value: 'off' })
    await submit($, 'private words', 'composer')
    await submit($, 'chat words', 'bridge')
    await submit($, 'sweep', 'scheduled-trigger')
    await complete($, 'o1')
    expect(mirrorCalls(w)).toEqual([])
    expect(w.files.get(PROMPTS) ?? '').not.toContain('private words')
    expect(w.files.get('/w/b/.kinitro-ai-outbox.json') ?? '[]').not.toContain('o1')
  })
})
