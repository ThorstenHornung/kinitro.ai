import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { isKeyRefusal, scrubKey, secondConnections, secondConnectionText, sessionKeyOf } from '../hooks/register'
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
const refuse2 = (v: unknown) => ({ result: JSON.stringify(v), isError: true })
const slugOf =(id: string) => id.replace(/^dom-/, '')

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
    expect(r).toContain('kinitro-ai PROD 0.25.9')
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

  test('6b (item 4.2.1-3696): the second-connection advice switches the connector off for this tool only, never in the claude.ai settings', () => {
    const connector = secondConnectionText([C])
    expect(connector).toContain('/mcp')
    expect(connector).toContain('Disable')
    expect(connector).not.toContain('claude.ai settings')
    expect(connector).not.toMatch(/disconnect/i)
    expect(secondConnectionText([U])).toContain('claude mcp remove kinitro_ai')   // control: a user server is still removed
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

  test('part 6 (M3): the seat setting of the person (user home) names the agent node passed to open-domain', async ($, on) => {
    const srv = newSrv()
    mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n'], ['/u/.kinitro-ai/agent', AGENT_ID + '\n']])
    await probe($, 'reload')
    expect(srv.agents[0]).toBe(AGENT_ID)
  })
})

// fix round (SECREVIEW_3590_plugin_2026-10-19.md): M1, M2, M3, L1-L5
describe('session key, fix round', () => {
  test('M3: a seat file in the project folder is refused (a cloned repository cannot pick the agent)', async ($, on) => {
    const srv = newSrv()
    mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n'], ['/w/b/.kinitro-ai-agent', AGENT_ID + '\n']])
    await probe($, 'reload')
    expect(srv.minted).toHaveLength(1)
    expect(srv.agents[0]).toBeUndefined()
  })

  test('M3 (0.24.1, criterion 1): the approval_needed answer names the agent and the domain', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    w.verbs = { ...w.verbs!, 'open-domain': () => refuse2({ status: 'error', code: 'seat_approval_required', request: 'REQ1', to: { domain: 'GAMMA', agentNode: 'Agent G' }, approvalLink: '[Switch domain to GAMMA](https://x/approve)' }) }
    const set: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'set-domain', domain: 'gamma' })
    const res = JSON.parse(textOf(set))   // 0.24.1 (item 4.2.1-3764): the R3 object, no thrown prose
    expect(res.status).toBe('approval_needed')
    expect(res.agent).toBe('Agent G')
    expect(res.domain).toBe('GAMMA')
    expect(res.approvalLink).toBe('https://x/approve')
  })

  test('M1: a new Claude session id never sees the key of the session before', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    const first = srv.minted[0]!
    w.sid = 'K2'   // /clear, or a second session in the same engine process
    await ($ as any).tool.call({ tool: `${B}list-nodes` })
    const last = w.sent[w.sent.length - 1]!
    expect(last.verb).toBe('list-nodes')
    expect(last.args.domainRef).not.toBe(first)
  })

  test('M2: a call that fails in the hook path is not run again and answers an error without a key', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    let runs = 0
    w.verbs = { ...w.verbs!, 'write-thing': () => { runs++; throw new Error('transport broke') } }
    const r: any = await ($ as any).tool.call({ tool: `${B}write-thing`, value: 1 })
    expect(runs).toBe(1)
    expect(r?.deny ?? (r?.isError ? r.text : undefined)).toBeTruthy()
    let opens = 0
    w.verbs = { ...w.verbs!, 'open-domain': () => { opens++; throw new Error('minted kss_LEAKEDKEYVALUE then broke') } }
    const o: any = await ($ as any).tool.call({ tool: `${B}open-domain`, domain: 'dom-gamma' })
    expect(opens).toBe(1)
    expect(JSON.stringify(o)).not.toContain('kss_')
  })

  test('L3: an error answer that carries a key keeps its error shape and loses the key', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    w.verbs = { ...w.verbs!, 'list-nodes': () => refuse2({ status: 'error', code: 'odd', message: 'echo kss_ECHOEDVALUE' }) }
    const r: any = await ($ as any).tool.call({ tool: `${B}list-nodes` })
    expect(JSON.stringify(r)).not.toContain('kss_')
    expect(r?.result).toBeUndefined()
  })

  test('L1: a lookalike server name never gets the key', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    await ($ as any).tool.call({ tool: 'mcp__plugin_kinitro-ai_kinitro_ai_evil__list-nodes' })
    const last = w.sent[w.sent.length - 1]!
    expect(w.prefixes[w.prefixes.length - 1]).toBe('mcp__plugin_kinitro-ai_kinitro_ai_evil__')
    expect(last.args.domainRef).toBeUndefined()
  })

  test('the mcp.call route: the key is adopted, passed and never shown; host errors are scrubbed', async ($, on) => {
    const srv = newSrv()
    const verbs = keyedServer(srv)
    const viaMcp: Array<{ tool: string; args: Record<string, unknown> }> = []
    on('mcp.call', async (_$: any, e: any) => {
      viaMcp.push({ tool: e.tool, args: e.args })
      const r: any = (verbs[e.tool] ?? (() => ok({ status: 'ok' })))(e.args ?? {})
      return { value: { content: [{ type: 'text', text: String(r.result) }], isError: !!r.isError } }
    })
    const w = mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n']], [])   // no tool listed: the tool path fails, the direct MCP route answers
    expect(await probe($, 'reload')).toContain('domain: beta')
    expect(srv.minted).toHaveLength(1)
    const after = viaMcp.slice(viaMcp.findIndex((c) => c.tool === 'open-domain') + 1)
    expect(after.length).toBeGreaterThan(0)
    expect(after.every((c) => c.args.domainRef === srv.minted[0])).toBe(true)
    expect(await probe($, 'status')).not.toContain('kss_')
    expect(noKeyInFiles(w)).toEqual([])
  })

  test('L5: once a key was held, an answer without a key never switches the session to the slug', async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await probe($, 'reload')
    srv.minted.length = 0; srv.legacy = true   // the key is refused and the next open-domain gives none
    await ($ as any).tool.call({ tool: `${B}list-nodes` })
    await ($ as any).tool.call({ tool: `${B}find-nodes` })
    expect(w.sent.filter((s) => s.args.domainRef === 'beta')).toEqual([])
  })
})

