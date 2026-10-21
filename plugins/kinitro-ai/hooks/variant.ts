// Build variant of the kinitro-ai plugin (PO 21.10.2026: two plugins with separate connections, one source).
// This file is the ONLY place that names the plugin, its environment and its local file names. The source carries the
// Production values; the packager (Novatect tools/plugin/package_kinitro_plugin.py --variant test) writes the VARIANT line
// anew for the Test build ("kinitro-ai-test", https://methos-test.kinitro.ai/mcp) and rewrites .mcp.json, plugin.json, the
// host state keys (atom plugin literals, types/index.d.ts) and commands/kinitro.md (as commands/kinitro-test.md) to match.
// Never edit the values by hand in a release tree.
//   name          the plugin name: tool names (mcp__<name>__probe, mcp__plugin_<name>_kinitro_ai__<verb>), host state, texts
//   env           PROD or TEST: which kinitro.ai host the bundled server talks to
//   showEnv       true: the prompt context line and the domain band carry the environment ([kinitro-ai-test TEST 0.24.1])
//   downloadBase  the download page whose marketplace.json gives the update notice
//   command       the slash command file (commands/<command>.md): /kinitro, /kinitro-test
//   files         the prefix of every local file (.kinitro-ai-domain, .kinitro-ai-outbox.json, ~/.kinitro-ai/sessions, ...)
// Activation (environment variable KINITRO_AI_ENV, read once per session): a PROD build is active unless it says TEST; a
// TEST build is active only when it says TEST. An inactive build passes every hook through and refuses calls of its own
// kinitro.ai server, so a session never works against both hosts.
export type Variant = { name: string; env: 'PROD' | 'TEST'; showEnv: boolean; downloadBase: string; files: string; command: string }
// @variant-begin (the packager replaces this line)
export const VARIANT: Variant = { name: 'kinitro-ai', env: 'PROD', showEnv: false, downloadBase: 'https://methos.kinitro.ai/download/plugins/claude/', files: '.kinitro-ai', command: 'kinitro' }
// @variant-end
