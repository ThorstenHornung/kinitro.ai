---
description: Choose the kinitro.ai domain this session works in
argument-hint: "[domain | refresh | test | test off | status]"
---

The user wants to choose the kinitro.ai domain this Claude session works for. Arguments: "$ARGUMENTS"

Talk to the user in their language and call it "domain" (German: "Arbeitsbereich"); never say "slug".

Work in this order, without commentary between calls. The plugin stores the choice and opens pages in the browser pane (the internal browser) itself.

0. **Load the tools first.** The plugin's tool may be deferred. Call ToolSearch once with `{"query": "select:mcp__kinitro-ai__probe,mcp__remote-devices__Claude_Browser__preview_start,mcp__Claude_Browser__preview_start", "max_results": 3}`. Use the fallback at the end only if `mcp__kinitro-ai__probe` is not returned.

**Other arguments first:** `refresh` → call `mcp__kinitro-ai__probe` with `{"action": "reload"}` and answer "Instructions refreshed from kinitro.ai." · `test` → `{"action": "test-mode", "value": "on"}`, answer "Test mode on: instructions refresh every 2 minutes." · `test off` → `{"action": "test-mode", "value": "off"}`, answer "Test mode off: instructions refresh daily." · `status` → `{"action": "status"}`, summarise in three lines (domain, instructions loaded at, refresh mode) without codes or ids. Then stop.

1. **Domain given** (the arguments name a domain, by slug such as `verum` or by name; match it against `choices` if it is a name): call `mcp__kinitro-ai__probe` with `{"action": "set-domain", "domain": "<slug>"}` and go to step 4.
2. **Ask which domain.** Call `mcp__kinitro-ai__probe` with `{"action": "choices"}`. Ask with AskUserQuestion: "Which domain should this session work for?" Options: one per entry in `approved` (label = name; description = "current" for the `current` one, else "approved"), plus "Approve another domain" (description = "opens the kinitro.ai domain selection").
   - An approved domain: call `set-domain` with its slug and go to step 4.
3. **Approve another domain.**
   - Call `mcp__kinitro-ai__probe` with `{"action": "selection-start"}`. The plugin opens the selection page in the browser pane. If it returns a `selectorUrl` instead, show it as the link "Open the kinitro.ai domain selection".
   - Ask with AskUserQuestion: "Choose the domain on the kinitro.ai page and press Switch. Then confirm here." Options: "Confirm my choice" (description = "use the domain I switched to") and "Cancel".
   - "Confirm my choice": call `mcp__kinitro-ai__probe` with `{"action": "selection-done"}`. Only if it returns `bound: false`, ask once which approved domain to use and call `set-domain`.
   - "Cancel": reply "No domain changed." and stop.
4. **Confirm:** reply with the `sayToUser` sentence only. The plugin has opened the domain view in the browser pane; if `domainView` says the pane was not reachable, add the link it contains. Never show slugs, node codes, ids, session ids or file paths. If `bound` is false, say in one sentence why.
5. From now on pass `domainRef: "<slug>"` on every `mcp__kinitro_ai__*` call.

**Fallback** (ToolSearch did not return `mcp__kinitro-ai__probe`; this happens on the first message of a new session while the plugin is still starting): do the same steps by hand, without mentioning hooks. Ask with `mcp__kinitro_ai__current-seat` (approved domains) as in step 2. For another domain, get the page with `mcp__kinitro_ai__open-page` (`{"target": "selector", "domainRef": "<any approved slug>"}`) and open its `url` in the internal browser with the `Claude_Browser` `preview_start` tool found in step 0; give a link only if no browser tool was found. Store the chosen slug as one line in `.kinitro-ai-domain` and in `.kinitro-ai-pending` in the working directory (the plugin finishes the binding at the next message: persona, session start, domain view), open the domain view the same way (`open-page` with `{"domainRef": "<slug>"}`), and confirm with the domain name.
