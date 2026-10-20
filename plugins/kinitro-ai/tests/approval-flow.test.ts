import { describe, expect, test } from 'claude-code/testing'
import { approvalContextBlock, approvalFromAnswer, bandModel, refreshErrorNote } from '../hooks/register'
import { makeWorld, probe } from './world'

// 0.24.1 (item 4.2.1-3764): "approval needed" is a normal outcome. A server whose domain gamma needs the person's approval:
// open-domain {domain: gamma} answers seat_approval_required with the link and its label as fields; open-domain {request}
// answers pending until the test approves, then approved. The plugin must never wait on a tool or turn path, never ask a
// second time for the same approval, and give the person a clickable "Approve Gamma" link.

const APPROVE_URL = 'https://methos.example/page/approvals/HANDLE1'
const SELECTOR_URL = 'https://methos.example/page/selector?link=SEL'
const PROSE = 'The person must approve this move. Show approvalLink to the person as it is'
type Srv = { expiresAt?: string; minted: string[]; working: Record<string, string>; approved: boolean; decision: 'pending' | 'approved' | 'denied' | 'hang' | 'manual'; release?: (v: unknown) => void; requests: number; failSeat?: boolean; hangDomain?: boolean }
const ok = (v: unknown) => ({ result: JSON.stringify(v) })
const refuse = (v: unknown) => ({ result: JSON.stringify(v), isError: true })

function server(srv: Srv): Record<string, (a: Record<string, unknown>) => unknown> {
  const doms = () => ['alpha', 'beta', 'gamma'].map((d) => ({ id: `dom-${d}`, slug: d, approved: d !== 'gamma' || srv.approved, defaultAgentNodeId: `agent-${d}` }))
  const keyed = (a: Record<string, unknown>) => typeof a.domainRef === 'string' && srv.minted.includes(a.domainRef)
  const gate = (a: Record<string, unknown>, v: unknown) => (keyed(a) ? ok(v) : refuse({ status: 'error', code: 'session_key_required', message: 'needs a session key' }))
  const mint = (domain: string) => { const k = `kss_${srv.minted.length + 1}X`; srv.minted.push(k); srv.working[k] = domain; return ok({ status: 'approved', domain, slug: domain, sessionKey: k }) }
  const verbs: Record<string, (a: Record<string, unknown>) => unknown> = {
    'list-domains': () => ok({ domains: doms() }),
    'current-seat': (a) => {
      if (srv.failSeat) return refuse({ status: 'error', code: 'unavailable', message: 'kinitro.ai is down' })
      const approved = doms().filter((d) => d.approved).map((d) => ({ slug: d.slug, name: d.slug === 'gamma' ? 'Gamma' : d.slug.toUpperCase() }))
      if (!keyed(a)) return ok({ approved })
      const w = srv.working[String(a.domainRef)]!
      return ok({ domain: { id: `dom-${w}`, name: w }, agentNode: { id: `agent-${w}` }, approved })
    },
    'open-domain': (a) => {
      if (a.request !== undefined) {
        if (srv.decision === 'hang') return new Promise(() => {})
        if (srv.decision === 'manual') return new Promise((res) => { srv.release = res })
        if (srv.decision === 'approved') { srv.approved = true; return ok({ status: 'approved', domain: { id: 'dom-gamma', name: 'Gamma' } }) }
        return ok({ status: srv.decision })
      }
      const slug = String(a.domain ?? '').replace(/^dom-/, '')
      if (slug === 'gamma' && srv.hangDomain) return new Promise(() => {})
      if (slug === 'gamma' && !srv.approved) {
        srv.requests++
        return refuse({ status: 'error', code: 'seat_approval_required', message: PROSE, request: `REQ${srv.requests}HANDLE`, to: { domain: 'Gamma', agentNode: 'Coach' }, approvalUrl: APPROVE_URL, approvalLinkText: 'Switch domain to Gamma', approvalLink: `[Switch domain to Gamma](${APPROVE_URL})`, expiresAt: srv.expiresAt ?? new Date(Date.now() + 3600_000).toISOString() })
      }
      if (keyed(a)) { srv.working[String(a.domainRef)] = slug; return ok({ status: 'moved', domain: { id: a.domain } }) }
      return mint(slug)
    },
    'get-node': (a) => gate(a, { code: `code-${a.nodeId}`, name: `name-${a.nodeId}` }),
    'get-briefing': (a) => gate(a, { status: 'ok', instructions: [{ type: 'instruction-persona', source: 'node', text: 'PERSONA' }, { type: 'instruction-standing', source: 'node', text: 'RULES' }] }),
    'open-page': (a) => gate(a, { url: SELECTOR_URL }),
  }
  for (const v of ['load-node-content', 'mirror-messaging', 'read-chat-tail', 'search-memory', 'find-nodes', 'list-ui-comments', 'list-nodes']) verbs[v] = (a) => gate(a, { status: 'ok' })
  return verbs
}

