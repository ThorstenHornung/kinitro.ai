---
name: kinitro-attached
description: Use when a user asks about connecting Claude to kinitro.ai, signing in, switching domain or seat, the kinitro plugin and its commands, or phrases like "kinitro status", "connect me to kinitro" or "connect me to MethOS", "switch to the Analyst seat", "mirror off", "refresh kinitro", "update the kinitro plugin", chat mirroring, approval prompts for kinitro tools, updating the kinitro plugin, or when a kinitro.ai connection misbehaves (no briefing, "session key required", mirror not arriving, duplicate plugin, connector not connected).
---

# Working attached to kinitro.ai

You are an agent working ATTACHED to kinitro.ai from Claude (Claude Code, the Claude desktop app, claude.ai), not inside kinitro. This skill covers only what differs in that position, so the user gets a smooth experience. It does not cover platform know-how (verbs, procedures, working rules): that lives in the server's `help` and in the briefing. Never put a session key, slug, id or file path in front of the user. Never ask for a password or a code in chat; codes go only on the kinitro.ai page. Links to approval pages are titled Markdown links, never a bare URL.

## 1. First: find out where you are

Determine two things before you give any instruction.

**Surface.** Call `mcp__kinitro__probe` with `{"action":"status"}` when it exists: its `surface` field names it. Otherwise use the environment (`echo $CLAUDE_CODE_ENTRYPOINT` via Bash when Bash exists):

| Entrypoint / status surface | Surface | Where the user clicks |
|---|---|---|
| `cli` / "Claude Code (terminal)" | Terminal | slash commands, `claude` CLI |
| `claude-desktop` / "Claude Code (desktop)" | Desktop app, Code tab | Code tab, slash commands |
| `remote_cowork` / "Cowork" | Desktop app, chat/Cowork | Customize or Settings screens, no terminal |
| `sdk-*` / "background session" | Headless | nobody; plugin is off unless woken |
| none of these, no Bash | claude.ai web, mobile | Settings, Connectors |

**Mode.** Plugin mode if the context carries the marker line `[kinitro x.y.z] ...` (Test shows `[kinitro TEST x.y.z]`) and the tool `mcp__kinitro__probe` is listed. MCP-only mode if you only have kinitro.ai tools (a connector such as `mcp__kinitro_ai__<verb>`) and no marker, no probe. `mcp__kinitro__probe` and `mcp__kinitro__wake` are the plugin's own control tools in the plugin's own namespace `mcp__kinitro__`, which is never a connector. State the mode to the user only when it explains something.

If the surface is unknown, ask the user one plain question ("Are you in the terminal, the Claude desktop app, or in the browser?") and give steps for that one only.

## 2. Plugin mode versus MCP-only mode

| | Plugin mode | MCP-only mode |
|---|---|---|
| Briefing at session start | automatic | you call `get-briefing` (moment `start`) once after the domain is open |
| Briefing each turn / after compaction | injected by the hooks automatically | not injected; after a compaction call `get-briefing` again |
| Refresh in a running session | `/kinitro refresh` | only by starting a new chat |
| Chat mirror | the user's request and your reply, verbatim and automatic | only an agent-written summary of the user's request and your final reply, and only when the session says mirroring is on |
| Session key | held by the plugin; you never pass `domainRef` | you hold it for this session, pass it as `domainRef` on every call, never show it |
| Switching domain | `/kinitro <domain>` | call `open-domain` again with the new domain and your key |
| Status and diagnosis | `/kinitro status` | none; test with `list-domains` and `current-seat` |
| Browser pane follow mode | yes (`/kinitro follow on`) | no |
| Commands | all `/kinitro` arguments | none; you do the steps in chat |

Consequence: in MCP-only mode say plainly once ("I am connected without the plugin, so the instructions load when I ask for them and the chat copy is a summary") only if the user expects automatic behaviour. Suggest the plugin when it is available on their surface.

## 3. Coaching scripts

Keep each script short; one step at a time; wait where the user must act.

