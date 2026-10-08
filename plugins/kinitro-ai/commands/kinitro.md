---
description: Choose or show the kinitro.ai domain of this session (opens the domain selection)
argument-hint: "[domain slug]"
---

The user wants to choose or check the kinitro.ai domain this Claude session works for. Arguments: "$ARGUMENTS"

Work in this order, without commentary between calls. Ask the user at most once.

1. **Slug given** (the arguments name a domain slug such as `verum`): call `mcp__kinitro-ai__probe` with `{"action": "set-domain", "domain": "<slug>"}` and go to step 4.
2. **No slug:** call `mcp__kinitro-ai__probe` with `{"action": "selection-start"}`. Open the returned `selectorUrl` in the browser pane if built-in browser tools (`Claude_Browser`) are present, otherwise show it as the link "Open the kinitro.ai domain selection". Then ask with AskUserQuestion, exactly once: "Which domain should this session work for?" Options: one per entry in `approved` (label = name, description = "already approved"), plus "Another domain" (description = "choose it on the kinitro.ai page, press Switch, then select this").
3. **Bind:**
   - The user picked an approved domain: call `set-domain` with its slug.
   - The user picked "Another domain": call `mcp__kinitro-ai__probe` with `{"action": "selection-done"}`. It finds what the user switched to on the page. Only if it returns `bound: false`, ask once more which domain, with the current list.
4. **Confirm:** reply with the `sayToUser` sentence only. The plugin has already opened the domain view in the browser pane; if `domainView` says the pane was not reachable, add the link it contains. Never show slugs, node codes, ids, session ids or file paths to the user. If `bound` is false, say in one sentence why.
5. From now on pass `domainRef: "<slug>"` on every `mcp__kinitro_ai__*` call.

If the tool `mcp__kinitro-ai__probe` does not exist, the plugin's hooks are not running in this session: say so in one sentence, then use `mcp__kinitro_ai__current-seat` and `mcp__kinitro_ai__open-page` (`target: "selector"`) directly, ask which domain with AskUserQuestion, write the slug as one line to `.kinitro-ai-domain` in the working directory, and confirm with the domain name.
