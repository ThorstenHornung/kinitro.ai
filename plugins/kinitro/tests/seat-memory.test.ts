import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { memoryStartBlock, rankNotes, ruleLine } from '../hooks/register'
import { makeWorld, probe } from './world'

// 0.27.0 (item 4.2.1-4316, D-MEMPUSH): one memory for every attached session. The kinitro memory comes ONCE per context (start, compaction, domain choice) as one block
// ranked by the open work; every other prompt carries the rule line and the todo changes only; a failed read is tried again; the plugin names no node by code (R11).
// Fixtures are in the form the 4.2.1-4455 writer emits (AgentMemorySetService.cs:2240-2276, premise 18).
const NOW = Date.UTC(2026, 10, 12, 10, 0)   // 12.11.2026 10:00 UTC
const DAY = 24 * 3600 * 1000
const stamp = (daysAgo: number) => {
  const d = new Date(NOW - daysAgo * DAY)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}. ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
// a memory-instruction body as the server renders it
const body = (todos: { text: string; daysAgo?: number; item?: number; parked?: boolean }[], exceptions: string[] = [], questions: string[] = []) =>
  ['## Instructions', ...todos.map((t, i) => `${i + 1}. "${t.text}" (${stamp(t.daysAgo ?? 1)})${t.item ? ` [item ${t.item}]` : ''}${t.parked ? ' [parked until 2026-12-01]' : ''}`),
    '{{mx:cache-cut}}', '## Exceptions', ...exceptions, '## Questions', ...questions, ''].join('\n')
const noteLine = (daysAgo: number, k: number, text: string, marks = '') => `- (${stamp(daysAgo)}) [#n${k}] ${text}${marks}`
const sized = (label: string, len: number) => label + ' ' + 'z'.repeat(Math.max(0, len - label.length - 1))

type Cfg = { todo?: () => string; notes?: () => string; topics?: number; turns?: { n: number }; instructions?: any[]; sid?: string }
const INSTR = (turn: string) => [
  { type: 'instruction-persona', source: 'node', text: 'PERSONA-TEXT' },
  { type: 'instruction-standing', source: 'aiagent', text: 'RULES-TEXT' },
  { type: 'instruction-preturn-continue', source: 'aiagent', text: turn },
  { type: 'instruction-postcompaction', source: 'aiagent', text: 'AFTER-TEXT' },
]
// the world: the seat's own sets are read with NO node (R11); an empty set answers status not_found
const mk = (on: any, cfg: Cfg = {}) => {
  const seen: string[] = []
  const turns = cfg.turns ?? { n: 0 }
  const mode = { todo: 'ok' as 'ok' | 'fail' | 'hang', notes: 'ok' as 'ok' | 'fail' | 'hang' }
  const clock = mock.clock(on, { now: NOW })
  on('session.turns', async () => ({ value: turns.n }))
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n\n')); return { text: e.text } })
  on('session.compact', async (_$: any, e: any) => ({ messages: e.messages.slice(-1), tokensBefore: 10, tokensAfter: 1 }))
  const w = makeWorld(on, {
    files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: cfg.sid ?? 'S7',
    verbs: {
      'get-briefing': () => ({ result: JSON.stringify({ status: 'ok', instructions: cfg.instructions ?? INSTR('TURN-TEXT') }) }),
      'search-memory': () => ({ result: JSON.stringify({ topics: Array.from({ length: cfg.topics ?? 0 }, (_, i) => ({ topic: `t${i}`, entryCount: 1 })) }) }),
      'load-node-content': (a: any) => {
        const kind = a.contentTypeCode === 'memory-instruction' ? 'todo' : 'notes'
        const m = mode[kind]
        if (m === 'fail') throw new Error('server error 500')
        if (m === 'hang') { setTimeout(() => { void clock.advance(3000) }, 0); return new Promise(() => {}) }   // the deadline passes while the read hangs
        const b = kind === 'todo' ? cfg.todo?.() : cfg.notes?.()
        return { result: JSON.stringify(b === undefined || b === '' ? { status: 'not_found', contentTypeCode: a.contentTypeCode, reason: `Your ${a.contentTypeCode} set is empty or not written yet.` } : { contentTypeCode: a.contentTypeCode, body: b }) }
      },
    },
  })
  return { seen, turns, mode, w, clock }
}
const submit = async ($: any, turns: { n: number }, n: number, text = 'p') => { turns.n = n; await $.prompt.submit({ text } as any) }
const compact = ($: any) => $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'a', toolUses: [] }, { role: 'assistant', text: 'b', toolUses: [] }] })
const memoryCalls = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'load-node-content')

