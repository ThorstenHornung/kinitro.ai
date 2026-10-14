# Codex plugin contract — 2026-10-14

Plan: [delivery plan](CYCLE_PLAN_codex_plugin_2026-10-14.md). Tracking: delivery branch codex/kinitro-ai-plugin (Issues disabled; integration cannot create PRs). User reference: [Codex plugin](../codex-plugin.md).

## Package

Add plugins/kinitro-ai-codex alongside plugins/kinitro-ai. Use Codex's supported compatibility manifest .codex-plugin/plugin.json, skills/ and .mcp.json. Separate .agents/plugins/marketplace.json resolves the package from repo root. Preserve the Claude package and marketplace. This is a config/skills package with no MethOS backend, schema, auth-policy or registration-row change.

## OAuth connection — amended after live diagnosis

The resource is https://methos.kinitro.ai/mcp. Public discovery advertises PKCE S256, refresh tokens, published-client metadata and issuer-bound authorization; it does not advertise DCR or token auth method none.

The standard Codex metadata URL advertises portless loopback redirects. Live anonymous authorization with a callback at port 45678 was refused with ID2043. The existing published-client route requires an exact redirect match. Therefore use a plugin-owned public client metadata document:

- Client ID: https://raw.githubusercontent.com/ThorstenHornung/kinitro.ai/codex/kinitro-ai-plugin/plugins/kinitro-ai-codex/oauth/client.json
- Metadata path in this repo: plugins/kinitro-ai-codex/oauth/client.json
- Exact redirect: http://127.0.0.1:33419/callback
- .mcp.json oauth callbackUrl and callbackPort match that redirect.
- Public client, token_endpoint_auth_method none, PKCE; no client secret.
- Publish the metadata before final authorization preflight. No server configuration change is involved.

Codex preserves an explicit registered callback when the provider advertises issuer-bound authorization. Port 33419 must be free at login. Two concurrent login attempts cannot share the listener. This is a plugin-specific OAuth identity, not a claim that kinitro is OpenAI. A future native-loopback provider fix can support Codex's generic client with variable ports; it is outside this package.

## Skill contract

The kinitro skill discovers actual server tools and binds one conversation to one approved domain. Use domainRef on domain calls, except current-seat/list-domains or a genuinely seat-bound connection. Never overwrite an established conversation choice from a folder default.

Load general instructions through the general-procedures edge and native agent contents. Accept content only when its returned contentTypeCode equals the requested type. Agent Persona replaces general Persona; other sections extend the general sections. Use memory-instruction for approved todos and memory-notes for notes. Existing general briefings mentioning Claude can supply business instructions; translate only available host mechanics and surface unsupported instructions.

## Lifecycle boundary

This version wires MCP and a skill, not Claude's TypeScript SDK hooks. Explicit skill requests read briefings, memory and comments. No background timers, exact context-percentage trigger, system/summarizer rewrite, automatic mirror, outbox or probe tool is promised. It does not automatically send transcripts.

## Verification

The managed package script writes JUnit XML. Counterprobes reject a wrong endpoint, Claude client ID and mismatched callback. Actual Codex CLI marketplace/plugin installation in an isolated home proves discoverability; mcp list proves the bundled server is loaded. Public discovery and anonymous authorize preflight remain diagnostics, not authenticated tool tests.

Account-dependent gate: successful login, current-seat, domain/agent and briefing reads in a new conversation. Report this separately; never infer it from metadata or install.

Sources: [Codex packaging](https://developers.openai.com/plugins/build/plugins), [Codex MCP](https://developers.openai.com/codex/mcp/), [Claude reference](../plugin-reference.md), Claude loader at main b431a77811524f1b894808463a972f3be7abc279.

## Distribution status

The validated package is distributed on codex/kinitro-ai-plugin. Its public client document URL references that branch, so it is testable without advancing main. Main publication must change the client_id and manifest/guide references together to the main URL, then repeat preflight. Do not delete the delivery branch while its OAuth identity is in use.
