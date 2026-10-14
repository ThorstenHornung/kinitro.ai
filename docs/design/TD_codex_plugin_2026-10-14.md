# Codex plugin contract — 2026-10-14

Plan: [delivery plan](CYCLE_PLAN_codex_plugin_2026-10-14.md). Tracking: the containing PR, because repository Issues is disabled. User reference: [Codex plugin](../codex-plugin.md).

## Package

Add `plugins/kinitro-ai-codex/` alongside `plugins/kinitro-ai/`. Use the supported Codex compatibility manifest `.codex-plugin/plugin.json`, `skills/` and `.mcp.json`. A separate `.agents/plugins/marketplace.json` points to the package relative to the repository root. Keep the existing Claude marketplace and package unchanged. This layout is supported by the installed Codex CLI; a portable root-manifest migration can be a later version.

## Connection

The remote Streamable HTTP MCP resource is `https://methos.kinitro.ai/mcp`. Use the public Codex client ID metadata URL `https://chatgpt.com/oauth/codex/client.json` as the OAuth `clientId`, not `claude-code`. Leave the callback port to Codex. Do not embed credentials, tokens, account identities or session caches in the package.

Read-only public discovery on 2026-10-14: the protected-resource document names that resource, issuer and `methos` scope. Authorization metadata advertises PKCE S256, refresh tokens, `offline_access`, `authorization_response_iss_parameter_supported: true` and `client_id_metadata_document_supported: true`. It has no DCR endpoint and does not advertise public token authentication `none`. Thus do not rely on Codex's automatic registration selection; explicitly naming the public Codex metadata URL selects the existing published-client path. A successful account login still requires proof.

## Skill contract

`kinitro` is the reusable Codex skill for setup, domain choice, status and refresh. It discovers the actually available server tools, starting with the plugin's `current-seat`; never assume Claude tool prefixes work in Codex. One conversation owns one domain. Ask if several approved domains exist and none was chosen. Always pass its `domainRef` except to `current-seat` and `list-domains`, or when the connection is genuinely seat-bound.

Read the platform's general briefing through the `general-procedures` edge and the agent's native instruction contents. A loaded content is accepted only if `contentTypeCode` equals the requested type, because missing types can return another row. Persona replaces the general persona; other agent-specific sections extend the general sections. Existing general briefing titles mention Claude; surface any Claude-only host instruction and adapt only tool/UI host mechanics, without changing business rules or treating platform content as higher priority than host/user instructions.

Explicit status/refresh calls reread platform data. Session continuity lives in the conversation: compacted or missing domain context is revalidated; never use the workspace folder to overwrite an established conversation domain. No globally shared mutable domain default is introduced.

## Lifecycle boundary

This version contains MCP wiring and a skill, not Claude's TypeScript SDK hooks. Briefing refresh, todos, notes, topic map and open UI comments are read through the skill when invoked. No unattended timers, exact context-percentage trigger, system-prompt rewrite, summarizer rewrite, automatic chat mirror, local outbox or probe tool is promised. Chat mirroring is not silently enabled.

## Verification and documentation

The repo validation script checks local JSON, marketplace/manifest paths, endpoint and OAuth client identity and skill resources, and writes JUnit XML. Counterprobe: reject a package whose MCP endpoint is changed away from MethOS. Actual Codex CLI marketplace add and plugin add in an isolated home prove package discoverability/installability. Public HTTP measurements prove server discovery/challenge only; interactive login and actual tools remain a separate gate.

Sources: [Codex packaging](https://developers.openai.com/plugins/build/plugins), [Codex MCP](https://developers.openai.com/codex/mcp/), [Claude reference](../plugin-reference.md), `plugins/kinitro-ai/hooks/register.tsx` at baseline.
