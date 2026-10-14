# kinitro.ai for Codex

Version **0.1.0** is a separate Codex plugin beside the Claude plugin. It connects Codex to MethOS MCP and provides the kinitro skill for domain selection, agent briefing, refresh and status. Instruction texts stay in kinitro.ai.

## Install

Use Codex desktop or a Codex CLI with plugin support:

```powershell
codex plugin marketplace add ThorstenHornung/kinitro.ai --ref codex/kinitro-ai-plugin
codex plugin add kinitro-ai-codex@kinitro-ai-codex
```

The commands above install the delivery branch. Main publication is pending review/approval. Keep this branch available: the test package's OAuth metadata is hosted there; main publication will update the client metadata URL consistently. Claude keeps its .claude-plugin/marketplace.json; Codex uses .agents/plugins/marketplace.json pointing to plugins/kinitro-ai-codex.

Start a new conversation after installation. Authenticate the plugin's **kinitro_ai** server through Codex's MCP connection UI; its name may be plugin-qualified. Then ask:

> Use $kinitro to connect this conversation to my domain.

Name your domain if known. If several domains are approved, the skill asks you to choose. It reads your seat, agent and platform instructions, and opens the domain view where supported. Later ask "Use kinitro to refresh my instructions" or "Use kinitro to show connection status".

## Connection and authentication

The endpoint is https://methos.kinitro.ai/mcp. The OAuth client ID is this plugin's public client metadata URL https://raw.githubusercontent.com/ThorstenHornung/kinitro.ai/codex/kinitro-ai-plugin/plugins/kinitro-ai-codex/oauth/client.json. Codex owns login, PKCE, callback handling and token storage. No credentials or tokens are packaged.

Read-only discovery on 2026-10-14 confirmed the methos resource scope, PKCE S256, refresh tokens, published client metadata and issuer-bound authorization. MethOS does not advertise DCR or public token auth method none; the plugin's published client declares a fixed callback because the generic Codex client's variable-port redirect was rejected by MethOS (ID2043). This package changes no server auth policy or registration row.

A CLI-only alternative for MCP without the plugin:

```powershell
codex mcp add kinitro_ai --url https://methos.kinitro.ai/mcp --oauth-client-id https://raw.githubusercontent.com/ThorstenHornung/kinitro.ai/codex/kinitro-ai-plugin/plugins/kinitro-ai-codex/oauth/client.json
codex -c 'mcp_servers.kinitro_ai.oauth.callback_url="http://127.0.0.1:33419/callback"' -c 'mcp_servers.kinitro_ai.oauth.callback_port=33419' mcp login kinitro_ai --scopes methos,offline_access
```

Choose one connection path to avoid duplicate servers. Preserve login errors for diagnosis; do not reuse Claude tokens or disable authentication checks.

## Differences from Claude

| Capability | Codex 0.1.0 |
|---|---|
| Bundled MethOS MCP | Yes, with Codex client metadata |
| Domain selection and one domain per conversation | Through the kinitro skill |
| General briefing and native agent instructions | Through the skill, with content-type validation |
| Refresh and status | Explicit skill requests |
| Notes, topic map, todos, open UI comments | Through the skill when available |
| Domain page | Returned link/browser capability |
| Claude probe tool and banner | Not included |
| Automatic prompt/compaction injection and 70% warnings | Not included |
| Automatic transcript mirror/outbox and inbox polling | Not included |

The skill does not automatically run on every prompt. Existing general briefings titled for Claude can supply business instructions; unsupported host instructions are surfaced rather than silently promised.

## Data and privacy

Calls go to MethOS using the signed-in account's permissions. The skill reads seat/domain/agent nodes, instructions and working memory needed for the requested domain work. Ordinary MCP actions still need task authorization. The package does not automatically mirror prompts, answers, tool calls or private reasoning.

The account needs an approved domain and default agent, or a seat-bound connection. See [domain setup](domain-setup.md).

## Validation

Run scripts/Test-CodexPlugin.ps1 for package checks and JUnit XML, including a wrong-endpoint counterprobe. See [validation evidence](codex-plugin-validation.md).

Installation and public discovery do not prove authenticated access. Login followed by current-seat, domain/agent nodes and briefing reads remains an account-dependent gate until explicitly recorded as passed.

[Design](design/TD_codex_plugin_2026-10-14.md) · [Delivery plan](design/CYCLE_PLAN_codex_plugin_2026-10-14.md).

### Fixed callback constraint

Login needs free local port 33419. Do not run two logins at once. If the port is occupied, stop and report the conflict; changing only the listener breaks the registered callback. Once signed in, regular MCP calls do not use the callback listener. The generic Codex client with a dynamic callback remains incompatible until the separate provider fix is implemented.
