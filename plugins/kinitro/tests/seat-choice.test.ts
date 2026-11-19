import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { matchSeat } from '../hooks/register'

// 0.26.0 (item 4.2.1-4672, seat choice): set-domain takes an optional seat. A name is resolved with list-agents of the domain (case-insensitive);
// open-domain {domain, agent} then runs on the SAME held key; the seat name comes from the answer (agentNode.name). The answer statuses choose,
// pending, moved, denied and expired go through the existing approval flow. The plugin keeps no mirror target.
const APPROVE_URL = 'https://methos.example/page/approvals/SEAT1'
const SEATS = [{ id: 'seat-beta-coach', name: 'Coach' }, { id: 'seat-beta-analyst', name: 'Analyst' }]
type Srv = { minted: string[]; working: Record<string, { domain: string; agent: string }>; chooseFor?: string; chosen: boolean; decision: 'pending' | 'approved' | 'expired' | 'denied'; requests: number }
const ok = (v: unknown) => ({ result: JSON.stringify(v) })
const refuse = (v: unknown) => ({ result: JSON.stringify(v), isError: true })
const seatName = (id: string) => SEATS.find((s) => s.id === id)?.name ?? 'Default'

function server(srv: Srv): Record<string, (a: Record<string, unknown>) => unknown> {
  const keyed = (a: Record<string, unknown>) => typeof a.domainRef === 'string' && srv.minted.includes(a.domainRef)
  const gate = (a: Record<string, unknown>, v: unknown) => (keyed(a) ? ok(v) : refuse({ status: 'error', code: 'session_key_required' }))
  const dom = (a: Record<string, unknown>) => String(srv.working[String(a.domainRef)]?.domain)
  const defaultAgent = (d: string) => (d === 'beta' ? 'seat-beta-coach' : `seat-${d}-default`)
  const approvedAnswer = (d: string, agent: string, extra: Record<string, unknown> = {}) => ({ status: 'approved', domain: { id: `dom-${d}`, name: d }, agentNode: { id: agent, name: seatName(agent) }, ...extra })
  return {
    'list-domains': () => ok({ domains: ['alpha', 'beta', 'gamma'].map((d) => ({ id: `dom-${d}`, slug: d, approved: true, defaultAgentNodeId: defaultAgent(d) })) }),
    'current-seat': (a) => {
      const approved = ['alpha', 'beta', 'gamma'].map((d) => ({ slug: d, name: d.toUpperCase() }))
      if (!keyed(a)) return ok({ approved })
      const w = srv.working[String(a.domainRef)]!
      return ok({ domain: { id: `dom-${w.domain}`, name: w.domain.toUpperCase() }, agentNode: { id: w.agent, name: seatName(w.agent) }, approved })
    },
    'list-agents': (a) => gate(a, { status: 'ok', agents: dom(a) === 'beta' ? SEATS.map((s) => ({ agent: s.name.toLowerCase(), displayName: s.name, seatId: s.id, anchorDomain: 'beta', hasActiveSession: false })) : [{ agent: 'default', displayName: 'Default', seatId: defaultAgent(dom(a)) }], count: 2 }),
    'open-domain': (a) => {
      if (a.request !== undefined) {
        if (srv.decision === 'approved') { srv.chosen = true; return ok({ status: 'approved', domain: { id: 'dom-beta', name: 'BETA' } }) }
        return ok({ status: srv.decision })
      }
      const d = String(a.domain ?? '').replace(/^dom-/, '')
      const agent = String(a.agent ?? defaultAgent(d))
      if (srv.chooseFor && agent === srv.chooseFor && !srv.chosen) {
        srv.requests++
        return ok({ status: 'choose', request: `REQ${srv.requests}`, approvalUrl: APPROVE_URL, approvalLink: `[Choose the seat](${APPROVE_URL})`, to: { domain: 'BETA', agentNode: seatName(agent) }, expiresAt: new Date(Date.now() + 3600_000).toISOString() })
      }
      if (keyed(a)) { srv.working[String(a.domainRef)] = { domain: d, agent }; return ok({ status: 'moved', domain: { id: `dom-${d}` }, agentNode: { id: agent, name: seatName(agent) } }) }
      const k = `kss_seat${srv.minted.length + 1}X`
      srv.minted.push(k); srv.working[k] = { domain: d, agent }
      return ok(approvedAnswer(d, agent, { sessionKey: k }))
    },
    'get-node': (a) => gate(a, { code: `code-${a.nodeId}`, name: String(a.nodeId).startsWith('seat-') ? seatName(String(a.nodeId)) : `name-${a.nodeId}` }),
    'get-briefing': (a) => gate(a, { status: 'ok', instructions: [{ type: 'instruction-persona', source: 'node', text: 'PERSONA' }, { type: 'instruction-standing', source: 'node', text: 'RULES' }] }),
    'open-page': (a) => gate(a, { url: 'https://methos.example/page' }),
    ...Object.fromEntries(['load-node-content', 'mirror-messaging', 'read-chat-tail', 'search-memory', 'find-nodes', 'list-ui-comments'].map((v) => [v, (a: Record<string, unknown>) => gate(a, { status: 'ok' })])),
  }
}
const newSrv = (x: Partial<Srv> = {}): Srv => ({ minted: [], working: {}, chosen: false, decision: 'pending', requests: 0, ...x })
const mk = (srv: Srv) => (on: any) => makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'SC1', verbs: server(srv) })
const json = (t: string) => JSON.parse(t)
const opens = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'open-domain' && s.args.request === undefined)
const statusOf = async ($: any) => json(await probe($, 'status'))

