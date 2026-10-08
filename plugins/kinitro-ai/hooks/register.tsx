import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { DomainChoice } from '../types'

// kinitro-ai harness for Claude. All instruction TEXTS live in kinitro.ai; this file only decides WHEN
// each section is injected. Layers G+M: the general briefing behind the domain's general-procedures edge;
// layer A: the agent node's native instruction-* contents. Nothing is hard-wired to a domain.

const SERVER = 'kinitro_ai'
// Everything is resolved from the seat (current-seat): no domain codes are hard-wired.
const GENERAL_EDGE = 'general-procedures'                 // association edge from the domain node to the general library section
const GENERAL_BRIEFING_PREFIX = 'Briefing: kinitro.ai agents in Claude'  // Document in that section: layers G + M
const PROTOCOL_SECTION = 'Protocols: Claude sessions'     // created in the domain's _Work section (or the domain) if missing
const WARN_PCT = 70        // auto-compaction fires at 80 % in this environment
const REWARN_STEP = 5      // warn again when the fill rises this many more points
const MAX_MIRROR = 6000    // chars per prompt / answer in the protocol
const RETRY_MS = 20000     // retry a failed briefing load at most this often
const LOG_FILE = 'kinitro-ai.log'
const VERSION = '0.17.3'
const REFRESH_MS = 24 * 3600 * 1000       // regular operation: instructions change rarely (PO 2026-10-08)
const TEST_REFRESH_MS = 2 * 60 * 1000     // test mode (/kinitro test)
const PAGE_TEXT_TOOLS = ['mcp__remote-devices__Claude_Browser__get_page_text', 'mcp__Claude_Browser__get_page_text']
const BROWSER_TOOLS = ['mcp__remote-devices__Claude_Browser__preview_start', 'mcp__Claude_Browser__preview_start']   // the Claude app's browser pane (cloud session linked to the computer / desktop session)
const SNAPSHOT_FILE = '.kinitro-ai-selection.json'   // approved slugs when the selection page was opened (selection-start)
// Domain binding (kinitro.ai 2026-10-08): a connection may serve several domains; every call names its domain
// with domainRef (the slug). The slug of this session lives in DOMAIN_FILE (set it with probe action 'set-domain').
const DOMAIN_FILE = '.kinitro-ai-domain'               // folder default: the last domain chosen in this working folder
const SESSION_DOMAIN_PREFIX = '.kinitro-ai-domain.'    // + session id: the domain of exactly this session (wins over the folder default)
const NO_DOMAIN_ARG = new Set(['current-seat', 'list-domains'])   // verbs that take no arguments
// Each user message may start a fresh engine process while the kinitro.ai
// connector is still connecting: the briefing and the hook state therefore
// live in files that survive the restart, refreshed from kinitro.ai in the background.
const CACHE_FILE = '.kinitro-ai-briefing.json'
const STATE_FILE = '.kinitro-ai-state.json'
const WAIT_FIRST_MS = 6000   // with no cache at all, wait this long for the connector

// section names in the briefing
const S = {
  persona: 'Persona', rules: 'Working rules', start: 'Session start', turn: 'Every turn',
  full: 'Context nearly full', after: 'After compaction', keep: 'Compaction instruction',
} as const

// ---- module state (resets on reload; session.start re-fills it) -----------
type Briefing = { raw: string; sections: Record<string, string>; code: string; loadedAt: string; source: string; domainCode?: string; agentCode?: string; domainRef?: string; domainName?: string; agentName?: string; layers?: string }
let briefing: Briefing | undefined
let briefingError: string | undefined
let lastLoadTry = 0
let route = '-'
let protocolCode: string | undefined
let pendingPrompt = ''
let warnedAt = 0
let compactedPending = false
let testArmed = false
let lastInjected: string[] = []
let composeCount = 0
let mirrored = 0
let lastMirrorError: string | undefined
let compactions = 0
let contextRenders = 0
let personaSource = 'briefing document'
let refreshing = false
let refreshDone = false
let domainRef: string | undefined      // slug passed on every call; undefined = legacy seat-bound connection
let bandRenders = 0
let lastBandSurface = '-'
let needsDomain: string | undefined    // set when the connection serves several domains and no slug is configured
const logLines: string[] = []

// ---- band state (host-held, survives module reloads) ----------------------
const approvedA = atom({ plugin: 'kinitro-ai', key: 'approved' } as const, [] as DomainChoice[])
const currentA = atom({ plugin: 'kinitro-ai', key: 'current' } as const, null as string | null)
const chooserA = atom({ plugin: 'kinitro-ai', key: 'chooser' } as const, false)
const selectorUrlA = atom({ plugin: 'kinitro-ai', key: 'selectorUrl' } as const, null as string | null)
const bandNoteA = atom({ plugin: 'kinitro-ai', key: 'bandNote' } as const, null as string | null)
const testModeA = atom({ plugin: 'kinitro-ai', key: 'testMode' } as const, false)
const startPackA = atom({ plugin: 'kinitro-ai', key: 'startPack' } as const, false)          // inject the session-start package on the next prompt (after binding a domain)
const contextKeyA = atom({ plugin: 'kinitro-ai', key: 'contextKey' } as const, '')            // domain + hash of persona/rules the agent last received
const boundA = atom({ plugin: 'kinitro-ai', key: 'bound' } as const, null as string | null)   // this session's slug, held by the host: survives reloads and a changed working folder

