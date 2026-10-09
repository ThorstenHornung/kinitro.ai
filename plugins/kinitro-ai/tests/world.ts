// A small world beneath the plugin for the domain-binding tests: a file system in memory that resolves
// relative paths against the CURRENT working directory (as the host does), a session id, a working
// directory and project root the test can move, a user home, and a kinitro.ai connector serving three domains.
import { mock } from 'claude-code/testing'

export type World = { files: Map<string, string>; cwd: string; root: string; sid: string; calls: string[] }

const DOMAINS = ['alpha', 'beta', 'gamma']

export function makeWorld(on: any, w: Omit<World, 'calls'>): World {
  const world: World = { ...w, calls: [] }
  const abs = (p: string) => (p.startsWith('/') ? p : `${world.cwd}/${p}`)
  mock.env(on, { HOME: '/u' })
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
  on('tool.call', async (_$: any, e: any) => {
    const verb = String(e.tool).replace(/^mcp__kinitro_ai__/, '')
    world.calls.push(verb + (e.domainRef ? `@${e.domainRef}` : ''))
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
  const r: any = await $.tool.call({ tool: 'mcp__kinitro-ai__probe', action, ...extra })
  return String(r.text ?? r.result)
}