describe('K1 first prompt: one memory block', () => {
  // 3 open todos (two with an item), 30 note lines: 1 deviation, 2 of the open items, the rest lessons of different age
  const todos = [{ text: 'build the plugin', item: 4316 }, { text: 'review the guard', item: 4500 }, { text: 'plain todo' }]
  const notes = () => [
    ...Array.from({ length: 27 }, (_, i) => noteLine(2 + i, 100 + i, sized(`lesson ${i}`, 200), ' [type: lesson] [review: 2027-01-01]')),
    noteLine(5, 1, 'DEVIATION: skipped the dry run — evidence: job 12', ' [item 3999] [type: lesson] [review: 2027-01-01]'),
    noteLine(40, 2, sized('note of open item 4316', 150), ' [item 4316]'),
    noteLine(41, 3, sized('note of open item 4500', 150), ' [item 4500]'),
  ].join('\n')

  test('the block: todos in full, then the deviation, the two open-item notes, then the newest; at most 3,500 chars; the pointer line with the counts; one listTopics call and nothing else', async ($, on) => {
    const { seen, w } = mk(on, { todo: () => body(todos), notes, topics: 7 })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    const s = seen[0]!
    const start = s.indexOf('Your kinitro memory (name-agent-beta)')
    expect(start).toBeGreaterThan(-1)
    const block = s.slice(start).split('\n\n')[0]!
    expect(block.length).toBeLessThanOrEqual(3500)
    const at = (needle: string) => block.indexOf(needle)
    expect(at('1. "build the plugin"')).toBeGreaterThan(-1)
    expect(at('3. "plain todo"')).toBeGreaterThan(at('1. "build the plugin"'))
    expect(at('DEVIATION: skipped the dry run')).toBeGreaterThan(at('3. "plain todo"'))
    expect(at('note of open item 4316')).toBeGreaterThan(at('DEVIATION: skipped the dry run'))
    expect(at('note of open item 4500')).toBeGreaterThan(at('note of open item 4316') - 1)
    expect(at('lesson 0 ')).toBeGreaterThan(at('note of open item 4500'))   // then the newest
    expect(at('lesson 0 ')).toBeLessThan(at('lesson 1 '))
    const m = /Showing (\d+) of 30 notes\. Read all of them with load-node-content \(type memory-notes\)\./.exec(block)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(3)
    expect(Number(m![1])).toBeLessThan(30)
    expect(block).toContain('7 memory topics: search-memory lists them.')
    // no search-memory call but the plugin's own topic count, and the reads name no node
    const search = w.sent.filter((c) => c.verb === 'search-memory')
    expect(search).toHaveLength(1)
    expect(search[0]!.args.listTopics).toBe(true)
    expect(memoryCalls(w).map((c) => c.args.contentTypeCode).sort()).toEqual(['memory-instruction', 'memory-notes'])
  })

  test('control: empty sets give "No open todos." and no notes part', async ($, on) => {
    const { seen } = mk(on, { todo: () => '', notes: () => '' })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen[0]).toContain('Your kinitro memory (name-agent-beta)')
    expect(seen[0]).toContain('No open todos.')
    expect(seen[0]).not.toContain('Showing')
    expect(seen[0]).not.toContain('notes shown')
    expect(seen[0]).not.toContain('kinitro memory not read')
  })
})