// ---- helpers: top level, because the engine only lets $ flow into these ----
async function log($: any, line: string) {
  logLines.push(`${new Date().toISOString()} ${line}`)
  try { await $.fs.write(LOG_FILE, logLines.join('\n') + '\n') } catch { /* ignore */ }
}

// kinitro.ai call through the engine's tool path (same route as the model's own
// mcp__kinitro_ai__* calls), falling back to the direct MCP route.
async function mcp($: any, tool: string, args0: Record<string, unknown>) {
  const args = domainRef && !NO_DOMAIN_ARG.has(tool) && args0.domainRef === undefined ? { ...args0, domainRef } : args0
  let text: string
  try {
    const r: any = await $.tool.call({ tool: `mcp__${SERVER}__${tool}`, ...args })
    if (r.deny) throw new Error(`denied: ${r.deny}`)
    text = r.text ?? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result))
    if (r.isError) throw new Error(`${tool}: ${String(text).slice(0, 300)}`)
    route = 'tool.call'
  } catch (err1: any) {
    try {
      const r = await $.mcp.call(SERVER, tool, args)
      text = (r.content ?? []).map((b: any) => (b.type === 'text' ? b.text : '')).join('')
      if (r.isError) throw new Error(`${tool}: ${text.slice(0, 300)}`)
      route = 'mcp.call'
    } catch (err2: any) {
      throw new Error(`tool.call: ${err1?.message ?? err1} | mcp.call: ${err2?.message ?? err2}`)
    }
  }
  try { return JSON.parse(text) } catch { return { text } }
}

function parseSections(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of body.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n')
    out[part.slice(0, nl).trim()] = part.slice(nl + 1).trim()
  }
  return out
}

function sec(name: string): string {
  return briefing?.sections[name] ?? ''
}

// identifies the persona and working rules the agent should hold: domain + content hash
function personaKey(): string {
  if (!briefing) return ''
  const t = `${sec(S.persona)}\n${sec(S.rules)}`
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0
  return `${briefing.domainRef ?? '-'}:${t.length}:${h.toString(36)}`
}

function trunc(s: string): string {
  return s.length > MAX_MIRROR ? s.slice(0, MAX_MIRROR) + ' [...truncated]' : s
}

// Layer A: the agent's own native instruction-* contents on its agent node, appended to the matching section
const A_TYPES: Record<string, string> = {
  [S.persona]: 'instruction-persona', [S.rules]: 'instruction-standing', [S.start]: 'instruction-coldstart',
  [S.turn]: 'instruction-preturn-continue', [S.after]: 'instruction-postcompaction',
}

async function readFileTrim($: any, f: string): Promise<string | undefined> {
  try { if (await $.fs.exists(f)) { const v = String(await $.fs.read(f)).trim(); return v || undefined } } catch { /* ignore */ }
  return undefined
}

// the session's own choice first, then the folder default
async function readDomainFile($: any): Promise<string | undefined> {
  let sid = ''
  try { sid = await $.session.id() } catch { /* ignore */ }
  let held: string | null = null
  try { held = await read($, boundA) } catch { /* ignore */ }
  return held ?? (sid ? await readFileTrim($, SESSION_DOMAIN_PREFIX + sid) : undefined) ?? await readFileTrim($, DOMAIN_FILE)
}

// what the agent tells the user: names only, no codes, ids or paths
function confirmation(slug: string, message: string) {
  const ok = domainRef === slug && !!briefing
  return ok
    ? { bound: true, domain: briefing?.domainName ?? slug, agent: briefing?.agentName ?? null, domainView: message.split('domain view: ')[1] ?? null, sayToUser: `This session now works for ${briefing?.domainName ?? slug}${briefing?.agentName && briefing.agentName !== briefing.domainName ? ` with the agent ${briefing.agentName}` : ''}.` }
    : { bound: false, reason: message }
}

async function domainFiles($: any): Promise<string[]> {
  let sid = '', cwd = '.'
  try { sid = await $.session.id() } catch { /* ignore */ }
  try { cwd = await $.session.cwd() } catch { /* ignore */ }
  return [sid ? `${cwd}/${SESSION_DOMAIN_PREFIX}${sid}` : '', `${cwd}/${DOMAIN_FILE}`].filter(Boolean)
}

async function writeDomainFiles($: any, slug: string) {
  let sid = ''
  try { sid = await $.session.id() } catch { /* ignore */ }
  try { await update($, boundA, () => slug) } catch { /* ignore */ }
  if (sid) await $.fs.write(SESSION_DOMAIN_PREFIX + sid, slug + '\n')
  await $.fs.write(DOMAIN_FILE, slug + '\n')
}

// approved domains of the connection, and the address of the seat picker (approve more domains)
async function refreshChoices($: any) {
  try {
    const seat = await mcp($, 'current-seat', {})
    const approved: DomainChoice[] = (seat?.approved ?? []).map((d: any) => ({ slug: String(d.slug), name: String(d.name) }))
    if (!approved.length && seat?.domain?.id) approved.push({ slug: '', name: String(seat.domain.name ?? 'seat-bound') })
    await update($, approvedA, () => approved)
    const anySlug = domainRef ?? approved.find((d) => d.slug)?.slug
    if (anySlug) {
      const r = await mcp($, 'open-page', { target: 'selector', domainRef: anySlug })
      if (r?.url) await update($, selectorUrlA, () => String(r.url))
    }
  } catch (err: any) { await log($, `refreshChoices failed: ${err?.message ?? err}`) }
}

