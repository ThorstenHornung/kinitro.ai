import { describe, expect, test } from 'claude-code/testing'
import { isKeyRefusal, scrubKey, secondConnections, sessionKeyOf } from '../hooks/register'
import { makeWorld, probe } from './world'

// 0.24.0 (item 4.2.1-3590, PO 19.10.2026): the session key is mandatory. A server that mints keys and refuses every verb
// without one; the plugin obtains the key with open-domain, keeps it per Claude session ($.state), adds it to every call of
// its own server (the model's calls included), never shows it to the model and never writes it anywhere.

const B = 'mcp__plugin_kinitro-ai_kinitro_ai__'
const U = 'mcp__kinitro_ai__'
const C = 'mcp__claude_ai_Kinitro__'
const DOMAINS = ['alpha', 'beta', 'gamma']
const AGENT_ID = '0f0e0d0c-0b0a-4909-8807-060504030201'

type Srv = { minted: string[]; working: Record<string, string>; refuseAll?: boolean; agents: unknown[]; legacy?: boolean }
const ok = (v: unknown) => ({ result: JSON.stringify(v) })
const refuse = (code: string, message: string) => ({ result: JSON.stringify({ status: 'error', code, message }), isError: true })
const slugOf = (id: string) => id.replace(/^dom-/, '')

function keyedServer(srv: Srv): Record<string, (a: Record<string, unknown>) => unknown> {
  const valid = (a: Record<string, unknown>) => !srv.refuseAll && typeof a.domainRef === 'string' && srv.minted.includes(a.domainRef)
  const gate = (a: Record<string, unknown>, f: (key: string) => unknown) => {
    if (valid(a)) return f(String(a.domainRef))
    if (typeof a.domainRef === 'string' && a.domainRef.startsWith('kss_')) return refuse('domain_ref_unknown', 'This session key is not valid on this connection. Call open-domain without domainRef.')
    return refuse('session_key_required', 'This call needs a session key. Call open-domain, keep the returned sessionKey for this session only, and pass it as domainRef on every call.')
  }
  const approved = DOMAINS.map((d) => ({ slug: d, name: d.toUpperCase() }))
  const verbs: Record<string, (a: Record<string, unknown>) => unknown> = {
    'list-domains': () => ok({ domains: DOMAINS.map((d) => ({ id: `dom-${d}`, slug: d, approved: true, defaultAgentNodeId: `agent-${d}` })) }),
    'current-seat': (a) => (a.domainRef === undefined
      ? ok({ approved })
      : gate(a, (k) => ok({ domain: { id: srv.working[k], name: slugOf(srv.working[k]!).toUpperCase() }, agentNode: { id: `agent-${slugOf(srv.working[k]!)}` }, approved }))),
    'open-domain': (a) => {
      srv.agents.push(a.agent)
      if (a.domainRef !== undefined) return gate(a, (k) => { srv.working[k] = String(a.domain); return ok({ status: 'moved', domain: { id: a.domain, name: slugOf(String(a.domain)) } }) })
      if (srv.legacy) return ok({ status: 'approved', domain: slugOf(String(a.domain)), slug: slugOf(String(a.domain)), message: `Pass domainRef=${slugOf(String(a.domain))} on your calls.` })
      const k = `kss_${srv.minted.length + 1}SECRETVALUE`
      srv.minted.push(k); srv.working[k] = String(a.domain)
      return ok({ status: 'approved', domain: slugOf(String(a.domain)), slug: slugOf(String(a.domain)), sessionKey: k, sessionKeyMessage: 'Keep sessionKey for this session only and pass it as domainRef on every call.', openDomains: [] })
    },
    'get-node': (a) => gate(a, () => ok({ code: `code-${a.nodeId}`, name: `name-${a.nodeId}` })),
    'get-briefing': (a) => gate(a, () => ok({ status: 'ok', instructions: [{ type: 'instruction-persona', source: 'node', text: 'PERSONA' }, { type: 'instruction-standing', source: 'node', text: 'RULES' }] })),
  }
  for (const v of ['load-node-content', 'mirror-messaging', 'read-chat-tail', 'search-memory', 'find-nodes', 'list-ui-comments', 'open-page', 'list-nodes']) verbs[v] = (a) => gate(a, () => ok({ status: 'ok' }))
  return verbs
}

const SEP = String.fromCharCode(10, 10)
const mk = (on: any, srv: Srv, files: [string, string][] = [['/w/b/.kinitro-ai-domain', 'beta\n']], tools?: string[]) => {
  const ctx: string[] = []
  on('prompt.submit', async (_$: any, e: any) => { ctx.push((e.context ?? []).join(SEP)); return { text: e.text } })
  on('turn.complete', async () => ({ text: '' }))
  const w = makeWorld(on, { files: new Map(files), cwd: '/w/b', root: '/w/b', sid: 'K1', verbs: keyedServer(srv), ...(tools ? { tools } : {}) })
  return Object.assign(w, { ctx })
}
const newSrv = (x: Partial<Srv> = {}): Srv => ({ minted: [], working: {}, agents: [], ...x })
const textOf = (r: any) => String(r?.text ?? r?.result ?? r?.deny ?? '')
const noKeyInFiles = (w: ReturnType<typeof makeWorld>) => [...w.files.entries()].filter(([, v]) => /kss_/.test(v)).map(([k]) => k)

