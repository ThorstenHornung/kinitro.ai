import { describe, expect, test } from 'claude-code/testing'
import { VARIANT } from '../hooks/variant'
import { makeWorld, probe } from './world'

// Ruling R1 (21.10.2026): kinitro-ai and kinitro-ai-test run side by side in one session. Each build's hooks touch only its own
// server: the session key of one never reaches a call of the other's server, and the other's answers are left alone.
// The OTHER name is computed, so the same test proves both directions (the Test build's suite runs it with the names swapped).
const OTHER = VARIANT.name === 'kinitro-ai' ? 'kinitro-ai-test' : 'kinitro-ai'
const OWN = `mcp__plugin_${VARIANT.name}_kinitro_ai__`
const FOREIGN = `mcp__plugin_${OTHER}_kinitro_ai__`
const KEY = 'kss_isolation_key_1'

describe('two builds in one session', () => {
  test('the own session key goes on own calls only; a call of the other build\'s server is not touched', async ($, on) => {
    const w = makeWorld(on, {
      files: new Map([['/w/b/' + VARIANT.files + '-domain', 'beta\n']]), cwd: '/w/b', root: '/w/b', sid: 'SI',
      verbs: { 'open-domain': () => ({ result: JSON.stringify({ status: 'ok', sessionKey: KEY }) }) },
    })
    await probe($, 'set-domain', { domain: 'beta' })
    await $.tool.call({ tool: OWN + 'list-nodes' })
    const own = w.sent.filter((s) => s.verb === 'list-nodes')
    expect(own.length).toBe(1)
    expect(own[0]!.args.domainRef).toBe(KEY)                       // control: the own server gets the key

    w.verbs!['echo-key'] = () => ({ result: JSON.stringify({ sessionKey: 'kss_other_build_key', note: 'kss_other_build_key' }) })
    const r: any = await $.tool.call({ tool: FOREIGN + 'echo-key', domainRef: 'their-own' })
    const theirs = w.sent.filter((s) => s.verb === 'echo-key')
    expect(theirs.length).toBe(1)
    expect(theirs[0]!.args.domainRef).toBe('their-own')            // not replaced by this build's key
    expect(JSON.stringify(theirs[0]!.args)).not.toContain(KEY)
    expect(String(r.result)).toContain('kss_other_build_key')       // the other build's answer is not scrubbed or adopted here
    await $.tool.call({ tool: OWN + 'list-nodes' })
    expect(w.sent.filter((s) => s.verb === 'list-nodes')[1]!.args.domainRef).toBe(KEY)   // the own key was not replaced by theirs
  })
})
