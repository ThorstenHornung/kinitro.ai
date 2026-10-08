---
description: Choose or show the kinitro.ai domain of this session (opens the domain selection)
argument-hint: "[domain slug]"
---

The user wants to choose or check the kinitro.ai domain this Claude session works for. Arguments: "$ARGUMENTS"

Do this with as few calls as possible and no commentary between them:

1. **Slug given** (the arguments name a domain slug such as `verum`): bind the session and stop.
   - If the tool `mcp__kinitro-ai__probe` exists, call it with `{"action": "set-domain", "domain": "<slug>"}`.
   - Otherwise write the slug as one line to the file `.kinitro-ai-domain` in the working directory.
   - Answer in one line: "This session works for <domain name> (<slug>)." If binding failed, say why.
2. **No slug given:**
   1. Call `mcp__kinitro_ai__current-seat` (no arguments). It lists the approved domains (`approved`: name, slug) or names the seat-bound domain.
   2. Get the address of the domain selection page: `mcp__kinitro_ai__open-page` with `{"target": "selector", "domainRef": "<current slug, else the first approved slug>"}`.
   3. Open that address for the user: if built-in browser tools (`Claude_Browser`) are present, open it in the browser pane; otherwise show it as a markdown link "Open the kinitro.ai domain selection".
   4. Ask with AskUserQuestion: "Which kinitro.ai domain should this session work for?" One option per approved domain (label = domain name, description = slug; mark the current one), plus the option "I approved another domain - check again". Remember the approved slugs before asking. On that option, call `current-seat` again: if exactly one slug is new, bind it at once without asking again (the user just approved it on the selection page); if none or several are new, ask again with the new list.
   5. Bind the chosen slug as in step 1 and confirm in one line.
3. From now on pass `domainRef: "<slug>"` on every `mcp__kinitro_ai__*` call.
