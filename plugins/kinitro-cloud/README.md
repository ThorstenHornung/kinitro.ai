# kinitro-cloud

Briefs a kinitro.ai agent with its seat's instructions in sessions that run **no hooks module** —
plain claude.ai chats and Cowork chats, where a plugin containing a module is switched off entirely.

It uses standard command hooks, which those sessions do run: `SessionStart` and `UserPromptSubmit`
put the seat's instructions in front of the agent, and `PostToolUse` caches the briefing text from
the agent's own `get-briefing` answer so later turns need no new call.

**What it deliberately does not do.** It carries no MCP server of its own, so a session has exactly
one kinitro connection and one set of verbs; it holds no credential of any kind, and it never stores
the session key; and it does not mirror the chat into kinitro.ai, because a command hook cannot call
an MCP server. Where the `kinitro` plugin is active, that plugin briefs and mirrors, and this one
stays silent.

## Install

- **Claude Code cloud sessions** (claude.ai/code, web and mobile): add the marketplace and install
  the plugin, `/plugin marketplace add ThorstenHornung/kinitro.ai`, then
  `/plugin install kinitro-cloud@kinitro-ai`. To have it in every cloud session of a repository,
  list the marketplace under `extraKnownMarketplaces` and `kinitro-cloud@kinitro-ai` under
  `enabledPlugins` in that repository's `.claude/settings.json`.
- **claude.ai and Cowork chats:** save the plugin file from the download page and upload it under
  Customize, Plugins.

Then ask "kinitro status". The kinitro connector (`kinitro_ai`) must be connected for the agent to
reach the kinitro verbs.

## Differences from `kinitro`

| | `kinitro` | `kinitro-cloud` |
|---|---|---|
| Seat instructions (briefing) | yes | yes |
| Chat mirror into kinitro.ai | yes | no (a command hook cannot call an MCP server) |
| Wakes an idle session on a new chat message | yes (from 0.27.1) | no |
| Own MCP server | yes | no, uses the connector |

## Scope

Made for cloud sessions. In a Windows terminal the hook launcher may find no Python; disable the
plugin on that machine and use `kinitro`, which is the right plugin there anyway.
