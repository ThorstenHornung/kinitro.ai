# Security and privacy

**The plugin sends nothing anywhere except to kinitro.ai, and it does so through your own connector.** It stores no credentials. What it does write is a mirror of your conversation into your own kinitro.ai domain and a few small files on your computer. This page lists exactly what goes where and what to review.

## What the plugin does with data

| Question | Answer |
|---|---|
| Where does data go? | Only to kinitro.ai, through the connector you connected in Claude under the name `kinitro_ai`. The plugin has no other destination. |
| What is read from kinitro.ai? | Your seat, the domain and agent nodes, the general briefing and the agent's own instructions. |
| What is written to kinitro.ai? | A protocol document per session in your domain: your prompts and the agent's answers, each cut after 6000 characters. Plus a section for the protocols if it does not exist yet. |
| Who can read the protocols? | Whoever has access to that domain section. The domain's access rights apply. |
| What is stored on your computer? | A log, a cache of the briefing and a small state file in the working directory. See below. |
| Are credentials stored? | No. The plugin uses your connector's existing sign-in and stores no passwords or tokens. |
| Does mirroring use model tokens? | No. It runs as a script call after each turn. |

## Local files

| File | Holds |
|---|---|
| `kinitro-ai.log` | Hook activity: loads, injections, errors, document codes. |
| `.kinitro-ai-briefing.json` | A copy of the briefing text, including persona and working rules. |
| `.kinitro-ai-state.json` | Counters, flags and the code of the protocol document. |

The files sit in the working directory of the Claude session. They contain your instruction texts, not your conversation. Treat the briefing cache as internal. Do not commit these files and do not share them outside your organization. You can delete them at any time. They are rebuilt.

## What is not covered here

Claude itself processes your conversation under your agreement with Anthropic. The plugin does not change that. For this, see your Claude plan and its terms.

The connector, your account and your domain are operated on kinitro.ai. Access rights inside the domain are set by the domain owner.

## Recommendations

1. **Use least privilege for seats.** Give each agent seat only the domains and rights its job needs. Agents ask for approval before writes outside their own domain. Rights are the stronger safeguard.
2. **Review what the domain shares.** The protocols hold full prompts and answers. Check who can open the `Protocols: Claude sessions` section. Restrict it if it holds sensitive topics.
3. **Keep protocols short-lived.** The domain standard expires scratch after 7 days. See [Domain setup](domain-setup.md). Keep that expiry for protocols unless you need them longer.
4. **Keep sensitive content out of prompts** that should not appear in a protocol. If a topic is confidential, check the domain's access rights first.
5. **Protect the local working directory.** Do not commit the plugin's local files. The repository's `.gitignore` excludes them.
6. **Review the agent's instructions.** They steer the agent's behaviour. Only the domain owner and trusted editors should be able to change them.
7. **Revoke when done.** Remove a seat or the connector when a person leaves.

## Report a concern

Write to [support@kinitro.ai](mailto:support@kinitro.ai). Include what you saw and when. Do not include secrets or personal data in the report.
