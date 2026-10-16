import { expect, test } from 'claude-code/testing'
import { composeSections, instructionSet, noAgentNodeText } from '../hooks/register'
import { makeWorld, probe } from './world'

// 0.23.5 (PO 16.10.2026): the bind loads only the agent node's instruction set from get-briefing `instructions`
// (server rule: AIAgent first, agent node appended; persona: the node's replaces the AIAgent's). No domain edge is read.

type Slot = { type: string; source: string; text: string }
const gb = (instructions: Slot[] | undefined) => () => ({ result: JSON.stringify({ status: 'ok', situation: 'ColdStart', text: 'composed', instructions }) })
const none = (type: string): Slot => ({ type, source: 'none', text: '' })
const mk = (on: any, verbs: Record<string, (a: Record<string, unknown>) => unknown>) =>
  makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9', verbs })
const cacheOf = (w: any) => [...w.files.entries()].find(([k, v]: [string, string]) => k.endsWith('.json') && v.includes('"source":"kinitro.ai"'))?.[1] ?? ''
const parse = (b: string) => Object.fromEntries(b.split(/^## /m).filter(Boolean).map((p) => { const [h, ...r] = p.split('\n'); return [h.trim(), r.join('\n').trim()] }))

test('the agent node persona binds', async ($, on) => {
  const w = mk(on, { 'get-briefing': gb([{ type: 'instruction-persona', source: 'node', text: 'NODE-PERSONA' }, none('instruction-standing')]) })
  await probe($, 'reload')
  expect(cacheOf(w)).toContain('NODE-PERSONA')
  expect(w.sent.some((s) => s.verb === 'list-edges')).toBe(false)
  expect(w.files.get('/w/b/kinitro-ai.log') ?? '').toContain('instruction-persona (node)')
})

test('an AIAgent-only persona binds', async ($, on) => {
  const w = mk(on, { 'get-briefing': gb([{ type: 'instruction-persona', source: 'aiagent', text: 'AI-PERSONA' }]) })
  await probe($, 'reload')
  expect(cacheOf(w)).toContain('AI-PERSONA')
  expect(w.files.get('/w/b/kinitro-ai.log') ?? '').toContain('instruction-persona (aiagent)')
})

test('a type missing on both tiers is left out; the bind holds when another part has text', async ($, on) => {
  const w = mk(on, { 'get-briefing': gb([none('instruction-persona'), { type: 'instruction-standing', source: 'aiagent+node', text: 'AI-RULES\n\nNODE-RULES' }]) })
  await probe($, 'reload')
  const c = cacheOf(w)
  expect(c).toContain('AI-RULES')
  expect(c).not.toContain('## Persona')
  expect(await probe($, 'status')).toContain('persona from none')
})

test('the Agent 101 opens the briefing; persona replaces, other types are appended to its sections', () => {
  const set = instructionSet({ instructions: [
    { type: 'instruction-agent101', source: 'aiagent', text: '## Working rules\n- 101 rule\n\n## Persona\nGeneric' },
    { type: 'instruction-persona', source: 'node', text: 'Jane' },
    { type: 'instruction-standing', source: 'node', text: '- own rule' }, none('instruction-coldstart')] })!
  const s = composeSections(set, parse)
  expect(s['Persona']).toBe('Jane')
  expect(s['Working rules']).toBe('- 101 rule\n\n**Agent-specific:**\n- own rule')
  expect(s['Session start']).toBe(undefined)
  expect(instructionSet({ text: 'old api' })).toBe(undefined)
})

test('a domain without an agent node is refused with a plain message', async ($, on) => {
  const w = mk(on, { 'list-domains': () => ({ result: JSON.stringify({ domains: [{ id: 'dom-beta', slug: 'beta', approved: true }] }) }) })
  await probe($, 'reload')
  const log = w.files.get('/w/b/kinitro-ai.log') ?? ''
  expect(log).toContain(noAgentNodeText('beta'))
  expect(noAgentNodeText('beta')).toContain('has no agent node; add one')
  expect(w.sent.some((s) => s.verb === 'get-briefing')).toBe(false)
})

test('no message names general-procedures, also when nothing is found', async ($, on) => {
  const w = mk(on, { 'get-briefing': gb([none('instruction-persona')]) })
  const st = await probe($, 'reload') + (await probe($, 'status'))
  const log = w.files.get('/w/b/kinitro-ai.log') ?? ''
  expect(log).toContain('has no instructions yet')
  expect(log + st).not.toContain('general-procedures')
  expect(w.sent.some((s) => s.verb === 'list-edges')).toBe(false)
})

test('an API without the instruction set: the agent node contents are loaded', async ($, on) => {
  const w = mk(on, {})
  await probe($, 'reload')
  expect(cacheOf(w)).toContain('instruction-persona of code-agent-beta')
  expect(w.files.get('/w/b/kinitro-ai.log') ?? '').toContain('agent node contents only')
})