// what the user switched to on the selection page, read from the browser pane ("This connection may now work in <Domain> as <Agent>")
async function switchedOnPage($: any, approved: DomainChoice[]): Promise<DomainChoice | undefined> {
  for (const tool of PAGE_TEXT_TOOLS) {
    try {
      const r: any = await $.tool.call({ tool })
      if (r?.deny || r?.isError) continue
      const text = String(r?.text ?? (typeof r?.result === 'string' ? r.result : JSON.stringify(r?.result ?? '')))
      const m = text.match(/may now work in (.+?) as /)
      if (!m) return undefined
      const hit = approved.find((d) => d.name === m[1]!.trim())
      await log($, `page says switched to '${m[1]}' -> ${hit?.slug ?? 'no approved match'}`)
      return hit
    } catch { /* try the next tool */ }
  }
  return undefined
}

// open the domain view of the bound domain in the browser pane, straight from the plugin (no model turn)
async function openDomainView($: any): Promise<string> {
  if (!domainRef) return 'no domain bound'
  let url: string | undefined
  try { url = (await mcp($, 'open-page', {}))?.url } catch (err: any) { return `open-page failed: ${err?.message ?? err}` }
  if (!url) return 'open-page gave no url'
  return openInPane($, url)
}

async function openInPane($: any, url: string): Promise<string> {
  const errs: string[] = []
  for (const tool of BROWSER_TOOLS) {
    try {
      const r: any = await $.tool.call({ tool, url })
      if (r?.deny) { errs.push(`${tool}: denied ${r.deny}`); continue }
      if (r?.isError) { errs.push(`${tool}: ${String(r.text ?? r.result).slice(0, 160)}`); continue }
      await log($, `pane opened via ${tool}`)
      return `opened in the browser pane (${tool.split('__')[1]})`
    } catch (err: any) { errs.push(`${tool}: ${String(err?.message ?? err).slice(0, 160)}`) }
  }
  await log($, `pane not opened: ${errs.join(' | ')}`)
  return `browser pane not reachable; link: ${url}`
}

// bind this session to a domain: files, module state, briefing, band
async function bindDomain($: any, slug: string): Promise<string> {
  await writeDomainFiles($, slug)
  briefing = undefined; protocolCode = undefined; needsDomain = undefined; domainRef = undefined
  await writeState($)
  await loadBriefing($)
  const ok = briefing && domainRef === slug
  await update($, currentA, () => (ok ? slug : null))
  await update($, chooserA, () => !ok)
  await update($, bandNoteA, () => (ok ? null : `could not bind ${slug}: ${briefingError ?? 'unknown'}`))
  if (!ok) return `binding ${slug} failed: ${briefingError}`
  await update($, startPackA, () => true)
  try { $.ui.toast(`kinitro.ai: this session works for ${slug}`) } catch { /* ignore */ }
  const view = await openDomainView($)
  return `bound to ${slug}; domain view: ${view}`
}

async function loadBriefing($: any) {
  lastLoadTry = Date.now()
  try {
    const seat = await mcp($, 'current-seat', {})
    let domainId: string | undefined = seat?.domain?.id, agentId: string | undefined = seat?.agentNode?.id
    if (domainId && agentId) domainRef = undefined   // legacy: the connection is bound to one seat
    else {
      // multi-domain connection: the session names its domain by slug
      const approved: any[] = seat?.approved ?? []
      const slug = (await readDomainFile($)) ?? (approved.length === 1 ? approved[0].slug : undefined)
      if (!slug) {
        needsDomain = `this connection serves ${approved.length} domains (${approved.map((d: any) => d.slug).join(', ')}); set this session's domain with mcp__kinitro-ai__probe action "set-domain", domain "<slug>"`
        try { await update($, approvedA, () => approved.map((x: any) => ({ slug: String(x.slug), name: String(x.name) }))); await update($, chooserA, () => true); await update($, currentA, () => null) } catch { /* ignore */ }
        throw new Error(needsDomain)
      }
      const doms = await mcp($, 'list-domains', {})
      const d = (doms?.domains ?? []).find((x: any) => x.slug === slug)
      if (!d) throw new Error(`domain slug '${slug}' not found in list-domains`)
      if (!d.approved) throw new Error(`domain '${slug}' is not approved for this connection`)
      domainRef = slug; needsDomain = undefined
      domainId = d.id; agentId = d.defaultAgentNodeId
      if (!agentId) throw new Error(`domain '${slug}' has no default agent node`)
    }
    const [dom, agent] = await Promise.all([mcp($, 'get-node', { nodeId: domainId }), mcp($, 'get-node', { nodeId: agentId })])
    const domainCode: string = dom?.code, agentCode: string = agent?.code
    if (!domainCode || !agentCode) throw new Error('domain or agent node code not resolvable')
    const sections: Record<string, string> = {}
    const layers: string[] = []
    let gCode: string | undefined
    // Layers G + M: general briefing behind the domain's general-procedures edge
    try {
      const ed = await mcp($, 'list-edges', { nodeCode: domainCode, relation: GENERAL_EDGE, direction: 'outgoing', limit: 5 })
      const target = ed?.edges?.[0]?.node?.code
      if (target) {
        const kids = await mcp($, 'list-nodes', { parentNodeCode: target, limit: 100 })
        const doc = (kids?.nodes ?? []).find((n: any) => String(n.name).startsWith(GENERAL_BRIEFING_PREFIX))
        if (doc) {
          const g = await mcp($, 'load-node-content', { nodeCode: doc.code, contentTypeCode: 'md' })
          if (g?.body && g?.contentTypeCode === 'md') { Object.assign(sections, parseSections(g.body)); gCode = doc.code; layers.push(`G+M ${doc.code}`) }
        }
      }
    } catch (err: any) { await log($, `general briefing failed: ${err?.message ?? err}`) }
    // Layer A: agent node
    const aRes = await Promise.all(Object.entries(A_TYPES).map(async ([title, type]) => {
      // the verb answers with ANOTHER row when the asked type is missing (platform G7): take the body only when the type matches
      try { const r = await mcp($, 'load-node-content', { nodeCode: agentCode, contentTypeCode: type }); return [title, (r?.contentTypeCode === type ? r?.body : undefined) as string | undefined] as const }
      catch { return [title, undefined] as const }
    }))
    for (const [title, body] of aRes) {
      if (!body) continue
      if (title === S.persona || !sections[title]) sections[title] = body
      else sections[title] = `${sections[title]}\n\n**Agent-specific:**\n${body}`
      layers.push(`A ${A_TYPES[title]}`)
    }
    personaSource = sections[S.persona] ? `${agentCode} instruction-persona` : 'none'
    if (!Object.keys(sections).length) throw new Error(`no briefing found: no '${GENERAL_EDGE}' edge with a '${GENERAL_BRIEFING_PREFIX}' document on ${domainCode}, and no instruction-* on ${agentCode}`)
    const raw = Object.entries(sections).map(([k, v]) => `## ${k}\n${v}`).join('\n\n')
    briefing = { raw, sections, code: gCode ?? agentCode, loadedAt: new Date().toISOString(), source: 'kinitro.ai', domainCode, agentCode, domainRef, domainName: dom?.name, agentName: agent?.name, layers: layers.join(', ') }
    briefingError = undefined
    try { await update($, currentA, () => domainRef ?? '') } catch { /* ignore */ }
    try { await $.fs.write(CACHE_FILE, JSON.stringify(briefing)) } catch { /* ignore */ }
    await log($, `briefing loaded for domain ${domainCode} / agent ${agentCode} via ${route}: ${raw.length} chars, layers ${briefing.layers}`)
  } catch (err: any) {
    briefingError = String(err?.message ?? err)
    await log($, `briefing FAILED: ${briefingError}`)
  }
}

