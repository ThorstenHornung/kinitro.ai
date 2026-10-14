# Codex plugin delivery plan — 2026-10-14

Request: provide the GPT/Codex plugin beside the Claude plugin in this repository, prioritizing the MethOS MCP connection.

Tracking: the pull request containing this plan is the repository work item (GitHub Issues is disabled). This is an external plugin package, not a MethOS application/backend cycle. No worker dispatch, application build, database change or auth-registration change is in scope.

Baseline: main b431a77811524f1b894808463a972f3be7abc279; Claude plugin 0.22.0 at `plugins/kinitro-ai/`. Design: [Codex plugin contract](TD_codex_plugin_2026-10-14.md). Result/reference: [Codex plugin](../codex-plugin.md).

| Step | Deliverable | Evidence / gate |
|---|---|---|
| 0 | This persistent plan and linked design | Commit before package authoring |
| 1 | Inspect Claude manifest, command and briefing loader | Source files at the baseline commit |
| 2 | Inspect official Codex plugin/MCP docs and public OAuth discovery | Record public discovery facts in design |
| 3 | Separate Codex package and marketplace | Existing Claude package remains unchanged |
| 4 | Setup and domain/briefing skill | Type-checked content loading; explicit domain binding |
| 5 | Validate package with the actual Codex CLI | Isolated CODEX_HOME; install/discovery evidence |
| 6 | Read-only OAuth/MCP connectivity proof | Public metadata and authorization challenge |
| 7 | Account-dependent live check | Login, current-seat, domain and briefing; explicitly open until performed |
| 8 | Publish repository branch and reviewable PR | Attach PR; document remaining parity limitations |

No full Claude hook parity is claimed in 0.1.0. Automatic transcript mirroring, context-fill thresholds, summarizer injection and background inbox polling remain outside this MCP-first package. The reference must describe the supported explicit skill workflow, not imply automatic execution.

Completion gate: compare this table, the linked contract and the user request. Do not mark the account-dependent live check passed from metadata or successful installation alone.