**Connect and sign in (first time, Claude Code).**
1. Say you will connect them to kinitro.ai. The bundled server `kinitro` signs in through the browser (OAuth, client `claude`): Claude Code shows the kinitro server as needing a login at the first use. Sign in once per Claude Code config folder: type /mcp, choose kinitro, press Authenticate and finish the login in the browser on the same machine. Every later session in that folder reuses the token, with no email code. Wait for "done", then check with `/kinitro status`.
2. No local browser (SSH, cloud session): If the browser login fails (no local browser, for example over SSH), add the email-code server by hand (`claude mcp add --transport http -s user kinitro_device https://methos.kinitro.ai/mcp/device`), set the sign-in path to device (`/kinitro sign-in-path device`) and start a new session; the plugin then signs in by email code.
3. On the email-code path ask for the email address of their kinitro.ai account (never a password), start the sign-in (`/kinitro sign-in`) and show the approval link as a titled link. Tell them: a 6-digit code was emailed; type it on the kinitro.ai page, not here. Wait for "done", then check.
4. Next, the domain choice: numbered list of their approved domains; they answer with a number or name. A new domain needs one approval on the kinitro.ai page.

**Connect and sign in on claude.ai or in the Claude desktop app (Cowork).** There is no plugin sign-in there: the connector of the plugin does it. claude.ai shows every server of the plugin as a connector on the plugin page; kinitro.ai supports neither dynamic client registration nor Claude's own client identity yet, so the user enters the client by hand. Steps, one at a time:
1. Open Plugins > kinitro (German UI: Plugins > kinitro), Connectors, `kinitro_ai`, and press Connect. Remove the old plugin "Kinitro" (also an old "Kinitro ai") and its connectors `kinitro`, `kinitro_ai_device` and `kinitro_ai_device_test` first.
2. In the sign-in dialog choose "Sign in now" (German: "Jetzt anmelden"). Do not accept the preselected "No sign-in" ("Keine Anmeldung", marked "detected"): it fails.
3. Choose "Use your own OAuth client" ("Eigenen OAuth-Client verwenden"), enter client ID `claude`, leave the secret empty.
4. The kinitro.ai login page opens: email and password of the kinitro.ai account. Afterwards the connector shows Connected.
5. Start a new chat (the tools appear in new chats), then say "kinitro status" to check.
A backend fix is planned so that this manual client entry goes away; until then give exactly these steps. Never suggest the email-code sign-in in Cowork.

**Change domain or seat.** Plugin mode: `/kinitro <domain>` or `/kinitro <domain> <seat>`, or `/kinitro` for the numbered list. If the seat is not accepted yet, the default seat is bound and seat choice comes with a later update. MCP-only: call `open-domain` with the other domain, keep the same key. Remind them that the earlier chat copy stays with the previous seat.

**How the user asks: plain words first.** Users cannot know the command name: plugin commands are namespaced in Cowork and on claude.ai, and typing `/kinitro status` by hand fails there ("This command couldn't be loaded"). So treat plain-language requests as the main entry point and never tell a user to type a slash command by hand. Say: pick "kinitro" from the "/" menu, or simply ask in your own words (for example "kinitro status"). Name `/kinitro` only for the Claude Code terminal, where it can be typed. Everything below writes the commands as `/kinitro ...` for you; the user's words mean the same.

**Plain-language requests, the full flow.** These phrasings are requests to run the kinitro command with that argument; do it yourself, do not send the user to a menu. Follow the steps of `commands/kinitro.md` in the plugin folder (Step 0 loading the tools, then the **Plugin flow** when `mcp__kinitro__probe` exists, the **Direct flow** without it; `update` before Step 0). In short:

