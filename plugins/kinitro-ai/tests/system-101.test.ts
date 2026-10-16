import { expect, test } from 'claude-code/testing'
import { addDomainSections, system101 } from '../hooks/register'
import { makeWorld, probe } from './world'

// 0.23.4 (PO 16.10.2026): the Agent 101 lives once in the System partition (the Default System Instruction every tenant's
// agents carry). get-briefing serves it to any tenant user; the plugin takes the marked block for every session, with no
// domain edge. A domain's general-procedures briefing is only an optional addition after it.

const RULE12 = '### 12. Where data goes, and links\n- Store everything you produce in the user\'s kinitro domain.'
const BLOCK = `# Briefing: kinitro.ai agents in Claude\n\n## Working rules\n- Rule one.\n\n${RULE12}\n\n## Persona\nYou are a kinitro.ai agent.`
const BRIEFING = `## SYSTEM INSTRUCTION ##\n# MethOS Agent - System Instruction\nGround rules.\n\n<!-- kinitro-agent-101 2026-10-16 begin -->\n${BLOCK}\n<!-- kinitro-agent-101 2026-10-16 end -->\n## SYSTEM INFO ##\nmuch more text`
const briefingVerb = (text: string) => () => ({ result: JSON.stringify({ status: 'ok', situation: 'ColdStart', text }) })

const mk = (on: any, verbs: Record<string, (a: Record<string, unknown>) => unknown>) =>
  makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S9', verbs })

test('the System 101 block is taken from the get-briefing text and nothing else', () => {
  const s = system101(BRIEFING)!
  expect(s).toContain(RULE12)
  expect(s).not.toContain('SYSTEM INFO')
  expect(s).not.toContain('Ground rules')
  expect(system101('no markers here')).toBe(undefined)
  expect(system101(undefined)).toBe(undefined)
})

test('a domain copy of the same 101 adds nothing; a new or different domain section is added after the System one', () => {
  const sections: Record<string, string> = { 'Working rules': `- Rule one.\n\n${RULE12}` }
  expect(addDomainSections(sections, { 'Working rules': '- Rule one.' })).toBe(0)
  expect(sections['Working rules']).toBe(`- Rule one.\n\n${RULE12}`)
  expect(addDomainSections(sections, { 'Working rules': '- Domain rule.', Extra: 'x' })).toBe(2)
  expect(sections['Working rules']).toBe(`- Rule one.\n\n${RULE12}\n\n**Domain-specific:**\n- Domain rule.`)
  expect(sections.Extra).toBe('x')
})

test('every session gets the System 101 with rule 12 without any general-procedures edge', async ($, on) => {
  const w = mk(on, { 'get-briefing': briefingVerb(BRIEFING), 'list-edges': () => ({ result: JSON.stringify({ edges: [] }) }) })
  await probe($, 'reload')
  const st = await probe($, 'status')
  const cache = [...w.files.entries()].find(([k]) => k.endsWith('.json') && w.files.get(k)!.includes('"source":"kinitro.ai"'))
  expect(w.sent.some((s) => s.verb === 'get-briefing' && s.args.moment === 'start')).toBe(true)
  expect(cache?.[1] ?? st).toContain('### 12. Where data goes, and links')
  expect(w.files.get('/w/b/kinitro-ai.log') ?? '').toContain('S system-101')
})

test('without the System block the domain edge briefing still loads', async ($, on) => {
  const w = mk(on, {
    'get-briefing': briefingVerb('## SYSTEM INSTRUCTION ##\nno block'),
    'list-edges': () => ({ result: JSON.stringify({ edges: [{ node: { code: 'lib' } }] }) }),
    'list-nodes': () => ({ result: JSON.stringify({ nodes: [{ code: 'doc1', name: 'Briefing: kinitro.ai agents in Claude (Draft)' }] }) }),
  })
  await probe($, 'reload')
  const log = w.files.get('/w/b/kinitro-ai.log') ?? ''
  expect(log).toContain('system 101 not found')
  expect(log).toContain('G+M doc1')
})
