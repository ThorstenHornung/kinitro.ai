import { expect } from 'claude-code/testing'
import { test } from './kit'
import { readableLink } from '../hooks/register'
import { makeWorld, probe } from './world'

// 0.23.3 (PO 16.10.2026): a new session and a domain switch OFFER the domain view in the built-in browser with a readable
// link (no ?link= payload); nothing opens until the user says yes.

const SHELL_URL = 'https://methos.example/?domain=beta&link=SHELLPAYLOAD'
const shell = () => ({ result: JSON.stringify({ url: SHELL_URL }) })

const mk = (on: any, turns: number, files: [string, string][] = [['/w/b/.kinitro-ai-domain', 'beta\n']]) => {
  const seen: string[] = []
  on('session.turns', async () => ({ value: turns }))
  on('prompt.submit', async (_$: any, e: any) => { seen.push((e.context ?? []).join('\n')); return { text: e.text } })
  const w = makeWorld(on, { files: new Map(files), cwd: '/w/b', root: '/w/b', sid: 'S7', verbs: { 'open-page': shell } })
  return { w, seen }
}

test('the readable link drops only the link payload', () => {
  expect(readableLink(SHELL_URL)).toBe('https://methos.example/?domain=beta')
  expect(readableLink('https://methos.example/?domain=4.2.3&pages=node%2Fabc&link=X')).toBe('https://methos.example/?domain=4.2.3&pages=node%2Fabc')
  expect(readableLink('https://methos.example/page/cloud/4.2.1.3?path=a%2Fb.md')).toBe('https://methos.example/page/cloud/4.2.1.3?path=a%2Fb.md')
  expect(readableLink('not a url')).toBe('not a url')
})

test('the first prompt of a new session offers the domain view with the readable link and opens nothing', async ($, on) => {
  const { w, seen } = mk(on, 0)
  await probe($, 'reload')
  await $.prompt.submit({ text: 'a', origin: { kind: 'composer' } } as any)
  const ctx = seen.join('\n')
  expect(ctx).toContain('Offer the user once')
  expect(ctx).toContain('https://methos.example/?domain=beta')
  expect(ctx).not.toContain('SHELLPAYLOAD')
  expect(w.files.get('/w/b/kinitro-ai.log') ?? '').not.toMatch(/pane opened|pane not opened/)
})

test('a later prompt carries no offer', async ($, on) => {
  const { seen } = mk(on, 3)
  await probe($, 'reload')
  await $.prompt.submit({ text: 'b', origin: { kind: 'composer' } } as any)
  expect(seen.join('\n')).not.toContain('Offer the user once')
})

test('a domain switch returns the readable link for the offer and opens no pane', async ($, on) => {
  const { w } = mk(on, 3)
  await probe($, 'reload')
  const r = await probe($, 'set-domain', { domain: 'beta' })
  expect(r).toContain('https://methos.example/?domain=beta')
  expect(r).not.toContain('SHELLPAYLOAD')
  expect(w.files.get('/w/b/kinitro-ai.log') ?? '').not.toMatch(/pane opened|pane not opened/)
})
