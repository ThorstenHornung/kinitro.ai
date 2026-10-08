import type { Register } from 'claude-code'

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
const VERSION = '0.10.0'
// Domain binding (kinitro.ai 2026-10-08): a connection may serve several domains; every call names its domain
// with domainRef (the slug). The slug of this session lives in DOMAIN_FILE (set it with probe action 'set-domain').
const DOMAIN_FILE = '.kinitro-ai-domain'
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
type Briefing = { raw: string; sections: Record<string, string>; code: string; loadedAt: string; source: string; domainCode?: string; agentCode?: string; domainRef?: string; layers?: string }
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
let needsDomain: string | undefined    // set when the connection serves several domains and no slug is configured
const logLines: string[] = []

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

function trunc(s: string): string {
  return s.length > MAX_MIRROR ? s.slice(0, MAX_MIRROR) + ' [...truncated]' : s
}

// Layer A: the agent's own native instruction-* contents on its agent node, appended to the matching section
const A_TYPES: Record<string, string> = {
  [S.persona]: 'instruction-persona', [S.rules]: 'instruction-standing', [S.start]: 'instruction-coldstart',
  [S.turn]: 'instruction-preturn-continue', [S.after]: 'instruction-postcompaction',
}

async function readDomainFile($: any): Promise<string | undefined> {
  try { if (await $.fs.exists(DOMAIN_FILE)) { const v = String(await $.fs.read(DOMAIN_FILE)).trim(); return v || undefined } } catch { /* ignore */ }
  return undefined
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
          if (g?.body) { Object.assign(sections, parseSections(g.body)); gCode = doc.code; layers.push(`G+M ${doc.code}`) }
        }
      }
    } catch (err: any) { await log($, `general briefing failed: ${err?.message ?? err}`) }
    // Layer A: agent node
    const aRes = await Promise.all(Object.entries(A_TYPES).map(async ([title, type]) => {
      try { const r = await mcp($, 'load-node-content', { nodeCode: agentCode, contentTypeCode: type }); return [title, r?.body as string | undefined] as const }
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
    briefing = { raw, sections, code: gCode ?? agentCode, loadedAt: new Date().toISOString(), source: 'kinitro.ai', domainCode, agentCode, domainRef, layers: layers.join(', ') }
    briefingError = undefined
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
    `layers: ${briefing?.layers ?? '-'}`,
    `sections: ${briefing ? Object.keys(briefing.sections).join(' | ') : '-'} · persona from ${personaSource}`,
    `system prompt section injected in ${composeCount} renders (prompt.compose) · first-message context block rendered ${contextRenders}x (prompt.context)`,
    `context: ${pct ?? '?'} % (warn at ${WARN_PCT} %, last warned ${warnedAt || '-'})`,
    `last prompt injected: ${lastInjected.join(', ') || '-'}`,
    `test armed: ${testArmed} · compactions seen: ${compactions} · post-compact pending: ${compactedPending}`,
    `mirror: ${mirrored} writes -> ${protocolCode ?? '-'}${lastMirrorError ? ' · last error: ' + lastMirrorError : ''}`,
  ].join('\n')
}


// ---- working memory of the seat (PO 2026-10-06): Todo every turn; Notes + topic map at start and after compaction
function cleanTodo(body: string): string | undefined {
  // drop the cache marker and empty sections; nothing to show when there are no numbered todos, exceptions or questions
  const lines = body.split('\n').filter((l) => !l.includes('{{mx:cache-cut}}'))
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
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
    try {
      await $.command.register({ name: 'kinitro', description: 'Status of the kinitro-ai hooks.' })
    } catch (err: any) { await log($, `command.register failed: ${err?.message ?? err}`) }
    try {
      await $.tool.register({
        name: 'probe',
        description: 'kinitro-ai harness control. action "status" (default): diagnostics; "set-domain" with domain "<slug>": bind this session to a kinitro.ai domain (slug from list-domains) and reload; "reload": re-read the briefing from kinitro.ai; "arm-test": inject EVERY briefing section, conditional ones included, into the next user prompt, marked [TEST]; "invalidate-context": re-render the first-message context block (persona) on the next request.',
        inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'set-domain', 'reload', 'arm-test', 'invalidate-context'] }, domain: { type: 'string', description: 'domain slug for set-domain, e.g. verum' } } },
      })
    } catch (err: any) { await log($, `tool.register failed: ${err?.message ?? err}`) }
    return next(e)
  })

  on('tool.call', { tool: 'mcp__kinitro-ai__probe' }, async ($, e: any) => {
    const action = e.action ?? 'status'
    if (action === 'set-domain') {
      const slug = String(e.domain ?? '').trim()
      if (!slug) return { result: 'set-domain needs domain: "<slug>" (see list-domains)' }
      await $.fs.write(DOMAIN_FILE, slug + '\n')
      briefing = undefined; protocolCode = undefined; needsDomain = undefined; domainRef = undefined
      await writeState($)
      await loadBriefing($)
      $.ui.invalidate('prompt.context')
    }
    if (action === 'reload') { needsDomain = undefined; await loadBriefing($) }
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
    pendingPrompt = e.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '').trim()
    const pct = await contextPercent($)
    const turns = await $.session.turns().catch(() => -1)
    const tag = testArmed ? '[TEST] ' : ''
    const blocks: string[] = [`[kinitro-ai ${VERSION}] context ${pct ?? '?'} % · briefing ${briefing ? briefing.code : 'MISSING (' + briefingError + ')'}`]
    const injected: string[] = ['marker']
    if (needsDomain) { blocks.push(`kinitro.ai domain not set: ${needsDomain}. Until then pass domainRef on every mcp__kinitro_ai__* call.`); injected.push('Domain missing') }
    else if (domainRef) blocks[0] += ` · domain ${domainRef} (pass domainRef:'${domainRef}' on every mcp__kinitro_ai__* call)`
    const add = (key: string, title: string, why: string) => {
      const t = sec(title)
      if (!t) return
      blocks.push(`${tag}${title}${why ? ' (' + why + ')' : ''}:\n${t}`)
      injected.push(title)
    }
    const startOrAfter = turns === 0 || compactedPending || testArmed
    if (briefing) {
      if (turns === 0 || testArmed) add('start', S.start, testArmed ? 'Test' : 'first turn')
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

  on('command.run', { command: 'kinitro' }, async ($) => ({ text: await statusText($) }))
}
