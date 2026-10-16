# Changelog

All notable changes to the `kinitro-ai` plugin are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.23.1] - 2026-10-16

### Changed
- The todo list no longer comes in full at every prompt (about 3,000 tokens per prompt on a 12,000-character list). Every prompt gets a short list, one line per todo with its number and the first 160 characters, and a push line: "Update your todos now if this turn changed anything: memory-append / memory-instruction-status. Oldest open todo: <n> days." The full text comes at the first prompt, after a compaction, after a domain choice and when the list changed since its last full injection (hash and session id in `.kinitro-ai-state.json`). Measured on a 12,038-character list of 24 todos: 12,441 characters before, 4,557 after.
- Housekeeping without deleting: the push line names todos older than 7 days, more than 10 open todos and todos over 400 characters, and asks to shorten or archive them. The limits are constants at the top of `hooks/register.tsx`.
- After a compaction Persona and Working rules are injected again together with After compaction (review of the agent 101 draft).
- Context nearly full is injected once per compaction cycle, at the first threshold (70 %); at 75 % and 80 % only a one-line reminder follows.
- At the first turn and after a compaction the last 5 turns of the agent's chat come with the start package (`read-chat-tail` with `count` 10; who, time, text; each message cut at 600 characters, the block at about 6,000), ending with "Earlier turns: read-chat-tail (more turns) if the context needs it." No chat or a failed read: skipped and logged (PO 2026-10-16).

### Tests
- `tests/todo-housekeeping.test.ts`: parsing, short form, push line with counts, stamps without a year, every todo text kept in the full block, and through `prompt.submit`: full at the first turn, short while the list stays, full after a change and after a compaction, the hash persisted and read after a restart, the push line on an empty list; Persona and Working rules after a compaction; Context nearly full once per cycle; the chat tail at the first turn and after a compaction, not on other turns, with its caps, and a failed read skipped and logged.

## [0.23.0] - 2026-10-14

