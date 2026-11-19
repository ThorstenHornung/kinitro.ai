import { describe, expect } from 'claude-code/testing'
import { test } from './kit'
import { makeWorld, probe } from './world'
import { bandModel, duplicateNotice, findCopies, surfaceKind, updateNotice } from '../hooks/register'

// 0.26.0 (item 4.2.1-4672 P7, P8, P12): the status of a session in the band (where a surface draws it) or in one marker line (Cowork), the
// plain-words diagnosis of the probe action status, other plugin copies, the update notice per surface, and the folder hint of the picker.
const PAGE = 'https://methos.kinitro.ai/download/plugins/claude/'
const COWORK_ENV = { CLAUDE_CODE_ENTRYPOINT: 'remote_cowork', CLAUDE_CODE_SKIP_PLUGIN_MCP_SERVERS: '1' }
const json = (t: string) => JSON.parse(t)
const submit = ($: any, text = 'a') => $.prompt.submit({ text, origin: { kind: 'composer' } } as any)

const mk = (on: any, o: { surfaces?: string[]; env?: Record<string, string>; tools?: { name: string; description?: string }[]; verbs?: Record<string, (a: Record<string, unknown>) => unknown>; files?: [string, string][]; turns?: number; cwd?: string; noHome?: boolean; fetch?: string } = {}) => {
  const seen: string[] = []
  on('session.surfaces', async () => ({ value: o.surfaces ?? [] }))
  on('session.turns', async () => ({ value: o.turns ?? 0 }))
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n\n')); return { text: e.text } })
  if (o.tools) on('tool.list', async () => ({ value: o.tools!.map((t) => ({ name: t.name, description: t.description ?? '', isMcp: true })) }))
  if (o.fetch) on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: o.fetch! } }))
  const w = makeWorld(on, { files: new Map([...(o.noHome ? [] : [['/w/b/.kinitro-ai-domain', 'beta\n'] as [string, string]]), ...(o.files ?? [])]), cwd: o.cwd ?? '/w/b', root: '/w/b', sid: 'ST1', env: o.env, verbs: o.verbs })
  return { w, seen }
}

describe('surface and status line (P7)', () => {
  test('surfaceKind names the surface from the entrypoint, the drawing surfaces and the Cowork marker', () => {
    expect(surfaceKind(false, 'remote_cowork', [], true)).toBe('cowork')
    expect(surfaceKind(false, 'cli', ['terminal'], false)).toBe('terminal')
    expect(surfaceKind(false, 'claude-desktop', [], false)).toBe('desktop')
    expect(surfaceKind(false, 'cli', ['desktop'], false)).toBe('desktop')
    expect(surfaceKind(true, 'sdk-cli', [], false)).toBe('background')
    expect(surfaceKind(false, '', [], true)).toBe('cowork')
  })

  test('without a band surface (Cowork) the marker is the one status line: domain, seat, mirror on, context; stable between turns', async ($, on) => {
    const { seen } = mk(on, { env: COWORK_ENV })
    await probe($, 'reload')
    await submit($); await submit($)
    const line = (t: string) => t.split('\n')[0]!
    expect(line(seen[0]!)).toBe('[kinitro-ai 0.26.0] name-dom-beta · name-agent-beta · mirror on · context ? %')
    expect(line(seen[1]!)).toBe(line(seen[0]!))
    expect(line(seen[0]!).length).toBeLessThan(120)   // about 30 tokens
    await probe($, 'mirror', { value: 'off' })
    await submit($)
    expect(line(seen[2]!)).toContain('mirror off')
  })

  test('where a surface draws the band the marker stays the short old one and the band model carries seat, mirror and version', async ($, on) => {
    const { seen } = mk(on, { surfaces: ['terminal'] })
    await probe($, 'reload')
    await submit($)
    expect(seen[0]).toMatch(/^\[kinitro-ai 0\.26\.0\] context \? % · briefing code-agent-beta/)
    const approved = [{ slug: 'beta', name: 'BETA' }]
    const m = bandModel({ approved, current: 'beta', chooser: false, url: null, note: null, pend: null, seat: 'Coach', mirror: true, version: '0.26.0' })
    expect(m.title).toBe('kinitro.ai · BETA · seat Coach · mirror on · 0.26.0')
    expect(bandModel({ approved, current: 'beta', chooser: false, url: null, note: null, pend: null, seat: 'Coach', mirror: false, version: '0.26.0', env: 'TEST' }).title).toBe('kinitro.ai TEST · BETA · seat Coach · mirror off · 0.26.0')
    expect(m.title).not.toContain('(beta)')   // no slug in the user's text
  })
})