// the connector may not be up yet at session start: retry lazily
async function ensureBriefing($: any) {
  if (!briefing && !needsDomain && Date.now() - lastLoadTry > RETRY_MS) await loadBriefing($)
}

async function loadCache($: any) {
  try {
    if (!(await $.fs.exists(CACHE_FILE))) return
    const c = JSON.parse(await $.fs.read(CACHE_FILE))
    if (c?.raw) {
      const want = await readDomainFile($)
      if (want && c.domainRef && want !== c.domainRef) { await log($, `cache is for ${c.domainRef}, session domain is ${want}: ignored`); return }
      briefing = { ...c, sections: c.sections ?? parseSections(c.raw), source: 'cache' }
      if (c.domainRef) domainRef = c.domainRef
      await log($, `briefing from cache (${c.code}, domain ${c.domainRef ?? 'seat-bound'}, loaded ${c.loadedAt})`)
    }
  } catch (err: any) { await log($, `cache read failed: ${err?.message ?? err}`) }
}

async function readState($: any) {
  try {
    if (!(await $.fs.exists(STATE_FILE))) return
    const st = JSON.parse(await $.fs.read(STATE_FILE))
    testArmed = !!st.testArmed; warnedAt = st.warnedAt ?? 0; compactedPending = !!st.compactedPending
    protocolCode = st.protocolCode; compactions = st.compactions ?? 0; mirrored = st.mirrored ?? 0; contextRenders = st.contextRenders ?? 0
  } catch (err: any) { await log($, `state read failed: ${err?.message ?? err}`) }
}

async function writeState($: any) {
  try {
    await $.fs.write(STATE_FILE, JSON.stringify({ testArmed, warnedAt, compactedPending, protocolCode, compactions, mirrored, contextRenders }))
  } catch { /* ignore */ }
}

// refresh from kinitro.ai once the connector is up (session.start timer)
async function refreshTick($: any) {
  if (briefing?.source === 'kinitro.ai') return true
  const cached = briefing
  await loadBriefing($)
  if (!briefing && cached) briefing = cached
  return briefing?.source === 'kinitro.ai'
}

// first message of a brand-new container: nothing cached, wait for the connector
async function waitForBriefing($: any) {
  const until = Date.now() + WAIT_FIRST_MS
  while (!briefing && !needsDomain && Date.now() < until) {
    await loadBriefing($)
    if (!briefing) await $.clock.sleep(1000)
  }
}

async function findInDomain($: any, name: string, prefix: string): Promise<string | undefined> {
  const r = await mcp($, 'find-nodes', { name, limit: 25 })
  return (r.matches ?? []).find((m: any) => m.name === name && String(m.code).startsWith(prefix + '.'))?.code
}