describe('K2 the other prompts: the rule line and nothing else', () => {
  test('second prompt without a change: no todo text, no push line, the rule line; a 600-char "Every turn" section is cut to 300 and the cut is logged once', async ($, on) => {
    const long = 'R'.repeat(600)
    const { seen, turns, w } = mk(on, { todo: () => body([{ text: 'remember me', item: 1 }]), instructions: INSTR(long) })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    await submit($, turns, 1)
    await submit($, turns, 2)
    expect(seen[1]).not.toContain('remember me')
    expect(seen[1]).not.toContain('Your kinitro memory')
    expect(seen[1]).not.toContain('Update your todos now')
    expect(seen[1]).toContain(`Every turn:\n${'R'.repeat(300)}`)
    expect(seen[1]).not.toContain('R'.repeat(301))
    expect(seen[0]).toContain(`Every turn:\n${'R'.repeat(300)}`)
    const cuts = (w.files.get('/w/b/kinitro-ai.log') ?? '').split('\n').filter((l) => l.includes('rule line cut from 600'))
    expect(cuts).toHaveLength(1)
  })
  test('the rule line function: at most 300 characters, the original length of a cut one', () => {
    expect(ruleLine('short rule')).toEqual({ text: 'short rule' })
    const r = ruleLine('x'.repeat(301))
    expect(r.text).toHaveLength(300)
    expect(r.cutFrom).toBe(301)
  })
})

describe('K3 the todo delta', () => {
  const t = (n: number, extra = '') => ({ text: `todo ${n}${extra}` })
  test('a todo added, one changed and one closed between two prompts give exactly the three lines', async ($, on) => {
    let cur = body([t(1), t(2), t(3)])
    const { seen, turns } = mk(on, { todo: () => cur })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    // the server never reuses a number: todo 3 is closed, 4 is new (the fixture is written with its numbers)
    cur = ['## Instructions', `1. "todo 1" (${stamp(1)})`, `2. "todo 2 changed" (${stamp(1)})`, `4. "todo 4" (${stamp(0)})`, '{{mx:cache-cut}}', '## Exceptions', '## Questions', ''].join('\n')
    await submit($, turns, 1)
    const d = seen[1]!
    expect(d).toContain('Todos changed since your last turn:')
    expect(d).toContain('new 4. todo 4')
    expect(d).toContain('changed 2. todo 2 changed')
    expect(d).toContain('closed 3.')
    expect(d).not.toContain('todo 1')
    expect(d.split('\n').filter((l) => /^(new|changed|closed) /.test(l))).toHaveLength(3)
    await submit($, turns, 2)
    expect(seen[2]).not.toContain('Todos changed since your last turn')
  })
  test('over 1,200 characters of changes: the read hint', async ($, on) => {
    let cur = body([t(1)])
    const { seen, turns } = mk(on, { todo: () => cur })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    cur = body(Array.from({ length: 6 }, (_, i) => ({ text: sized(`big ${i}`, 300) })))
    await submit($, turns, 1)
    expect(seen[1]).toContain('Your todo list changed in 6 entries: read it with load-node-content (type memory-instruction).')
    expect(seen[1]).not.toContain('Todos changed since your last turn')
  })
  test('another session on the same state file: a refill with its todoSeen gives the start block once, then deltas against the own snapshot (E2: todo 14)', async ($, on) => {
    let cur = body(Array.from({ length: 13 }, (_, i) => t(i + 1)))
    const { seen, turns, w } = mk(on, { todo: () => cur })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    await submit($, turns, 1)
    expect(seen[1]).not.toContain('Your kinitro memory')
    // the other session writes the shared state file with its own keys; a refill of this session drops them
    w.files.set('/w/b/.kinitro-ai-state.json', JSON.stringify({ memorySid: 'OTHER', todoSeen: { '1': 'x' } }))
    await ($ as any).session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
    await submit($, turns, 2)
    expect(seen[2]).toContain('Your kinitro memory')
    cur = body(Array.from({ length: 14 }, (_, i) => t(i + 1)))
    await submit($, turns, 3)
    expect(seen[3]).not.toContain('Your kinitro memory')
    expect(seen[3]).toContain('Todos changed since your last turn:\nnew 14. todo 14')
    expect(seen[3]).not.toContain('new 13')
    await submit($, turns, 4)
    expect(seen[4]).not.toContain('new 14')
    // a new session id in the module (the process serves another session) gives the block once as well
    w.sid = 'S9'
    await submit($, turns, 5)
    expect(seen[5]).toContain('Your kinitro memory')
  })
})

