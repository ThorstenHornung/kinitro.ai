import { expect, test } from 'claude-code/testing'
import { makeWorld, probe } from './world'

// 0.22.0: the domain view opens the shell of the domain (open-page target 'shell'); a server that does not know the
// target answers page_link_bad_target and the plugin asks once more without a target.

const SHELL_URL = 'https://methos.example/?domain=beta&link=SHELLPAYLOAD'
const PAGE_URL = 'https://methos.example/page/node?link=PAGEPAYLOAD'
// an error answer of the server: a tool result flagged isError, which the plugin turns into a thrown error with the text
const refuse = (text: string) => () => ({ result: text, isError: true })
const BAD_TARGET = refuse('open-page: {"error":"page_link_bad_target","message":"Target shell opens your current domain; it takes no node."}')

// one visible server, as in a real session: a failing call is then not repeated on a second server name
const BUNDLED_TOOLS = ['mcp__plugin_kinitro-ai_kinitro_ai__current-seat', 'mcp__plugin_kinitro-ai_kinitro_ai__open-page']

const bound = (on: any, verbs: Record<string, (args: Record<string, unknown>) => unknown>) =>
  makeWorld(on, { files: new Map([['/w/b/.kinitro-ai-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'S3', tools: BUNDLED_TOOLS, verbs })

const openPages = (w: ReturnType<typeof makeWorld>) => w.sent.filter((c) => c.verb === 'open-page')

test('the domain view asks for the shell of the bound domain and opens what the server gives', async ($, on) => {
  const w = bound(on, { 'open-page': () => ({ result: JSON.stringify({ url: SHELL_URL }) }) })
  expect(await probe($, 'reload')).toContain('domain: beta')

  const view = await probe($, 'open-domain')

  expect(openPages(w)).toHaveLength(1)
  expect(openPages(w)[0]!.args.target).toBe('shell')
  expect(openPages(w)[0]!.args.domainRef).toBe('beta')
  expect(view).toContain('https://methos.example/?domain=beta')
  expect(view).not.toContain('SHELLPAYLOAD')
})

test('a server that does not know the shell target is asked once more without a target', async ($, on) => {
  const w = bound(on, { 'open-page': (args) => (args.target === 'shell' ? BAD_TARGET() : { result: JSON.stringify({ url: PAGE_URL }) }) })
  expect(await probe($, 'reload')).toContain('domain: beta')

  const view = await probe($, 'open-domain')

  expect(openPages(w).map((c) => c.args.target)).toEqual(['shell', undefined])
  expect(view).toContain('https://methos.example/page/node')
  expect(view).not.toContain('PAGEPAYLOAD')
  expect(w.files.get('/w/b/kinitro-ai.log')).toMatch(/target shell not known by the server; asking again without a target/)
})

test('the retry happens once: a second page_link_bad_target ends in a failure answer', async ($, on) => {
  const w = bound(on, { 'open-page': BAD_TARGET })
  expect(await probe($, 'reload')).toContain('domain: beta')

  const view = await probe($, 'open-domain')

  expect(openPages(w)).toHaveLength(2)
  expect(view).toMatch(/^open-page failed: /)
})

test('any other error does not trigger the retry', async ($, on) => {
  const w = bound(on, { 'open-page': refuse('open-page: {"error":"open_page_no_session"}') })
  expect(await probe($, 'reload')).toContain('domain: beta')

  const view = await probe($, 'open-domain')

  expect(openPages(w)).toHaveLength(1)
  expect(view).toMatch(/^open-page failed: .*open_page_no_session/)
})
