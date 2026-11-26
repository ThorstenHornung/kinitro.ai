import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { wakeText } from '../hooks/register'

// Item 4.2.1-4945 (PO 26.11.2026): a message that arrives in the agent's kinitro.ai chat while the Claude Code session is idle starts
// a turn of its own: after the background inbox fetch, the plugin submits one prompt with every new message. Not while a turn runs,
// never in an inert session; a message is given to the agent once.
const done = { reason: 'answer', durationMs: 1, isAborted: false } as const
const MSG = { at: '2026-11-26T10:00:00Z', from: 'Manager', text: 'please look at item 4855' }
const mk = (on: any, inbox: Array<Record<string, unknown>>) => {
  const prompts: any[] = []
  on('turn.complete', async () => ({ text: '' }))
  on('prompt.submit', async (_$: any, e: any) => { prompts.push(e); return { text: e.text } })
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9' })
  const gate = { open: true, served: false }   // open=false holds the messages back until the test opens it
  w.verbs = {
    'mirror-messaging': (args) => {
      if (args.action !== 'fetch') return { result: JSON.stringify({ status: 'ok', rowIds: ['r1'] }) }
      const messages = gate.served || !gate.open ? [] : inbox
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
    const { prompts } = mk(on, [MSG, { ...MSG, at: '2026-11-26T10:00:05Z', text: 'and 4856 too' }])
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

  test('W2: no wake while a turn runs; the wake follows once the turn ends', async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const { prompts, gate } = mk(on, [MSG])
    gate.open = false   // the message arrives only after the typed prompt has started its turn
    await start($)
    await $.prompt.submit({ text: 'working on something', origin: { kind: 'composer' } } as any)
    gate.open = true
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(0)
    await $.turn.complete({ ...done, turnId: 't1', answer: 'done' } as any)
    await clock.advance(61_000)
    expect(wakes(prompts)).toHaveLength(1)
    expect(wakes(prompts)[0].text).toContain('please look at item 4855')
  })

  test('W3: the wake text names the count, the sender and the time', async () => {
    const t = wakeText([MSG as any])
    expect(t).toContain('(1)')
    expect(t).toContain('2026-11-26 10:00 (Manager) please look at item 4855')
  })
})
