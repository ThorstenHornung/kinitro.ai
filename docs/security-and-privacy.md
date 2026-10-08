# Security and privacy

**The plugin sends nothing anywhere except to kinitro.ai, and it does so through your own connector.** It stores no credentials. What it does write is a mirror of your conversation into your own kinitro.ai domain and a few small files on your computer. This page lists exactly what goes where and what to review.

## What the plugin does with data

| Question | Answer |
|---|---|
| Where does data go? | Only to kinitro.ai, through the connector you connected in Claude under the name `kinitro_ai`. The plugin has no other destination. |
| What is read from kinitro.ai? | Your seat, the domain and agent nodes, the general briefing and the agent's own instructions. |
| What is written to kinitro.ai? | Your prompts and the agent's final answers, written into the agent's chat, each cut after 50,000 characters. Tool calls, thinking and injected instruction blocks are not sent. |
| Who can read the chat? | Whoever can read that agent's chat. The domain's access rights apply. |
| What is stored on your computer? | A log, a cache of the briefing, a small state file, an outbox and an inbox in the working directory. See below. |
| Are credentials stored? | No. The plugin uses your connector's existing sign-in and stores no passwords or tokens. |
| Does mirroring use model tokens? | No. It runs as a script call after each turn. |

## Local files

| File | Holds |
|---|---|
| `kinitro-ai.log` | Hook activity: loads, injections, errors, document codes. |
| `.kinitro-ai-briefing.json` | A copy of the briefing text, including persona and working rules. |
| `.kinitro-ai-state.json` | Counters and flags. |
| `.kinitro-ai-outbox.json` | Prompts and answers waiting to be sent (at most 200 turns). |
| `.kinitro-ai-inbox.json` | New messages fetched from the agent's chat. |

The files sit in the working directory of the Claude session. The briefing cache holds your instruction texts. The outbox and inbox hold prompts, answers and chat messages: treat them like the conversation itself. Treat the briefing cache as internal. Do not commit these files and do not share them outside your organization. You can delete them at any time. They are rebuilt.

## What is not covered here

Claude itself processes your conversation under your agreement with Anthropic. The plugin does not change that. For this, see your Claude plan and its terms.

The connector, your account and your domain are operated on kinitro.ai. Access rights inside the domain are set by the domain owner.

## Recommendations

1. **Use least privilege for seats.** Give each agent seat only the domains and rights its job needs. Agents ask for approval before writes outside their own domain. Rights are the stronger safeguard.
2. **Review who can read the agent's chat.** It holds full prompts and final answers. Restrict access if it holds sensitive topics.
3. **Mind older protocol documents.** Versions before 0.19.0 wrote protocol documents into the domain. They stay where they are. Review and archive them if they hold sensitive content. See [Domain setup](domain-setup.md).
4. **Keep sensitive content out of prompts** that should not appear in the agent's chat. If a topic is confidential, check the domain's access rights first.
5. **Protect the local working directory.** Do not commit the plugin's local files. The repository's `.gitignore` excludes them.
6. **Review the agent's instructions.** They steer the agent's behaviour. Only the domain owner and trusted editors should be able to change them.
7. **Revoke when done.** Remove a seat or the connector when a person leaves.

## Report a concern

Write to [support@kinitro.ai](mailto:support@kinitro.ai). Include what you saw and when. Do not include secrets or personal data in the report.
