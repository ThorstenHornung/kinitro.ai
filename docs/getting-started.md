# Getting started

**Once your account, seat and repository access are in place, you install one plugin and your kinitro.ai agent runs in Claude.** This guide is for the business user and the person who sets things up. Four steps lead to the first conversation.

| Step | Who | What |
|---|---|---|
| 1 | kinitro or partner | Account and agent seat |
| 2 | Setup person | Install the plugin (it brings the kinitro.ai server) |
| 3 | Setup person | Sign in once: `/mcp` → `plugin:kinitro-ai:kinitro_ai` → Authenticate |
| 4 | Business user | Start the first conversation |

## Before you start

You need:

- A kinitro.ai account.
- Claude Code with plugin support (the terminal, or the Code tab of the desktop app), and `git` on the machine.

## Step 1: Account and agent seat

An **agent seat** ties your kinitro.ai account to a **domain** (your workspace in kinitro.ai) and an **agent node** (the place where your agent's own instructions live). kinitro or your solution partner sets this up for you.

Ask your contact to confirm these points:

1. Your account has an agent seat.
2. The domain has an agent node.
3. The agent node names an AIAgent that points to the platform instruction templates; the Agent 101 reaches the agent through the include tag in the coldstart and postcompaction templates.
4. The agent node carries its own instructions where it needs more than the AIAgent's.

Points 2 to 4 are explained in the [plugin reference](plugin-reference.md#what-must-be-configured-in-kinitroai). You do not need to do them yourself.

## Step 2: Install the plugin

You install once per machine, not per Claude account. In a Claude Code session, add the marketplace and install the plugin:

```
/plugin marketplace add ThorstenHornung/kinitro.ai
/plugin install kinitro-ai@kinitro-ai
```

Choose **user scope** when asked. The plugin is active in every later session. No GitHub account is needed.

**Updates:** run `/plugin marketplace update kinitro-ai`, or turn on **Enable auto-update** for the marketplace under **Marketplaces** in `/plugin`.

If the install fails, check that `git` is installed and the machine can reach github.com. If an SSH attempt hangs or fails, set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` and try again. Still stuck: write to [support@kinitro.ai](mailto:support@kinitro.ai).

## Step 3: Sign in once

The plugin ships the kinitro.ai MCP server, so there is no separate connector to set up. After installing, sign in once:

1. Open `/mcp`.
2. Choose **`plugin:kinitro-ai:kinitro_ai`**.
3. Choose **Authenticate** and finish the sign-in in the browser.

Until you are signed in the plugin finds no kinitro.ai tools and tells you: "Type /kinitro domain to sign in". That command starts the sign-in by email code (it asks for your account email, shows an approval link, then goes on to the domain choice); it works in the Claude desktop app, which has no `/mcp`. The `/mcp` steps above are only a fallback for the Claude Code terminal.

**Remote sessions sign in by email code.** When Claude Code runs over SSH or in a cloud session (or the setting **kinitro.ai sign-in path** says `device`), the browser is not on the same machine, so the plugin signs in by itself instead: at your first message kinitro.ai mails you a 6-digit code (the plugin asks for your account email once if the setting **kinitro.ai account email** is empty). Open the link **Approve this sign-in** on any device, type the code on methos.kinitro.ai, choose your domain and agent, then send any message or press **I approved it**. Never type the code in the chat. Change the path with `/kinitro sign-in-path auto|oauth|device` (it applies from the next session).

**You already have the kinitro.ai connector or a `kinitro_ai` server of your own?** From 0.24.0 the plugin works only with its own server: it keeps this session's kinitro.ai session key and passes it on every call, and it never sends the key through another connection. Switch the other one off for this tool (`claude mcp remove kinitro_ai` for a server of your own; for the claude.ai connector in Claude Code switch it off for this tool only: `/mcp`, choose the claude.ai connector, Disable. Leave it connected in the claude.ai settings: the browser, Desktop and mobile need it); the plugin tells you once per session when it sees one.

**Claude Code cloud sessions do not load plugins.** Use the terminal or the Code tab of the desktop app.

## Step 4: First conversation

Start a session and type `/kinitro`. The agent opens the kinitro.ai domain selection, shows your approved domains as buttons and binds the session to the one you choose. If your domain is missing, approve it on the selection page and choose "check again": the newly approved domain is taken at once. `/kinitro <slug>` (for example `/kinitro verum`) binds directly. In the terminal and the desktop Code tab a row above the prompt offers the same choice. Use a separate working directory for each agent you run in parallel.

Then write your first message. Write in your own language. The agent answers in the language you use.

What you will see:

- The agent behaves as its persona describes. It follows the working rules of your domain.
- Each prompt begins with a short marker line from the plugin: `[kinitro-ai <version>] context ... % · briefing ... · domain <slug>`.
- After each turn, your question and the answer appear in the agent's chat in kinitro.ai. Open the agent's chat there. Several sessions of the same agent share one chat.

## Check status at any time

| Action | How |
|---|---|
| Choose or change the domain | Type `/kinitro` |
| Quick status | Ask the agent to run the `probe` tool with action `status` |
| Reload the briefing from kinitro.ai | Ask the agent to run the `probe` tool with action `reload` |
| Test that every section arrives | Ask the agent to run `probe` with action `arm-test`, then send any message. Every section arrives once, marked `[TEST]`. Ask the agent to confirm each block. |

## If the briefing is missing

The `probe` status then shows `briefing: MISSING (...)` followed by a reason. Work through this list:

1. **Wait a moment and send another message.** The server may still be connecting. The plugin retries on its own.
2. **Run `probe` with action `reload`.** This reads the briefing again.
3. **Check the sign-in.** If the status says `kinitro.ai tools: none visible`, type `/kinitro domain`; it signs you in by email code. (Claude Code terminal only, as a fallback: open `/mcp`, choose `plugin:kinitro-ai:kinitro_ai` and Authenticate.)
4. **Read the reason in the status line.** The [troubleshooting table](plugin-reference.md#troubleshooting) maps typical messages to a fix.
5. **Ask your contact** to check the agent node, its AIAgent and the agent instructions.

## Next steps

- Understand the building blocks: [How it works](how-it-works.md).
- See how a domain is structured: [Domain setup](domain-setup.md).
- Know what is stored where: [Security and privacy](security-and-privacy.md).