describe('pure parts', () => {
  test('sessionKeyOf reads the key of an open-domain answer only', () => {
    expect(sessionKeyOf(JSON.stringify({ status: 'approved', sessionKey: 'kss_ABC' }))).toBe('kss_ABC')
    expect(sessionKeyOf(JSON.stringify({ status: 'approved', sessionKey: 'beta' }))).toBeUndefined()
    expect(sessionKeyOf('not json')).toBeUndefined()
  })
  test('scrubKey removes the key, its message and the slug instruction, and any kss_ value', () => {
    const s = scrubKey(JSON.stringify({ status: 'approved', slug: 'beta', message: 'Pass domainRef=beta on your calls.', sessionKey: 'kss_ABC', sessionKeyMessage: 'Keep sessionKey' }))
    expect(s).not.toContain('kss_')
    expect(s).not.toContain('sessionKey')
    expect(s).not.toContain('Pass domainRef')
    expect(JSON.parse(s).status).toBe('approved')
    expect(scrubKey('plain kss_XYZ text')).not.toContain('kss_XYZ')
    const refusal = JSON.stringify({ status: 'error', code: 'session_key_required', message: 'pass it as domainRef' })
    expect(scrubKey(refusal)).toBe(refusal)
  })
  test('isKeyRefusal: session_key_required and an unknown session key, not other refusals', () => {
    expect(isKeyRefusal('{"code":"session_key_required"}')).toBe(true)
    expect(isKeyRefusal('{"code":"domain_ref_unknown","message":"This session key is not valid"}')).toBe(true)
    expect(isKeyRefusal('{"code":"domain_ref_unknown","message":"No domain beta"}')).toBe(false)
  })
  test('secondConnections names the kinitro.ai servers that are not the plugin\'s own', () => {
    expect(secondConnections([`${B}current-seat`, `${U}current-seat`, `${C}current-seat`, 'mcp__other__current-seat'])).toEqual([U, C])
    expect(secondConnections([`${B}current-seat`])).toEqual([])
  })
})