describe('diagnosis (P8)', () => {
  test('status is a plain-words object: surface, connection, signed in, key held (never the value), domain, seat, mirror, problems', async ($, on) => {
    mk(on, { surfaces: ['terminal'] })
    await probe($, 'reload')
    const st = json(await probe($, 'status'))
    expect(st).toMatchObject({ version: '0.26.0', surface: 'Claude Code (terminal)', environment: 'Prod', domain: 'name-dom-beta', seat: 'name-agent-beta', mirror: { on: true, lastError: null }, duplicates: [], updateAvailable: null })
    expect(typeof st.keyHeld).toBe('boolean')
    expect(JSON.stringify(st)).not.toContain('kss_')
    expect(Array.isArray(st.problems)).toBe(true)
    expect(st.briefingLoadedAt).toBeTruthy()
    expect(st.details.join('\n')).toContain('briefing: domain')
  })

  test('problems carry a fix for the surface the status names', async ($, on) => {
    mk(on, { env: COWORK_ENV, tools: [] as any })
    const st = json(await probe($, 'status'))
    expect(st.surface).toBe('Cowork')
    expect(st.connection).toEqual({ kind: 'none', prefix: null })
    expect(st.problems[0].problem).toContain('cannot see any kinitro.ai tools')
    expect(st.problems[0].fix).toContain('connector to your Claude account')
    expect(st.problems.every((p: any) => typeof p.fix === 'string' && p.fix.length > 0)).toBe(true)
  })

  test('Cowork with a connector: connection is the account connector with its prefix', async ($, on) => {
    mk(on, { env: COWORK_ENV, tools: [{ name: 'mcp__Kinitro__current-seat' }, { name: 'mcp__Kinitro__open-domain' }] })
    const st = json(await probe($, 'status'))
    expect(st.connection).toEqual({ kind: 'account connector', prefix: 'mcp__Kinitro__' })
  })

  test('the update notice names the step of the surface; without a surface both', async ($, on) => {
    expect(updateNotice('0.27.0', '0.26.0', PAGE, 'terminal')).toBe(`kinitro-ai 0.27.0 is available (you run 0.26.0). Claude Code: run /kinitro update.`)
    expect(updateNotice('0.27.0', '0.26.0', PAGE, 'cowork')).toContain('managed in your Claude account (organisation plugins: your admin re-uploads it); ask me to fetch the new package')
    expect(updateNotice('0.27.0', '0.26.0', PAGE)).toContain('Cowork/Desktop: re-upload the plugin')
    expect(updateNotice('0.26.0', '0.26.0', PAGE, 'cowork')).toBeUndefined()
  })

  test('in Cowork the first prompt carries the account step of the update notice', async ($, on) => {
    const { seen } = mk(on, { env: COWORK_ENV, fetch: JSON.stringify({ plugins: [{ name: 'kinitro-ai', version: '0.27.0' }] }) })
    await probe($, 'reload')
    await submit($)
    expect(seen[0]).toContain('kinitro-ai 0.27.0 is available (you run 0.26.0).')
    expect(seen[0]).toContain('ask me to fetch the new package')
    expect(seen[0]).not.toContain('run /kinitro update')
  })
})

