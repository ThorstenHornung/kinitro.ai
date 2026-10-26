import { describe, expect, mock } from 'claude-code/testing'
import { test } from './kit'
import { bandModel, chooseSignInPath, deviceLabel, emailMask, isSixDigits, resolveKinitroTools, secondConnections, signInContextBlock, signInResult } from '../hooks/register'
import { makeWorld, probe } from './world'

// Item 4.2.1-3910 (F4): when the browser is not on the same machine (SSH, a cloud session, or the setting), the plugin signs
// the Claude session in through the device server /mcp/device by itself: sign-in with the person's email, the pending key
// held by the plugin, the person approves with the mailed code on methos.kinitro.ai, then any message (or "I approved it")
// binds the domain and agent chosen on the approval page. This file carries its own fake device server (4.2.1-3880 answer
// shapes: pending, sign_in_pending, ready, domain_ref_unknown, sign_in_rate_limited).

const DEV = 'mcp__plugin_kinitro-ai_kinitro_ai_device__'
const OAUTH = 'mcp__plugin_kinitro-ai_kinitro_ai__'
const URL = 'https://methos.example/page/approvals/SIGNIN1'
const PROSE = 'SERVER-PROSE-never-shown'
const KEYMSG = 'KEY-MESSAGE-never-shown'
const EMAIL = 't@example.com'
const MASK = 't***@example.com'
const SSH = { SSH_CONNECTION: '10.9.8.7 50000 10.0.0.1 22', COMPUTERNAME: 'WS-1' }
const SEP = String.fromCharCode(10, 10)
const DEVICE_TOOLS = ['sign-in', 'current-seat', 'list-domains', 'open-domain', 'get-node', 'get-briefing', 'load-node-content', 'mirror-messaging', 'open-page', 'read-chat-tail', 'search-memory', 'find-nodes', 'list-ui-comments'].map((v) => DEV + v)
const BAND = { plugin: 'kinitro-ai', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 } } } as const

type Direct = { server: string; tool: string; args: Record<string, unknown> }
type Srv = { keys: Record<string, 'pending' | 'ready' | 'gone'>; minted: string[]; direct: Direct[]; connected: boolean; rateLimited?: number; expiresAt: string; mirrored: Record<string, unknown>[] }
const newSrv = (x: Partial<Srv> = {}): Srv => ({ keys: {}, minted: [], direct: [], connected: true, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), mirrored: [], ...x })
const answer = (v: unknown, isError = false) => ({ text: JSON.stringify(v), isError })

function serve(srv: Srv, verb: string, a: Record<string, unknown>) {
  if (verb === 'sign-in') {
    if (srv.rateLimited) return answer({ status: 'error', code: 'sign_in_rate_limited', message: PROSE, retryAfterSeconds: srv.rateLimited }, true)
    const prior = typeof a.domainRef === 'string' && srv.keys[a.domainRef] === 'pending' ? a.domainRef : undefined
    const key = prior ?? `kss_dev${srv.minted.length + 1}X`
    if (!prior) { srv.minted.push(key); srv.keys[key] = 'pending' }
    return answer({ status: 'pending', sessionKey: key, sessionKeyMessage: KEYMSG, approvalUrl: URL, approvalLink: `[Approve this sign-in](${URL})`, expiresAt: srv.expiresAt, email: MASK, message: PROSE })
  }
  const state = typeof a.domainRef === 'string' ? srv.keys[a.domainRef] : undefined
  if (!state) return answer({ status: 'error', code: 'session_key_required', message: "Call sign-in with the person's email first." }, true)
  if (state === 'gone') return answer({ status: 'error', code: 'domain_ref_unknown', message: 'unknown domainRef' }, true)
  if (state === 'pending') return answer({ status: 'pending', code: 'sign_in_pending', message: PROSE, approvalUrl: URL, approvalLink: `[Approve this sign-in](${URL})`, expiresAt: srv.expiresAt }, true)
  if (verb === 'current-seat') return answer({ domain: { id: 'dom-beta', name: 'Beta' }, agentNode: { id: 'agent-chosen' }, approved: [{ slug: 'beta', name: 'Beta' }] })
  if (verb === 'list-domains') return answer({ domains: ['alpha', 'beta'].map((d) => ({ id: `dom-${d}`, slug: d, approved: true, defaultAgentNodeId: `agent-${d}` })) })
  if (verb === 'get-node') return answer({ code: `code-${a.nodeId}`, name: `name-${a.nodeId}` })
  if (verb === 'get-briefing') return answer({ status: 'ok', agentNodeId: 'agent-chosen', instructions: [{ type: 'instruction-persona', source: 'node', text: 'PERSONA' }, { type: 'instruction-standing', source: 'node', text: 'RULES' }, { type: 'instruction-coldstart', source: 'node', text: 'START' }] })
  if (verb === 'mirror-messaging') { if (a.action === 'append') srv.mirrored.push(a); return answer({ status: 'ok', rowIds: [1] }) }
  return answer({ status: 'ok' })
}