async function ensureProtocol($: any): Promise<string> {
  if (protocolCode) return protocolCode
  const domainCode = briefing?.domainCode
  if (!domainCode) throw new Error('domain unknown (briefing not loaded)')
  const sid: string = await $.session.id()
  let section = await findInDomain($, PROTOCOL_SECTION, domainCode)
  if (!section) {
    const kids = await mcp($, 'list-nodes', { parentNodeCode: domainCode, limit: 200 })
    const work = (kids?.nodes ?? []).find((n: any) => n.name === '_Work')?.code
    const r = await mcp($, 'create-node', {
      nodeTypeName: 'Section', name: PROTOCOL_SECTION, parentNodeCode: work ?? domainCode,
      description: 'One document per Claude session, mirrored turn by turn by the kinitro-ai plugin. Scratch.',
    })
    section = r?.node?.code
    if (!section) throw new Error(`protocol section not created: ${JSON.stringify(r).slice(0, 200)}`)
  }
  const name = `Protocol: Claude session ${new Date().toISOString().slice(0, 10)} (${sid.slice(0, 8)})`
  let code = await findInDomain($, name, section)
  if (!code) {
    const r = await mcp($, 'create-node', {
      nodeTypeName: 'Document', name, parentNodeCode: section,
      description: `Mirror of Claude session ${sid} (kinitro-ai plugin).`,
      initialContents: [{ contentTypeCode: 'md', body: `# ${name}\nClaude session \`${sid}\`, mirrored by the kinitro-ai plugin.\n` }],
    })
    code = r?.node?.code
    if (!code) throw new Error(`create-node gave no code: ${JSON.stringify(r).slice(0, 200)}`)
  }
  protocolCode = code
  return code as string
}

async function mirror($: any, text: string) {
  try {
    const code = await ensureProtocol($)
    await mcp($, 'update-content', { nodeCode: code, contentTypeCode: 'md', append: text, inPlace: true })
    mirrored++
    lastMirrorError = undefined
    await writeState($)
  } catch (err: any) {
    lastMirrorError = String(err?.message ?? err)
    await log($, `mirror FAILED: ${lastMirrorError}`)
  }
}

function briefingBlock(): string {
  if (!briefing) return ''
  return `kinitro.ai briefing (from ${briefing.code}, applies to the whole session)\n\n## ${S.persona}\n${sec(S.persona)}\n\n## ${S.rules}\n${sec(S.rules)}`
}

async function contextPercent($: any): Promise<number | undefined> {
  try { return (await $.session.usage()).context.percent } catch { return undefined }
}

async function statusText($: any): Promise<string> {
  const pct = await contextPercent($)
  return [
    `kinitro-ai ${VERSION}`,
    `briefing: ${briefing ? `domain ${briefing.domainCode ?? '?'} / agent ${briefing.agentCode ?? '?'} (${briefing.raw.length} chars, source ${briefing.source}, loaded ${briefing.loadedAt}, route ${route})` : `MISSING (${briefingError})`}`,
    `domain: ${domainRef ?? (needsDomain ? 'NOT SET - ' + needsDomain : 'seat-bound connection')}`,
    `refresh: ${(await read($, testModeA)) ? 'test mode, every 2 min' : 'daily'} · instructions loaded ${briefing?.loadedAt ?? '-'}`,
    `layers: ${briefing?.layers ?? '-'}`,
    `sections: ${briefing ? Object.keys(briefing.sections).join(' | ') : '-'} · persona from ${personaSource}`,
    `system prompt section injected in ${composeCount} renders (prompt.compose) · first-message context block rendered ${contextRenders}x (prompt.context)`,
    `context: ${pct ?? '?'} % (warn at ${WARN_PCT} %, last warned ${warnedAt || '-'})`,
    `last prompt injected: ${lastInjected.join(', ') || '-'}`,
    `test armed: ${testArmed} · compactions seen: ${compactions} · post-compact pending: ${compactedPending}`,
    `mirror: ${mirrored} writes -> ${protocolCode ?? '-'}${lastMirrorError ? ' · last error: ' + lastMirrorError : ''}`,
  ].join('\n')
}


// other Claude sessions of this agent today (from the protocol documents): memory is shared by design, so the agent is warned
async function otherSessionsToday($: any): Promise<string[]> {
  try {
    let sid = ''
    try { sid = String(await $.session.id()).slice(0, 8) } catch { /* ignore */ }
    const today = new Date().toISOString().slice(0, 10)
    const r = await mcp($, 'find-nodes', { name: `Protocol: Claude session ${today}`, limit: 25 })
    return (r?.matches ?? []).map((m: any) => String(m.name).match(/\(([0-9a-f]{8})\)$/)?.[1]).filter((x: any) => x && x !== sid)
  } catch (err: any) { await log($, `other sessions check failed: ${err?.message ?? err}`); return [] }
}

