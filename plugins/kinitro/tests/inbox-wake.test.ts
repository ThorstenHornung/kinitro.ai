import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { wakeText } from '../hooks/register'

// Item 4.2.1-4945 (PO 26.11.2026): a message that arrives in the agent's kinitro.ai chat while the Claude Code session is idle starts
// a turn of its own: after the background inbox fetch, the plugin submits one prompt with every new message. Not while a turn runs,
// never in an inert session; a message is given to the agent once.
const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
const MSG = { at: new Date().toISOString(), from: 'Manager', text: 'please look at item 4855' }
const mk = (on: any, inbox: Array<Record<string, unknown>>, always = false) => {
  const prompts: any[] = []
  on('turn.complete', async () => ({ text: '' }))
  on('prompt.submit', async (_$: any, e: any) => { prompts.push(e); return { text: e.text } })
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9' })
  const gate = { open: true, served: false }   // open=false holds the messages back until the test opens it
  w.verbs = {
    'mirror-messaging': (args) => {
      if (args.action !== 'fetch') return { result: JSON.stringify({ status: 'ok', rowIds: ['r1'] }) }
      const messages = (gate.served && !always) || !gate.open ? [] : inbox
      if (gate.open) gate.served = true
      return { result: JSON.stringify({ status: 'ok', messages, nextCursor: 'c1' }) }
    },
  }
  return { w, prompts, gate }
}
const start = async ($: any) => {
  await $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
  await probe($, 'reload')
}
const wakes = (prompts: any[]) => prompts.filter((p) => p.origin?.kind === 'plugin')

describe('inbox wake (item 4.2.1-4945)', () => {
  test('W1: a new chat message wakes an idle session with one prompt that carries it', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const { prompts } = mk(on, [MSG, { ...MSG, text: 'and 4856 too' }])
    await start($)
    await clock.advance(61_000)
    const w = wakes(prompts)
    expect(w).toHaveLength(1)
    expect(w[0].text).toContain('please look at item 4855')
    expect(w[0].text).toContain('and 4856 too')
    expect(w[0].text).toContain('(2)')
    await $.turn.complete({ ...done, turnId: 'w1', answer: 'looked' } as any)
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)   // given once: no second wake for the same messages
  })

  test('W2: a message that arrives during a running turn is queued at once as its own prompt (0.27.2), given once', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const { prompts, gate } = mk(on, [MSG])
    gate.open = false   // the message arrives only after the typed prompt has started its turn
    await start($)
    await $.prompt.submit({ text: 'working on something', origin: { kind: 'composer' } } as any)
    gate.open = true
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)
    expect(wakes(prompts)[0].text).toContain('please look at item 4855')
    await $.turn.complete({ ...done, turnId: 't1', answer: 'done' } as any)
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)
  })

  test('W3: the wake text names the count, the sender and the time', async () => {
    const t = wakeText([MSG as any])
    expect(t).toContain('(1)')
    expect(t).toContain(`${MSG.at.slice(0, 16).replace('T', ' ')} (Manager) please look at item 4855`)
  })

  // 0.27.5: the wake hands over only what arrived after the current seat was bound; an old backlog never starts a turn
  const OLD = [1, 2, 3].map((i) => ({ at: `2026-11-2${3 + (i % 2)}T1${i}:00:00Z`, from: 'Manager', text: `old chat ${i}` }))
  const logOf = (w: any) => String(w.files.get('/w/b/kinitro-ai.log') ?? '')
  const skipLines = (w: any) => logOf(w).split('\n').filter((l) => l.includes('old message(s) skipped'))

  test('W4: a rebind to another seat with a backlog of old messages gives no wake and one log line', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const { w, prompts } = mk(on, OLD, true)   // the server serves the backlog on every fetch, cursor or not
    await start($)
    await probe($, 'set-domain', { domain: 'alpha' })
    await clock.advance(61_000)
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(0)
    expect(skipLines(w)).toHaveLength(1)
    expect(skipLines(w)[0]).toContain('inbox wake: 3 old message(s) skipped')
  })

  test('W5: a new message after the rebind wakes once, the old ones stay out', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const msgs: Array<Record<string, unknown>> = [...OLD]
    const { prompts } = mk(on, msgs, true)
    await start($)
    await probe($, 'set-domain', { domain: 'alpha' })
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(0)
    msgs.push({ ...MSG, text: 'fresh after the rebind' })
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)
    expect(wakes(prompts)[0].text).toContain('fresh after the rebind')
    expect(wakes(prompts)[0].text).not.toContain('old chat')
    expect(wakes(prompts)[0].text).toContain('(1)')
    await $.turn.complete({ ...done, turnId: 'w5', answer: 'ok' } as any)
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)
  })

  test('W6: 25 new messages give one wake that lists 20 and names 25', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const many = Array.from({ length: 25 }, (_, i) => ({ ...MSG, text: `batch m${String(i + 1).padStart(2, '0')}` }))
    const { prompts } = mk(on, many)
    await start($)
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)
    const t = wakes(prompts)[0].text as string
    expect(t).toContain('(25)')
    expect(t).toContain('read-chat-tail')
    expect(t.match(/batch m\d\d/g)).toHaveLength(20)
    expect(t).toContain('batch m25')
    expect(t).not.toContain('batch m05')
  })

  test('W7: rebind A to B to A with a server that keeps serving the backlog: old messages never come back, nothing is told twice', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const { prompts } = mk(on, OLD, true)
    await start($)
    for (const d of ['beta', 'alpha', 'beta', 'alpha', 'beta']) {
      if (d !== 'beta' || prompts.length) await probe($, 'set-domain', { domain: d })
      await clock.advance(61_000)
      await $.turn.complete({ ...done, turnId: `w7${d}`, answer: 'ok' } as any)
    }
    expect(wakes(prompts)).toHaveLength(0)
  })

  test('W8: the context block of a typed prompt after a rebind skips the old messages and caps at 20', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const many = Array.from({ length: 25 }, (_, i) => ({ ...MSG, text: `batch m${String(i + 1).padStart(2, '0')}` }))
    const { prompts } = mk(on, [...OLD, ...many], true)
    await start($)
    await probe($, 'set-domain', { domain: 'alpha' })
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' } } as any)
    const typed = prompts.filter((p) => p.origin?.kind !== 'plugin').pop()
    const ctx = (typed?.context ?? []).join('\n')
    expect(ctx).not.toContain('old chat')
    expect(ctx).toContain('(25)')
    expect(String(ctx).match(/batch m\d\d/g)).toHaveLength(20)
    void clock
  })
})