describe('session key', () => {
  test('P1/P3: the bind obtains the key with open-domain and every later call carries it, current-seat and list-domains included', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    const st = await probe($, 'reload')
    expect(st).toContain('domain: beta')
    expect(srv.minted).toHaveLength(1)
    const key = srv.minted[0]!
    const i = w.sent.findIndex((s) => s.verb === 'open-domain')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(w.sent[i]!.args.domainRef).toBeUndefined()
    expect(w.sent[i]!.args.domain).toBe('dom-beta')
    const after = w.sent.slice(i + 1)
    expect(after.length).toBeGreaterThan(3)
    expect(after.every((s) => s.args.domainRef === key)).toBe(true)
    expect(after.some((s) => s.verb === 'current-seat')).toBe(true)
    await probe($, 'reload')
    expect(srv.minted).toHaveLength(1)   // a reload keeps the session: no second key
    expect(w.sent.filter((s) => s.verb === 'list-domains').every((s, n) => n === 0 || s.args.domainRef === key)).toBe(true)
  })

  test('P2/P4/P8: the key is in no file, no log line, no probe answer and no prompt block', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' } } as any)
    const r = w.ctx.join(SEP)
    await $.turn.complete({ reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1', answer: 'done' } as any)
    expect(srv.minted).toHaveLength(1)
    expect(noKeyInFiles(w)).toEqual([])
    expect(await probe($, 'status')).not.toContain('kss_')
    expect(r).toContain('kinitro-ai 0.24.0')
    expect(r).not.toContain('kss_')
    expect(r).not.toContain("pass domainRef:'beta'")
  })

  test('P3/P4: a call of the model gets the key in place of a slug; an answer with a key is stripped and adopted', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv, [])   // no domain chosen: the model opens the session itself
    const opened: any = await ($ as any).tool.call({ tool: `${B}open-domain`, domain: 'dom-alpha' })
    expect(srv.minted).toHaveLength(1)
    expect(textOf(opened)).not.toContain('kss_')
    expect(textOf(opened)).not.toContain('sessionKey')
    const listed: any = await ($ as any).tool.call({ tool: `${B}list-nodes`, domainRef: 'alpha' })
    expect(listed?.isError).toBeFalsy()
    expect(w.sent[w.sent.length - 1]!.args.domainRef).toBe(srv.minted[0])
    await ($ as any).tool.call({ tool: `${B}open-domain`, domain: 'dom-gamma' })
    expect(srv.minted).toHaveLength(1)   // a further domain: no new key
    expect(srv.working[srv.minted[0]!]).toBe('dom-gamma')
  })

  test('P5: /kinitro <domain> adds the domain to the session with the key, no new key', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    const set: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'set-domain', domain: 'gamma' })
    expect(textOf(set)).toContain('"bound":true')
    expect(srv.minted).toHaveLength(1)
    const opens = w.sent.filter((s) => s.verb === 'open-domain')
    expect(opens).toHaveLength(2)
    expect(opens[1]!.args).toMatchObject({ domain: 'dom-gamma', domainRef: srv.minted[0] })
    expect(await probe($, 'status')).toContain('domain: gamma')
  })

  test('P7: a refused key is replaced once by a new session and the call is repeated once', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    srv.minted.length = 0   // the sign-in was renewed elsewhere: the old key is unknown now
    const r: any = await ($ as any).tool.call({ tool: `${B}list-nodes` })
    expect(r?.isError).toBeFalsy()
    expect(srv.minted).toHaveLength(1)
    expect(w.sent[w.sent.length - 1]!.args.domainRef).toBe(srv.minted[0])
    srv.refuseAll = true   // a server that refuses every key: one re-bind at most, no loop
    const before = w.sent.filter((s) => s.verb === 'open-domain').length
    const r2: any = await ($ as any).tool.call({ tool: `${B}list-nodes` })
    expect(textOf(r2)).toContain('domain_ref_unknown')
    expect(w.sent.filter((s) => s.verb === 'open-domain').length - before).toBeLessThanOrEqual(1)
  })

  test('P7: against a server without session keys the slug goes on every call as before', async ($, on) => {
    const srv = newSrv({ legacy: true })
    const w = mk(on, srv)
    // the legacy server runs verbs with a slug: answer them
    const legacyOk = (a: Record<string, unknown>) => (a.domainRef === 'beta' ? ok({ status: 'ok', code: `code-${a.nodeId}`, name: 'n', instructions: [{ type: 'instruction-persona', source: 'node', text: 'P' }] }) : refuse('domain_ref_required', 'pass domainRef'))
    w.verbs = { ...w.verbs!, 'get-node': legacyOk, 'get-briefing': legacyOk, 'list-nodes': legacyOk }
    expect(await probe($, 'reload')).toContain('domain: beta')
    await ($ as any).tool.call({ tool: `${B}list-nodes` })
    expect(w.sent[w.sent.length - 1]!.args.domainRef).toBe('beta')
    expect(srv.minted).toHaveLength(0)
  })

  test('P6: a second kinitro.ai connection is told once and never gets the key', async ($, on) => {
    const srv = newSrv()
    const tools = [`${B}current-seat`, `${B}open-domain`, `${U}current-seat`, `${U}list-nodes`]
    const w = mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n']], tools)
    await probe($, 'reload')
    await $.prompt.submit({ text: 'one', origin: { kind: 'composer' } } as any)
    await $.prompt.submit({ text: 'two', origin: { kind: 'composer' } } as any)
    expect(w.ctx[0]).toContain('A second kinitro.ai connection')
    expect(w.ctx[1]).not.toContain('A second kinitro.ai connection')
    await ($ as any).tool.call({ tool: `${U}list-nodes` })
    const last = w.sent[w.sent.length - 1]!
    expect(last.verb).toBe('list-nodes')
    expect(last.args.domainRef).toBeUndefined()
    expect(new Set(w.prefixes.slice(0, -1))).toEqual(new Set([B]))   // the plugin's own calls use only its own server
  })

  test('P8: an unsent turn of another Claude session is not sent with this session\'s key', async ($, on) => {
    const srv = newSrv()
    const other = JSON.stringify([{ sessionId: 'OTHER', turnId: 'x1', prompt: 'p', answer: 'a', eventTs: '2026-10-19T00:00:00Z', domainRef: 'beta' }])
    const w = mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n'], ['/w/b/.kinitro-ai-outbox.json', other]])
    await probe($, 'reload')
    await $.prompt.submit({ text: 'mine', origin: { kind: 'composer' } } as any)
    await $.turn.complete({ reason: 'answer', durationMs: 1, isAborted: false, turnId: 'm1', answer: 'done' } as any)
    const appends = w.sent.filter((s) => s.verb === 'mirror-messaging' && s.args.action === 'append')
    expect(appends.map((s) => s.args.turnId)).toEqual(['m1'])
    expect(noKeyInFiles(w)).toEqual([])
  })

  test('part 6: the seat setting names the agent node passed to open-domain', async ($, on) => {
    const srv = newSrv()
    mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n'], ['/w/b/.kinitro-ai-agent', AGENT_ID + '\n']])
    await probe($, 'reload')
    expect(srv.agents[0]).toBe(AGENT_ID)
  })
})
