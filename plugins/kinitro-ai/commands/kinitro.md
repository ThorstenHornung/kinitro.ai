---
description: Choose or show the kinitro.ai domain of this session (opens the domain selection)
argument-hint: "[domain slug]"
---

The user wants to choose or check the kinitro.ai domain this Claude session works for. Arguments: "$ARGUMENTS"

Work in this order, one step at a time, without commentary between calls. The selection page is the only place where the user chooses; never ask in the chat while the page is still the user's task.

1. **Slug given** (the arguments name a domain slug such as `verum`): call `mcp__kinitro-ai__probe` with `{"action": "set-domain", "domain": "<slug>"}` and go to step 4.
2. **No slug: open the selection page.**
   - Call `mcp__kinitro-ai__probe` with `{"action": "selection-start"}`. It remembers the domains approved now and returns `selectorUrl`.
   - Open `selectorUrl` for the user: in the browser pane if built-in browser tools (`Claude_Browser`) are present, otherwise as the markdown link "Open the kinitro.ai domain selection".
   - Then ask with AskUserQuestion, exactly once: "Choose the domain on the kinitro.ai page and press Switch there. Done?" Options: "Done" (description: "I switched on the page"), and one option per already approved domain from the `approved` list (label = name, description = "use <slug> directly").
3. **Bind.**
   - Answer "Done": call `mcp__kinitro-ai__probe` with `{"action": "selection-done"}`. If it returns `bound`, go to step 4. If not, ask once with AskUserQuestion which domain to use (one option per domain in `approved`), then call `set-domain` with that slug.
   - Answer = a domain: call `set-domain` with its slug.
4. **Confirm and open the domain.**
   - Reply in two lines: "This session now works for <domain name> (<slug>), agent <agent>." and "Saved in <files>." If `bound` is null, say why and stop.
   - Open the domain view: `mcp__kinitro_ai__open-page` with `{"domainRef": "<slug>"}` (no node), then open its `url` in the browser pane (or give it as a link).
5. From now on pass `domainRef: "<slug>"` on every `mcp__kinitro_ai__*` call.

If the tool `mcp__kinitro-ai__probe` does not exist, the plugin's hooks are not running in this session: say so in one line, then use `mcp__kinitro_ai__current-seat` and `mcp__kinitro_ai__open-page` (`target: "selector"`) directly, ask which domain with AskUserQuestion, write the slug as one line to `.kinitro-ai-domain` in the working directory, and continue with step 4.
