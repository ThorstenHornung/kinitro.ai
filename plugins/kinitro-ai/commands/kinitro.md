---
description: Choose or show the kinitro.ai domain of this session (opens the domain selection)
argument-hint: "[domain slug]"
---

The user wants to choose the kinitro.ai domain this Claude session works for. Arguments: "$ARGUMENTS"

Work in this order, without commentary between calls. The plugin stores the choice and opens pages in the browser pane (the internal browser) itself.

0. **Load the tools first.** The plugin's tool may be deferred. Call ToolSearch once with `{"query": "select:mcp__kinitro-ai__probe,mcp__remote-devices__Claude_Browser__preview_start,mcp__Claude_Browser__preview_start", "max_results": 3}`. Use the fallback at the end only if `mcp__kinitro-ai__probe` is not returned.

1. **Slug given** (the arguments name a domain slug such as `verum`): call `mcp__kinitro-ai__probe` with `{"action": "set-domain", "domain": "<slug>"}` and go to step 4.
2. **Ask which domain.** Call `mcp__kinitro-ai__probe` with `{"action": "choices"}`. Ask with AskUserQuestion: "Which domain should this session work for?" Options: one per entry in `approved` (label = name; description = "current" for the `current` one, else "approved"), plus "Approve another domain" (description = "opens the kinitro.ai domain selection").
   - An approved domain: call `set-domain` with its slug and go to step 4.
3. **Approve another domain.**
   - Call `mcp__kinitro-ai__probe` with `{"action": "selection-start"}`. The plugin opens the selection page in the browser pane. If it returns a `selectorUrl` instead, show it as the link "Open the kinitro.ai domain selection".
   - Ask with AskUserQuestion: "Choose the domain on the kinitro.ai page and press Switch. Then confirm here." Options: "Confirm my choice" (description = "use the domain I switched to") and "Cancel".
   - "Confirm my choice": call `mcp__kinitro-ai__probe` with `{"action": "selection-done"}`. Only if it returns `bound: false`, ask once which approved domain to use and call `set-domain`.
   - "Cancel": reply "No domain changed." and stop.
4. **Confirm:** reply with the `sayToUser` sentence only. The plugin has opened the domain view in the browser pane; if `domainView` says the pane was not reachable, add the link it contains. Never show slugs, node codes, ids, session ids or file paths. If `bound` is false, say in one sentence why.
5. From now on pass `domainRef: "<slug>"` on every `mcp__kinitro_ai__*` call.

**Fallback** (ToolSearch did not return `mcp__kinitro-ai__probe`): do the same steps by hand, without mentioning hooks. Ask with `mcp__kinitro_ai__current-seat` (approved domains) as in step 2. For another domain, get the page with `mcp__kinitro_ai__open-page` (`{"target": "selector", "domainRef": "<any approved slug>"}`) and open its `url` in the internal browser with the `Claude_Browser` `preview_start` tool found in step 0; give a link only if no browser tool was found. Store the chosen slug as one line in `.kinitro-ai-domain` in the working directory, open the domain view the same way (`open-page` with `{"domainRef": "<slug>"}`), and confirm with the domain name.