describe('other plugin copies (P8)', () => {
  const OTHERS = [{ name: 'mcp__kinitro-ai-em__probe', description: 'kinitro-ai-em harness control, version 0.25.0.' }, { name: 'mcp__plugin_kinitro-ai-test_kinitro_ai_device_test__current-seat' }, { name: 'mcp__kinitro-ai__probe' }, { name: 'mcp__plugin_kinitro-ai_kinitro_ai_device__current-seat' }]

  test('findCopies: another copy by its probe or wake tool and by its plugin-scoped server; this copy is none; a higher version is known only from its description', () => {
    const r = findCopies(OTHERS, 'kinitro-ai', '0.26.0')
    expect(r.names.sort()).toEqual(['kinitro-ai-em', 'kinitro-ai-test'])
    expect(r.higher).toBeUndefined()
    const newer = findCopies([{ name: 'mcp__kinitro-ai-em__wake', description: 'x (version 0.27.1). y' }], 'kinitro-ai', '0.26.0')
    expect(newer).toEqual({ names: ['kinitro-ai-em'], higher: '0.27.1' })
    expect(findCopies([{ name: 'mcp__kinitro-ai-em__probe', description: 'old copy, no version' }], 'kinitro-ai', '0.26.0').higher).toBeUndefined()
  })

  test('the probe and wake descriptions of this copy say their version', async ($, on) => {
    const registered: Record<string, string> = {}
    on('tool.register', async (_$: any, e: any) => { registered[String(e.name)] = String(e.description); return { value: undefined } })
    mk(on)
    await probe($, 'status')
    expect(registered.probe).toContain('version 0.26.0')
  })

  test('an older copy is named once in the injected context with the steps of the surface; status lists it', async ($, on) => {
    const { seen } = mk(on, { surfaces: ['terminal'], tools: OTHERS })
    await probe($, 'reload')
    await submit($); await submit($)
    expect(seen[0]).toContain('Another kinitro.ai plugin is active in this session (kinitro-ai-em, kinitro-ai-test). Remove it: type /plugin')
    expect(seen[1]).not.toContain('Another kinitro.ai plugin')
    const st = json(await probe($, 'status'))
    expect(st.duplicates.sort()).toEqual(['kinitro-ai-em', 'kinitro-ai-test'])
    expect(st.problems.some((p: any) => p.problem.includes('Another kinitro.ai plugin') && p.fix.includes('/plugin'))).toBe(true)
    expect(duplicateNotice(['x'], 'cowork')).toContain('your Claude account')
  })

  test('control: with an OLDER copy this copy still mirrors the turn (so the silent test above can go red)', async ($, on) => {
    const sent: string[] = []
    const { seen } = mk(on, { tools: [{ name: 'mcp__kinitro-ai-em__probe', description: 'kinitro-ai-em harness control, version 0.25.0.' }], verbs: { 'mirror-messaging': (a) => { sent.push(String(a.action)); return { result: JSON.stringify({ status: 'ok', rowIds: [] }) } } } })
    on('turn.complete', async () => ({ text: '' }))
    await submit($)
    expect(seen[0]).toContain('[kinitro-ai 0.26.0]')
    await $.turn.complete({ turnId: 't1', reason: 'end_turn', answer: 'done' } as any)
    expect(sent).toContain('append')
  })

  test('a copy with a HIGHER version is active: this copy goes silent (no injection, no mirror) and logs it', async ($, on) => {
    const sent: string[] = []
    const { seen, w } = mk(on, { tools: [{ name: 'mcp__kinitro-ai-em__probe', description: 'kinitro-ai-em harness control, version 0.27.0.' }], verbs: { 'mirror-messaging': (a) => { sent.push(String(a.action)); return { result: JSON.stringify({ status: 'ok', rowIds: [] }) } } } })
    on('turn.complete', async () => ({ text: '' }))
    await submit($)
    expect(seen[0] ?? '').not.toContain('[kinitro-ai')
    await $.turn.complete({ turnId: 't1', reason: 'end_turn', answer: 'done' } as any).catch(() => undefined)
    expect(sent).toEqual([])
    expect(w.files.get('/u/.kinitro-ai/headless.log') ?? '').toContain('runs version 0.27.0; this copy stays silent')
  })
})

describe('picker data and folder hint (P12)', () => {
  test('choices returns approved {name, slug}, current and lastInFolder', async ($, on) => {
    mk(on, { surfaces: ['terminal'] })
    await probe($, 'reload')
    const c = json(await probe($, 'choices'))
    expect(c.approved).toEqual([{ slug: 'alpha', name: 'ALPHA' }, { slug: 'beta', name: 'BETA' }, { slug: 'gamma', name: 'GAMMA' }])
    expect(c.current).toBe('beta')
    expect(c.lastInFolder).toBe('beta')
  })

  test('the folder wins over the session home; no record gives null', async ($, on) => {
    mk(on, { files: [['/w/b/.kinitro-ai-domain', 'gamma\n']] })
    expect(json(await probe($, 'choices')).lastInFolder).toBe('gamma')
  })

  test('a first prompt without a binding and a lastInFolder adds one line (no auto-bind); said once', async ($, on) => {
    // the session's home (the project root) has no domain; the folder it runs in does: the plugin names it and binds nothing
    on('clock.sleep', async (_$: any, e: any) => (e.ms >= 3000 ? new Promise<{ value: undefined }>(() => {}) : new Promise<{ value: undefined }>((res) => setTimeout(() => res({ value: undefined }), 1))))   // budgets never fire, retry pauses are short
    const { seen, w } = mk(on, { noHome: true, cwd: '/w/c', files: [['/w/c/.kinitro-ai-domain', 'gamma\n']] })
    await submit($); await submit($)
    expect(seen[0]).toContain('kinitro.ai: this folder last worked in GAMMA. If the user wants it, bind it with mcp__kinitro-ai__probe action set-domain.')
    expect(seen[1] ?? '').not.toContain('this folder last worked in')
    expect(w.sent.some((s) => s.verb === 'open-domain')).toBe(false)
  })
})
