// A small world beneath the plugin for the domain-binding tests: a file system in memory that resolves
// relative paths against the CURRENT working directory (as the host does), a session id, a working
// directory and project root the test can move, a user home, and a kinitro.ai connector serving three domains.
import { mock } from 'claude-code/testing'
import { VARIANT } from '../hooks/variant'

export type World = { files: Map<string, string>; cwd: string; root: string; sid: string; calls: string[]; tools?: string[]; prefixes: string[]; sent: Array<{ verb: string; args: Record<string, unknown> }>; verbs?: Record<string, (args: Record<string, unknown>) => unknown>; env?: Record<string, string> }

const DOMAINS = ['alpha', 'beta', 'gamma']

// `tools` (optional, changeable by the test): the tool names the session lists. When set, only a tool of a listed server
// answers; a call to any other server name fails, as it does in a session that does not have that server.
// `verbs` (optional): an answer for one kinitro.ai verb, given the call's arguments; it returns the engine's tool result
// (`{ result }`, or `{ result: <text>, isError: true }` for an error answer). `sent` records every call with its arguments.
export function makeWorld(on: any, w: Omit<World, 'calls' | 'prefixes' | 'sent'>): World {
  const world: World = { ...w, calls: [], prefixes: [], sent: [] }
  // The host resolves a path before the mock sees it; on Windows it arrives with a drive letter and backslashes. Fold it back to /w/b/file.
  const abs = (raw: string) => {
    const p = raw.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')
    return p.startsWith('/') ? p : `${world.cwd}/${p}`
  }
  mock.env(on, { HOME: '/u', ...(w.env ?? {}) })   // `env` (optional): more environment variables, e.g. KINITRO_AI_ENV
  on('session.id', async () => ({ value: world.sid }))
  on('session.cwd', async () => ({ value: world.cwd }))
  on('session.root', async () => ({ value: world.root }))
  on('fs.exists', async (_$: any, e: any) => ({ value: world.files.has(abs(e.path)) }))
  on('fs.read', async (_$: any, e: any) => {
    const f = abs(e.path)
    if (!world.files.has(f)) throw new Error(`ENOENT ${f}`)
    return { value: world.files.get(f)! }
  })
  on('fs.write', async (_$: any, e: any) => { world.files.set(abs(e.path), e.text); return { value: undefined } })
  if (w.tools) on('tool.list', async () => ({ value: world.tools!.map((name) => ({ name, description: '', isMcp: true })) }))
  on('tool.call', async (_$: any, e: any) => {
    const m = /^(mcp__(?:plugin_kinitro-ai(?:-test)?_[A-Za-z0-9_]+?|kinitro_ai|claude_ai_Kinitro)__)(.*)$/.exec(String(e.tool))
    if (!m) throw new Error(`unexpected tool ${e.tool}`)
    const prefix = m[1] as string
    if (world.tools && !world.tools.some((n) => n.startsWith(prefix))) throw new Error(`no such tool ${e.tool}`)
    world.prefixes.push(prefix)
    const verb = m[2] as string
    world.calls.push(verb + (e.domainRef ? `@${e.domainRef}` : ''))
    const { tool: _tool, ...args } = e
    world.sent.push({ verb, args })
    const custom = world.verbs?.[verb]
    if (custom) return custom(args) as any
    const out = (v: unknown) => ({ result: JSON.stringify(v) })
    if (verb === 'current-seat') return out({ approved: DOMAINS.map((d) => ({ slug: d, name: d.toUpperCase() })) })
    if (verb === 'list-domains') return out({ domains: DOMAINS.map((d) => ({ id: `dom-${d}`, slug: d, approved: true, defaultAgentNodeId: `agent-${d}` })) })
    if (verb === 'get-node') return out({ code: `code-${e.nodeId}`, name: `name-${e.nodeId}` })
    if (verb === 'load-node-content') return out({ contentTypeCode: e.contentTypeCode, body: `${e.contentTypeCode} of ${e.nodeCode}` })
    return out({ status: 'ok' })
  })
  return world
}

export async function probe($: any, action: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r: any = await $.tool.call({ tool: `mcp__${VARIANT.name}__probe`, action, ...extra })   // review F3: the build's own probe
  return String(r.text ?? r.result)
}