const SEP = String.fromCharCode(10, 10)
const mk = (on: any, srv: Srv, folder = 'gamma') => {
  const ctx: string[] = []
  on('prompt.submit', async (_$: any, e: any) => { ctx.push((e.context ?? []).join(SEP)); return { text: e.text } })
  on('turn.complete', async () => ({ text: '' }))
  const w = makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', `${folder}\n`]]), cwd: '/w/b', root: '/w/b', sid: 'A1', verbs: server(srv) })
  return Object.assign(w, { ctx })
}
const newSrv = (x: Partial<Srv> = {}): Srv => ({ minted: [], working: {}, approved: false, decision: 'pending', requests: 0, ...x })
const domainCalls = (w: ReturnType<typeof makeWorld>, slug: string) => w.sent.filter((s) => s.verb === 'open-domain' && s.args.domain === `dom-${slug}`).length
const requestCalls = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'open-domain' && s.args.request !== undefined).length
const json = (t: string) => JSON.parse(t)
const start = ($: any) => $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)   // runs refreshChoices
const submit = ($: any, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' } } as any)

describe('pure parts', () => {
  test('the approval keeps the plain approvalUrl; the Markdown approvalLink only as a fallback', () => {
    const a = approvalFromAnswer({ request: 'R', approvalUrl: APPROVE_URL, approvalLink: '[x](https://other)', to: { domain: 'Gamma', agentNode: 'Coach' } }, 'gamma', 'S')
    expect(a.url).toBe(APPROVE_URL)
    expect(approvalFromAnswer({ request: 'R', approvalLink: `[Switch](${APPROVE_URL})` }, 'gamma', 'S').url).toBe(APPROVE_URL)
  })
  test('R8: the per-turn sentence, exact', () => {
    const a = approvalFromAnswer({ request: 'R', approvalUrl: APPROVE_URL, to: { domain: 'Gamma' } }, 'gamma', 'S')
    expect(approvalContextBlock(a)).toBe(`kinitro.ai: Gamma waits for the user's approval. In your first reply give the link [Approve Gamma](${APPROVE_URL}) as a Markdown link, say the plugin also tried the browser pane, and ask the user to confirm here after approving.`)
  })
  test('R9: the refresh note is short and holds no key', () => {
    const n = refreshErrorNote(new Error(`current-seat: kss_SECRET ${'x'.repeat(400)}`))
    expect(n.startsWith('Refresh failed: ')).toBe(true)
    expect(n).not.toContain('kss_SECRET')
    expect(n.length).toBeLessThanOrEqual(16 + 160)
  })
})

describe('approval flow (criteria 1-5)', () => {
  test('A1: set-domain on an unapproved domain answers approval_needed with the plain link; control: an approved one binds', async ($, on) => {
    const srv = newSrv()
    mk(on, srv, 'beta')
    const r = json(await probe($, 'set-domain', { domain: 'gamma' }))
    expect(r.status).toBe('approval_needed')
    expect(r.domain).toBe('Gamma')
    expect(r.agent).toBe('Coach')
    expect(r.approvalLink).toBe(APPROVE_URL)
    expect(r.label).toBe('Approve Gamma')
    expect(JSON.stringify(r)).not.toContain(PROSE)
    expect(json(await probe($, 'set-domain', { domain: 'beta' })).bound).toBe(true)
  })

  test('A2: a second set-domain while pending answers at once and sends no new {domain}; control: after the yes the bind reads the agent node', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv, 'beta')
    await probe($, 'set-domain', { domain: 'gamma' })
    const before = w.sent.length
    const again = json(await probe($, 'set-domain', { domain: 'gamma' }))
    expect(again.status).toBe('approval_needed')
    expect(domainCalls(w, 'gamma')).toBe(1)
    expect(w.sent.slice(before).filter((s) => s.verb !== 'open-domain' || s.args.request === undefined)).toHaveLength(0)   // no network but the background {request}
    expect(srv.requests).toBe(1)
    srv.decision = 'approved'
    const done = json(await probe($, 'selection-done'))
    expect(done.bound).toBe(true)
    expect(w.sent.some((s) => s.verb === 'get-node' && s.args.nodeId === 'agent-gamma')).toBe(true)
    expect(srv.requests).toBe(1)
  })

  test('A3: no retry while pending: five prompts send no {domain} and no current-seat, one {request} each at most', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    expect(srv.requests).toBe(1)
    const before = w.sent.length
    for (let i = 0; i < 5; i++) await submit($, `p${i}`)
    const after = w.sent.slice(before)
    expect(after.filter((s) => s.verb === 'current-seat' || s.verb === 'list-domains')).toHaveLength(0)
    expect(domainCalls(w, 'gamma')).toBe(1)
    expect(requestCalls(w)).toBeLessThanOrEqual(5)
    expect(srv.requests).toBe(1)
    expect(w.files.get('/w/b/kinitro-ai.log') ?? '').not.toContain('briefing FAILED')
  })

  test('A4: a hanging binding does not hold set-domain past the budget; control: a hanging {request} does not hold selection-done', async ($, on) => {
    const srv = newSrv({ hangDomain: true })
    const waits: number[] = []
    on('clock.sleep', async (_$: any, e: any) => { waits.push(e.ms); return { value: undefined } })   // the budget passes at once
    mk(on, srv, 'beta')
    const r = json(await probe($, 'set-domain', { domain: 'gamma' }))
    expect(r.status).toBe('binding')
    expect(waits).toContain(8000)
  })

  test('A4b: selection-done with a request that never answers returns approval_needed within the budget', async ($, on) => {
    const srv = newSrv()
    let fast = false   // from the selection-done on, the budget passes at once
    on('clock.sleep', async (_$: any, e: any) => (fast ? { value: undefined } : new Promise<{ value: undefined }>((res) => setTimeout(() => res({ value: undefined }), Math.min(e.ms, 50)))))
    mk(on, srv, 'beta')
    await probe($, 'set-domain', { domain: 'gamma' })
    srv.decision = 'hang'
    fast = true
    const r = json(await probe($, 'selection-done'))
    expect(r.status).toBe('approval_needed')
  })

  test('A5/A6: the picker state lists the pending domain with its approve link; no raw server text in the band note', async ($, on) => {
    const srv = newSrv()
    mk(on, srv, 'beta')
    await probe($, 'set-domain', { domain: 'gamma' })
    const c = json(await probe($, 'choices'))
    expect(c.pending.slug).toBe('gamma')
    expect(c.pending.approvalLink).toBe(APPROVE_URL)
    expect(c.pending.label).toBe('Approve Gamma')
    const st = await probe($, 'status')
    expect(st).toContain('band note: -')
    expect(st).not.toContain('could not bind')
    expect(st).not.toContain('Switch domain to')
  })

  test('A7: selection-start returns selectorUrl and, while pending, the approval link', async ($, on) => {
    const srv = newSrv()
    mk(on, srv, 'beta')
    await probe($, 'reload')
    const plain = json(await probe($, 'selection-start'))
    expect(plain.selectorUrl).toBe(SELECTOR_URL)
    await probe($, 'set-domain', { domain: 'gamma' })
    const r = json(await probe($, 'selection-start'))
    expect(r.approvalLink).toBe(APPROVE_URL)
    expect(r.label).toBe('Approve Gamma')
    expect(typeof r.selectionPage).toBe('string')
  })

  test('A8: the turn context carries the R8 sentence; control: after the yes it is gone and the briefing comes', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    await submit($, 'hello')
    expect(w.ctx[0]).toContain(`In your first reply give the link [Approve Gamma](${APPROVE_URL}) as a Markdown link`)
    expect(w.ctx[0]).toContain('briefing pending approval (gamma)')
    expect(w.ctx[0]).not.toContain(PROSE)
    srv.decision = 'approved'
    await probe($, 'selection-done')
    await submit($, 'again')
    const last = w.ctx[w.ctx.length - 1]!
    expect(last).not.toContain('waits for the user')
    expect(last).toContain('PERSONA')
  })

  test('A9: a failing refresh puts its error in the band note; a later success clears it', async ($, on) => {
    const srv = newSrv({ failSeat: true })
    const ww = mk(on, srv, 'beta')
    ;(globalThis as any).__w = ww
    const w = (globalThis as any).__w
    await start($)
    await probe($, 'status')
    expect(await probe($, 'status')).toContain('band note: Refresh failed:')
    srv.failSeat = false
    await start($)
    await probe($, 'status')
    expect(await probe($, 'status')).toContain('band note: -')
  })

  test('A10 (R5): while pending no mirror-messaging is sent; after the binding the queued turn goes out with the key', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    await submit($, 'one')
    await ($ as any).turn.complete({ reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1', answer: 'done' } as any)
    expect(w.sent.filter((s) => s.verb === 'mirror-messaging')).toHaveLength(0)
    srv.decision = 'approved'
    await probe($, 'selection-done')
    await submit($, 'two')
    const sent = w.sent.filter((s) => s.verb === 'mirror-messaging' && s.args.action === 'append')
    expect(sent.length).toBeGreaterThan(0)
    expect(String(sent[0]!.args.domainRef)).toMatch(/^kss_/)
  })

  test('A11: approved from the re-check binds and clears the approval; denied sets the band note', async ($, on) => {
    const srv = newSrv({ decision: 'denied' })
    mk(on, srv, 'beta')
    await probe($, 'set-domain', { domain: 'gamma' })
    const r = json(await probe($, 'selection-done'))
    expect(r.status).not.toBe('approval_needed')
    expect(await probe($, 'status')).toContain('band note: Approval for Gamma was denied. Choose the domain again.')
    expect(await probe($, 'status')).not.toContain('waiting for approval')
  })
})