### Changed
- The chat mirror sends only what the person typed, what another agent sent to the session and the main agent's final answer (item 4.2.1-3536, part 2). The plugin decides by the engine's `origin.kind` of each prompt, never by its text: `composer`, `bridge`, `slack-ping` and `sdk` are the person's; `peer`, `peer-send-message`, `coordinator`, `projects-relay` and `observer` are another agent's and are sent with `promptFrom: "agent"`; every other kind (task notifications, scheduled triggers, automatic follow-ups, plugin texts, unclassified, and any kind not known) is dropped.
- A notice that arrives in a running turn no longer replaces the typed prompt. Prompts of a sub agent are never kept, sub agent turns stay skipped, and no hook reads tool calls.
- Several prompts in one turn are sent in their order; the answer stands on the last one. A turn that only a notice started sends the answer alone.
- An engine that gives no `origin` is served as by 0.22.0 (every prompt is the person's); the log line of each prompt names the kind and the class, never the text.
- Needs the server of item 4.2.1-3536 part 1 (the verb argument `promptFrom`); an older server would store another agent's prompt as the person's.

### Tests
- `tests/chat-mirror.test.ts`: `classifyOrigin` for all 16 kinds, unknown kind, no kind; `planTurn` for notices, tool-call turns, another agent's message, two prompts in one turn; `turn.complete` of a sub agent queues nothing and a main agent turn without prompt sends the answer alone. The `prompt.submit` handler runs through the test kit with an `origin` and an `agentId` (a terminal handler registered on `prompt.submit`): a typed prompt followed by a notice in one turn, a turn that holds only a notice, a prompt from another agent, a sub agent prompt and a prompt with no origin, and the log carrying kind and class but never the prompt text.

## [0.22.0] - 2026-10-11

### Changed
- The domain view opens the shell of the bound domain. After binding (and on the `probe` action `open-domain`) the plugin calls `open-page` with `target: "shell"` and opens the address it gets in the browser pane. The address is `<server>/?domain=<code>&link=<payload>`: the same page as for a person in the browser, but a session started from the link shows the domain's own pages and no Chat tab, and the navigation holds only the domain and what lies under it down to the next domain.
- A server that does not know the shell target answers `page_link_bad_target`. The plugin then asks once more with `open-page` without a target and opens that page, as 0.21.0 did. Any other error is reported and not repeated.

### Tests
- `tests/domain-shell.test.ts`: the call carries `target: "shell"` and the bound domain; the fallback after `page_link_bad_target` happens once; any other error is not repeated.
- `tests/world.ts` folds the drive letter and backslashes the Windows host puts on paths, so the domain tests run on Windows too (`domain-running` and `domain-restart` were red there); a world can answer a verb itself (`verbs`) and records every call with its arguments (`sent`).

### Notes
- Needs the kinitro.ai server release that knows `open-page` target `shell` (item 4.2.1-3485). Before that release the plugin works through the fallback.

## [0.21.0] - 2026-10-11

### Added
- The plugin brings the kinitro.ai MCP server: `.mcp.json` declares the HTTP server `kinitro_ai` at `https://methos.kinitro.ai/mcp` (OAuth client `claude-code`, callback port 33418). A new user installs only the plugin and signs in once: `/mcp` → `plugin:kinitro-ai:kinitro_ai` → Authenticate. The separate connector step is gone.
- The tools of the bundled server are `mcp__plugin_kinitro-ai_kinitro_ai__<verb>`. The plugin prefers them; a `kinitro_ai` user server, the claude.ai connector (`mcp__claude_ai_Kinitro__`) and any other kinitro/methos server still work as fallbacks. A fallback is looked at again after 60 seconds, so the bundled server is taken as soon as it is signed in.
- The `probe` status names the source: `source: bundled plugin server`, `user server`, `claude.ai connector` or `other server`. When no kinitro.ai tool is visible it says `none visible (Open /mcp, choose plugin:kinitro-ai:kinitro_ai and Authenticate)`; the failed-binding answer carries the same text as `sayToUser`, and the `MISSING (...)` reason begins with it.
- Tests: `claude plugin test plugins/kinitro-ai` covers the preference order (bundled, user server, connector, other, none) and a session that goes from nothing visible to the connector to the bundled server.

### Changed
- `/kinitro` no longer names a fixed server: it speaks of "the kinitro.ai tools" (`mcp__plugin_kinitro-ai_kinitro_ai__<verb>`, `mcp__kinitro_ai__<verb>` or `mcp__claude_ai_Kinitro__<verb>`) and loads all three names in its ToolSearch line.
- Docs: getting started (install, then sign in once), plugin reference (server and tool lookup, troubleshooting), README, security and partner pages.

### Notes
- Prerequisite on the kinitro.ai server: Claude Code sends the redirect as `http://localhost:33418/callback` in current builds; the server must accept it for the client `claude-code` (today it registers `http://127.0.0.1:33418/callback`). Otherwise the sign-in fails with a redirect mismatch.
- Whether Claude Code honours the `oauth` keys for a plugin's server is not confirmed; they are kept.
- Claude Code cloud sessions do not load plugins.

## [0.20.0] - 2026-10-09

### Added
- Open UI comments: at every prompt the plugin calls `list-ui-comments` (bound domain, at most 20, open only, 10 s timeout, run alongside the todo read, silent on error). When comments are open, the agent gets the block "Open UI comments (N)" with one line per comment and how to answer it (`answer-ui-comment`).
- The block is sent only when the set of open comments changed in this session, every 30 minutes as a reminder, and on the first prompt, after a compaction and after choosing a domain.
- `probe` action `comments` checks now and returns the open comments with the check time. The `probe` status shows `ui comments: N open`.
- Plugin tests (`claude plugin test plugins/kinitro-ai`): block format, dedupe rule, the `comments` action and the timeout.

### Fixed
- The domain belongs to the session, not to the current folder. A `cd` in the main session moved the working directory, the hook process restarted there, read that folder's `.kinitro-ai-domain` and bound the running session to another domain. Each session now has a record in `~/.kinitro-ai/sessions/<session id>.json` with its home folder (the project root at its first start) and its domain. The folder default is used only for a session without a domain. A changed working folder is logged and never changes the binding.
- All local files (log, briefing cache, state, outbox, inbox, selection snapshot, folder default) are read and written in the session's home folder, never in the current working directory. The `/kinitro` fallback's `.kinitro-ai-pending` is looked for in both.
- The `probe` status shows the session home and the record. Tests: a session bound to A stays A after its folder changes to one with default B (running and after a restart); a new session in folder B gets B.

## [0.19.0] - 2026-10-08

### Changed
- The per-session protocol document is replaced by a chat mirror (kinitro.ai item 3413). At the end of each turn the plugin writes your prompt and the agent's final answer into the agent's chat in kinitro.ai. Tool calls, thinking and injected instruction blocks are not sent. Subagent turns are skipped.
- Each turn is marked with its session, so several sessions of the same agent share one chat. Turns are written to `.kinitro-ai-outbox.json` first and then sent. A failed send is retried at the next prompt and every 60 seconds. Repeating a turn is safe. The outbox keeps at most 200 entries.
- Every 60 seconds and at each prompt the plugin fetches new messages from the agent's chat, stores them in `.kinitro-ai-inbox.json` and tells the agent about them at the next prompt.
- No protocol document is created or appended any more, and there is no compaction line. Protocol documents written by older versions stay where they are. Texts longer than 50,000 characters are cut.
- The `probe` status shows the chat mirror: turns sent, already present, agent, last error, new inbox messages and last fetch. Turns before a domain is chosen wait in the outbox and are sent after binding.

## [0.18.0] - 2026-10-08

### Changed
- The plugin finds the kinitro.ai tools under whatever server name the session has: `kinitro_ai`, `claude_ai_Kinitro` (claude.ai connector inside Claude Code) or a name of your choice. Before, only `kinitro_ai` worked, and Claude Code with the claude.ai connector showed "briefing MISSING".
- The `probe` status names the tool prefix it uses.

## [0.17.4] - 2026-10-08

### Fixed
- `/kinitro` on the very first message of a new session: the plugin may still be starting, so the agent binds the domain by hand. The plugin now finishes that binding at the next message (persona, session start, domain view in the browser pane).

## [0.17.3] - 2026-10-08

### Fixed
- After choosing a domain, persona and working rules now always travel with the next prompt. The plugin no longer asks the Claude app to re-render its start block: the app does not deliver it mid-conversation, and the plugin then took the persona as delivered.

## [0.17.2] - 2026-10-08

### Fixed
- When the plugin restarted while the kinitro.ai connector was still connecting, it kept its local copy of the instructions until the daily refresh. It now loads fresh at the next prompt.

## [0.17.1] - 2026-10-08

### Added
- Shared-agent warning: at session start and after choosing a domain, the agent learns which other Claude sessions worked with the same agent today. Their todos, notes and memory are shared by design; the agent checks a todo's state before acting on one it did not start, and tells the user once.

## [0.17.0] - 2026-10-08

Fixes from the instruction and mirroring test (plan 4.2.2.7.15).

### Fixed
- After choosing a domain, the next prompt carries the full start package: persona, working rules, session start, notes and memory topics. Before, they arrived only at the next compaction.
- Persona and working rules are injected whenever the agent does not hold the current ones (domain switch, changed instructions, an outdated start block).
- A missing instruction type no longer pulls in another instruction: the plugin checks the content type of every row it reads.

### Added
- Instructions refresh from kinitro.ai at session start and then daily. `/kinitro refresh` refreshes on request; `/kinitro test` refreshes every 2 minutes for testing, `/kinitro test off` returns to daily.
- `/kinitro status`.

## [0.16.2] - 2026-10-08

### Changed
- `/kinitro` speaks of the "domain" (German: "Arbeitsbereich"), never of a slug; `/kinitro <domain>` also accepts the domain's name.

## [0.16.1] - 2026-10-08

### Fixed
- `/kinitro` loads the plugin's tool first (it may be deferred). Before, the agent sometimes took the plugin for inactive and showed a link that opened the external browser. The fallback now also opens the internal browser pane.

## [0.16.0] - 2026-10-08

### Changed
- `/kinitro` asks first: an approved domain is bound at once, without the selection page. Only "Approve another domain" opens the kinitro.ai selection page; a second question asks you to confirm your choice there.
- The plugin opens the selection page and the domain view in the browser pane itself (new `probe` action `choices`).

## [0.15.0] - 2026-10-08

### Changed
- `/kinitro` asks once: an approved domain directly, or "Another domain" after choosing it on the kinitro.ai page. The domain you switched to on the page is read from the page, so you are not asked again.
- The plugin opens the domain view in the browser pane itself after binding (new `probe` action `open-domain`).
- The confirmation names the domain and the agent only: no codes, ids or paths.
- The session's domain is also held by the host, so it survives a changed working folder.

## [0.13.0] - 2026-10-08

### Changed
- `/kinitro` runs one step at a time: it opens the kinitro.ai domain selection, waits until you press **Done** in the chat (or pick an already approved domain there), binds the newly approved domain, confirms the domain, agent and saved files, and opens the domain view.
- New `probe` actions `selection-start` and `selection-done`; `set-domain` returns the bound domain, agent and files.

## [0.12.0] - 2026-10-08

### Changed
- `/kinitro` is now a command file, so the Claude app lists it. It opens the kinitro.ai domain selection, asks which approved domain to use, binds the session and records the slug; `/kinitro <slug>` binds directly. A domain approved on the selection page is bound at once after "check again".
- The status moved to the `probe` tool (action `status`).

## [0.11.0] - 2026-10-08

### Added
- Domain row above the prompt (terminal and desktop Code tab): shows the session's domain with **Change domain**; without a domain it offers one button per approved domain, **Refresh list** and a link to the kinitro.ai domain selection page.
- Without a drawing surface (for example a cloud session in the Claude app), the agent asks for the domain in the chat with selection buttons and binds the session itself.
- The slug is stored per session (`.kinitro-ai-domain.<session id>`) and as the folder default (`.kinitro-ai-domain`), so parallel sessions in one folder keep their own domain.

## [0.10.0] - 2026-10-08

### Added
- Multi-domain connections: one kinitro.ai connection can serve several domains. Each session names its domain by slug (`probe` action `set-domain`, stored in `.kinitro-ai-domain`), and every kinitro.ai call of the plugin passes `domainRef`.
- `/kinitro` shows the domain slug; the marker line reminds the agent to pass `domainRef`.

### Fixed
- When no domain is set, the plugin stops retrying instead of calling kinitro.ai every 3 seconds.

## [0.9.0] - 2026-10-06

### Added
- Working memory in front of the agent: the agent's todo list (user-approved work in progress) is read fresh and shown on every prompt; its notes and a map of its memory topics are shown at session start and after a compaction.

## [0.8.0] - 2026-10-06

First public package, with a marketplace for installation in Claude Code.

### Added
- Marketplace entry, so the plugin installs with `/plugin marketplace add ThorstenHornung/kinitro.ai` and `/plugin install kinitro-ai@kinitro-ai`.
- Documentation in `docs/`.

### Changed
- Domain and agent are resolved from the seat, not hard-wired.
- Two instruction layers: the general briefing behind the domain's `general-procedures` edge, plus the agent's own instructions.
- A protocol section per domain holds the mirrored sessions.
- All texts are in English.

## [0.7.0] - 2026-10-06

### Changed
- Renamed from the internal prototype to `kinitro-ai`.

## [0.6.0] - 2026-10-05

### Changed
- Nodes are addressed by stable IDs.

## [0.5.0] - 2026-10-05

### Changed
- The persona comes from the agent node.

## [0.1.0 to 0.4.x] - 2026-10-05

Prototype.

### Added
- Start briefing.
- Every-turn reminder.
- Context-fill checkpoint.
- Compaction instruction.
- Turn mirror.
