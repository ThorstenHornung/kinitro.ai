import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { pickDomain, domainOption, DomainAmbiguous } from '../hooks/register'

// Unreleased (item 4.2.1-4831, PO decisions 24.11.2026): a person reaches two domains called "Thorsten", one in tenant Kinitro Consulting and one in
// tenant Emerging Motif. The plugin binds no ambiguous slug: set-domain answers the options with id, tenant and breadcrumb; set-domain with the
// chosen id binds that domain, and the slug means that id from then on (never resolved by name again). A failed bind keeps the briefing and the
// seat of before, moves a session that moved meanwhile back, and shows the seat current-seat answers.
const KC = '11111111-1111-4111-8111-111111111111', EM = '22222222-2222-4222-8222-222222222222'
const THO_KC = 'aaaaaaaa-0000-4000-8000-000000000001', THO_EM = 'aaaaaaaa-0000-4000-8000-000000000002'
const ALPHA = 'aaaaaaaa-0000-4000-8000-0000000000a1', GAMMA = 'aaaaaaaa-0000-4000-8000-0000000000c3'
const DOMAINS = [
  { id: THO_KC, name: 'Thorsten', slug: 'thorsten', tenant: KC, path: 'Thorsten' },
  { id: THO_EM, name: 'Thorsten', slug: 'thorsten', tenant: EM, path: 'Thorsten' },
  { id: ALPHA, name: 'Alpha', slug: 'alpha', tenant: KC, path: 'Alpha' },
  { id: GAMMA, name: 'Gamma', slug: 'gamma', tenant: KC, path: 'Gamma' },
]
const TENANTS = [{ id: KC, name: 'Kinitro Consulting', active: true }, { id: EM, name: 'Emerging Motif', active: false }]
const agentOf = (d: string) => `seat-${d.slice(-2)}`
type Srv = { minted: string[]; working: Record<string, string>; failNode?: string }
const ok = (v: unknown) => ({ result: JSON.stringify(v) })
const refuse = (v: unknown) => ({ result: JSON.stringify(v), isError: true })

function server(srv: Srv): Record<string, (a: Record<string, unknown>) => unknown> {
  const keyed = (a: Record<string, unknown>) => typeof a.domainRef === 'string' && srv.minted.includes(a.domainRef)
  const gate = (a: Record<string, unknown>, v: unknown) => (keyed(a) ? ok(v) : refuse({ status: 'error', code: 'session_key_required' }))
  const nameOf = (id: string) => DOMAINS.find((d) => d.id === id)?.name ?? id
  return {
    'list-domains': () => ok({ activeTenant: { id: KC, name: 'Kinitro Consulting' }, tenants: TENANTS, domains: DOMAINS.map((d) => ({ ...d, approved: true, defaultAgentNodeId: agentOf(d.id) })) }),
    'current-seat': (a) => {
      const approved = DOMAINS.map((d) => ({ slug: d.slug, name: d.name }))
      if (!keyed(a)) return ok({ approved })
      const d = srv.working[String(a.domainRef)]!
      return ok({ domain: { id: d, name: nameOf(d) }, agentNode: { id: agentOf(d), name: `Seat ${nameOf(d)}` }, approved })
    },
    'open-domain': (a) => {
      const d = String(a.domain ?? '')
      if (!DOMAINS.some((x) => x.id === d)) return refuse({ status: 'error', code: 'domain_not_allowed' })
      if (keyed(a)) { srv.working[String(a.domainRef)] = d; return ok({ status: 'moved', domain: { id: d }, agentNode: { id: agentOf(d), name: `Seat ${nameOf(d)}` } }) }
      const k = `kss_amb${srv.minted.length + 1}X`
      srv.minted.push(k); srv.working[k] = d
      return ok({ status: 'approved', domain: { id: d, name: nameOf(d) }, agentNode: { id: agentOf(d), name: `Seat ${nameOf(d)}` }, sessionKey: k })
    },
    'get-node': (a) => (srv.failNode && a.nodeId === srv.failNode ? refuse({ status: 'error', code: 'node_not_found' }) : gate(a, { name: String(a.nodeId).startsWith('seat-') ? `Seat ${nameOf(DOMAINS.find((d) => agentOf(d.id) === a.nodeId)?.id ?? '')}` : nameOf(String(a.nodeId)) })),
    'get-briefing': (a) => gate(a, { status: 'ok', instructions: [{ type: 'instruction-persona', source: 'node', text: 'PERSONA' }, { type: 'instruction-standing', source: 'node', text: 'RULES' }] }),
    'open-page': (a) => gate(a, { url: 'https://methos.example/page' }),
    ...Object.fromEntries(['load-node-content', 'mirror-messaging', 'read-chat-tail', 'search-memory', 'find-nodes', 'list-ui-comments', 'list-agents'].map((v) => [v, (a: Record<string, unknown>) => gate(a, { status: 'ok' })])),
  }
}
const newSrv = (x: Partial<Srv> = {}): Srv => ({ minted: [], working: {}, ...x })
const mk = (srv: Srv) => (on: any) => makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'AMB1', verbs: server(srv) })
const json = (t: string) => JSON.parse(t)
const opens = (w: ReturnType<typeof makeWorld>) => w.sent.filter((s) => s.verb === 'open-domain' && s.args.request === undefined)