const mk = (on: any, srv: Srv, env: Record<string, string> = SSH, tools: string[] = DEVICE_TOOLS) => {
  const ctx: string[] = []
  const cfg: Record<string, unknown> = {}
  on('prompt.submit', async (_$: any, e: any) => { ctx.push((e.context ?? []).join(SEP)); return { text: e.text } })
  on('turn.complete', async () => ({ text: '' }))
  on('mcp.connect', async (_$: any, e: any) => ({ value: srv.connected ? { isConnected: true, server: `plugin:kinitro-ai:${e.server}` } : { isConnected: false, reason: 'failed' } }))
  on('mcp.call', async (_$: any, e: any) => {
    if (!String(e.server).endsWith('kinitro_ai_device')) throw new Error(`no connected MCP server named "${e.server}"`)   // only the device server is connected
    srv.direct.push({ server: String(e.server), tool: String(e.tool), args: { ...(e.args ?? {}) } })
    const r = serve(srv, String(e.tool), e.args ?? {})
    return { value: { content: [{ type: 'text', text: r.text }], isError: r.isError } }
  })
  on('config.set', async (_$: any, e: any) => { cfg[String(e.key)] = e.value; return { value: e.value } })
  const verbs = new Proxy({}, { get: (_t, verb) => (a: Record<string, unknown>) => { const r = serve(srv, String(verb), a); return r.isError ? { result: r.text, isError: true } : { result: r.text } } })
  const w = makeWorld(on, { files: new Map(), cwd: '/w/b', root: '/w/b', sid: 'D1', tools, env, verbs: verbs as any })
  return Object.assign(w, { ctx, cfg })
}
const start = ($: any) => $.session.start({ isInteractive: true, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
const submit = ($: any, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' } } as any)
const complete = ($: any, turnId: string, answerText: string) => $.turn.complete({ reason: 'answer', durationMs: 1, isAborted: false, turnId, answer: answerText } as any)
const signIns = (srv: Srv) => srv.direct.filter((d) => d.tool === 'sign-in')
const textOf = (r: any) => String(r?.text ?? r?.result ?? r?.deny ?? '')
const allFiles = (w: { files: Map<string, string> }) => [...w.files.values()].join('\n')
const WITH_EMAIL = { options: { email: EMAIL, signInPath: 'auto' }, timeoutMs: 20000 } as const
const WITH_EMAIL_OAUTH = { options: { email: EMAIL, signInPath: 'oauth' }, timeoutMs: 20000 } as const
const NO_EMAIL = { options: { signInPath: 'auto' }, timeoutMs: 20000 } as const

describe('pure parts', () => {
  test('D1: chooseSignInPath: the setting wins; auto takes SSH markers and CLAUDE_CODE_REMOTE=true, else device (0.25.5)', () => {
    expect(chooseSignInPath('auto', { SSH_CONNECTION: '1.2.3.4 1 5.6.7.8 22' })).toEqual({ path: 'device', reason: 'SSH_CONNECTION' })
    expect(chooseSignInPath('auto', { SSH_CLIENT: '1.2.3.4 1 22' })).toEqual({ path: 'device', reason: 'SSH_CLIENT' })
    expect(chooseSignInPath('auto', { SSH_TTY: '/dev/pts/1' })).toEqual({ path: 'device', reason: 'SSH_TTY' })
    expect(chooseSignInPath('auto', { CLAUDE_CODE_REMOTE: 'TRUE' })).toEqual({ path: 'device', reason: 'CLAUDE_CODE_REMOTE' })
    expect(chooseSignInPath('auto', { CLAUDE_CODE_REMOTE: 'false' })).toEqual({ path: 'device', reason: 'default: the email-code sign-in; no localhost callback' })
    expect(chooseSignInPath('auto', { SSH_TTY: '' })).toEqual({ path: 'device', reason: 'default: the email-code sign-in; no localhost callback' })
    expect(chooseSignInPath('auto', {})).toEqual({ path: 'device', reason: 'default: the email-code sign-in; no localhost callback' })
    expect(chooseSignInPath(undefined, {})).toEqual({ path: 'device', reason: 'default: the email-code sign-in; no localhost callback' })
    expect(chooseSignInPath('oauth', { SSH_CONNECTION: 'x' })).toEqual({ path: 'oauth', reason: 'setting signInPath=oauth' })
    expect(chooseSignInPath('device', {})).toEqual({ path: 'device', reason: 'setting signInPath=device' })
  })
  test('the mask, the device label, the six-digit rule', () => {
    expect(emailMask('t@example.com')).toBe('t***@example.com')
    expect(emailMask(' Anna.B@kinitro.ai ')).toBe('A***@kinitro.ai')
    expect(deviceLabel({ COMPUTERNAME: 'WS-1', HOSTNAME: 'box' })).toBe('WS-1')
    expect(deviceLabel({ HOSTNAME: 'box' })).toBe('box')
    expect(deviceLabel({})).toBe('unknown device')
    expect(deviceLabel({ COMPUTERNAME: 'x'.repeat(100) })).toHaveLength(80)
    expect(isSixDigits(' 123456 ')).toBe(true)
    expect(isSixDigits('1234567')).toBe(false)
    expect(isSixDigits('12345a')).toBe(false)
    expect(isSixDigits('code 123456')).toBe(false)
  })
  test('R5: the per-turn block and the pending result, exact, with no server text', () => {
    const si = { sid: 'S', url: URL, mask: MASK, expiresAt: '2026-10-25T10:00:00.000Z', requestedAt: 0 }
    expect(signInContextBlock(si)).toBe(`kinitro.ai sign-in waits for the user's approval. In your first reply give the link [Approve this sign-in](${URL}) as a Markdown link and say: a 6-digit code was sent to ${MASK}; type it only on that kinitro.ai page, on any device, never in this chat; then send any message here. Never ask for the code.`)
    const r = signInResult(si)
    expect(r.status).toBe('sign_in_pending')
    expect(r.approvalLink).toBe(URL)
    expect(r.label).toBe('Approve this sign-in')
    expect(typeof r.sayToUser).toBe('string')
    expect(JSON.stringify(r)).not.toContain(PROSE)
  })
  test('D4 band model: the mask, the link and "I approved it"; "Send a new code" dim for 60 s', () => {
    const si = { sid: 'S', url: URL, mask: MASK, expiresAt: '2026-10-25T10:00:00.000Z', requestedAt: 1_000_000 }
    const early = bandModel({ approved: [], current: null, chooser: false, url: null, note: null, pend: null, signIn: si, now: 1_030_000 })
    expect(early.title).toBe(`kinitro.ai PROD · a code was sent to ${MASK}.`)
    expect(early.items[0]).toEqual({ kind: 'link', key: 'kin-signin-link', label: 'Approve this sign-in', href: URL })
    expect(early.items[1]).toMatchObject({ kind: 'button', label: 'I approved it', act: 'signin-approved', primary: true })
    expect(early.items[2]).toMatchObject({ kind: 'button', label: 'Send a new code', act: 'signin-resend', dim: true })
    const late = bandModel({ approved: [], current: null, chooser: false, url: null, note: null, pend: null, signIn: si, now: 1_061_000 })
    expect(late.items[2]).toMatchObject({ label: 'Send a new code', dim: false })
    expect(JSON.stringify(early)).not.toContain(PROSE)
    const ended = bandModel({ approved: [], current: null, chooser: false, url: null, note: 'The kinitro.ai sign-in ended.', pend: null, signIn: null })
    expect(ended.title).toBe('The kinitro.ai sign-in ended.')
    expect(ended.items).toEqual([{ kind: 'button', key: 'kin-signin-again', label: 'Sign in again', act: 'signin-again', primary: true }])
    const escape = bandModel({ approved: [], current: null, chooser: false, url: null, note: null, pend: null, offerDevice: true })
    expect(escape.items.some((i) => i.kind === 'button' && i.label === 'Sign in with an email code' && i.act === 'signin-device')).toBe(true)
    const control = bandModel({ approved: [], current: null, chooser: false, url: null, note: null, pend: null })
    expect(control.items.some((i) => i.label === 'Sign in with an email code')).toBe(false)
  })
  test('D9 pure: the inactive own server is never resolved; the device server is no second connection', () => {
    expect(resolveKinitroTools([`${DEV}current-seat`], 'oauth')).toBeUndefined()
    expect(resolveKinitroTools([`${DEV}current-seat`], 'device')).toEqual({ prefix: DEV, source: 'bundled' })
    expect(resolveKinitroTools([`${DEV}current-seat`])).toBeUndefined()   // the default is the OAuth path
    expect(resolveKinitroTools([`${DEV}current-seat`, `${OAUTH}current-seat`], 'oauth')).toEqual({ prefix: OAUTH, source: 'bundled' })   // control
    expect(resolveKinitroTools([`${DEV}current-seat`, `${OAUTH}current-seat`], 'device')).toEqual({ prefix: DEV, source: 'bundled' })
    expect(secondConnections([`${DEV}current-seat`, 'mcp__plugin_kinitro-ai-test_kinitro_ai_device__current-seat'])).toEqual([])
  })
})

describe('device sign-in (criteria 1-9)', () => {
  test('D1: an SSH session decides the device path (logged by the variable name, never its value)', WITH_EMAIL, async ($, on) => {
    const w = mk(on, newSrv())
    await start($)
    const st = await probe($, 'status')
    expect(st).toContain('sign-in path: device (SSH_CONNECTION)')
    const log = w.files.get('/w/b/kinitro-ai.log') ?? ''
    expect(log).toMatch(/sign-in path device \(SSH_CONNECTION\)/)
    expect(log).not.toContain('10.9.8.7')
  })
  test('D1 control (0.25.5): a local session without markers takes the device path, never OAuth', WITH_EMAIL, async ($, on) => {
    mk(on, newSrv(), {}, [])
    await start($)
    expect(await probe($, 'status')).toContain('sign-in path: device (default: the email-code sign-in; no localhost callback)')
  })
  test('D1: the setting wins over the markers (oauth with SSH)', { options: { email: EMAIL, signInPath: 'oauth' }, timeoutMs: 20000 }, async ($, on) => {
    const srv = newSrv()
    mk(on, srv, SSH, [])
    await start($)
    expect(await probe($, 'status')).toContain('sign-in path: oauth (setting signInPath=oauth)')
    await submit($, 'hello')
    expect(signIns(srv)).toHaveLength(0)
  })
  test('D1: setting device without any marker', { options: { email: EMAIL, signInPath: 'device' }, timeoutMs: 20000 }, async ($, on) => {
    const srv = newSrv()
    mk(on, srv, {})
    await start($)
    expect(await probe($, 'status')).toContain('sign-in path: device (setting signInPath=device)')
    await submit($, 'hello')
    expect(signIns(srv)).toHaveLength(1)
  })

  test('D2: the first turn sends one sign-in on the device server; the key is held and used, and nothing the model, a file or the log sees holds it', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    const s = signIns(srv)
    expect(s).toHaveLength(1)
    expect(s[0]!.server).toBe('plugin:kinitro-ai:kinitro_ai_device')
    expect(s[0]!.args).toEqual({ email: EMAIL, deviceLabel: 'WS-1', clientName: 'Claude Code, kinitro-ai 0.25.5' })
    expect(w.sent.filter((x) => x.verb === 'open-domain')).toHaveLength(0)
    // the model's call carries the held key (the plugin adds it), and the answer is the plugin's pending result
    const r: any = await ($ as any).tool.call({ tool: `${DEV}current-seat` })
    expect(w.sent[w.sent.length - 1]!.args.domainRef).toBe(srv.minted[0])
    expect(textOf(r)).toContain('sign_in_pending')
    await complete($, 't1', 'Please approve.')
    const seen = [w.ctx.join(SEP), allFiles(w), await probe($, 'status'), textOf(r)].join('\n')
    expect(seen).not.toContain('kss_')
    expect(seen).not.toContain(PROSE)
    expect(seen).not.toContain(KEYMSG)
    expect(seen).not.toContain(EMAIL)   // only the mask is shown and logged
    expect(seen).toContain(MASK)
  })
  test('D2 control: a session that never gets a prompt calls nothing on any server', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    expect(srv.direct).toEqual([])
    expect(w.sent).toEqual([])
  })
  test('criterion 1: the band shows the mask, the link "Approve this sign-in" and "I approved it"', WITH_EMAIL, async ($, on) => {
    mk(on, newSrv())
    await start($)
    await submit($, 'hello')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect((await ui.find({ type: 'Text', text: /a code was sent/ }))?.text).toBe(`kinitro.ai PROD · a code was sent to ${MASK}.`)
    const link = await ui.find({ type: 'Link' })   // a Link carries no key in the drawn tree
    expect(link?.props.href).toBe(URL)
    expect(link?.props.label).toBe('Approve this sign-in')
    expect(await ui.find({ key: 'kin-signin-approved' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).not.toContain(PROSE)
    await ui.unmount()
  })

  test('D3: without an email the agent is asked once (exact block); the probe stores the setting and signs in once; a malformed address sends nothing', NO_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    expect(w.ctx[0]).toContain('kinitro.ai sign-in: ask the user, in one short question in chat, for the email address of their kinitro.ai account, then call `mcp__kinitro-ai__probe` with {"action": "sign-in", "email": "<address>"}. Never ask for a password or a code.')
    expect(signIns(srv)).toHaveLength(0)
    await submit($, 'next')
    expect(w.ctx[1]).not.toContain('ask the user, in one short question')   // once
    const bad = JSON.parse(await probe($, 'sign-in', { email: 'not-an-address' }))
    expect(bad).toEqual({ status: 'error', message: 'That is not an email address.' })
    expect(JSON.parse(await probe($, 'sign-in', { email: 'a@b@c.d' })).status).toBe('error')
    expect(JSON.parse(await probe($, 'sign-in', { email: `${'x'.repeat(250)}@example.com` })).status).toBe('error')
    expect(signIns(srv)).toHaveLength(0)
    expect(w.cfg).toEqual({})
    const ok = JSON.parse(await probe($, 'sign-in', { email: ` ${EMAIL} ` }))
    expect(ok.status).toBe('sign_in_pending')
    expect(w.cfg).toEqual({ 'kinitro-ai.email': EMAIL })
    expect(signIns(srv)).toHaveLength(1)
    expect(signIns(srv)[0]!.args.email).toBe(EMAIL)
    expect(JSON.stringify(ok)).not.toContain('kss_')
  })

  test('D4: while pending the turn gets the exact R5 block; the model\'s own sign-in call is refused', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    expect(w.ctx[0]).toContain(`kinitro.ai sign-in waits for the user's approval. In your first reply give the link [Approve this sign-in](${URL}) as a Markdown link and say: a 6-digit code was sent to ${MASK}; type it only on that kinitro.ai page, on any device, never in this chat; then send any message here. Never ask for the code.`)
    const own: any = await ($ as any).tool.call({ tool: `${DEV}sign-in`, email: EMAIL })
    expect(textOf(own)).toContain('The kinitro-ai plugin signs in itself: call mcp__kinitro-ai__probe with {"action": "sign-in"}.')
    expect(signIns(srv)).toHaveLength(1)
    expect(w.sent.filter((x) => x.verb === 'sign-in')).toHaveLength(0)
  })

  test('D5: after the approval the next turn binds the domain and agent of the seat answer and loads the briefing; control: before it no briefing is read', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    await complete($, 't1', 'Approve, please.')
    expect(w.sent.some((x) => x.verb === 'get-briefing')).toBe(false)   // control
    expect(srv.mirrored).toHaveLength(0)                                // held while pending
    srv.keys[srv.minted[0]!] = 'ready'
    await submit($, 'done')
    expect(w.sent.some((x) => x.verb === 'get-node' && x.args.nodeId === 'agent-chosen')).toBe(true)
    expect(w.sent.some((x) => x.verb === 'get-briefing')).toBe(true)
    expect(w.sent.filter((x) => x.verb === 'open-domain')).toHaveLength(0)
    expect(w.ctx[1]).toContain('PERSONA')
    expect(w.ctx[1]).toContain('domain beta')
    expect(w.ctx[1]).not.toContain('sign-in waits')
    expect(w.sent.every((x) => x.args.domainRef === srv.minted[0])).toBe(true)
    expect(srv.mirrored.length).toBeGreaterThan(0)                      // the held turn went out after binding
    expect(signIns(srv)).toHaveLength(1)
    expect(await probe($, 'status')).toContain('domain: beta')
  })
  test('criterion 2: "I approved it" binds without a message', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    srv.keys[srv.minted[0]!] = 'ready'
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    await ui.press({ key: 'kin-signin-approved' })
    await ui.unmount()
    expect(w.sent.some((x) => x.verb === 'get-briefing')).toBe(true)
    expect(await probe($, 'status')).toContain('domain: beta')
  })

  test('D6: an expired or denied request drops the key and shows "ended" with "Sign in again"; no further sign-in until it is pressed', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    srv.keys[srv.minted[0]!] = 'gone'
    await submit($, 'again')
    for (let i = 0; i < 5; i++) await submit($, `more ${i}`)
    expect(signIns(srv)).toHaveLength(1)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect((await ui.find({ type: 'Text', text: /sign-in ended/ }))?.text).toBe('The kinitro.ai sign-in ended.')
    const before = w.sent.length
    await ($ as any).tool.call({ tool: `${DEV}list-domains` })
    expect(w.sent.slice(before).every((x) => x.args.domainRef === undefined)).toBe(true)   // the key was dropped
    await ui.press({ key: 'kin-signin-again' })
    await ui.unmount()
    expect(signIns(srv)).toHaveLength(2)
    expect(signIns(srv)[1]!.args.domainRef).toBeUndefined()
  })

  test('D7: "Send a new code" sends nothing before 60 s; after 60 s it carries the pending key and the key stays', WITH_EMAIL, async ($, on) => {
    const clock = mock.clock(on, { now: Date.now() })
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    const early = JSON.parse(await probe($, 'sign-in'))
    expect(early.status).toBe('too_soon')
    expect(early.message).toMatch(/^A new code can be sent from \d\d:\d\d\.$/)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    await ui.press({ key: 'kin-signin-resend' })
    expect(signIns(srv)).toHaveLength(1)
    await clock.advance(61_000)
    await ui.press({ key: 'kin-signin-resend' })
    await ui.unmount()
    expect(signIns(srv)).toHaveLength(2)
    expect(signIns(srv)[1]!.args.domainRef).toBe(srv.minted[0])
    expect(srv.minted).toHaveLength(1)
    await ($ as any).tool.call({ tool: `${DEV}current-seat` })
    expect(w.sent[w.sent.length - 1]!.args.domainRef).toBe(srv.minted[0])
  })

  test('D8: a rate limit shows the minutes and starts no retry', WITH_EMAIL, async ($, on) => {
    const srv = newSrv({ rateLimited: 600 })
    mk(on, srv)
    await start($)
    await submit($, 'hello')
    await submit($, 'again')
    expect(signIns(srv)).toHaveLength(1)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect(JSON.stringify(await ui.drawn())).toContain('Too many sign-in requests. Try again in 10 minutes.')
    expect(JSON.stringify(await ui.drawn())).not.toContain(PROSE)
    await ui.unmount()
  })

  test('D9: on the OAuth path a device-server call is refused with a pointer; the band offers the email code while no own tool is listed', WITH_EMAIL_OAUTH, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv, {}, [...DEVICE_TOOLS])
    await start($)
    const r: any = await ($ as any).tool.call({ tool: `${DEV}current-seat` })
    expect(textOf(r)).toContain(`kinitro-ai works through ${OAUTH} in this session; use those tools.`)
    expect(w.sent).toEqual([])
    const st = await probe($, 'status')
    expect(st).toContain('kinitro.ai tools: none visible')
    expect(st).not.toContain('not used:')   // the own device server is no second connection
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect(await ui.find({ key: 'kin-signin-device' })).toBeDefined()
    await ui.unmount()
  })
  test('D9 control: on the device path an OAuth-server call is refused the other way round', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv, SSH, [...DEVICE_TOOLS, `${OAUTH}current-seat`])
    await start($)
    const r: any = await ($ as any).tool.call({ tool: `${OAUTH}current-seat` })
    expect(textOf(r)).toContain(`kinitro-ai works through ${DEV} in this session; use those tools.`)
    expect(w.sent).toEqual([])
  })
  test('D9: a refused key on the device path never calls open-domain without a key (R8); it ends the sign-in', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    srv.keys[srv.minted[0]!] = 'ready'
    await submit($, 'approved')
    delete srv.keys[srv.minted[0]!]   // the server no longer knows the key: session_key_required
    await ($ as any).tool.call({ tool: `${DEV}get-node`, nodeId: 'n1' })
    expect(w.sent.filter((x) => x.verb === 'open-domain')).toHaveLength(0)
    expect(signIns(srv)).toHaveLength(1)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect((await ui.find({ type: 'Text', text: /sign-in ended/ }))?.text).toBe('The kinitro.ai sign-in ended.')
    await ui.unmount()
  })
  test('the escape on the OAuth path: "Sign in with an email code" switches this session to the device path and signs in', WITH_EMAIL_OAUTH, async ($, on) => {
    const srv = newSrv()
    mk(on, srv, {}, [...DEVICE_TOOLS])
    await start($)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    await ui.press({ key: 'kin-signin-device' })
    await ui.unmount()
    expect(signIns(srv)).toHaveLength(1)
    expect(await probe($, 'status')).toContain('sign-in path: device (band button)')
  })

  test('D10: a 6-digit prompt while pending is not mirrored and gets the R9 line; control: the same prompt without a pending sign-in is mirrored', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await start($)
    await submit($, 'hello')
    await complete($, 't1', 'Approve, please.')
    await submit($, ' 482913 ')
    expect(w.ctx[1]).toContain('The user typed what looks like the sign-in code here. Tell them to type it only on the kinitro.ai page; do not repeat it.')
    await complete($, 't2', 'Type it on the page.')
    srv.keys[srv.minted[0]!] = 'ready'
    await submit($, 'approved now')
    await complete($, 't3', 'Bound.')
    const outbox = w.files.get('/w/b/.kinitro-ai-outbox.json') ?? ''
    expect(outbox).not.toContain('482913')
    expect(JSON.stringify(srv.mirrored)).not.toContain('482913')
    expect(JSON.stringify(srv.mirrored)).toContain('approved now')
    // control: after the sign-in, the same text is mirrored like any prompt
    await submit($, '482913')
    expect(w.ctx[w.ctx.length - 1]).not.toContain('looks like the sign-in code')
    await complete($, 't4', 'ok')
    expect(JSON.stringify(srv.mirrored)).toContain('482913')
  })

  test('D11: a headless session with SSH set calls no sign-in and draws no band', WITH_EMAIL, async ($, on) => {
    const srv = newSrv()
    const w = mk(on, srv)
    await $.session.start({ isInteractive: false, surface: 'terminal', cwd: '/w/b' }).catch(() => undefined)
    await submit($, 'Reply OK')
    await complete($, 't1', 'OK')
    expect(signIns(srv)).toHaveLength(0)
    expect(srv.direct).toEqual([])
    expect(w.ctx.join(SEP)).not.toContain('kinitro')
  })

  test('D12: the device path without a connected device server falls back to OAuth with the note', WITH_EMAIL, async ($, on) => {
    const srv = newSrv({ connected: false })
    mk(on, srv)
    await start($)
    await submit($, 'hello')
    expect(signIns(srv)).toHaveLength(0)
    expect(await probe($, 'status')).toContain('sign-in path: oauth')
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect(JSON.stringify(await ui.drawn())).toContain('kinitro.ai sign-in by email code is not available here; type /kinitro domain to sign in.')
    await ui.unmount()
  })

  test('criterion 5: /kinitro sign-in-path stores the setting; a bad value is refused', WITH_EMAIL, async ($, on) => {
    const w = mk(on, newSrv(), {}, [])
    const ok = JSON.parse(await probe($, 'sign-in-path', { value: 'device' }))
    expect(ok.status).toBe('ok')
    expect(w.cfg).toEqual({ 'kinitro-ai.signInPath': 'device' })
    const bad = JSON.parse(await probe($, 'sign-in-path', { value: 'other' }))
    expect(bad.status).toBe('error')
    expect(w.cfg).toEqual({ 'kinitro-ai.signInPath': 'device' })
  })
})
