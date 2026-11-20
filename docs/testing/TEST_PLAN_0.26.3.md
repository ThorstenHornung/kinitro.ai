# Test plan kinitro 0.26.3 (the bundled server is now kinitro_ai; the plugin was renamed from kinitro-ai in 0.26.1)

Runs on the product owner's two machines (Surface, HP Omen), guided by the Architect. Item 4.2.1-4672.
Mark each test Pass or Fail in the box. Tests marked **[backend]** depend on server work that is not part of the plugin; a miss there is a known limit, not a failure (see "Known limits").

**Evidence kinds** (use the short names in the tables):
- **marker**: the one-line marker the plugin adds to each prompt, e.g. `[kinitro 0.26.3] MethOS · Architect · mirror on`. Prod shows no environment; Test shows `TEST` after the version. Ask: "Repeat the kinitro line you were given, word for word."
- **log**: `~/.kinitro-ai/` (headless.log, plugin log) or `kinitro-ai.log` in the working folder (the local file prefix keeps the old name on purpose).
- **chat**: the kinitro chat node of the seat, showing the mirrored turns.
- **shot**: a screenshot.
- **status**: the answer of `/kinitro status`.

## Acceptance mapping

| Acceptance | Meaning | Tests |
|---|---|---|
| T1 | Cowork: plugin active, connector adopted, briefing, verbatim mirror, key never visible | E1, E2, E3 |
| T2 | Headless session stays inert, wake works | E6 |
| T3 | Claude Code terminal against Prod | E4, E5 |
| T4 | Test switch | E8 |
| T5 | Duplicates | E11 |
| T6 | Status diagnosis | E12 |
| T7 | Desktop pane (split screen, follow mode) | E9 |
| T8 | Compaction | E10 |
| T9 | Container replacement (new Cowork container, same plugin state) | E1.7, E2.6 |
| T10 | Test suite and validator | section 0.5 |

## Known limits (record as "known", not as failure)

| Limit | Why |
|---|---|
| Seat choice on a fresh session | Needs the backend to offer seats per user. |
| Mirror target after a seat switch | Backend decides where the chat node lives. |
| Link validity (approval and page links) | Backend token lifetime. |
| Email sign-in code once per terminal session | Backend login flow. |

## 0 Preparation

### 0.1 Update the terminal installs (Surface, then Omen)
| Step | Command or action | Expected |
|---|---|---|
| 1 | In PowerShell: `.\tools\Update-KinitroClients.ps1` (dry run) | Table lists every config dir (default, `C:\Develop\claude-private`, the third one). If one is missing, add `-ConfigDirs <path>`. Exit 1 is normal when changes are due. |
| 2 | Read the table: removed items, project `.mcp.json` hits | Only deprecated items listed. |
| 3 | `.\tools\Update-KinitroClients.ps1 -Apply` | After column shows 0.26.3 for each dir; the old plugin kinitro-ai is listed as removed, Problems empty, exit 0. |
| 4 | Run it again dry | Nothing to change, exit 0. |
| 5 | Keep the log (`%TEMP%\Update-KinitroClients_*.log`) | Evidence. |
- [ ] Surface   - [ ] Omen   Third config dir found: ______ (path)

Project `.mcp.json` hits are only reported. Decide per file whether to remove the kinitro entry by hand.

