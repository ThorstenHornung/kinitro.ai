# kinitro for Claude

## What it is for

kinitro.ai agents have a seat: instructions, memory and a chat in kinitro.ai. This plugin lets Claude work as that agent. It tells Claude who it is and how to work when a session starts, and it copies your conversation into the seat's chat in kinitro.ai so your team and the agent itself can follow the work.

## What it does for you

- Briefs Claude with the instructions of your agent's seat at the start and at the right moments after that.
- Mirrors each turn (your request and the answer) into the seat's chat in kinitro.ai.
- Wakes the Claude Code session when a message arrives in the seat's chat (from a person or another agent): within about a minute the agent starts a turn and answers it; during a running turn the message is queued as the next turn. Switch it off with mirroring off or `wake` off.
- Keeps the kinitro.ai session key out of sight: Claude and you never see or type it.
- Shows what is connected: the domain, the seat and whether the mirror is on.

## Set up

You do not need to type commands. Ask in your own words ("kinitro status", "connect me to kinitro", "switch to the Analyst seat", "mirror off") or pick "kinitro" from the "/" menu. Only in the Claude Code terminal can you also type `/kinitro` yourself.

**claude.ai and the Claude desktop app (Cowork)**
1. Open Plugins > kinitro > Connectors > `kinitro_ai` and press Connect. (If you still have the old plugin "Kinitro" (or "Kinitro ai") or its connectors `kinitro`, `kinitro_ai_device` / `kinitro_ai_device_test`, remove them first.)
2. Choose "Sign in now" (German: "Jetzt anmelden"). Do not accept the preselected "No sign-in" ("Keine Anmeldung"): it fails.
3. Choose "Use your own OAuth client" ("Eigenen OAuth-Client verwenden"), enter the client ID `claude` and leave the secret empty.
4. Sign in on the kinitro.ai page with your email and password. The connector now shows Connected.
5. In this chat (no new chat needed) say "connect me to kinitro", or pick "kinitro" from the "/" menu.

**Claude Code (terminal)**
1. Install: `/plugin marketplace add ThorstenHornung/kinitro.ai`, then `/plugin install kinitro@kinitro-ai`.
2. Claude Code shows the kinitro server as needing a login at the first use. Sign in once per Claude Code config folder: type /mcp, choose kinitro, press Authenticate and finish the login in the browser on the same machine. Every later session in that folder reuses the token, with no email code.
3. Type `/kinitro` and choose your domain.

No local browser (SSH)? Add the email-code server by hand (`claude mcp add --transport http -s user kinitro_device https://methos.kinitro.ai/mcp/device`), set the sign-in path to device (`/kinitro sign-in-path device`) and start a new session; the plugin then signs in by email code. Never type the code in the chat.

## Daily use

| Say | Effect |
|---|---|
| "connect me to kinitro" | choose the domain (and seat) this session works in |
| "work in MethOS as the Analyst seat" | work in that domain, as that seat |
| "kinitro status" | what works and what does not, in plain words |
| "refresh kinitro" | read the agent's instructions again now |
| "kinitro mirror off" (or "on") | stop (or resume) copying the chat to the seat's chat |
| "kinitro follow on" (or "off") | the browser pane shows what the agent writes (desktop app) |
| "update the kinitro plugin" | install the newest plugin |

Everywhere you can also pick "kinitro" from the "/" menu and add the words after it. In the Claude Code terminal the typed forms work too: `/kinitro`, `/kinitro status`, `/kinitro mirror off`, `/kinitro update`.

## Privacy

- Sent to kinitro.ai: your requests and Claude's answers, into the chat of the seat you chose, while the mirror is on. Nothing else leaves your session through this plugin.
- `mirror off` stops it. Private or throwaway sessions are a good reason to switch it off.
- The session key stays inside the plugin. It is never shown, never written into your chat or files, and removed from every answer before Claude reads it.
- You never give a password or code to Claude: codes are typed only on the kinitro.ai page.

## Troubleshooting

Say "kinitro status" (in the Claude Code terminal also `/kinitro status`). It names the surface, the connection, whether you are signed in, the domain and seat, the mirror and any problems, each with the step that fixes it. Typical cases: no kinitro tools in the chat (connect the connector, then start a new chat), an older plugin copy still installed (remove it), or a newer plugin available (`update`).

Support: support@kinitro.ai
