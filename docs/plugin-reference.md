# Plugin reference

**The plugin `kinitro-ai` 0.8.0 reads a briefing from kinitro.ai, injects its sections at fixed moments and mirrors each turn into your domain.** It contains no instruction texts and sends nothing anywhere except to kinitro.ai through your own connector. This page is the technical reference for the setup person.

- [Hooks and events](#hooks-and-events)
- [How the briefing is looked up](#how-the-briefing-is-looked-up)
- [What must be configured in kinitro.ai](#what-must-be-configured-in-kinitroai)
- [Local files](#local-files)
- [The `/kinitro` command](#the-kinitro-command)
- [The `probe` tool](#the-probe-tool)
- [Known limits](#known-limits-in-the-beta)
- [Troubleshooting](#troubleshooting)

## Hooks and events

| Event | What the plugin does |
|---|---|
| Session start | Reads the hook state and the cached briefing from local files. Registers the `/kinitro` command and the `probe` tool. Starts a background refresh from kinitro.ai: every 3 seconds, at most 40 tries, until the load succeeds. |
| First-message context | Adds a context block with **Persona** and **Working rules**. Rendered once per conversation, and again after every compaction. |
| System prompt | Adds the same two sections to the system prompt on every request, where the host supports it. If no briefing is loaded yet, it retries the load, at most every 20 seconds. |
| Every user prompt | Adds a one-line marker `[kinitro-ai 0.8.0] context <n> % · briefing <code>`. Adds **Session start** on the first turn, **Every turn** on every turn, **After compaction** once on the first prompt after a compaction, and **Context nearly full** when the context window reaches 70 % and again every 5 points further. With no cache and no briefing, the first prompt waits up to 6 seconds for the connector. |
| Compaction | Appends the **Compaction instruction** to the instructions for the summarizer. Afterwards it flags the After compaction section for the next prompt, resets the context warning, and writes a compaction line into the protocol. Skipped for sub-agents. |
| End of turn | Appends your prompt and the agent's answer to the protocol document. Each text is cut after 6000 characters. Skipped for sub-agents. |
| `/kinitro` | Shows the status. |
| `probe` tool call | Runs the requested action. |

The marker line and every injected block start from the sections of the briefing. If a section is empty or missing, nothing is injected for it.

## How the briefing is looked up

The plugin hard-wires no domain. It resolves everything from your seat:

1. `current-seat` returns your domain and agent node.
2. The plugin reads both nodes to get their codes.
3. **General layers.** It follows the association edge `general-procedures` from the domain node (outgoing, first edge). In the linked section it takes the first Document whose name starts with `Briefing: kinitro.ai agents in Claude` and loads its markdown content. The document is split into sections at each `## ` heading.
4. **Agent layer.** It reads the agent node's instruction contents (table below) and merges them into the matching sections.
5. It writes the result to the local cache and logs what was loaded.

If neither the general briefing nor any agent instruction is found, the load fails and `/kinitro` shows `MISSING` with the reason.

A failed general briefing does not stop the load. The agent's own instructions are used alone.

## What must be configured in kinitro.ai

| Item | Requirement |
|---|---|
| Seat | Your account has an agent seat: a domain and an agent node. |
| Edge | The domain node has an association edge with the relation name `general-procedures` to the section that holds the general library. |
| Briefing document | That section holds a Document whose name **starts with** `Briefing: kinitro.ai agents in Claude`. Its markdown content has one `## ` heading per section (names below). |
| Agent instructions | Optional, but something must exist: either the briefing or at least one agent instruction. |
| Connector | Connected in Claude under the server name `kinitro_ai`. |

### Section names

| Section | Injected | Agent instruction type that extends it |
|---|---|---|
| `Persona` | First-message context block and system prompt | `instruction-persona` (replaces the general persona) |
| `Working rules` | First-message context block and system prompt | `instruction-standing` |
| `Session start` | First prompt of a session | `instruction-coldstart` |
| `Every turn` | Every prompt | `instruction-preturn-continue` |
| `Context nearly full` | At 70 % context, then every +5 points | none |
| `After compaction` | First prompt after a compaction | `instruction-postcompaction` |
| `Compaction instruction` | To the summarizer only | none |

Names must match exactly. Other `## ` sections are loaded but never injected.

An agent instruction is appended below the general text under the heading **Agent-specific**. Only the persona is replaced.

## Local files

The plugin writes three files into the working directory of the Claude session.

| File | Content | Safe to delete? |
|---|---|---|
| `kinitro-ai.log` | Log of the hooks: loads, injections, mirror writes, errors. | Yes |
| `.kinitro-ai-briefing.json` | Cache of the briefing, so the first message is fast while the connector connects. | Yes. It is rebuilt. |
| `.kinitro-ai-state.json` | Hook state: test flag, last context warning, compaction flag, protocol document code, counters. | Yes. Counters and the protocol link restart. |

The cache holds the briefing text. Do not commit these files to a repository. The `.gitignore` of this repository already excludes them.

## The `/kinitro` command

`/kinitro` prints:

- plugin version;
- briefing status: domain, agent, size, source (`kinitro.ai` or `cache`), load time, route used to reach kinitro.ai;
- layers loaded (for example the general document and each agent instruction);
- section names and where the persona comes from;
- how often the sections were injected;
- context fill and the level of the last warning;
- what was injected into the last prompt;
- test flag, compactions seen, post-compaction flag;
- mirror status: number of writes, protocol document code, last error.

## The `probe` tool

The agent can call `probe` with one of four actions. All four return the same status text.

| Action | Effect |
|---|---|
| `status` (default) | Shows diagnostics. |
| `reload` | Reads the briefing again from kinitro.ai. |
| `arm-test` | The next prompt receives every section once, marked `[TEST]`, including the ones that normally appear only at certain moments. The Compaction instruction is shown too, although it normally goes only to the summarizer. Use it to verify the setup. |
| `invalidate-context` | Renders the first-message context block (persona and working rules) again on the next request. |

## The protocol

At the end of every turn the plugin appends to a document named `Protocol: Claude session <date> (<first 8 characters of the session id>)`.

- The section `Protocols: Claude sessions` is found in your domain. If it is missing, it is created in the domain's `_Work` section (or in the domain itself if there is no `_Work`).
- The document is created on the first mirror write.
- Each entry has the time (UTC), the end reason, the hooks injected, your prompt and the agent's answer.
- Compactions appear as a separate line with tokens before and after.
- Mirroring is a script call and costs no model tokens.

## Known limits in the beta

- Messages sent to the agent inside the kinitro.ai app do not reach an agent running in Claude yet.
- Section-level expiry rules cannot be configured yet. Agents set the expiry per document.
- The compaction threshold is assumed to be 80 %. The checkpoint at 70 % is based on that assumption.
- Texts longer than 6000 characters are cut in the protocol.
- Mirroring needs the connector. If it is down, that turn is not mirrored.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/kinitro` is not found | Plugin not installed or not active in this session | Run the install command again. Choose user scope. Start a new session. |
| Install fails with an access error | Your GitHub account has no access to the private repository | Ask kinitro for the invitation. |
| `briefing: MISSING (... current-seat gave no domain/agent node ...)` | No agent seat, or the connector is not connected | Check the seat with your contact. Check the connector. |
| `briefing: MISSING (... no briefing found ...)` | No `general-procedures` edge with a `Briefing: kinitro.ai agents in Claude` document, and no agent instructions | Ask your contact to add the edge and document, or the agent instructions. Then run `probe` with `reload`. |
| `MISSING` with a message about `tool.call` and `mcp.call` | Connector not reachable under the name `kinitro_ai` | Check the connector name and its sign-in. Send a new message. |
| Briefing source stays `cache` | Connector was not up in time, or loading keeps failing | Run `probe` with `reload`. Read `kinitro-ai.log`. |
| A section never arrives | Heading missing or misspelled in the briefing document | Use the exact names above. Run `probe` with `arm-test`. |
| Persona does not change after editing in kinitro.ai | The old briefing is cached | Run `probe` with `reload`, then `invalidate-context`. |
| No protocol document appears | Mirror write failed. `/kinitro` shows `last error`. | Check write access to the domain. Check the `_Work` section. Read `kinitro-ai.log`. |
| Agent ignores a checkpoint | The agent was not told in time, or the text is unclear | Run `arm-test` and ask the agent to confirm each block. Edit the text in kinitro.ai. |

Still stuck? Send `kinitro-ai.log` and the output of `/kinitro` to your kinitro contact. Check both for confidential content first.
