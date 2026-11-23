---
name: kinitro
description: Use when the user asks about connecting this chat to kinitro.ai, signing in, choosing or switching the domain or seat, the kinitro briefing or instructions, "kinitro status", "refresh kinitro", or when the kinitro briefing does not arrive in a plain claude.ai or Cowork chat.
---

# kinitro.ai in a session without a hooks module

This plugin briefs the agent with command hooks only. It carries **no MCP server**: the kinitro
verbs come from the connector the session already has. It does **not** mirror the chat into
kinitro.ai, and it stays silent whenever the `kinitro` plugin drives the session.

Talk to the user in their language and call it "domain" (German: "Arbeitsbereich"); never say "slug".

## Choosing or switching the domain

1. Call the kinitro verb `open-domain`. With no argument the person chooses; with a domain id or
   path it opens that one. Its answer carries the session key.
2. Keep the session key in this session only. Never show it to the user, never put it in a file,
   never repeat it in your answer. Pass it as `domainRef` on every later kinitro call.
3. Call `get-briefing` with moment `start` once and keep its instructions for the session. The
   plugin's hook caches that text and puts it in front of you again on later turns, so you do not
   need to fetch it every turn.
4. Confirm with the domain's name, nothing else.

## "kinitro status"

Report these four lines, in the user's language, without ids, keys or file paths:

- **Where**: a session without a hooks module, so the briefing comes from command hooks.
- **Signed in**: whether a kinitro verb answered. If none is available at all, tell the user to
  connect the kinitro connector, then stop.
- **Domain and briefing**: the domain in use, and whether instructions are cached. Read the cache
  with Bash: `cat ~/.kinitro-cloud/$CLAUDE_SESSION_ID.json 2>/dev/null | head -c 400`, or list
  `~/.kinitro-cloud/`. Report only whether instructions are there and when they were fetched.
- **Chat mirror**: not available here. Say it plainly once, and do not offer to switch it on.

If the user also has the `kinitro` plugin and expects the mirror, tell them this chat cannot run it:
the mirror needs a session with a Code environment (a Code-tab session, a Cowork task, or the
terminal).

## "refresh kinitro"

Call `get-briefing` with moment `start` again. The hook replaces the cache from that answer.

## Two plugins at once

Both plugins briefing one session would brief it twice. The `kinitro` plugin keeps a session record,
and this plugin's hook stays silent while that record is there. If the user reports a doubled
briefing, check with Bash whether `~/.kinitro-ai/sessions/` holds a file for this session and say
what you found; never edit or delete it.