describe('K4 compaction and domain choice', () => {
  test('after session.compact the block comes again; the next prompt carries no todo text', async ($, on) => {
    const { seen, turns } = mk(on, { todo: () => body([{ text: 'keep this todo' }]) })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    await submit($, turns, 3)
    expect(seen[1]).not.toContain('keep this todo')
    await compact($)
    await submit($, turns, 4)
    expect(seen[2]).toContain('Your kinitro memory')
    expect(seen[2]).toContain('keep this todo')
    await submit($, turns, 5)
    expect(seen[3]).not.toContain('keep this todo')
  })
  test('after a domain choice the block comes again', async ($, on) => {
    const { seen, turns } = mk(on, { todo: () => body([{ text: 'keep this todo' }]) })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    await submit($, turns, 3)
    expect(seen[1]).not.toContain('Your kinitro memory')
    await probe($, 'set-domain', { domain: 'gamma' })
    await submit($, turns, 4)
    expect(seen[2]).toContain('Your kinitro memory')
    expect(seen[2]).toContain('keep this todo')
  })
})

describe('K5 todos over the budget', () => {
  test('12 todos of 392 characters: all in full, the over-budget line, no note line, the pointer line', async ($, on) => {
    const todos = Array.from({ length: 12 }, (_, i) => ({ text: sized(`big todo ${i + 1}`, 392) }))
    const notes = [noteLine(3, 1, 'a note one'), noteLine(4, 2, 'a note two')].join('\n')
    const { seen } = mk(on, { todo: () => body(todos), notes: () => notes })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    for (const td of todos) expect(seen[0]).toContain(`"${td.text}"`)
    expect(seen[0]).toMatch(/Your todos alone are 4,9\d\d characters, more than the 3,500 of this block: consolidate them now \(help ref\/content\/memory\/todo-list\)\./)
    expect(seen[0]).not.toContain('a note one')
    expect(seen[0]).toContain('Showing 0 of 2 notes. Read all of them with load-node-content (type memory-notes).')
  })
  test('pure: the start block never cuts a todo to the budget', () => {
    const items = Array.from({ length: 12 }, (_, i) => `${i + 1}. "${sized('t', 400)}" (01.11. 10:00)`)
    const b = memoryStartBlock({ todoClean: ['## Todo (user-approved)', ...items].join('\n'), notesBody: '- (01.11. 10:00) n', topicCount: 0, agentCode: 'A', domainLine: '', now: NOW, tag: '', reviewDue: false })
    expect(b.todosOver).toBe(true)
    for (const l of items) expect(b.text).toContain(l)
    expect(b.notesShown).toBe(0)
  })
})