describe('seat choice', () => {
  test('matchSeat: a name matches case-insensitively on the display name, the agent name or the seat id', () => {
    const agents = [{ agent: 'coach', displayName: 'Coach', seatId: 'S1' }, { agent: 'ana', displayName: 'Analyst', seatId: 'S2' }]
    expect(matchSeat(agents, 'ANALYST')).toEqual({ id: 'S2', name: 'Analyst' })
    expect(matchSeat(agents, ' ana ')).toEqual({ id: 'S2', name: 'Analyst' })
    expect(matchSeat(agents, 's1')).toEqual({ id: 'S1', name: 'Coach' })
    expect(matchSeat(agents, 'nobody')).toBeUndefined()
    expect(matchSeat(agents, '')).toBeUndefined()
  })

  test('matchSeat (review): a short word matches exactly one seat (the real MethOS list); an ambiguous word matches none', () => {
    const real = [
      { agent: 'architect', displayName: 'MethOS', seatId: 'A1' },
      { agent: 'methos-analyst', displayName: 'MethOS Analyst', seatId: 'A2' },
      { agent: 'external-default', displayName: 'Admin', seatId: 'A3' },
    ]
    expect(matchSeat(real, 'analyst')).toEqual({ id: 'A2', name: 'MethOS Analyst' })
    expect(matchSeat(real, 'Architect')).toEqual({ id: 'A1', name: 'MethOS' })
    expect(matchSeat(real, 'methos')).toEqual({ id: 'A1', name: 'MethOS' })   // exact display name wins over the word in "MethOS Analyst"
    expect(matchSeat([{ agent: 'x-analyst', seatId: 'B1' }, { agent: 'y-analyst', seatId: 'B2' }], 'analyst')).toBeUndefined()
  })

  test('a seat name is resolved with list-agents of the domain, then open-domain gets the agent id; the seat name comes from the answer', async ($, on) => {
    const srv = newSrv(); const w = mk(srv)(on)
    const r = json(await probe($, 'set-domain', { domain: 'beta', seat: 'analyst' }))
    expect(r.bound).toBe(true)
    expect(r.seat).toBe('Analyst')
    const la = w.sent.filter((s) => s.verb === 'list-agents')
    expect(la).toHaveLength(1)
    expect(la[0]!.args.domain).toBe('dom-beta')
    expect(la[0]!.args.domainRef).toBe(srv.minted[0])
    expect(opens(w).map((s) => s.args.agent)).toEqual([undefined, 'seat-beta-analyst'])
    expect(opens(w)[1]!.args.domainRef).toBe(srv.minted[0])   // the same key
    expect(srv.minted).toHaveLength(1)
    const st = await statusOf($)
    expect(st.seat).toBe('Analyst')
    expect(st.domain).toBe('name-dom-beta')
  })

  test('no seat: no agent argument and the seat name of the answer is recorded; the default seat given by name costs no second open', async ($, on) => {
    const srv = newSrv(); const w = mk(srv)(on)
    await probe($, 'set-domain', { domain: 'beta' })
    expect(opens(w).map((s) => s.args.agent)).toEqual([undefined])
    expect((await statusOf($)).seat).toBe('Coach')
    await probe($, 'set-domain', { domain: 'beta', seat: 'coach' })
    expect(opens(w)).toHaveLength(1)   // already the seat of the key: nothing to switch
    await probe($, 'set-domain', { domain: 'beta', seat: 'seat-beta-analyst' })   // the seat id also matches in the list
    expect((await statusOf($)).seat).toBe('Analyst')
  })

  test('a seat switch: the same domain with another seat re-runs open-domain with the agent on the SAME key and updates the status', async ($, on) => {
    const srv = newSrv(); const w = mk(srv)(on)
    await probe($, 'set-domain', { domain: 'beta', seat: 'Coach' })
    expect((await statusOf($)).seat).toBe('Coach')
    const key = srv.minted[0]
    const r = json(await probe($, 'set-domain', { domain: 'beta', seat: 'Analyst' }))
    expect(r.bound).toBe(true)
    expect(r.seat).toBe('Analyst')
    expect(srv.minted).toEqual([key])   // no new key
    const last = opens(w)[opens(w).length - 1]!
    expect(last.args).toMatchObject({ domain: 'dom-beta', agent: 'seat-beta-analyst', domainRef: key })
    expect(srv.working[key!]!.agent).toBe('seat-beta-analyst')
    expect((await statusOf($)).seat).toBe('Analyst')
    // and back: the plugin caches no target
    await probe($, 'set-domain', { domain: 'beta', seat: 'Coach' })
    expect((await statusOf($)).seat).toBe('Coach')
    expect(srv.working[key!]!.agent).toBe('seat-beta-coach')
  })

  test('choose: a link plus a request goes through the approval flow; the wish is bound after the person chose', async ($, on) => {
    const srv = newSrv({ chooseFor: 'seat-beta-analyst' }); const w = mk(srv)(on)
    await probe($, 'set-domain', { domain: 'beta' })
    const r = json(await probe($, 'set-domain', { domain: 'beta', seat: 'Analyst' }))
    expect(r.status).toBe('approval_needed')
    expect(r.approvalLink).toBe(APPROVE_URL)
    expect(r.label).toBe('Approve BETA')
    const c = json(await probe($, 'choices'))
    expect(c.pending.approvalLink).toBe(APPROVE_URL)
    expect(srv.requests).toBe(1)
    srv.decision = 'approved'
    const done = json(await probe($, 'selection-done'))
    expect(done.bound).toBe(true)
    expect(done.seat).toBe('Analyst')
    expect(srv.working[srv.minted[0]!]!.agent).toBe('seat-beta-analyst')
    expect(w.sent.filter((s) => s.verb === 'open-domain' && s.args.request !== undefined).length).toBeGreaterThan(0)
  })

  for (const decision of ['pending', 'expired', 'denied'] as const) {
    test(`${decision}: ${decision === 'pending' ? 'the link stays and the request is polled' : 'the wait ends with a plain note and the old seat stays'}`, async ($, on) => {
      const srv = newSrv({ chooseFor: 'seat-beta-analyst', decision })
      const world = mk(srv)(on)
      await probe($, 'set-domain', { domain: 'beta' })
      await probe($, 'set-domain', { domain: 'beta', seat: 'Analyst' })
      await probe($, 'selection-done')   // looks at the pending request once
      const c = json(await probe($, 'choices'))
      if (decision === 'pending') expect(c.pending?.approvalLink).toBe(APPROVE_URL)
      else { expect(c.pending).toBeUndefined(); expect(await probe($, 'status')).toContain(`Approval for BETA was ${decision}`) }
      expect(srv.working[srv.minted[0]!]!.agent).toBe('seat-beta-coach')
      expect(world.sent.some((s) => s.verb === 'open-domain' && s.args.request === 'REQ1')).toBe(true)
    })
  }

  test('a seat that does not exist leaves the default seat bound and says so once, with the names to choose from', async ($, on) => {
    const srv = newSrv(); mk(srv)(on)
    const r = json(await probe($, 'set-domain', { domain: 'beta', seat: 'Nobody' }))
    expect(r.bound).toBe(true)
    expect(r.seat).toBe('Coach')
    expect(r.seats).toEqual(['Coach', 'Analyst'])
    expect(r.sayToUser).toContain('Nobody')
    expect(r.sayToUser).not.toContain('seat-beta')
    const again = json(await probe($, 'set-domain', { domain: 'beta' }))
    expect(again.seatProblem).toBeUndefined()
  })
})