describe('ambiguous domain names (4.2.1-4831)', () => {
  test('pickDomain: an id wins; a chosen id resolves its slug; a shared slug without a choice throws the options with tenant and breadcrumb', () => {
    const doms = { tenants: TENANTS, domains: DOMAINS }
    expect(pickDomain(doms, { id: THO_EM }).id).toBe(THO_EM)
    expect(pickDomain(doms, { slug: 'thorsten' }, THO_EM).id).toBe(THO_EM)
    expect(pickDomain(doms, { slug: 'alpha' }).id).toBe(ALPHA)
    let err: any
    try { pickDomain(doms, { slug: 'thorsten' }) } catch (e) { err = e }
    expect(err instanceof DomainAmbiguous).toBe(true)
    expect(err.options).toEqual([
      { id: THO_KC, name: 'Thorsten', tenant: 'Kinitro Consulting', breadcrumb: 'Kinitro Consulting > Thorsten' },
      { id: THO_EM, name: 'Thorsten', tenant: 'Emerging Motif', breadcrumb: 'Emerging Motif > Thorsten' },
    ])
    expect(() => pickDomain(doms, { slug: 'thorsten' }, GAMMA)).toThrow()   // a chosen id is never replaced by a name match
    expect(domainOption({ id: 'x', name: 'D', tenant: KC, path: 'Root\\Sub\\D' }, TENANTS).breadcrumb).toBe('Kinitro Consulting > Root > Sub > D')
  })

  test('set-domain with a shared slug binds nothing and answers the options; no open-domain is sent', async ($, on) => {
    const srv = newSrv(); const w = mk(srv)(on)
    const r = json(await probe($, 'set-domain', { domain: 'thorsten' }))
    expect(r.status).toBe('ambiguous')
    expect(r.bound).toBe(false)
    expect(r.options.map((o: any) => o.id)).toEqual([THO_KC, THO_EM])
    expect(r.options.map((o: any) => o.breadcrumb)).toEqual(['Kinitro Consulting > Thorsten', 'Emerging Motif > Thorsten'])
    expect(r.sayToUser).toContain('Emerging Motif > Thorsten')
    expect(opens(w)).toHaveLength(0)
    expect(srv.minted).toHaveLength(0)
  })

  test('set-domain with the chosen id binds that domain, and the slug keeps meaning that id', async ($, on) => {
    const srv = newSrv(); const w = mk(srv)(on)
    const r = json(await probe($, 'set-domain', { domain: THO_KC }))
    expect(r.bound).toBe(true)
    expect(opens(w).map((s) => s.args.domain)).toEqual([THO_KC])
    expect(srv.working[srv.minted[0]!]).toBe(THO_KC)
    // the slug alone now means the chosen id: no ambiguity, no move into the other tenant
    const again = json(await probe($, 'set-domain', { domain: 'thorsten' }))
    expect(again.status).not.toBe('ambiguous')
    expect(opens(w).map((s) => s.args.domain)).not.toContain(THO_EM)
    expect(srv.working[srv.minted[0]!]).toBe(THO_KC)
  })

  test('a shared slug while a domain is bound keeps the briefing and the seat of before', async ($, on) => {
    const srv = newSrv(); mk(srv)(on)
    expect(json(await probe($, 'set-domain', { domain: 'alpha' })).bound).toBe(true)
    const r = json(await probe($, 'set-domain', { domain: 'thorsten' }))
    expect(r.status).toBe('ambiguous')
    const st = json(await probe($, 'status'))
    expect(st.domain).toBe('Alpha')
    expect(st.seat).toBe('Seat Alpha')
    expect(srv.working[srv.minted[0]!]).toBe(ALPHA)
  })

  test('a failed bind keeps the briefing, moves the session back to the old seat and shows the seat current-seat answers', async ($, on) => {
    const srv = newSrv({ failNode: GAMMA }); const w = mk(srv)(on)
    expect(json(await probe($, 'set-domain', { domain: 'alpha' })).bound).toBe(true)
    const r = json(await probe($, 'set-domain', { domain: 'gamma' }))
    expect(r.bound).toBe(false)
    expect(r.kept).toEqual({ domain: 'Alpha', seat: 'Seat Alpha' })
    expect(opens(w).map((s) => s.args.domain)).toEqual([ALPHA, GAMMA, ALPHA])   // the move back to the old seat
    expect(srv.working[srv.minted[0]!]).toBe(ALPHA)
    const st = json(await probe($, 'status'))
    expect(st.domain).toBe('Alpha')
    expect(st.seat).toBe('Seat Alpha')
  })
})