describe('K6 retry', () => {
  const live = () => body([{ text: 'a todo' }])
  test('a notes read that never answers gives the failure line; the next prompt delivers; the third does not repeat it', async ($, on) => {
    const { seen, turns, mode } = mk(on, { todo: live, notes: () => noteLine(2, 1, 'a note') })
    mode.notes = 'hang'
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen[0]).toContain('kinitro memory not read (timeout): read it with load-node-content (type memory-instruction and memory-notes).')
    expect(JSON.parse(await probe($, 'status')).details.join('\n')).toContain('memory: pending (try 1 of 5)')
    mode.notes = 'ok'
    await submit($, turns, 1)
    expect(seen[1]).toContain('Your kinitro memory')
    expect(seen[1]).toContain('a note')
    expect(seen[1]).not.toContain('kinitro memory not read')
    await submit($, turns, 2)
    expect(seen[2]).not.toContain('Your kinitro memory')
    expect(seen[2]).not.toContain('kinitro memory not read')
    expect(JSON.parse(await probe($, 'status')).details.join('\n')).toMatch(/memory: delivered \d\d:\d\d \(/)
  })
  test('at most 5 tries: a read that keeps failing is retried 5 times and then left alone; the status says failed', async ($, on) => {
    const { seen, turns, mode } = mk(on, { todo: live, notes: () => '' })
    mode.todo = 'fail'
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    for (let i = 1; i <= 7; i++) await submit($, turns, i)
    const withLine = seen.map((s) => s.includes('kinitro memory not read'))
    expect(withLine.slice(0, 6)).toEqual([true, true, true, true, true, true])   // the start prompt and 5 retries
    expect(withLine[6]).toBe(false)
    expect(withLine[7]).toBe(false)
    expect(JSON.parse(await probe($, 'status')).details.join('\n')).toContain('memory: failed (')
  })
  test('control: a good read sets no pending state', async ($, on) => {
    const { seen, turns } = mk(on, { todo: live, notes: () => noteLine(2, 1, 'a note') })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen[0]).not.toContain('kinitro memory not read')
    await submit($, turns, 1)
    expect(seen[1]).not.toContain('Your kinitro memory')
    const st = JSON.parse(await probe($, 'status')).details.join('\n')
    expect(st).not.toContain('memory: pending')
    expect(st).toMatch(/memory: delivered/)
  })
})

describe('K7 the weekly review line', () => {
  const due = [1, 2, 3, 4].map((k) => noteLine(10, k, `Keep the gate log short ${k} — evidence: run 12`, ' [type: lesson] [review: 2026-11-08]')).join('\n')
  const REVIEW = '4 memory entries are past their review date. Review them this week: keep, change or retire each (help ref/content/memory/todo-list).'
  test('4 past-due lines give the line once; a start 3 days later does not; one 8 days later gives it again', async ($, on) => {
    const { seen, turns, w, clock } = mk(on, { todo: () => body([{ text: 'x' }]), notes: () => due })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen[0]).toContain(REVIEW)
    expect(seen[0]!.split('\n').filter((l) => l.includes('(review due)')).length).toBe(4)
    await clock.advance(3 * DAY)
    await compact($)
    await submit($, turns, 2)
    expect(seen[1]).toContain('Your kinitro memory')
    expect(seen[1]).not.toContain('past their review date')
    await clock.advance(5 * DAY)   // 8 days after the first
    await compact($)
    await submit($, turns, 3)
    expect(seen[2]).toContain(REVIEW)
    expect(JSON.parse(w.files.get('/w/b/.kinitro-ai-state.json')!).reviewPromptAt).toBeGreaterThan(NOW)
  })
  test('control: a line with [review: next sprint] (not a date) is never due', async ($, on) => {
    const { seen } = mk(on, { todo: () => body([{ text: 'x' }]), notes: () => noteLine(10, 1, 'Open question — evidence: e', ' [type: lesson] [review: next sprint]') })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen[0]).toContain('Open question')
    expect(seen[0]).not.toContain('past their review date')
    expect(seen[0]).not.toContain('(review due)')
  })
})

describe('K8 /kinitro status', () => {
  test('holds the memory: and rule line: lines; the old todo line is gone', async ($, on) => {
    const { seen } = mk(on, { todo: () => body([{ text: 'a' }, { text: 'b' }]), notes: () => [noteLine(1, 1, 'n1'), noteLine(2, 2, 'n2'), noteLine(3, 3, 'n3')].join('\n'), instructions: INSTR('R'.repeat(450)) })
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen).toHaveLength(1)
    const d = JSON.parse(await probe($, 'status')).details.join('\n')
    expect(d).toMatch(/memory: delivered \d\d:\d\d \([\d,]+ chars, todos 2, notes 3 of 3\)/)
    expect(d).toContain('rule line: 300 chars (cut from 450)')
    expect(d).not.toContain('todos: full text when the list changes')
  })
  test('no rule line in the briefing: "rule line: 0 chars"; before the first prompt: "memory: not delivered yet"', async ($, on) => {
    mk(on, { instructions: [{ type: 'instruction-persona', source: 'node', text: 'P' }] })
    await probe($, 'reload')
    const d = JSON.parse(await probe($, 'status')).details.join('\n')
    expect(d).toContain('rule line: 0 chars')
    expect(d).toContain('memory: not delivered yet')
  })
})

