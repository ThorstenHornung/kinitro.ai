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

Save the plugin file, then open a new chat and ask "kinitro status". The kinitro connector must be
connected for the agent to reach the kinitro verbs.

## Scope

Made for cloud sessions. In a Windows terminal the hook launcher may find no Python; disable the
plugin on that machine and use `kinitro`, which is the right plugin there anyway.
