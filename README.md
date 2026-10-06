<p align="center"><img src="assets/kinitro-ai-logo.png" alt="kinitro ai" width="420"></p>

<p align="center"><strong>The agentic collaboration and solution platform.</strong></p>

<p align="center">Beta 0.8 · private preview for partners</p>

---

**kinitro.ai lets business users work with AI agents that know their business, follow their procedures and keep their results in one governed place. This repository holds what you need to run a kinitro.ai agent in Claude.**

## What kinitro.ai is

- **A platform for rich agentic solutions.** Memory, skills, domain knowledge, data, procedures and user interface live together in one governed place.
- **Built for business users.** You work with an agent in plain language. You do not need platform or technical knowledge.
- **Open to partners.** Partners can offer specialized agent solutions on kinitro.ai, at a charge. [Verum](docs/for-partners.md#example-verum) ("agent-led business planning & intelligence") is one example.
- **Works with several agentic platforms.** It starts with Claude (Anthropic) and is being extended to other platforms rapidly.
- **Governed.** Instructions, knowledge and results sit in your own kinitro.ai domain, where the domain owner controls them.

## What is in this repository

| Path | What it is |
|---|---|
| `plugins/kinitro-ai/` | The Claude Code plugin `kinitro-ai` (version 0.8.0). It briefs your agent from kinitro.ai and mirrors each conversation turn into your domain. |
| `.claude-plugin/marketplace.json` | The marketplace entry that lets Claude Code install the plugin. |
| `docs/` | Guides for beta partners and their setup people. |
| `assets/` | The kinitro ai logo. |

## Quick start

You need four things:

1. A kinitro.ai account with an **agent seat** (a domain and an agent node, set up by kinitro or a partner).
2. The **kinitro.ai connector** connected in Claude under the server name `kinitro_ai`.
3. **Claude Code** with plugin support (terminal, or the Code tab of the desktop app).
4. **Access to this private repository** for your GitHub account (invitation by kinitro).

Install the plugin in a Claude Code session (once per machine; the repository is private, so your machine needs GitHub access first: `gh auth login`, then `gh auth setup-git`):

```
/plugin marketplace add ThorstenHornung/kinitro.ai
/plugin install kinitro-ai@kinitro-ai
```

Teams on a Claude Team or Enterprise plan can instead let their admin add this repository under **Organization settings > Plugins & skills** on claude.ai; then nobody needs GitHub access.

The plugin is active at once and in every later session. Check it with:

```
/kinitro
```

The status shows the domain, the agent and the loaded briefing. Step-by-step help: [Getting started](docs/getting-started.md).

## How the plugin briefs your agent

All instruction texts live in kinitro.ai and are edited by the domain owner. The plugin only decides **when** each section is handed to the agent.

| Moment | What is injected |
|---|---|
| First message of a conversation, and again after each compaction | Persona and Working rules |
| First prompt of a session | Session start |
| Every prompt | A one-line marker and the Every turn section |
| Context window reaches 70 % (and again every 5 points more) | Context nearly full |
| First prompt after a compaction | After compaction |
| While Claude compacts the conversation | Compaction instruction (goes to the summarizer) |
| End of every turn | Your prompt and the agent's answer are appended to a protocol document in your domain |

Details: [How it works](docs/how-it-works.md) and [Plugin reference](docs/plugin-reference.md).

## For partners

Partners build specialized agent solutions on kinitro.ai and offer them to customers, at a charge. A solution combines persona, procedures, knowledge, data model, views and documents. Commercial terms are agreed individually during the beta. See [For partners](docs/for-partners.md). To get access, contact Thorsten Hornung, kinitro consulting, [support@kinitro.ai](mailto:support@kinitro.ai).

## Documentation

- [Getting started](docs/getting-started.md): account, connector, plugin, first conversation.
- [How it works](docs/how-it-works.md): platform concepts, instruction layers, agent principles, session flow.
- [Plugin reference](docs/plugin-reference.md): hooks, configuration, local files, commands, troubleshooting.
- [Domain setup](docs/domain-setup.md): the recommended structure of a kinitro.ai domain.
- [For partners](docs/for-partners.md): building and offering an agent solution.
- [Security and privacy](docs/security-and-privacy.md): what is sent where, and what to review.
- [Changelog](CHANGELOG.md)

## License

Proprietary beta software. See [LICENSE](LICENSE).

---

<p align="center">© 2026 kinitro consulting · Thorsten Hornung · <a href="mailto:support@kinitro.ai">support@kinitro.ai</a></p>