describe('K9 the rank of the notes', () => {
  test('lines without the marks rank as lessons; a [type: rule] line older than a lesson ranks first; deviation, then open item, then newest', () => {
    const body = [
      noteLine(1, 9, 'a lesson without marks'),
      '- (02.10. 09:00) [#n1] Run the dry run first — evidence: gate log [type: rule] [review: 2027-01-02]',
      '- (12.11. 08:00) [#n7] DEVIATION: skipped the dry run — evidence: job 12 [item 4316] [type: lesson] [review: 2026-12-12]',
      noteLine(30, 4, 'old note of the open item', ' [item 4316]'),
      noteLine(0, 5, 'newest lesson', ' [type: lesson]'),
    ].join('\n')
    const r = rankNotes(body, new Set(['4316']), NOW).map((n) => n.line)
    expect(r[0]).toContain('Run the dry run first')
    expect(r[1]).toContain('DEVIATION: skipped the dry run')
    expect(r[2]).toContain('old note of the open item')
    expect(r[3]).toContain('newest lesson')
    expect(r[4]).toContain('a lesson without marks')
  })
  test('the review mark: a passed date is due, a future date and a non-date are not', () => {
    const r = rankNotes([noteLine(1, 1, 'a', ' [review: 2026-11-08]'), noteLine(1, 2, 'b', ' [review: 2026-12-08]'), noteLine(1, 3, 'c', ' [review: soon]')].join('\n'), new Set(), NOW)
    expect(r.map((n) => n.reviewDue).sort()).toEqual([false, false, true])
  })
  test('a start block cuts each note line to 240 characters with the visible mark', () => {
    const b = memoryStartBlock({ todoClean: undefined, notesBody: noteLine(1, 1, 'q'.repeat(500)), topicCount: 0, agentCode: 'A', domainLine: '', now: NOW, tag: '', reviewDue: false })
    expect(b.text).toContain('q'.repeat(100) + '')
    expect(b.text).toContain(' [...]')
    expect(b.text).not.toContain('q'.repeat(300))
    expect(b.text).toContain('All 1 notes shown.')
  })
})

describe('K10 node references without codes (R11)', () => {
  test('against a server that refuses nodeCode (graph_code_retired), answers get-node without a code and a node-less read from the seat\'s own set: the briefing loads, the first prompt carries the block, no call sends nodeCode', async ($, on) => {
    const { seen, w } = mk(on, { todo: () => '', notes: () => '' })
    const st = await probe($, 'reload')
    expect(st).toContain('domain: beta')
    await $.prompt.submit({ text: 'one' } as any)
    expect(seen[0]).toContain('Your kinitro memory (name-agent-beta)')   // the seat's name, the display label
    expect(seen[0]).toContain('No open todos.')
    expect(seen[0]).not.toContain('kinitro memory not read')
    expect(w.sent.some((s) => 'nodeCode' in s.args)).toBe(false)
    const reads = memoryCalls(w)
    expect(reads.length).toBeGreaterThan(0)
    for (const c of reads) expect(Object.keys(c.args).filter((k) => k !== 'contentTypeCode' && k !== 'domainRef' && k !== 'tool_use_id')).toEqual([])   // no node named at all
    const log = w.files.get('/w/b/kinitro-ai.log') ?? ''
    expect(log).not.toContain('graph_code_retired')
    expect(log).not.toContain('briefing FAILED')
  })
})
