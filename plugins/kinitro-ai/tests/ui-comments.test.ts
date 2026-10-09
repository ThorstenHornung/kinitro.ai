import { describe, expect, test } from 'claude-code/testing'
import { uiCommentKey, uiCommentsBlock, uiCommentsDue } from '../hooks/register'

const FAKE = [
  { id: 'c2', page: { nodeId: 'n1', code: '4.2.2.25', title: 'Expense review' }, control: { id: 'grid-1', type: 'DataGrid', label: 'Expenses' }, controlState: { tab: 'Open', selection: ['r7'] }, kind: 'question', text: 'Why is row 7\nflagged?', createdAt: '2026-10-09T08:15:00Z', status: 'open', answer: null, author: { name: 'Thorsten' }, session: { id: 's-1' } },
  { id: 'c1', page: { nodeId: 'n2', code: '4.2.2.30', title: 'Budget' }, control: { id: 'chart-2', type: 'Chart', label: 'Spend' }, kind: 'comment', text: 'Axis label wrong', createdAt: '2026-10-09T09:00:00Z', status: 'open', author: { name: 'Anna' }, session: { id: 's-2' } },
]

describe('open UI comments', () => {
  test('block lists each comment on one line with page, control and id', async () => {
    const b = uiCommentsBlock(FAKE as any)
    const lines = b.split('\n')
    expect(lines[0]).toBe('## Open UI comments (2)')
    expect(lines[1]).toMatch(/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} Thorsten on "Expense review" \(4\.2\.2\.25\) control grid-1 \(DataGrid\): "Why is row 7 flagged\?"  \[comment c2\]$/)
    expect(lines[2]).toMatch(/Anna on "Budget" \(4\.2\.2\.30\) control chart-2 \(Chart\): "Axis label wrong"  \[comment c1\]$/)
    expect(lines[3]).toBe("Read the comment's session state if you need the user's view (tab, selection, filters). Act within the user's approved todos or ask; answer with answer-ui-comment when done.")
    expect(lines.length).toBe(4)
  })

  test('no open comments: no block; truncated list is marked', async () => {
    expect(uiCommentsBlock([])).toBe('')
    expect(uiCommentsBlock(FAKE as any, true).split('\n')[0]).toBe('## Open UI comments (2+)')
  })

  test('long text is cut', async () => {
    const b = uiCommentsBlock([{ ...FAKE[0], text: 'x'.repeat(900) }] as any)
    expect(b).toContain('x'.repeat(500) + ' [...]"')
    expect(b).not.toContain('x'.repeat(501))
  })

  test('dedupe: set changed, other session, or 30 minutes', async () => {
    const key = uiCommentKey(FAKE as any)
    expect(key).toBe('c1,c2')
    expect(uiCommentKey([...FAKE].reverse() as any)).toBe(key)
    const t0 = 1_000_000_000
    const last = { key, sid: 's', at: t0 }
    expect(uiCommentsDue(key, 's', t0 + 60_000, last)).toBe(false)            // same set, same session, 1 min later
    expect(uiCommentsDue(key, 's', t0 + 29 * 60_000, last)).toBe(false)
    expect(uiCommentsDue(key, 's', t0 + 30 * 60_000, last)).toBe(true)        // reminder
    expect(uiCommentsDue('c1', 's', t0 + 60_000, last)).toBe(true)            // one answered: set changed
    expect(uiCommentsDue('c1,c2,c3', 's', t0 + 60_000, last)).toBe(true)      // a new one
    expect(uiCommentsDue(key, 'other', t0 + 60_000, last)).toBe(true)         // new session
    expect(uiCommentsDue('', 's', t0 + 99 * 60_000, last)).toBe(false)        // nothing open: never
    expect(uiCommentsDue(key, 's', t0, { key: '', sid: 's', at: 0 })).toBe(true)
  })
})

test('probe comments calls list-ui-comments once and returns the open list and check time', async ($, on) => {
  const calls: any[] = []
  on('tool.call', { tool: 'mcp__kinitro_ai__list-ui-comments' } as any, async (_$: any, e: any) => {
    calls.push(e)
    return { result: JSON.stringify({ status: 'ok', data: { comments: FAKE, truncated: false } }) }
  })
  await ($ as any).session.start({ isInteractive: true, surface: 'terminal', cwd: '.' }).catch(() => undefined)
  const r: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'comments' })
  const out = JSON.parse(String(r.text ?? r.result))
  if (out.open !== 2) throw new Error(JSON.stringify(out).slice(0, 600))
  expect(calls.length).toBe(1)
  expect(calls[0].limit).toBe(20)
  expect(out.open).toBe(2)
  expect(out.lastCheck).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(out.block).toContain('[comment c1]')
  const st: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'status' })
  expect(String(st.text ?? st.result)).toContain('ui comments: 2 open')
})

test('a connector that does not answer within 10 s is cut off silently', async ($, on) => {
  const waits: number[] = []
  on('clock.sleep', async (_$, e) => { waits.push(e.ms); return { value: undefined } })   // the wait resolves at once
  on('tool.call', { tool: 'mcp__kinitro_ai__list-ui-comments' } as any, async () => new Promise(() => {}))
  const r: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'comments' })
  const out = JSON.parse(String(r.text ?? r.result))
  expect(waits).toContain(10000)
  expect(out.open).toBe(null)
  expect(out.error).toBe('timeout after 10000 ms')
})
