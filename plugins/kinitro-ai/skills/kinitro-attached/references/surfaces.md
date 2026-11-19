# Surfaces: update and check the kinitro.ai setup

Anything marked (check) was not verified against the current product and may differ; say so to the user if it matters.

## Claude Code (terminal) and the Code tab of the desktop app

| Task | How |
|---|---|
| See installed plugins, errors, enable or disable | `/plugin` (tabs for installed, marketplaces, errors) (check tab names) |
| See MCP servers, sign in, reconnect | `/mcp` |
| Load plugin changes without restart | `/reload-plugins` |
| Update the kinitro plugin | `/kinitro update`, or shell: `claude plugin marketplace update kinitro-ai` then `claude plugin update kinitro-ai@kinitro-ai` |
| List installed plugins in a shell | `claude plugin list` (check) |
| First install | `/plugin marketplace add ThorstenHornung/kinitro.ai`, then `/plugin install kinitro-ai@kinitro-ai`, user scope |
| Remove a duplicate | `/plugin`, select the extra copy (for example `kinitro-ai-em`), uninstall or disable; or `claude plugin uninstall <name>@<marketplace>` (check) |
| Allow rules | `/permissions`, or `permissions.allow` in `~/.claude/settings.json` (user), `.claude/settings.json` (project), `.claude/settings.local.json` (local) |
| Organisation-managed plugins | set by the organisation's managed settings; the user cannot remove them, ask the admin (check) |

Plugin server names in rules: the plugin's device server is `plugin_kinitro-ai_kinitro_ai_device`, so tools are `mcp__plugin_kinitro-ai_kinitro_ai_device__<verb>`.

## Claude desktop app, chat and Cowork

- Plugins and connectors are managed in the Claude account, not on the machine. Settings areas: Connectors (kinitro.ai connected or not), and the plugin or customize area (check exact name) for installed plugins.
- Organisation plugins: an admin uploads and updates the package; users cannot update it themselves. To update: the admin re-uploads the new package file.
- Personal plugins: install the new package file (check exact menu). The package is at https://methos.kinitro.ai/download/plugins/claude/; offer to fetch it for the user with the tools you have, then tell them where to open it.
- Cowork sessions have no terminal: the plugin's own server is not started there; the plugin adopts the account connector. If the connector is missing, connect it under Settings, Connectors.
- Browser pane (split screen beside the chat): the user opens it from the app's view or pane controls (check).

## claude.ai (web) and mobile

- No plugin hooks. The kinitro.ai connector (Settings, Connectors) is the whole connection; use MCP-only mode.
- Organisation connectors: an owner or admin adds and enables them for the organisation (check roles).
- Per-tool permissions of a connector: open the connector in Settings, Connectors; each tool can be set to allow, ask or block (check wording).

## Entry points (how to tell)

`CLAUDE_CODE_ENTRYPOINT`: `cli` terminal; `claude-desktop` desktop Code tab; `remote_cowork` Cowork; `sdk-cli`, `sdk-ts`, `sdk-py` and other `sdk-*` background or programmatic sessions. The probe's `status` action names the surface in words.
