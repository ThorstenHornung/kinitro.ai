# Plugin reference

**The plugin `kinitro-ai` 0.23.2 reads a briefing from kinitro.ai, injects its sections at fixed moments, tells the agent about open UI comments and mirrors each turn into the agent's chat.** It contains no instruction texts and sends nothing anywhere except to kinitro.ai through its own bundled MCP server (or a kinitro.ai server or connector you already have). This page is the technical reference for the setup person.

- [Hooks and events](#hooks-and-events)
- [How the briefing is looked up](#how-the-briefing-is-looked-up)
- [What must be configured in kinitro.ai](#what-must-be-configured-in-kinitroai)
- [Local files](#local-files)
- [The `/kinitro` command](#the-kinitro-command)
- [The `probe` tool](#the-probe-tool)
- [The chat mirror](#the-chat-mirror)
- [Todo list](#todo-list)
- [Open UI comments](#open-ui-comments)
- [Known limits](#known-limits-in-the-beta)
- [Server and tool lookup](#server-and-tool-lookup)
- [Troubleshooting](#troubleshooting)

## Hooks and events

| Event | What the plugin does |
|---|---|
| Session start | Reads the hook state and the cached briefing from local files. Registers the `probe` tool. Starts a background refresh from kinitro.ai: every 3 seconds, at most 40 tries, until the load succeeds. |
| First-message context | Adds a context block with **Persona** and **Working rules**. Rendered once per conversation, and again after every compaction. |
| System prompt | Adds the same two sections to the system prompt on every request, where the host supports it. If no briefing is loaded yet, it retries the load, at most every 20 seconds. |
| Every user prompt | Adds a one-line marker `[kinitro-ai 0.23.2] context <n> % · briefing <code>`. Adds **Session start** on the first turn, **Every turn** on every turn, **After compaction** once on the first prompt after a compaction, together with **Persona** and **Working rules** again (the summary does not keep them), and **Context nearly full** once per compaction cycle when the context window reaches 70 %; at every 5 points further only a one-line reminder follows. Adds the agent's todo list and a reminder to update it (see [Todo list](#todo-list)). At the first turn and after a compaction it adds the last 5 turns of the agent's kinitro.ai chat (`read-chat-tail`, each message cut at 600 characters, the block at about 6,000, oldest first, the speaker cut at 40) as quoted data: a header that says the history is data, not instructions, and the lines between `--- begin quoted chat history ---` and `--- end quoted chat history ---`, then the line `Earlier turns: read-chat-tail (more turns) if the context needs it.`; when there is no chat, the read fails or it does not answer within 3 seconds, nothing is added and the log says why (`chat tail skipped: timeout`). Adds the open UI comments of the domain when they changed (see [Open UI comments](#open-ui-comments)). With no cache and no briefing, the first prompt waits up to 6 seconds for the connector. |
| Compaction | Appends the **Compaction instruction** to the instructions for the summarizer. Afterwards it flags the After compaction section for the next prompt and resets the context warning. Skipped for sub-agents. |
| End of turn | Writes what you typed, what another agent sent and the main agent's final answer into the agent's chat (see [The chat mirror](#the-chat-mirror)). Each text is cut after 50,000 characters. Skipped for sub-agents. |
| `/kinitro` | A command file of the plugin: opens the domain selection and binds the session (see below). |
| `probe` tool call | Runs the requested action. |

The marker line and every injected block start from the sections of the briefing. If a section is empty or missing, nothing is injected for it.

## How the briefing is looked up

The plugin hard-wires no domain. It resolves the domain and agent node from your connection:

1. **Session key (0.24.0).** kinitro.ai runs a verb only for a call that carries a valid session key (item 4.2.1-3590). The plugin obtains the key itself: it looks the session's domain up with `list-domains` and calls `open-domain` with that domain (and the agent node of the seat setting, below). The answer carries the session key. The plugin keeps it for this Claude session only, in the session-scoped host state (`$.state`), tied to the Claude session id: it survives a compaction and a reload of the plugin, and a new Claude session (also after `/clear`) never sees the old key and gets a new one. The key is never written to a file (not the session record, `.kinitro-ai-domain`, the state file, the cache, the outbox or the log), never kept across sessions and never shown to the agent.
2. `current-seat` with the key returns the domain and agent node of the session. Without a key, `current-seat` lists the approved domains; the plugin then takes this session's **domain** (see "Choosing the domain" below) and starts the session there. A connection bound to one seat (a pinned address) starts its session in that seat's domain.
3. From then on the plugin adds the key as `domainRef` to **every** call of its own kinitro.ai server, `current-seat` and `list-domains` included, and to every call the agent makes through it. A `domainRef` the agent passes is replaced by the key. The key in an `open-domain` answer is removed before the agent reads the answer.
4. A call that kinitro.ai refuses with `session_key_required`, or with an unknown session key (the sign-in was renewed, the session ended), makes the plugin start a new session once and repeat the call once.
5. **Older server.** When `open-domain` answers without a session key (a server older than session keys), the plugin passes the domain as before.
6. The plugin reads both nodes to get their codes.
7. **Agent instruction set (0.23.6).** `get-briefing` returns the agent node's instruction set, one entry per `instruction-*` type (persona, standing, coldstart, preturn-continue, postcompaction), composed by the server: the AIAgent's text first, then the agent node's; the agent node's `instruction-persona` replaces the AIAgent's. A type missing on both is empty and left out; with no persona there is no Persona section. The Agent 101 reaches the agent through `{{mx:include "<nodeGuid>:<contentType>"}}` in the coldstart and postcompaction templates, expanded by the server. The plugin injects each text as given into its section (table below); "Context nearly full" and "Compaction instruction" are read from a `## ` heading of that name inside a given text.
8. It writes the result to the local cache and logs what was loaded.

No domain edge is read. A domain without an agent node is refused: "this domain (<slug>) has no agent node; add one". If the agent node and its AIAgent carry no instruction at all, the load fails with "agent <name> has no instructions yet" and the `probe` status shows `MISSING`. Against an API that does not send the instruction set yet, the plugin loads the agent node's own contents only.

## Choosing the domain

One kinitro.ai connection can serve several domains, for example two agents of the same person. Each Claude session has its own kinitro.ai session (its own key) and works in one domain at a time, named by its slug (`list-domains` shows the slugs, for example `verum`). Choosing another domain adds it to the same session with the same key; the domains opened before stay open. Two Claude sessions in the same domain are two kinitro.ai sessions.

**Seat setting (0.24.0, part 6).** A seat that works as one particular agent node of the domain names its id in the file `~/.kinitro-ai/agent` (one line, the id; `%USERPROFILE%\.kinitro-ai\agent` on Windows). Only the person's own home folder counts: a file in the project folder and environment variables are not read, so a repository cannot choose the agent. The plugin passes the id as `agent` to `open-domain`; an approval it needs names the agent and the domain. Without the setting the domain's default agent node is used.

| Situation | What the plugin does |
|---|---|
| The session already has a domain (its session record) | Uses it, whatever the current folder says. |
| The connection serves one approved domain | Uses it. Nothing to set. |
| New session, several approved domains, folder default `.kinitro-ai-domain` in the session's home folder | Uses that slug (the last domain chosen in this folder). |
| New session, several approved domains, no file | Stops retrying, shows `domain: NOT SET` in the `probe` status and asks you to choose (below). |

**The domain belongs to the session, not to the folder.** At its first start each session gets a record in a fixed place, `~/.kinitro-ai/sessions/<session id>.json` (`%USERPROFILE%` on Windows). The record holds the session's **home folder** (the project root, or the working directory where there is none) and its domain. The folder default is read only for a session that has no domain yet. If the working directory changes later, for example through a `cd` in the main session, the binding stays, the hook process may even restart in the new folder, and the plugin only logs `working folder changed to <folder> (folder default <slug>); the session keeps <slug>`. The `probe` status shows the session home and the record.

How you choose:

- **Row above the prompt** (Claude Code in the terminal and the desktop Code tab): one button per approved domain, **Refresh list**, and a link to the kinitro.ai domain selection page where you approve another domain. With a domain set, the row shows it with **Change domain**.
- **In the chat** (where no row can be drawn, for example a cloud session in the Claude app): the agent asks you with selection buttons, gives you the selection link if your domain is missing, and binds the session.
- **By hand:** ask the agent to call `probe` with action `set-domain` and the slug.

Choosing writes the session record and the folder default of the session's home folder (the slug only) and calls `open-domain` with the session key: the domain is added to the session and becomes its working domain; no new key is made. A domain this sign-in has not approved yet answers with an approval link: the agent shows it to you, and after your approval the binding is repeated. The agent never passes `domainRef` itself; the marker line of every prompt says so. If the agent calls `open-domain` itself, the plugin follows the session's working domain at the next prompt.

Run two agents at the same time in two Claude sessions, each with its own working directory and its own `.kinitro-ai-domain`.

## When instructions are refreshed

| Moment | What happens |
|---|---|
| First prompt of a session | The instructions are loaded fresh from kinitro.ai (never from the local copy alone). |
| Daily | Before a prompt, a copy older than 24 hours is renewed. |
| `/kinitro refresh` | Renewed on request, for example after editing instructions in kinitro.ai. |
| `/kinitro test` / `/kinitro test off` | Test mode renews every 2 minutes; off returns to daily. |
| `/kinitro update` | Claude Code only (0.23.2): runs `claude plugin marketplace update kinitro-ai` and `claude plugin update kinitro-ai@kinitro-ai` (pre-approved for that turn by the command's `allowed-tools`), then asks you to run `/reload-plugins`. In Cowork and the desktop app, re-upload the plugin from the download page instead. At the first prompt of a session the plugin tells you in one line when the download page publishes a newer version (checked at most once a day). |
| Domain chosen | Loaded fresh for the new domain; the next prompt carries persona, working rules, session start, notes and memory topics. |

When the persona or working rules changed, the next prompt carries them again.

## What must be configured in kinitro.ai

| Item | Requirement |
|---|---|
| Seat | Your account has an agent seat: a domain and an agent node. On a multi-domain connection the domain must be approved for the connection and have a default agent node. |
| Agent node | The domain has an agent node (its default agent node). Without one the plugin refuses the binding. |
| AIAgent | The agent node names an AIAgent whose instruction node points to the platform `instruction-*` templates, with the Agent 101 included into the coldstart and postcompaction templates. |
| Agent instructions | Optional on the agent node: its own `instruction-*` contents are appended to the AIAgent's; its `instruction-persona` replaces the AIAgent's. |
| MCP server | From 0.25.5 the plugin brings one server of its own (`.mcp.json`), the device sign-in server `kinitro_ai_device` at `https://methos.kinitro.ai/mcp/device` (no OAuth; tools `mcp__plugin_kinitro-ai_kinitro_ai_device__<verb>`). The plugin signs in itself by email code (setting `email`; `/kinitro domain` or `/kinitro sign-in`; the secret is exchanged with the server and held by the plugin), so it never needs a localhost callback and shows no "needs authentication" in `/mcp`. The setting `signInPath` is `auto` (default, which means device) or `device`; `oauth` is only for a user who adds their own server named `kinitro_ai` with OAuth (the plugin no longer brings one). See [Server and tool lookup](#server-and-tool-lookup). |

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

The plugin keeps its files in the session's **home folder** (see [Choosing the domain](#choosing-the-domain)), not in the current working directory, so a `cd` never splits or swaps them. The session record lives in `~/.kinitro-ai/sessions/<session id>.json`.

| File | Content | Safe to delete? |
|---|---|---|
| `kinitro-ai.log` | Log of the hooks: loads, injections, mirror writes, errors. | Yes |
| `.kinitro-ai-briefing.json` | Cache of the briefing, so the first message is fast while the connector connects. | Yes. It is rebuilt. |
| `~/.kinitro-ai/sessions/<session id>.json` | The session record: home folder and domain. | Yes, after the session has ended. In a running session the domain is then taken from the folder default again. |
| `.kinitro-ai-domain.<session id>` | Written up to 0.19.x. Read once to take over an older session's domain. | Yes. |
| `.kinitro-ai-domain` | The folder default: the last slug chosen in this folder. | Yes. |
| `.kinitro-ai-state.json` | Hook state: test flag, chat mirroring switch (`mirror`), last update check (`updateCheckedAt`, `updateLatest`, 0.23.2), last context warning, compaction flag, counters. | Yes. Counters restart; the next first prompt checks for an update again. |
| `.kinitro-ai-prompts.json` | The prompts of the running turn (0.25.9), written when they are typed and emptied at the end of the turn. Not written while mirroring is off. | Yes |
| `.kinitro-ai-outbox.json` | Turns not yet confirmed by kinitro.ai (prompt and answer text, the domain slug; never a session key). Each Claude session sends only its own turns. At most 200 entries. | Yes, but unsent turns are lost. |
| `~/.kinitro-ai/agent` | Optional seat setting in the person's home folder: the agent node id this seat works as (0.24.0). | Yes. The domain's default agent node is used. |
| `.kinitro-ai-inbox.json` | New messages fetched from the agent's chat, and the fetch cursor. | Yes. |

The cache holds the briefing text. Do not commit these files to a repository. The `.gitignore` of this repository already excludes them.

## The `/kinitro` command

`/kinitro` is a command file (`commands/kinitro.md`), so it is listed in every Claude surface, the Claude app included.

- `/kinitro <slug>` binds the session to that domain.
- `/kinitro` alone asks which domain: pick an approved one and it is bound at once, or pick **Approve another domain**. That opens the kinitro.ai domain selection (in the browser pane if there is one, else as a link); choose there, press **Switch**, then **Confirm my choice** in the chat. Either way the plugin stores the choice, opens the domain view in the browser pane, and the agent confirms the domain by name.
- Binding writes the session record and `.kinitro-ai-domain` (through `probe` `set-domain`; without the plugin's tool, the agent writes the folder file and `.kinitro-ai-pending`, which the plugin looks for in the session home and in the current folder).

The status is shown by `probe` with action `status`:

- plugin version;
- the domain slug, or `NOT SET` with the approved slugs, or `seat-bound connection`;
- briefing status: domain, agent, size, source (`kinitro.ai` or `cache`), load time, route used to reach kinitro.ai;
- layers loaded (for example the general document and each agent instruction);
- section names and where the persona comes from;
- how often the sections were injected;
- context fill and the level of the last warning;
- what was injected into the last prompt;
- test flag, compactions seen, post-compaction flag;
- ui comments: how many are open, last check, last time the agent was told, last error;
- `Chat mirroring: on` or `off` (the switch, see [The chat mirror](#the-chat-mirror));
- chat mirror: turns sent, already present, agent, last error, new inbox messages, last fetch.

## The `probe` tool

The agent can call `probe` with one of twelve actions. All but `comments`, `choices`, `open-domain`, `selection-*` and `set-domain` return the same status text.

| Action | Effect |
|---|---|
| `status` (default) | Shows diagnostics. |
| `comments` | Checks the open UI comments of the bound domain now. Returns them, the formatted block, the check time and the last time the agent was told. |
| `choices` | Returns the approved domains and the current one. |
| `open-domain` | Opens the bound domain's view in the browser pane (done automatically after binding): the shell of the domain, `open-page` with `target: "shell"`. A server that does not know the target is asked once more without it and its page is opened. |
| `selection-start` | Remembers the approved domains and returns the address of the selection page. |
| `selection-done` | Binds the domain approved since `selection-start`, or returns the list to ask from. |
| `set-domain` | With `domain: "<slug>"`: binds this session to that domain, stores the slug in the session record and in `.kinitro-ai-domain` and reloads. |
| `test-mode` | With `value: "on"` or `"off"`: refreshes the instructions every 2 minutes instead of daily. |
| `mirror` | With `value: "on"` or `"off"`: switches the chat mirror on or off (default on). See [The chat mirror](#the-chat-mirror). |
| `reload` | Reads the briefing again from kinitro.ai. |
| `arm-test` | The next prompt receives every section once, marked `[TEST]`, including the ones that normally appear only at certain moments. The Compaction instruction is shown too, although it normally goes only to the summarizer. Use it to verify the setup. |
| `invalidate-context` | Renders the first-message context block (persona and working rules) again on the next request. |

## The chat mirror

The plugin sends what you typed, what another agent sent to this session and the main agent's final answer. Automatic notices, sub agent texts, tool calls, thinking and instruction blocks are not sent. From 0.25.9 the text of an automatic prompt (a schedule, `/loop`, a wake-up, a task notification, a system reminder) is not sent (the answer of that turn still is), and a prompt that is the text of a message written in the kinitro.ai chat itself is not sent a second time. The prompts of the running turn are kept in `.kinitro-ai-prompts.json` until the turn ends. It writes them at the end of every turn into the agent's chat in kinitro.ai. It uses the verb `mirror-messaging` (action `append`, platform `claude-code`, the Claude session id and the turn id).

- Which prompt is whose is decided by the engine's `origin.kind`, never by the text: `composer`, `bridge`, `slack-ping` and `sdk` are yours; `peer`, `peer-send-message`, `coordinator`, `projects-relay` and `observer` are another agent's (sent with `promptFrom: "agent"`); every other kind is dropped.
- Tool calls, thinking and injected instruction blocks are not sent. Subagent turns are skipped.
- Each turn is marked with its session. Several sessions of the same agent share one chat.
- Each turn is written to `.kinitro-ai-outbox.json` first and then sent. A failed send is retried at the next prompt and every 60 seconds. Repeating a turn is safe: kinitro.ai answers `alreadyPresent`. The outbox keeps at most 200 entries.
- Turns before a domain is chosen wait in the outbox and are sent after binding.
- Every 60 seconds and at each prompt the plugin fetches new messages from that chat (`mirror-messaging` action `fetch` with a stored cursor). It stores them in `.kinitro-ai-inbox.json` and tells the agent at the next prompt, in the block "New messages in your kinitro.ai chat".
- No protocol document is created or appended any more, and there is no compaction line. Protocol documents written by older versions stay where they are.
- Mirroring is a script call and costs no model tokens.
- **Switch:** `probe` action `mirror` with `value: "off"` stops the mirror: no `mirror-messaging` call at all (no append at the end of a turn, no fetch at a prompt, every 60 seconds or after a session start), and turns are not queued. `value: "on"` resumes from the next turn without backfill: turns left unsent are marked skipped and the inbox cursor is dropped, so messages written in the chat while it was off are not fetched. The default is on; the flag (`mirror`) is kept in `.kinitro-ai-state.json` and survives restarts. `probe status` shows `Chat mirroring: on` or `off`. No tenant or agent setting can require mirroring yet.

## Todo list

Every prompt carries the agent's todo list (the `memory-instruction` set of its agent node) and one push line: `Update your todos now if this turn changed anything: memory-append / memory-instruction-status. Oldest open todo: <n> days.`

- The **full text** comes at the first prompt of a session, after a compaction, after a domain choice, and when the list changed since its last full injection. The plugin keeps a hash of the list and the session id in `.kinitro-ai-state.json` (`todoHash`, `todoSid`); another session in the same folder gets the full text once.
- At every other prompt the list comes in **short form**: one line per todo, its number and the first 160 characters (`TODO_TURN_LINE_CHARS`). Exceptions and questions are cut the same way.
- **Housekeeping** never deletes: when more than 10 todos are open (`TODO_MAX_ITEMS`), a todo is older than 7 days (`TODO_MAX_AGE_DAYS`, from its stamp `dd.MM. HH:mm`) or longer than 400 characters (`TODO_MAX_ITEM_CHARS`), the push line names it, for example `3 todos older than 7 days, 2 over 400 chars: shorten or archive them`. `memory-instruction-status` with `done` or `withdrawn` keeps the full text in the agent's notes.
- An empty list, and a todo set that does not exist, get the push line alone (`No open todos. ...`). A failed read, or one that does not answer within 3 seconds, gets the push line without the count, and the next good read brings the full list.

## Open UI comments

People can comment on a control of a kinitro.ai page: a question or a remark on a grid, a chart or a field. The plugin tells the agent about the open ones.

- At every prompt the plugin calls `list-ui-comments` once, with the session key and `limit: 20` (open comments only). The call runs alongside the todo read and is cut off after 10 seconds. Errors are logged, never shown.
- When comments are open, the prompt gets the block `## Open UI comments (N)`: one line per comment with time, author, page title and code, control id and type, the text (one line, at most 500 characters) and the comment id. A last line asks the agent to read the comment's session state when it needs the user's view, to act within the approved todos or ask, and to answer with `answer-ui-comment`.
- The block is sent only when the set of open comment ids changed since the last time in this session, every 30 minutes as a reminder, and on the first prompt, after a compaction and after choosing a domain. The last set and time are kept in `.kinitro-ai-state.json`.
- `probe` action `comments` checks now; the `probe` status shows `ui comments: N open`.


- Messages sent to the agent inside the kinitro.ai app do not reach an agent running in Claude yet.
- Section-level expiry rules cannot be configured yet. Agents set the expiry per document.
- The compaction threshold is assumed to be 80 %. The checkpoint at 70 % is based on that assumption.
- Prompts and answers longer than 50,000 characters are cut in the chat.
- Mirroring needs the connector. If it is down, the turn waits in the outbox and is sent later.

## Server and tool lookup

From 0.24.0 the plugin works **only with its own bundled server**, `mcp__plugin_kinitro-ai_kinitro_ai__<verb>` (`probe` status: `source: bundled plugin server`). A second kinitro.ai connection in the same Claude session (a `kinitro_ai` server of yours, `mcp__kinitro_ai__<verb>`, the claude.ai connector, `mcp__claude_ai_Kinitro__<verb>`, or any other server with `current-seat` and "kinitro" or "methos" in its name) is not used, and the plugin never adds the session key to its calls. The plugin tells you once per Claude session, in one sentence, that a second connection is present and how to switch it off for this tool (`claude mcp remove kinitro_ai` for a server of your own; for the claude.ai connector in Claude Code switch it off for this tool only: `/mcp`, choose the claude.ai connector, Disable. Leave it connected in the claude.ai settings: the browser, Desktop and mobile need it); the `probe` status lists it as `not used`. Calls the agent makes through such a connection are plain connector calls: kinitro.ai asks them for their own session key.

Claude Code itself decides which servers are connected: a server of yours at the same address as the plugin's is used instead of the plugin's copy (precedence local, project, user, plugin, claude.ai connectors), so the plugin then finds no server of its own until you remove yours.

When no kinitro.ai tool is visible, the `probe` status shows `kinitro.ai tools: none visible (Type /kinitro domain to sign in)`, a failed binding returns the same instruction as `sayToUser` (the command starts the email-code sign-in itself), and the `MISSING (...)` reason begins with it.

**Claude Code cloud sessions do not load plugins**, so the bundled server is not available there. A `kinitro_ai` server in the session configuration or the claude.ai connector works there as a plain connection: the agent calls `open-domain` once and passes the returned session key on every call, as the connector's own texts say.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/kinitro` is not found | Plugin not installed or not active in this session | Run the install command again. Choose user scope. Start a new session. |
| Install fails | `git` missing, github.com not reachable, or an SSH attempt fails | Install `git`; check the network; set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` and retry. |
| `domain: NOT SET` | The connection serves several domains and this session has no slug | Run `probe` with `set-domain` and the slug from `list-domains`. |
| `session_key_required` in the log or in agent calls | A call without a session key (an older plugin, or a second connection) | Update the plugin to 0.24.0 or later (`/kinitro update`). Remove a second kinitro.ai connection. |
| `session: none yet (waiting for the approval of ...)` | The domain needs your approval for this sign-in | Open the approval link the agent showed, approve, then choose the domain again. |
| `briefing: MISSING (... not approved ...)` | The slug is not approved for this connection | Approve the domain for the connector in kinitro.ai, or choose another slug. |
| `briefing: MISSING (... has no agent node ...)` | The domain has no agent node | Add one (provision-domain-agent or the domain page), then choose the domain again. |
| `briefing: MISSING (... has no instructions yet ...)` | Neither the agent node nor its AIAgent carries an `instruction-*` content | Ask your contact to configure the AIAgent's templates or the agent's instructions. Then run `probe` with `reload`. |
| `kinitro.ai tools: none visible`, or `MISSING (no kinitro.ai tools are visible ...)` | The bundled server is not signed in yet | Type `/kinitro domain`: it signs in by email code. Send a new message. |
| (Before 0.25.5) The sign-in in `/mcp` fails with a redirect mismatch or a localhost callback error | Versions before 0.25.5 brought an OAuth server that needs `http://localhost:33418/callback` | Update the plugin to 0.25.5 or later: it signs in by email code and has no localhost callback. |
| `MISSING` with a message about `tool.call` and `mcp.call`, tools are listed | The server is connected but the call fails | The `probe` status shows the tool prefix and source the plugin found; check that server's sign-in. Send a new message. |
| The status shows `not used: ... (a second kinitro.ai connection)` | Your own server or the claude.ai connector is in the session | Switch it off for this tool (`claude mcp remove kinitro_ai` for a server of your own; for the claude.ai connector in Claude Code switch it off for this tool only: `/mcp`, choose the claude.ai connector, Disable. Leave it connected in the claude.ai settings: the browser, Desktop and mobile need it) and sign in to `plugin:kinitro-ai:kinitro_ai` in `/mcp`. |
| Briefing source stays `cache` | Connector was not up in time, or loading keeps failing | Run `probe` with `reload`. Read `kinitro-ai.log`. |
| A section never arrives | Heading missing or misspelled in the briefing document | Use the exact names above. Run `probe` with `arm-test`. |
| Persona does not change after editing in kinitro.ai | The old briefing is cached | Run `probe` with `reload`, then `invalidate-context`. |
| `sign-in path: device` and the band says "a code was sent to ..." | The sign-in by email code waits for your approval | Open **Approve this sign-in** on any device, type the code from the mail on methos.kinitro.ai, then send any message or press **I approved it**. Never type the code in the chat. |
| The band says "The kinitro.ai sign-in ended." | The request expired or was refused, or kinitro.ai no longer knows the session key | Press **Sign in again** (or `/kinitro sign-in`); a new code is mailed. |
| The band says "Too many sign-in requests. Try again in N minutes." | kinitro.ai limits sign-in requests | Wait the minutes shown, then press **Sign in again**. The plugin does not retry by itself. |
| The band says "kinitro.ai sign-in by email code is not available here; type /kinitro domain to sign in." | The device server is not connected in this session (an environment without `/mcp/device`) | Check that the plugin is installed and enabled and that the machine can reach the kinitro.ai address; then type `/kinitro domain` again. |
| Turns do not appear in the agent's chat | The send failed. The `probe` status shows `last error`. | The outbox resends at the next prompt and every 60 seconds. Check the connector and write access to the domain. Read `kinitro-ai.log`. |
| Agent ignores a checkpoint | The agent was not told in time, or the text is unclear | Run `arm-test` and ask the agent to confirm each block. Edit the text in kinitro.ai. |

Still stuck? Send `kinitro-ai.log` and the `probe` status to [support@kinitro.ai](mailto:support@kinitro.ai). Check both for confidential content first.