// ---- working memory of the seat (PO 2026-10-06): Todo every turn; Notes + topic map at start and after compaction
function cleanTodo(body: string): string | undefined {
  // drop the cache marker and empty sections; nothing to show when there are no numbered todos, exceptions or questions
  const lines = body.split('\n').filter((l) => !l.includes('{{mx:cache-cut}}'))
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? ''
    if (/^## /.test(l)) {
      const next = lines.slice(i + 1).find((x) => x.trim() !== '')
      if (!next || /^## /.test(next)) continue
      out.push(l.replace('## Instructions', '## Todo (user-approved)'))
    } else if (l.trim()) out.push(l)
  }
  return out.some((l) => !/^## /.test(l)) ? out.join('\n') : undefined
}

async function readSet($: any, type: string): Promise<string | undefined> {
  if (!briefing?.agentCode) return undefined
  try {
    const r = await mcp($, 'load-node-content', { nodeCode: briefing.agentCode, contentTypeCode: type })
    return r?.contentTypeCode === type ? (r.body as string | undefined) : undefined   // the verb may answer with another row when the set does not exist
  } catch (err: any) { await log($, `read ${type} failed: ${err?.message ?? err}`); return undefined }
}

async function topicMap($: any): Promise<string | undefined> {
  try {
    const r = await mcp($, 'search-memory', { listTopics: true })
    const t = (r?.topics ?? []).slice(0, 40).map((x: any) => `- ${x.topic} (${x.nodeCode}, ${x.entryCount} entries, newest ${String(x.newestUtc ?? '').slice(0, 10)})`)
    return t.length ? t.join('\n') : undefined
  } catch (err: any) { await log($, `topic map failed: ${err?.message ?? err}`); return undefined }
}

// ---- hooks -----------------------------------------------------------------
export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await log($, `session.start ${VERSION} (interactive=${e.isInteractive}, surface=${e.surface})`)
    await readState($)
    await loadCache($)
    try { await log($, `surfaces: ${JSON.stringify(await $.session.surfaces())}`) } catch (err: any) { await log($, `surfaces failed: ${err?.message ?? err}`) }
    refreshChoices($)
    let tries = 0
    const timer = $.clock.every(3000, () => {
      if (refreshing || refreshDone) return
      refreshing = true
      tries++
      refreshTick($).then((done) => {
        refreshing = false
        if (done || tries > 40 || needsDomain) { refreshDone = true; timer.cancel(); log($, `refresh ${done ? 'done' : 'gave up'} after ${tries} tries`) }
      })
    })
    // /kinitro is a static command file (commands/kinitro.md): the Claude app lists only those
    try {
      await $.tool.register({
        name: 'probe',
        description: 'kinitro-ai harness control. action "status" (default): diagnostics; "test-mode" with value on|off: refresh the instructions every 2 minutes instead of daily; "selection-start": remember the approved domains and return the selection page address (call before the user chooses on that page); "selection-done": compare with that list and bind the newly approved domain, or return the list to ask from; "set-domain" with domain "<slug>": bind this session to a kinitro.ai domain (slug from list-domains) and reload; "reload": re-read the briefing from kinitro.ai; "arm-test": inject EVERY briefing section, conditional ones included, into the next user prompt, marked [TEST]; "invalidate-context": re-render the first-message context block (persona) on the next request.',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'test-mode', 'choices', 'open-domain', 'selection-start', 'selection-done', 'set-domain', 'reload', 'arm-test', 'invalidate-context'] }, domain: { type: 'string', description: 'domain slug for set-domain, e.g. verum' }, value: { type: 'string', enum: ['on', 'off'], description: 'for test-mode' } } },
      })
    } catch (err: any) { await log($, `tool.register failed: ${err?.message ?? err}`) }
    return next(e)
  })

  on('tool.call', { tool: 'mcp__kinitro-ai__probe' }, async ($, e: any) => {
    const action = e.action ?? 'status'
    if (action === 'open-domain') return { result: await openDomainView($) }
    if (action === 'choices') {
      const seat = await mcp($, 'current-seat', {})
      const approved: DomainChoice[] = (seat?.approved ?? []).map((d: any) => ({ slug: String(d.slug), name: String(d.name) }))
      await update($, approvedA, () => approved)
      return { result: JSON.stringify({ approved, current: domainRef ? (briefing?.domainName ?? domainRef) : null }) }
    }
    if (action === 'selection-start') {
      const seat = await mcp($, 'current-seat', {})
      const approved: DomainChoice[] = (seat?.approved ?? []).map((d: any) => ({ slug: String(d.slug), name: String(d.name) }))
      const anySlug = domainRef ?? approved[0]?.slug
      const page = anySlug ? await mcp($, 'open-page', { target: 'selector', domainRef: anySlug }) : undefined
      await $.fs.write(SNAPSHOT_FILE, JSON.stringify({ at: new Date().toISOString(), approved }))
      await update($, approvedA, () => approved)
      if (page?.url) await update($, selectorUrlA, () => String(page.url))
      const opened = page?.url ? await openInPane($, String(page.url)) : 'no selection page address'
      await log($, `selection-start: ${approved.map((d) => d.slug).join(',')}; ${opened}`)
      return { result: JSON.stringify({ selectionPage: opened, selectorUrl: opened.startsWith('opened') ? undefined : page?.url ?? null }) }
    }
    if (action === 'selection-done') {
      let before: DomainChoice[] = []
      try { before = JSON.parse(await $.fs.read(SNAPSHOT_FILE)).approved ?? [] } catch { /* no snapshot */ }
      const seat = await mcp($, 'current-seat', {})
      const approved: DomainChoice[] = (seat?.approved ?? []).map((d: any) => ({ slug: String(d.slug), name: String(d.name) }))
      await update($, approvedA, () => approved)
      const fresh = approved.filter((d) => !before.some((b) => b.slug === d.slug))
      await log($, `selection-done: new ${fresh.map((d) => d.slug).join(',') || '-'}`)
      const pick = fresh.length === 1 ? fresh[0] : await switchedOnPage($, approved)
      if (pick) {
        const r = await bindDomain($, pick.slug)
        return { result: JSON.stringify(confirmation(pick.slug, r)) }
      }
      return { result: JSON.stringify({ bound: null, newlyApproved: fresh, approved, message: fresh.length ? 'several domains were approved: ask which one' : 'no newly approved domain: the user chose one that was already approved; ask which one' }) }
    }
    if (action === 'set-domain') {
      const slug = String(e.domain ?? '').trim()
      if (!slug) return { result: 'set-domain needs domain: "<slug>" (see list-domains)' }
      const r = await bindDomain($, slug)
      return { result: JSON.stringify(confirmation(slug, r)) }
    }
    if (action === 'reload') { needsDomain = undefined; await loadBriefing($) }
    if (action === 'test-mode') { const enable = String(e.value ?? 'on') !== 'off'; await update($, testModeA, () => enable); await log($, `test mode ${enable ? 'on' : 'off'}`) }
    if (action === 'arm-test') { testArmed = true; await writeState($) }
    if (action === 'invalidate-context') $.ui.invalidate('prompt.context')
    const res = `action: ${action}\n${await statusText($)}`
    await log($, `probe ${action}`)
    return { result: res }
  })

  // FIRST-MESSAGE CONTEXT BLOCK: Persona + Working rules. Rendered once per
  // conversation and again after every compaction (the host owns the system prompt here).
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    if (!briefing) await loadCache($)
    const text = briefingBlock()
    if (!text) return r
    contextRenders++
    await update($, contextKeyA, () => personaKey())
    await writeState($)
    await log($, `prompt.context: kinitroBriefing block added (${text.length} chars), render #${contextRenders}`)
    return { ...r, blocks: [...r.blocks.filter((b: any) => b.name !== 'kinitroBriefing'), { name: 'kinitroBriefing', text }] }
  })

  // SYSTEM PROMPT (every request): Persona + Working rules -- does not fire in the claude.ai cloud host
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    await ensureBriefing($)
    if (!briefing) return r
    composeCount++
    const text = `# kinitro.ai briefing (from ${briefing.code})\n\n## ${S.persona}\n${sec(S.persona)}\n\n## ${S.rules}\n${sec(S.rules)}`
    return { sections: [...r.sections, { id: 'kinitro-briefing', text, scope: 'session' as const }] }
  })

  // EVERY USER PROMPT: marker, start (first prompt), per-turn, 70 %, post-compaction
  on('prompt.submit', async ($, e, next) => {
    if (!briefing) await waitForBriefing($)
    const turns0 = await $.session.turns().catch(() => -1)
    // freshness: a new session always starts from kinitro.ai, later the copy is renewed daily (test mode: every 2 minutes)
    if (briefing && !needsDomain) {
      const age = Date.now() - Date.parse(briefing.loadedAt ?? '1970-01-01')
      const limit = (await read($, testModeA)) ? TEST_REFRESH_MS : REFRESH_MS
      // a local copy (plugin restarted while the connector was still connecting) is replaced at the next prompt, not only after a day
      if (briefing.source !== 'kinitro.ai' || age > limit) { const kept = briefing; await loadBriefing($); if (!briefing) briefing = kept }
    }
    pendingPrompt = e.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '').trim()
    const pct = await contextPercent($)
    const turns = await $.session.turns().catch(() => -1)
    const tag = testArmed ? '[TEST] ' : ''
    const blocks: string[] = [`[kinitro-ai ${VERSION}] context ${pct ?? '?'} % · briefing ${briefing ? briefing.code : 'MISSING (' + briefingError + ')'}`]
    const injected: string[] = ['marker']
    if (needsDomain) {
      const approved = await read($, approvedA)
      const url = await read($, selectorUrlA)
      blocks.push([
        'kinitro.ai domain not set for this session. Before any other work:',
        `1. Ask the user which domain this session works for, with AskUserQuestion (one option per approved domain: ${approved.map((d) => `${d.name} = ${d.slug}`).join('; ') || 'none listed'}).`,
        url ? `2. If their domain is missing, give them this link to approve it, then ask again: ${url}` : '2. If their domain is missing, ask them to approve it for this connection in kinitro.ai.',
        '3. Bind the session: call mcp__kinitro-ai__probe with action "set-domain" and domain "<slug>". Confirm the domain in one line.',
        `Detail: ${needsDomain}.`,
      ].join('\n'))
      injected.push('Domain missing')
    }
    else if (domainRef) blocks[0] += ` · domain ${domainRef} (pass domainRef:'${domainRef}' on every mcp__kinitro_ai__* call)`
    const add = (key: string, title: string, why: string) => {
      const t = sec(title)
      if (!t) return
      blocks.push(`${tag}${title}${why ? ' (' + why + ')' : ''}:\n${t}`)
      injected.push(title)
    }
    const startPack = !needsDomain && (await read($, startPackA))
    const startOrAfter = turns === 0 || compactedPending || testArmed || startPack
    if (briefing) {
      // persona and working rules: when the agent does not hold the current ones (domain switch, refresh with changes, stale start block)
      // after choosing a domain always: a re-render request does not reach a running conversation (measured 2026-10-08)
      if (!needsDomain && (startPack || (await read($, contextKeyA)) !== personaKey())) {
        add('persona', S.persona, startPack ? `domain ${briefing.domainName ?? domainRef}` : 'updated')
        add('rules', S.rules, '')
        await update($, contextKeyA, () => personaKey())
      }
      if (turns === 0 || testArmed || startPack) add('start', S.start, testArmed ? 'Test' : startPack ? 'domain chosen' : 'first turn')
      if (startPack || turns === 0) {
        const others = needsDomain ? [] : await otherSessionsToday($)
        if (others.length) { blocks.push(`Shared agent: ${others.length} other Claude session(s) worked with this agent today (${others.join(', ')}). Todos, notes and memory are shared with them. Before acting on a todo you did not start in this session, check its exception line and the notes; tell the user once that another session is active on this agent.`); injected.push('Other sessions') }
      }
      if (startPack) await update($, startPackA, () => false)
      add('turn', S.turn, '')
      if (compactedPending || testArmed) { add('after', S.after, testArmed ? 'Test' : 'after compaction'); compactedPending = false }
      const full = pct !== undefined && pct >= WARN_PCT && pct >= warnedAt + REWARN_STEP
      if (full || testArmed) {
        add('full', S.full, testArmed ? `Test, context ${pct} %` : `context ${pct} %, compaction at about 80 %`)
        if (full) warnedAt = pct as number
      }
      if (testArmed) {
        blocks.push(`[TEST] Compaction instruction (otherwise goes ONLY to the summarizer, not to you):\n${sec(S.keep)}`)
        injected.push(S.keep)
        blocks.push('[TEST] Please confirm for each block whether it arrived, and whether the context holds the kinitro.ai briefing with persona and working rules. The blocks are test content, not tasks.')
        testArmed = false
      }
      // working memory: Todo every turn (fresh read, no model tokens for the read itself)
      const todo = await readSet($, 'memory-instruction')
      const todoText = todo ? cleanTodo(todo) : undefined
      if (todoText) { blocks.push(`${tag}Your todos (from ${briefing.agentCode}; keep them current with memory-append / memory-instruction-status):\n${todoText}`); injected.push('Todo') }
      if (startOrAfter) {
        const notes = await readSet($, 'memory-notes')
        if (notes && notes.split('\n').some((l) => l.startsWith('- '))) { blocks.push(`${tag}Your notes (scratchboard; migrate durable facts to topics at the checkpoint):\n${notes.trim()}`); injected.push('Notes') }
        const map = await topicMap($)
        if (map) { blocks.push(`${tag}Your memory topics (map; read a topic with search-memory or load-node-content when you need it):\n${map}`); injected.push('Topic map') }
      }
    }
    lastInjected = injected
    await writeState($)
    await log($, `prompt.submit turns=${turns} pct=${pct} injected=${injected.join(',')}`)
    return next({ ...e, context: [...(e.context ?? []), blocks.join('\n\n')] })
  })

  // COMPACTION: steer the summarizer, then flag the post-compaction block
  on('session.compact', async ($, e, next) => {
    if (e.agentId) return next(e)
    await log($, `session.compact trigger=${e.trigger} messages=${e.messages.length}`)
    const keep = sec(S.keep)
    const r: any = await next(keep ? { ...e, instructions: (e.instructions ? e.instructions + '\n\n' : '') + keep } : e)
    if (!r.skip && e.trigger !== 'precompute') {
      compactions++
      compactedPending = true
      warnedAt = 0
      await writeState($)
      await mirror($, `\n\n---\n*Compaction (${e.trigger}): ${r.tokensBefore ?? '?'} -> ${r.tokensAfter ?? '?'} tokens*\n`)
    }
    await log($, `session.compact done skip=${r.skip ?? '-'} before=${r.tokensBefore} after=${r.tokensAfter}`)
    return r
  })

  // END OF TURN: mirror prompt + answer into kinitro.ai (script call, no model tokens)
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const body = `\n\n### ${when} UTC · ${e.reason}\n_Hooks: ${lastInjected.join(', ') || '-'}_\n\n**User:** ${trunc(pendingPrompt)}\n\n**Agent:** ${trunc(e.answer)}\n`
    pendingPrompt = ''
    await mirror($, body)
    await log($, `turn.complete reason=${e.reason} mirrored=${mirrored} protocol=${protocolCode}`)
    return r
  })


  // DOMAIN BAND above the prompt: which kinitro.ai domain this session works for; choose or change it
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e as any).props?.hasSurvey) return next(e)
    const { Box, Text, Button, Link } = $.ui.resolve(e) as any
    bandRenders++; lastBandSurface = String((e as any).surface)
    const approved = await read($, approvedA)
    const current = await read($, currentA)
    const chooser = await read($, chooserA)
    const url = await read($, selectorUrlA)
    const note = await read($, bandNoteA)
    const name = (slug: string | null) => approved.find((d) => d.slug === slug)?.name ?? slug
    if (!chooser && current) {
      return (
        <Box>
          <Text dimColor>kinitro.ai · {name(current)} ({current}) </Text>
          <Button key="kin-change" label="Change domain" dimColor onPress={() => { update($, chooserA, () => true); refreshChoices($) }} />
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text>{current ? `kinitro.ai · this session works for ${name(current)}. Switch to:` : 'kinitro.ai · choose the domain for this session:'}</Text>
        <Box>
          {approved.filter((d) => d.slug && d.slug !== current).map((d) => (
            <Button key={'kin-' + d.slug} label={d.name} variant={approved.length === 1 ? 'primary' : undefined} onPress={() => { bindDomain($, d.slug) }} />
          ))}
          <Button key="kin-refresh" label="Refresh list" dimColor onPress={() => { refreshChoices($) }} />
          {current ? <Button key="kin-close" label="Close" role="dismiss" onPress={() => { update($, chooserA, () => false) }} /> : null}
        </Box>
        {url ? <Text dimColor>Domain missing? <Link href={url} label="Open the kinitro.ai domain selection" />, approve it there, then Refresh list.</Text> : null}
        {note ? <Text dimColor>{note}</Text> : null}
      </Box>
    )
  })
}
