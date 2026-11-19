import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { writtenNode } from '../hooks/register'

// 0.26.0 (item 4.2.1-4672 P9, P11): refresh re-reads the start briefing and injects it once, marked as superseding; follow mode opens the
// node the agent wrote last (once per turn) in the browser pane, only when a browser tool is listed.
const OWN = 'mcp__plugin_kinitro_kinitro__'
const BROWSER = 'mcp__Claude_Browser__preview_start'
const NODE_URL = 'https://methos.example/page/node?link=NODEPAYLOAD'
const json = (t: string) => JSON.parse(t)
const submit = ($: any, text = 'a') => $.prompt.submit({ text, origin: { kind: 'composer' } } as any)
const complete = ($: any, n: number) => $.turn.complete({ turnId: `t${n}`, reason: 'end_turn', answer: 'done' } as any)

const mk = (on: any, o: { browser?: boolean } = {}) => {
  const seen: string[] = [], opened: string[] = []
  let turns = 0
  on('session.turns', async () => ({ value: turns }))
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n\n')); return { text: e.text } })
  on('turn.complete', async () => ({ text: '' }))
  on('tool.call', { tool: BROWSER }, async (_$: any, e: any) => { opened.push(String(e.url)); return { result: 'ok' } })
  const tools = [`${OWN}current-seat`, `${OWN}open-page`, `${OWN}create-node`, `${OWN}wm-add`, ...(o.browser === false ? [] : [BROWSER])]
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'RF1', tools,
    verbs: {
      'open-page': () => ({ result: JSON.stringify({ url: NODE_URL }) }),
      'create-node': (a) => ({ result: JSON.stringify({ status: 'ok', nodeCode: `4.2.1.${String(a.name ?? 7)}` }) }),
      'wm-add': () => ({ result: JSON.stringify({ status: 'ok', item: { id: '0b0f8a52-3d52-4c5e-9d0f-3a7e2f6f5b11', number: 12 } }) }),
    } })
  return { seen, opened, w, setTurns: (n: number) => { turns = n } }
}
const write = ($: any, verb: string, args: Record<string, unknown> = {}) => $.tool.call({ tool: OWN + verb, ...args })

describe('refresh (P9)', () => {
  test('refresh re-reads the start briefing and injects it once at the next prompt, marked as superseding the earlier one', async ($, on) => {
    const { seen, w, setTurns } = mk(on)
    await probe($, 'reload')
    await submit($)
    setTurns(1); await submit($)
    expect(seen[1]).not.toContain('supersedes')
    const before = w.sent.filter((s) => s.verb === 'get-briefing').length
    const r = json(await probe($, 'refresh'))
    expect(r.status).toBe('ok')
    expect(r.message).toBe('Instructions refreshed from kinitro.ai. They apply from your next message.')
    const gb = w.sent.filter((s) => s.verb === 'get-briefing')
    expect(gb.length).toBeGreaterThan(before)
    expect(gb[gb.length - 1]!.args.moment).toBe('start')
    setTurns(2); await submit($)
    expect(seen[2]).toContain('This refreshed briefing supersedes the earlier one in this session.')
    expect(seen[2]).toContain('instruction-persona of')
    expect(seen[2]).toContain('instruction-coldstart of')
    setTurns(3); await submit($)
    expect(seen[3]).not.toContain('supersedes')
    expect(seen[3]).not.toContain('instruction-persona of')
  })
})

describe('follow mode (P11)', () => {
  test('writtenNode: a node code or a node id from the answer, also inside node / item; nothing for an answer that names none', () => {
    expect(writtenNode('create-node', JSON.stringify({ status: 'ok', nodeCode: '4.2.1.9' }))).toEqual({ nodeCode: '4.2.1.9', what: 'create-node' })
    expect(writtenNode('update-content', JSON.stringify({ node: { code: '4.2.2.5' } }))?.nodeCode).toBe('4.2.2.5')
    expect(writtenNode('wm-add', JSON.stringify({ item: { id: '0b0f8a52-3d52-4c5e-9d0f-3a7e2f6f5b11' } }))?.nodeId).toBe('0b0f8a52-3d52-4c5e-9d0f-3a7e2f6f5b11')
    expect(writtenNode('wm-update', JSON.stringify({ status: 'ok', id: 12 }))).toBeUndefined()
    expect(writtenNode('create-node', 'not json')).toBeUndefined()
  })

  test('default off: a write opens nothing; follow on: after the turn the last written node opens in the pane, once', async ($, on) => {
    const { opened, w } = mk(on)
    await probe($, 'reload')
    await write($, 'create-node', { name: 5 })
    await complete($, 1)
    expect(opened).toEqual([])   // off by default
    const r = json(await probe($, 'follow', { value: 'on' }))
    expect(r).toMatchObject({ status: 'ok', follow: true })
    await write($, 'create-node', { name: 6 })
    await write($, 'create-node', { name: 7 })
    await complete($, 2)
    expect(opened).toHaveLength(1)   // at most once per turn, the last write
    const page = w.sent.filter((s) => s.verb === 'open-page' && s.args.nodeCode)
    expect(page[page.length - 1]!.args).toMatchObject({ target: 'shell', nodeCode: '4.2.1.7' })
    await complete($, 3)
    expect(opened).toHaveLength(1)   // nothing written in this turn
    await probe($, 'follow', { value: 'off' })
    await write($, 'create-node', { name: 8 })
    await complete($, 4)
    expect(opened).toHaveLength(1)
  })

  test('an item answer opens its page by id; no browser tool listed: nothing opens and nothing fails', async ($, on) => {
    const a = mk(on)
    await probe($, 'reload'); await probe($, 'follow', { value: 'on' })
    await write($, 'wm-add', { title: 'x' })
    await complete($, 1)
    expect(a.opened).toHaveLength(1)
    expect(a.w.sent.filter((s) => s.verb === 'open-page').pop()!.args).toMatchObject({ target: 'shell', nodeId: '0b0f8a52-3d52-4c5e-9d0f-3a7e2f6f5b11' })
  })

  test('without a browser tool nothing is opened', async ($, on) => {
    const { opened, w } = mk(on, { browser: false })
    await probe($, 'reload'); await probe($, 'follow', { value: 'on' })
    await write($, 'create-node', { name: 5 })
    await complete($, 1)
    expect(opened).toEqual([])
    expect(w.sent.some((s) => s.verb === 'open-page' && s.args.nodeCode === '4.2.1.5')).toBe(false)
  })
})
