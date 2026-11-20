# Surfaces: update and check the kinitro.ai setup

Anything marked (check) was not verified against the current product and may differ; say so to the user if it matters. Menu names are the English ones; the German ones are in brackets once.

## Claude Code (terminal) and the Code tab of the desktop app

| Task | How |
|---|---|
| See installed plugins, errors, enable or disable | `/plugin` (tabs for installed, marketplaces, errors) (check tab names) |
| See MCP servers, sign in, reconnect | `/mcp` |
| Load plugin changes without restart | `/reload-plugins` |
| Update the kinitro plugin | `/kinitro update`, or shell: `claude plugin marketplace update kinitro-ai` then `claude plugin update kinitro@kinitro-ai` (and `claude plugin uninstall kinitro-ai@kinitro-ai` if the old plugin is installed) |
| List installed plugins in a shell | `claude plugin list` (check) |
| First install | `/plugin marketplace add ThorstenHornung/kinitro.ai`, then `/plugin install kinitro@kinitro-ai`, user scope |
| Remove a duplicate | `/plugin`, select the extra copy (for example `kinitro-ai-em`), uninstall or disable; or `claude plugin uninstall <name>@<marketplace>` (check) |
| Allow rules | `/permissions`, or `permissions.allow` in `~/.claude/settings.json` (user), `.claude/settings.json` (project), `.claude/settings.local.json` (local) |
| Organisation-managed plugins | set by the organisation's managed settings; the user cannot remove them, ask the admin (check) |

Plugin server names in rules: the plugin's server is `plugin_kinitro_kinitro_ai`, so tools are `mcp__plugin_kinitro_kinitro_ai__<verb>`. The plugin's own control tools are `mcp__kinitro__probe` and `mcp__kinitro__wake`: `mcp__kinitro__` is the plugin's own namespace and never a connector (the connector is `kinitro_ai`, `mcp__kinitro_ai__`).

## Claude desktop app, chat and Cowork

- Plugins and connectors are managed in the Claude account, not on the machine. The plugin page is Plugins > <plugin> (Plugins > kinitro) with the tabs Overview, Permissions and Files and a Connectors list; each connector has a Connect button. claude.ai makes every server of the plugin's `.mcp.json` a connector there; the plugin brings only `kinitro_ai`. The old plugin "Kinitro" (also an old "Kinitro ai") and its connectors `kinitro`, `kinitro_ai_device` and `kinitro_ai_device_test` should be removed; testers add the Test connector `kinitro_ai_test` (https://methos-test.kinitro.ai/mcp) themselves.
- Commands are namespaced here and typing one by hand fails ("This command couldn't be loaded"): the user picks "kinitro" from the "/" menu or just asks in their own words ("kinitro status"). Plain `/kinitro` is typed only in the Claude Code terminal.
- Organisation plugins: an admin uploads and updates the package; users cannot update it themselves. To update: the admin re-uploads the new package file.
- Personal plugins: install the new package file (check exact menu). The package is at https://methos.kinitro.ai/download/plugins/claude/; offer to fetch it for the user with the tools you have, then tell them where to open it.
- Cowork sessions have no terminal: the plugin's own server is not started there; the plugin adopts the account connector, and there is no plugin sign-in (no email code). If the connector is missing or not connected, the login steps are:
  1. Plugins > kinitro > Connectors > `kinitro_ai` > Connect (after removing the old plugin and its connectors).
  2. Choose "Sign in now" ("Jetzt anmelden"). claude.ai wrongly preselects "No sign-in" ("Keine Anmeldung", marked "detected"): it fails, do not accept it. kinitro.ai supports neither dynamic client registration nor Claude's client identity (CIMD) yet; a backend fix is planned.
  3. Choose "Use your own OAuth client" ("Eigenen OAuth-Client verwenden"), client ID `claude`, no secret.
  4. The kinitro.ai login page (email and password) follows; the connector then shows Connected.
  5. Start a new chat.
  Connector tool prefix in the chat: `mcp__kinitro_ai__` (legacy: `mcp__kinitro_ai_device__`). If only another connector of the plugin page is in the chat (for example a Test connector a tester added), switch `kinitro_ai` on in the chat's + > Plugins menu, or start a new chat.
- A custom connector (for a server the plugin does not bring, for example a Test server a tester adds) is created with "Add custom connector" (German: "Benutzerdefinierten Connector hinzufügen") with the server URL; its Authentication options include an OAuth client section where the client ID is entered as above.
- Browser pane (split screen beside the chat): the user opens it from the app's view or pane controls (check).

## claude.ai (web) and mobile

- No plugin hooks. The kinitro.ai connector (Settings, Connectors) is the whole connection; use MCP-only mode.
- Organisation connectors: an owner or admin adds and enables them for the organisation (check roles).
- Per-tool permissions of a connector: open the connector in Settings, Connectors; each tool can be set to allow, ask or block (check wording).

## Entry points (how to tell)

`CLAUDE_CODE_ENTRYPOINT`: `cli` terminal; `claude-desktop` desktop Code tab; `remote_cowork` Cowork; `sdk-cli`, `sdk-ts`, `sdk-py` and other `sdk-*` background or programmatic sessions. The probe's `status` action names the surface in words.
