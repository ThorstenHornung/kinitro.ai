---
description: Choose the kinitro.ai domain this session works in
argument-hint: "[domain | refresh | test | test off | status | update]"
allowed-tools: Bash(claude plugin marketplace update kinitro-ai) Bash(claude plugin update kinitro-ai@kinitro-ai)
---

The user wants to choose the kinitro.ai domain this Claude session works for. Arguments: "$ARGUMENTS"

The kinitro.ai tools are the plugin's own: `mcp__plugin_kinitro-ai_kinitro_ai__<verb>`. Below, "the kinitro.ai tools" and `<verb>` mean these; the plugin's own `mcp__kinitro-ai__probe` is a different tool and keeps its name. Never use another kinitro.ai connection (`mcp__kinitro_ai__<verb>`, `mcp__claude_ai_Kinitro__<verb>`) for this command: the plugin works only with its own. If the plugin's kinitro.ai tools are not available, tell the user: "Open /mcp, choose plugin:kinitro-ai:kinitro_ai and Authenticate", then stop.

Talk to the user in their language and call it "domain" (German: "Arbeitsbereich"); never say "slug".

**`update`** (the arguments are `update`): do not load or call any kinitro.ai tool. Run these two commands with the Bash tool, one after the other, exactly as written: `claude plugin marketplace update kinitro-ai`, then `claude plugin update kinitro-ai@kinitro-ai`. If the first one fails, do not run the second. Then answer in the user's language: the version the second command reports (or that kinitro-ai is already up to date), and "Run /reload-plugins to load the new version in this session." If a command fails, quote its error in one line and add: "In Cowork or the Claude desktop app, re-upload the plugin from https://methos.kinitro.ai/download/plugins/claude/." Then stop.

Work in this order, without commentary between calls. The plugin stores the choice and opens pages in the browser pane (the internal browser) itself.

0. **Load the tools first.** The plugin's tool may be deferred. Call ToolSearch once with `{"query": "select:mcp__kinitro-ai__probe,mcp__plugin_kinitro-ai_kinitro_ai__current-seat,mcp__remote-devices__Claude_Browser__preview_start,mcp__Claude_Browser__preview_start", "max_results": 4}`. Use the fallback at the end only if `mcp__kinitro-ai__probe` is not returned. (ToolSearch needs to find only the names that exist; the others are simply not returned.)

**Other arguments first:** `refresh` → call `mcp__kinitro-ai__probe` with `{"action": "reload"}` and answer "Instructions refreshed from kinitro.ai." · `test` → `{"action": "test-mode", "value": "on"}`, answer "Test mode on: instructions refresh every 2 minutes." · `test off` → `{"action": "test-mode", "value": "off"}`, answer "Test mode off: instructions refresh daily." · `status` → `{"action": "status"}`, summarise in three lines (domain, instructions loaded at, refresh mode) without codes or ids. Then stop.

1. **Domain given** (the arguments name a domain, by slug such as `verum` or by name; match it against `choices` if it is a name): call `mcp__kinitro-ai__probe` with `{"action": "set-domain", "domain": "<slug>"}` and go to step 4.
2. **Ask which domain.** Call `mcp__kinitro-ai__probe` with `{"action": "choices"}`. Ask with AskUserQuestion: "Which domain should this session work for?" Options: one per entry in `approved` (label = name; description = "current" for the `current` one, else "approved"), plus "Approve another domain" (description = "opens the kinitro.ai domain selection").
   - An approved domain: call `set-domain` with its slug and go to step 4.
3. **Approve another domain.**
   - Call `mcp__kinitro-ai__probe` with `{"action": "selection-start"}`. The plugin opens the selection page in the browser pane. If it returns a `selectorUrl` instead, show it as the link "Open the kinitro.ai domain selection".
   - Ask with AskUserQuestion: "Choose the domain on the kinitro.ai page and press Switch. Then confirm here." Options: "Confirm my choice" (description = "use the domain I switched to") and "Cancel".
   - "Confirm my choice": call `mcp__kinitro-ai__probe` with `{"action": "selection-done"}`. Only if it returns `bound: false`, ask once which approved domain to use and call `set-domain`.
   - "Cancel": reply "No domain changed." and stop.
4. **Confirm:** reply with the `sayToUser` sentence, then offer in one sentence to open the domain in the built-in browser, with the readable link in `domainView` (the plugin gives it without the `link=` part; never add that part yourself). Open it only if the user says yes: `mcp__kinitro-ai__probe` with `{"action": "open-domain"}`. Never show slugs, node codes, ids, session ids or file paths. If `bound` is false, say the `sayToUser` sentence if there is one, else one sentence why.
5. Never pass `domainRef` yourself: the plugin keeps this session's key and passes it on every call of the kinitro.ai tools. Never ask for, show or repeat a session key. To work in another domain, run this command again; the domain is added to the same session.

**Fallback** (ToolSearch did not return `mcp__kinitro-ai__probe`; this happens on the first message of a new session while the plugin is still starting): do not call `open-domain`, `open-page` or any other kinitro.ai tool with a domain yourself; the session key is the plugin's to obtain. Ask with the kinitro.ai tool `current-seat` (approved domains) as in step 2; if the user's domain is not listed, say it is approved at the next message. Store the chosen slug as one line in `.kinitro-ai-domain` and in `.kinitro-ai-pending` in the working directory (the plugin opens the session at the next message: persona, session start, domain view offer), and confirm with the domain name; the plugin offers the domain view at the next message.