describe('round 2', () => {
  const pend = approvalFromAnswer({ request: 'R', approvalUrl: APPROVE_URL, approvalLinkText: 'Switch domain to Gamma', to: { domain: 'Gamma', agentNode: 'Coach' } }, 'gamma', 'S')
  const approved = [{ slug: 'alpha', name: 'ALPHA' }, { slug: 'beta', name: 'BETA' }]

  test('A5 (band model): a pending approval gives the "Approve Gamma" link with the plain URL, the confirm button, no server text', () => {
    const m = bandModel({ approved, current: 'beta', chooser: false, url: SELECTOR_URL, note: null, pend })
    expect(m.compact).toBe(false)
    expect(m.title).toBe('kinitro.ai · Gamma needs your approval.')
    expect(m.items[0]).toEqual({ kind: 'link', key: 'kin-approve-gamma', label: 'Approve Gamma', href: APPROVE_URL })
    expect(m.items.some((i) => i.kind === 'button' && i.label === 'I approved it' && i.act === 'approved')).toBe(true)
    const all = JSON.stringify(m)
    for (const bad of ['could not bind', 'Switch domain to', '](', PROSE]) expect(all).not.toContain(bad)
  })

  test('A6 (band model): the picker lists the pending domain only as its approve link; control: the bound band', () => {
    const m = bandModel({ approved: [...approved, { slug: 'gamma', name: 'Gamma' }], current: 'beta', chooser: true, url: null, note: null, pend })
    expect(m.items.filter((i) => i.key.includes('gamma')).map((i) => i.kind)).toEqual(['link'])
    expect(m.items.some((i) => i.kind === 'button' && i.act === 'bind' && i.slug === 'alpha')).toBe(true)
    const bound = bandModel({ approved, current: 'beta', chooser: false, url: null, note: null, pend: null })
    expect(bound.compact).toBe(true)
    expect(bound.title).toBe('kinitro.ai · BETA (beta) ')
  })

  test('overlap: an approval check that is still open neither hides the agent own open-domain nor clears a running bind', async ($, on) => {
    const srv = newSrv({ decision: 'manual' })
    const w = mk(on, srv, 'beta')
    await probe($, 'reload')
    await probe($, 'set-domain', { domain: 'gamma' })   // approval needed
    await probe($, 'set-domain', { domain: 'gamma' })   // pending: starts the check, whose {request} stays open
    for (let i = 0; i < 10 && !srv.release; i++) await probe($, 'status')   // the check runs in the background
    expect(typeof srv.release).toBe('function')
    await ($ as any).tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai__open-domain', domain: 'dom-alpha' })   // the agent's own call
    expect(w.files.get('/w/b/kinitro-ai.log') ?? '').toContain('open-domain called by the agent')
    srv.release!(ok({ status: 'pending' }))
    await probe($, 'status')
    expect(json(await probe($, 'set-domain', { domain: 'alpha' })).bound).toBe(true)   // control: a bind after the check
  })
})

describe('round 3 (review)', () => {
  test('F1: binding another domain while one is pending drops the pending approval from the band state and the context', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv, 'beta')
    await probe($, 'reload')
    expect(json(await probe($, 'set-domain', { domain: 'gamma' })).status).toBe('approval_needed')
    expect(json(await probe($, 'set-domain', { domain: 'alpha' })).bound).toBe(true)
    expect(json(await probe($, 'choices')).pending).toBeUndefined()
    expect(await probe($, 'status')).not.toContain('waiting for approval')
    await submit($, 'after')
    const last = w.ctx[w.ctx.length - 1]!
    expect(last).not.toContain('waits for the user')
    expect(last).not.toContain('Approve Gamma')
  })

  test('F2: an expired approval is dropped: no approval block, the band note says expired', async ($, on) => {
    const srv = newSrv({ expiresAt: new Date(Date.now() - 60_000).toISOString() })
    const w = mk(on, srv)
    await probe($, 'reload')
    await submit($, 'hello')
    expect(w.ctx[0]).not.toContain('waits for the user')
    expect(json(await probe($, 'choices')).pending).toBeUndefined()
    expect(await probe($, 'status')).toContain('band note: Approval for Gamma was expired. Choose the domain again.')
  })
})