// confirmation review (N2, N3): a deny on the own server is final; a host error that carries a key is scrubbed
describe('session key, confirmation round', () => {
  test('L4: a deny on the own server does not fall through to the direct MCP route, and says the call may have run', async ($, on) => {
    const srv = newSrv()
    const direct: string[] = []
    on('mcp.call', async (_$: any, e: any) => { direct.push(e.tool); return { value: { content: [{ type: 'text', text: '{"status":"ok"}' }], isError: false } } })
    const w = mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n']], [`${B}current-seat`, `${B}list-ui-comments`])
    await probe($, 'reload')
    let runs = 0
    w.verbs = { ...w.verbs!, 'list-ui-comments': () => { runs++; throw new Error('transport broke') } }
    const r: any = await ($ as any).tool.call({ tool: 'mcp__kinitro-ai__probe', action: 'comments' })
    expect(runs).toBe(1)
    expect(direct.filter((t) => t === 'list-ui-comments')).toEqual([])
    expect(textOf(r)).toContain('The call may have run; check before repeating a write.')
  })

  test('L2: a host error that carries a key is scrubbed before the probe status and the log', async ($, on) => {
    const srv = newSrv()
    // the test kit hands a hook's thrown error on as its own text, so the host error comes as the direct route's error answer
    on('mcp.call', async () => ({ value: { content: [{ type: 'text', text: 'host broke while sending domainRef=kss_HOSTLEAKVALUE' }], isError: true } }))
    const w = mk(on, srv, [['/w/b/.kinitro-ai-domain', 'beta\n']], [])   // nothing listed: the direct route answers with the host error
    const st = await probe($, 'reload')
    expect(st).toContain('host broke')
    expect(st).not.toContain('kss_')
    expect(noKeyInFiles(w)).toEqual([])
  })
})