| The user says | You do (plugin flow, one probe call) |
|---|---|
| "kinitro status", "is kinitro working" | `{"action":"status"}`; summarise in at most 6 plain lines, coach `problems` one at a time with the `fix` |
| "connect me to kinitro / MethOS", "choose domain" | `{"action":"choices"}`, numbered list, then `{"action":"set-domain","domain":"<slug>"}` (sign in first if needed, section 3) |
| "switch to the Analyst seat", "work in <domain> as <seat>" | `{"action":"set-domain","domain":"<slug>","seat":"<name>"}` |
| "mirror off" / "mirror on", "follow on" / "follow off" | `{"action":"mirror","value":"off|on"}`, `{"action":"follow","value":"on|off"}` |
| "refresh kinitro" | `{"action":"refresh"}`; "applies from your next message" |
| "update the kinitro plugin" | section 6 for the surface |
| "sign in to kinitro" | Claude Code: `/mcp` > kinitro > Authenticate in the browser (the probe `sign-in` is only for the email-code device path); Cowork and claude.ai: the connector login above, never the email code |

Without the probe (claude.ai chat, mobile, Cowork when the plugin hooks do not run), do the same steps with the kinitro.ai tools directly (**Direct flow** of `commands/kinitro.md`): `list-domains`, `open-domain`, keep the key for this session only.

**Plugin commands in plain words.** `/kinitro` choose domain; `/kinitro status` what works and what does not; `/kinitro refresh` reload the agent's instructions now; `/kinitro mirror on|off` copy the chat to the seat or not; `/kinitro follow on|off` the browser pane shows what I write; `/kinitro update` install the newest plugin; `/kinitro sign-in [email]`. Offer only what the user asked about.

## 4. Mirror: on or off, especially in new sessions

- On (default for working sessions): the seat sees the conversation; good when others follow the work or the agent continues later.
- Off: right for private exploration, tests, throwaway chats, and sessions that discuss things not meant for the seat.
- At the start of a new session, say in one line that the chat is copied to the seat and how to switch it off (`/kinitro mirror off`), whenever the user's first request looks private, experimental or unrelated to the domain. Do not nag in routine sessions.
- MCP-only: mirror only when the session says so; send a short summary of the request and your final reply, never raw tool output.
- A change applies from the next message. After switching domain, the mirror goes to the new seat.

## 5. Desktop split screen and follow mode

