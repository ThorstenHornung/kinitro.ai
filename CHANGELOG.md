# Changelog

All notable changes to the `kinitro-ai` plugin are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.20.0] - 2026-10-09

### Added
- Open UI comments: at every prompt the plugin calls `list-ui-comments` (bound domain, at most 20, open only, 3 s timeout, silent on error). When comments are open, the agent gets the block "Open UI comments (N)" with one line per comment and how to answer it (`answer-ui-comment`).
- The block is sent only when the set of open comments changed in this session, every 30 minutes as a reminder, and on the first prompt, after a compaction and after choosing a domain.
- `probe` action `comments` checks now and returns the open comments with the check time. The `probe` status shows `ui comments: N open`.
- Plugin tests (`claude plugin test plugins/kinitro-ai`): block format, dedupe rule, the `comments` action and the timeout.

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
