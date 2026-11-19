// Build variant of the kinitro-ai plugin (PO 21.10.2026: two plugins with separate connections, one source).
// 0.26.0 (item 4.2.1-4672 P5): ONE plugin now serves Prod and Test. Both device servers are in .mcp.json (kinitro_ai_device,
// kinitro_ai_device_test); the SESSION's environment decides which one is used (default Prod; KINITRO_AI_ENV=TEST or the probe action env
// select Test). The separate Test build (kinitro-ai-test, written by the packager) is retired; its VARIANT line keeps working until then.
// This file is the ONLY place that names the plugin, its default environment and its local file names. The source carries the
// Production values; the packager (Novatect tools/plugin/package_kinitro_plugin.py --variant test) writes the VARIANT line
// anew for a Test build and rewrites .mcp.json, plugin.json, the host state keys (atom plugin literals, types/index.d.ts) and
// commands/kinitro.md (as commands/kinitro-test.md) to match. Never edit the values by hand in a release tree.
//   name          the plugin name: tool names (mcp__<name>__probe, mcp__plugin_<name>_kinitro_ai_device__<verb>), host state, texts
//   env           the DEFAULT environment, PROD or TEST (no longer decides whether the plugin is active: the session's environment does)
//   showEnv       kept for the packaged builds; the marker and the domain band show TEST only while Test is active and show no environment for Prod
//   downloadBase  the download page whose marketplace.json gives the update notice
//   command       the slash command file (commands/<command>.md): /kinitro, /kinitro-test
//   files         the prefix of every local file (.kinitro-ai-domain, .kinitro-ai-outbox.json, ~/.kinitro-ai/sessions, ...)
export type Variant = { name: string; env: 'PROD' | 'TEST'; showEnv: boolean; downloadBase: string; files: string; command: string }
// @variant-begin (the packager replaces this line)
export const VARIANT: Variant = { name: 'kinitro-ai', env: 'PROD', showEnv: true, downloadBase: 'https://methos.kinitro.ai/download/plugins/claude/', files: '.kinitro-ai', command: 'kinitro' }
// @variant-end