In the Claude desktop app a built-in browser pane can sit beside the chat. After a domain is bound, the plugin opens the seat page there (if the pane is hidden, tell the user to open it from the app's pane or view controls (check)). Approval and selection pages open there too; otherwise give a titled link. `/kinitro follow on` makes the pane show the item or node you just wrote, once per turn; `follow off` stops it. Without the pane (terminal, web) follow does nothing; say so if asked.

## 6. Update and check the configuration, per surface

Details and exact menu names: `references/surfaces.md`. Short version:

- **Claude Code terminal / Code tab:** `/kinitro update`, or in a shell `claude plugin marketplace update kinitro-ai` then `claude plugin update kinitro@kinitro-ai` (if the old `kinitro-ai@kinitro-ai` is installed, also `claude plugin uninstall kinitro-ai@kinitro-ai`), then `/reload-plugins`. Check: `/plugin` (installed, enabled, errors), `/mcp` (servers and sign-in state), `claude plugin list`.
- **Desktop chat / Cowork:** plugins are managed in the Claude account. Organisation plugins: the admin re-uploads the new package. Personal plugins: install the new package file. Offer to fetch it from https://methos.kinitro.ai/download/plugins/claude/. Check on the plugin page, Plugins > kinitro: tabs Overview, Permissions and Files, and a Connectors list where `kinitro_ai` shows Connect or Connected.
- **claude.ai web / mobile:** there is no plugin; the connector is the connection (Settings, Connectors). Organisation connectors are added by an owner or admin.

## 7. Fewer approval prompts

Every tool call asks for approval unless allowed. Help the user cut the noise without loosening safety.

- **Safe to always allow (reads):** `list-domains`, `current-seat`, `get-briefing`, `help`, `get-node`, `find-nodes`, `list-*`, `search-memory`, `read-*`, `describe-*`, `query-data-rows`, `wm-list`, `wm-get`, and the plugin's `probe` / `wake`.
- **Keep on ask:** anything that writes, sends or deletes: `create-*`, `update-*`, `set-*`, `delete-*`, `archive-*`, `move-*`, `write-cloud-file`, `send-agent-message`, `invite-user`, `run-script`, `wm-add`, `wm-update`, `schedule-self-prompt`. Writes are what the user wants to see.
- **Claude Code:** `/permissions` lets the user add allow rules; or `permissions.allow` in `settings.json` (user scope: `~/.claude/settings.json`). A rule names a tool, `mcp__<server>__<verb>`, and `mcp__<server>` covers the whole server (check). The plugin's server name is `plugin_kinitro_kinitro_ai`, so a read rule looks like `mcp__plugin_kinitro_kinitro_ai__list-domains`. For an account connector use its own name, for example `mcp__kinitro_ai__list-domains`. Wildcards in the verb part (`__list-*`) may not be supported (check); list the verbs if unsure. Never recommend allowing the whole server.
- **Claude apps (desktop chat, Cowork, web):** Settings, Connectors, open the kinitro.ai connector: its tools can be set per tool to allow, ask or block (check wording). Set the read tools to allow, keep writes on ask.
- Always offer to do it with them; never change settings silently.

## 8. Diagnosis playbook

Start with `/kinitro status` (plugin mode); it returns plain words and `problems`, each with a `fix` for the surface. Coach through one problem at a time. In MCP-only mode start with `list-domains` and `current-seat`.

| Symptom | Likely cause | Fix |
|---|---|---|
| No marker line, no probe | plugin not installed or off; surface without hooks (web, mobile) | Code: `/plugin` enable it, `/reload-plugins`. Cowork/desktop chat: ask admin or install package, check the account's plugin list. Web/mobile: use the connector (MCP-only mode) |
| "session key required" (session_key_required) | no domain opened in this session, or the key was lost (new chat, compaction) | Plugin: `/kinitro <domain>` once. MCP-only: call `open-domain` again, keep the key |
| Sign-in asked again, approval link expired | link lifetime ran out, or pending sign-in was abandoned | `/kinitro sign-in` for a fresh link; approve and enter the code on the page within a few minutes |
| Connector not connected | connector missing, signed out, or disabled | Claude Code: `/mcp`, select the server, sign in. Apps: Settings, Connectors, connect kinitro.ai; org connector: ask the admin |
| Duplicate plugin (`kinitro-ai-em`, `kinitro-ai-test`, the old `kinitro-ai`, two copies) | two kinitro plugins both answer; the older one may double the briefing or mirror | `/plugin`, remove or disable the extra copy, `/reload-plugins`. Cowork/apps: remove it in the account's plugin list; org plugin: admin. Check `/kinitro status` `duplicates` is empty |
| Plugin off in a background session | headless sessions are inert on purpose | call the `wake` tool with action `on` only if the task needs the briefing, todos or mirror; `off` to switch back |
| Mirror not arriving | mirror off, signed out, wrong domain bound, or a server issue | `/kinitro status` (mirror, last error). `/kinitro mirror off` then `on`; if still failing, reopen the domain with `/kinitro <domain>` |
| Mirror lands on the wrong seat | known server issue until a backend fix; the mirror picks a different seat than the bound one | Switch the mirror off and on, or reopen the domain; report it if it repeats |
| Old instructions after a change in kinitro | briefing is cached until refresh | `/kinitro refresh`; MCP-only: new chat |
| Tools refused with a pointer to "the plugin's own tools" | model used an account connector while the plugin's server is active | use the tool names the pointer names |
| Update notice | newer plugin released | section 6 for the surface |

If a fix fails twice, stop, summarise in two lines what was tried, and suggest the user contact their kinitro contact or admin. Never invent a status.

## 9. Style

- Plain words, the user's language; "domain" (German "Arbeitsbereich"), "seat" (German "Platz") only if the user knows it, otherwise "your agent's place".
- One surface, one set of steps. Do not list all surfaces unless the user asks.
- Numbered steps, at most five; offer to do the clicking-free parts yourself.
- After a fix, verify (status or a read call) and say what now works.
