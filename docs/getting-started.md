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
2. The domain node is linked to the general procedure library with an association edge named `general-procedures`.
3. The linked section holds a document whose name starts with `Briefing: kinitro.ai agents in Claude`.
4. The agent node carries its own instructions, or the general briefing alone is enough for you.

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

Plugin hooks never start a sign-in, so until you have done this the plugin finds no kinitro.ai tools and tells you: "Open /mcp, choose plugin:kinitro-ai:kinitro_ai and Authenticate".

**You already have the kinitro.ai connector or a `kinitro_ai` server of your own?** No harm. A `kinitro_ai` server of yours at the same address is used instead of the plugin's copy. The claude.ai connector at the same address is hidden in favour of the plugin's server. The plugin finds the tools under any of these names, and the `probe` status says which one it uses (bundled plugin server, user server or claude.ai connector).

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
3. **Check the sign-in.** If the status says `kinitro.ai tools: none visible`, do step 3 above: open `/mcp`, choose `plugin:kinitro-ai:kinitro_ai` and Authenticate.
4. **Read the reason in the status line.** The [troubleshooting table](plugin-reference.md#troubleshooting) maps typical messages to a fix.
5. **Ask your contact** to check the `general-procedures` edge, the briefing document name and the agent instructions.

## Next steps

- Understand the building blocks: [How it works](how-it-works.md).
- See how a domain is structured: [Domain setup](domain-setup.md).
- Know what is stored where: [Security and privacy](security-and-privacy.md).