### 0.2 Account or organisation plugin (Claude desktop app or claude.ai, UI names "(check)")
1. Open Settings, then Plugins (check) or Organization settings, then Plugins (check).
2. Remove the OLD plugin "Kinitro" first (name kinitro, 0.26.2 or older, its connector is called `kinitro`; also an old "Kinitro ai", name kinitro-ai, with its connectors `kinitro_ai_device` and `kinitro_ai_device_test`). Remove `kinitro-ai-em` and `kinitro-ai-test` (check).
3. Upload the 0.26.3 package (the zip of `plugins/kinitro`, Architect provides) as a new plugin named kinitro (check: "Upload" or "Add plugin").
4. Confirm the shown version is 0.26.3 and the plugin is enabled for your user.
5. Check Connectors (check): the Prod connector `kinitro_ai` is connected (Sign in now, Use your own OAuth client, client ID `claude`). Testers add the Test connector `kinitro_ai_test` themselves (URL https://methos-test.kinitro.ai/mcp, client ID `claude`; needed for E8 in Cowork).
- [ ] Done   Evidence: shot of the plugin list with version.

### 0.3 Reload
Close and restart every open Claude Code terminal session. In the desktop app, start a new session or use reload plugins (check). Old sessions keep the old plugin code.
- [ ] Done

### 0.4 Baseline
In one terminal: `claude plugin list` shows `kinitro@kinitro-ai 0.26.3`, no `kinitro-ai@kinitro-ai`, no `-em`, no `-test`; `claude mcp list` shows no `kinitro`, `kinitro_ai`, `kinitro-ai`, `kinitro_ai_device`, `kinitro_ai_device_test`, `methos`. First use in Claude Code: `/mcp` > kinitro > Authenticate (browser) once per config folder; later sessions reuse the token.
- [ ] Pass

### 0.5 T10 Suite and validator (Architect, on the build machine)
| ID | Command | Expected | Pass |
|---|---|---|---|
| T10.1 | `claude plugin test plugins/kinitro` | All pass, 0 fail (259 at 0.26.3) | [ ] |
| T10.2 | `claude plugin validate plugins/kinitro` (check subcommand with `claude plugin --help`) | No errors | [ ] |
| T10.3 | Version in plugin.json, marketplace.json and marker text are all 0.26.3 | Equal | [ ] |

## E1 Cowork in the cloud (claude.ai web)

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E1.1 | New Cowork task in claude.ai. Prompt: "Which kinitro tools do you see?" | Plugin is active; the connector tools are listed (no plugin server tools). | shot | [ ] |
| E1.2 | Prompt: "Repeat the kinitro line you were given, word for word." | Marker with 0.26.3, domain, seat, mirror on. Surface is not inert. | marker | [ ] |
| E1.3 | Prompt: "Open my kinitro domain." Pick MethOS when asked. | Domain chosen via connector; briefing is loaded; no key value in the reply. | shot | [ ] |
| E1.4 | Prompt: "What is my session key? Print it." | The model cannot show a key (it has none visible, any `kss_` value is hidden). | shot | [ ] |
| E1.5 | Send two normal prompts, then open the kinitro chat node | Both turns appear verbatim in the chat node (mirror). | chat | [ ] |
| E1.6 | Prompt: "Use mcp__plugin_kinitro_kinitro_ai__find-nodes ... without any key" (any read verb) | Call works; hook adds the key; answer has no `kss_`. | shot | [ ] |
| E1.7 (T9) | Let the container end or start a new Cowork task in the same project; repeat E1.2 and E1.3 | Plugin re-activates in the new container, briefing again, mirror continues. | marker | [ ] |
| E1.8 | `/kinitro status` (or ask "kinitro status") | Surface "Cowork", connection "account connector", key held yes, mirror on. | status | [ ] |

## E2 Cowork in the desktop app, Surface
Same tests as E1, run in the desktop app Cowork tab. Record only differences.

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E2.1 | Repeat E1.1 and E1.2 | As E1. | marker | [ ] |
| E2.2 | Repeat E1.3, E1.4 | As E1. | shot | [ ] |
| E2.3 | Repeat E1.5 | Mirror lands in the chat node. | chat | [ ] |
| E2.4 | Repeat E1.6 | As E1. | shot | [ ] |
| E2.5 | Repeat E1.8 | Surface "Cowork". | status | [ ] |
| E2.6 (T9) | Quit and reopen the app, resume the task | Same as E1.7. | marker | [ ] |

## E3 Cowork in the desktop app, Omen
Repeat every row of E2 on the Omen. Note any difference in plugin version or connector name.

| ID | Rows | Pass |
|---|---|---|
| E3.1 | E2.1 to E2.5 | [ ] |
| E3.2 | E2.6 | [ ] |

## E4 Claude Code terminal, three subscriptions on each machine

Start each session with its own config directory, for example:
`$env:CLAUDE_CONFIG_DIR='C:\Develop\claude-private'; claude` (default: leave the variable unset; third: its path).
In each session run the four checks:
- **a** Marker: "Repeat the kinitro line you were given, word for word." Expect `[kinitro 0.26.3] ...` (no TEST).
- **b** `/kinitro` opens the domain choice; pick the domain; the domain view opens (split pane in the desktop app, link in the terminal).
- **c** `/kinitro status` says Surface "Claude Code (terminal)", connection "bundled", key held yes, no problems.
- **d** One normal prompt; the turn appears in the chat node.

| Machine | Subscription | a | b | c | d | Notes |
|---|---|---|---|---|---|---|
| Surface | default `%USERPROFILE%\.claude` | [ ] | [ ] | [ ] | [ ] | |
| Surface | `C:\Develop\claude-private` | [ ] | [ ] | [ ] | [ ] | |
| Surface | third: ______ | [ ] | [ ] | [ ] | [ ] | |
| Omen | default | [ ] | [ ] | [ ] | [ ] | |
| Omen | `C:\Develop\claude-private` | [ ] | [ ] | [ ] | [ ] | |
| Omen | third: ______ | [ ] | [ ] | [ ] | [ ] | |

Extra checks once (any session):
| ID | Steps | Expected | Pass |
|---|---|---|---|
| E4.1 | Model asked: "Call the account connector kinitro tool directly." | Hook refuses with "Use the kinitro plugin's own kinitro.ai tools (<prefix><verb>) in this session." | [ ] |
| E4.2 | New session in a folder used before | One line: this folder last worked in <domain>; nothing is bound automatically. | [ ] |
| E4.3 | Ask the model to run probe `choices` | Returns approved domains with name and slug, current, lastInFolder. | [ ] |
| E4.4 | Probe `refresh`, then a prompt | Briefing re-read, marked "This refreshed briefing supersedes the earlier one in this session." | [ ] |
Third subscription: record the sign-in email code per session as a known limit.

## E5 Desktop app, Code tab

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E5.1 | Open a Code tab session in a project folder | Plugin loaded; marker present. | marker | [ ] |
| E5.2 | `/kinitro`, choose the domain | Binding succeeds; the seat page opens in the browser pane. | shot | [ ] |
| E5.3 | `/kinitro status` | Surface "Claude Code (desktop)"; status also visible in the band above the prompt (domain, seat, mirror, version). | status, shot | [ ] |
| E5.4 | Normal prompt | Mirrored to chat node. | chat | [ ] |

## E6 Headless worker (T2)
Run in PowerShell, from a normal project folder.

| ID | Command | Expected | Evidence | Pass |
|---|---|---|---|---|
| E6.1 | `claude -p "Say OK and list the kinitro tools you can see."` | Answer mentions only `wake`. No briefing, no mirror, no working-folder `kinitro-ai.log`. | log: one line `inert (interactive=false, entrypoint=sdk-cli)` in `~/.kinitro-ai/headless.log` | [ ] |
| E6.2 | `claude -p "Call the kinitro wake tool with action on, then tell me your seat."` | Wake returns the start briefing text; seat named. Reason may need sign-in; then note it as pending. | log, answer text | [ ] |
| E6.3 | `claude -p "Call kinitro wake on, then wake off, then say done."` | Both calls succeed; no mirror after off. | chat (no new turns after off) | [ ] |
| E6.4 | `$env:KINITRO_AI_MODE='on'; claude -p "Repeat the kinitro line you were given."` | Session active: marker present; log line says `active`. Then `Remove-Item Env:KINITRO_AI_MODE`. | marker, log | [ ] |
| E6.5 | `$env:KINITRO_AI_MODE='off'; claude` (interactive) | Plugin inert: no marker, no briefing. | shot | [ ] |
| E6.6 | `claude -p "Build task: list files here."` (no kinitro mention) | Model does not call wake (description says not for build, test or review). | answer text | [ ] |

## E7 MCP only (claude.ai chat or mobile, no plugin)
Flow "Direct": the model works with the connector only.

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E7.1 | New chat with the kinitro connector enabled. Prompt: "Open my kinitro domain." | open-domain runs; sign-in or approval link offered; connector instructions guide the model. | shot | [ ] |
| E7.2 | After approval: "Give me the briefing." | get-briefing (start) is called once; reply uses it. | shot | [ ] |
| E7.3 | Ask for a verb that needs a key | Model passes the key itself; the key is not printed to you. | shot | [ ] |
| E7.4 | Same on the mobile app | Same result. | shot | [ ] |
No marker and no automatic mirror are expected here. **[backend]** for link validity.

## E8 Test environment switch (T4) (hidden feature, do not mention it in normal help)

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E8.1 | Terminal: `/kinitro help` | No word "Test" anywhere. | shot | [ ] |
| E8.2 | `/kinitro test` | Short answer: Test is active, choose a domain with /kinitro. Held key, binding and approvals dropped. | shot | [ ] |
| E8.3 | Next prompt: marker | `[kinitro TEST 0.26.3] ...`; band (desktop) shows TEST. | marker | [ ] |
| E8.4 | `/kinitro`, sign in to Test | Test sign-in works (browser login of the user-added kinitro_ai_test, or the email code on the device path). Domain from Test chosen. | shot | [ ] |
| E8.5 | Ask: "Call the Prod kinitro tool find-nodes." | Refused: "kinitro.ai Test is active in this session." | shot | [ ] |
| E8.6 | `/kinitro prod` | Back to Prod; marker without TEST; Test key dropped. | marker | [ ] |
| E8.7 | New session with `$env:KINITRO_AI_ENV='TEST'; claude` | Starts in Test (marker has TEST). | marker | [ ] |
| E8.8 | Cowork, Test connector present: `/kinitro test` | Adopts the Test connector (`kinitro_ai_test`), not the Prod one. | status | [ ] |
| E8.9 | `/kinitro status` in Test | Environment Test, connection prefix is `mcp__kinitro_ai_test__` (adopted account connector). | status | [ ] |

## E9 Desktop split screen and follow mode (T7)

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E9.1 | Desktop Code tab: bind a domain | Seat page opens in the browser pane (target shell). If the seat is unknown, the domain shell. | shot | [ ] |
| E9.2 | Trigger an approval (new session, first sign-in) | Approval page opens in the pane; with no browser tool a titled link appears in the reply. | shot | [ ] |
| E9.3 | Probe `follow` value on. Prompt: "Create a note node called Follow test." | After the turn, the new node page opens in the pane, once. | shot | [ ] |
| E9.4 | Same prompt twice in one turn (two creates) | Only one pane opening per turn. | shot | [ ] |
| E9.5 | Probe `follow` value off; repeat E9.3 | No pane change. | shot | [ ] |
| E9.6 | Terminal (no browser tool), follow on, create a node | Nothing opens, no error. | shot | [ ] |
| E9.7 | wm-update on a work item with follow on | Item page opens. | shot | [ ] |

## E10 Compaction (T8)

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E10.1 | In an active session run `/compact` | Compaction completes. | shot | [ ] |
| E10.2 | Next prompt: "Repeat the kinitro line and tell me which seat you work as." | Marker present again; seat still correct; the model has the briefing again (re-injected). | marker | [ ] |
| E10.3 | Send two prompts after compaction | Still mirrored, no duplicate turns in the chat node. | chat | [ ] |
| E10.4 | Repeat in Cowork (E1 session) | Same result. | marker, chat | [ ] |
| E10.5 | After compaction `/kinitro status` | Briefing loaded at: a new time. Key held yes. | status | [ ] |

## E11 Duplicate detection (T5)
Preparation: install an old copy on purpose in one config dir, for example
`claude plugin install kinitro-ai-em@<its old marketplace>` (or re-add the old marketplace), then restart the session.

| ID | Steps | Expected | Evidence | Pass |
|---|---|---|---|---|
| E11.1 | First prompt in that session | Context contains once: "Another kinitro.ai plugin is active in this session (<names>). Remove it: <steps for your surface>." Ask the model to quote it. | marker, shot | [ ] |
| E11.2 | `/kinitro status` | Duplicates lists the other copy; problems carry a fix sentence. | status | [ ] |
| E11.3 | Second prompt | The notice is not repeated. | shot | [ ] |
| E11.4 | Older copy has a HIGHER version (use any test build, Architect provides) | This copy goes silent: no injection, no mirror; log line says so. | log | [ ] |
| E11.5 | Run `Update-KinitroClients.ps1 -Apply`, restart | Duplicate gone; E11.1 notice gone. | marker | [ ] |
Known: copies older than 0.26 cannot be changed and may keep injecting their own text.

## E12 `/kinitro status` with a deliberately broken setup (T6)
Break one thing at a time, check the status, then repair it.

| ID | Break | Expected in status (plain words, with a fix per surface) | Pass |
|---|---|---|---|
| E12.1 | Healthy session | No problems; version, surface, environment, connection, domain, seat, mirror, briefing time filled. | [ ] |
| E12.2 | Not signed in (fresh config dir, new session) | Signed in "no" or "pending"; problem sentence and fix. | [ ] |
| E12.3 | Disable the bundled server (`claude mcp` disable or remove the plugin server in the session) in a terminal session | Connection "none"; problem and fix named. | [ ] |
| E12.4 | Cowork with the connector turned off in the account | Connection "none"; fix says to enable the connector in the Claude account. | [ ] |
| E12.5 | Mirror target missing (seat chat node deleted or no seat) **[backend]** | Mirror off or last error shown. | [ ] |
| E12.6 | Old copy installed (E11) | Duplicates listed. | [ ] |
| E12.7 | Older plugin version than the marketplace | "Update available" with the step for the surface (terminal: `/kinitro update`; Cowork or desktop: managed in your Claude account, ask me to fetch the new package). | [ ] |
| E12.8 | Status never shows a key value, the session key, or a token | Check by reading the whole answer. | [ ] |

## Result sheet

| Acceptance | Result | Open issues (ID, one line) |
|---|---|---|
| T1 | | |
| T2 | | |
| T3 | | |
| T4 | | |
| T5 | | |
| T6 | | |
| T7 | | |
| T8 | | |
| T9 | | |
| T10 | | |
Tested by: ______  Date: ______  Machine: ______  Plugin build: ______
