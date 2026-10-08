# Changelog

All notable changes to the `kinitro-ai` plugin are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.11.0] - 2026-10-08

### Added
- Domain row above the prompt (terminal and desktop Code tab): shows the session's domain with **Change domain**; without a domain it offers one button per approved domain, **Refresh list** and a link to the kinitro.ai domain selection page.
- Without a drawing surface (for example a cloud session in the Claude app), the agent asks for the domain in the chat with selection buttons and binds the session itself.
- The slug is stored per session (`.kinitro-ai-domain.<session id>`) and as the folder default (`.kinitro-ai-domain`), so parallel sessions in one folder keep their own domain.

## [0.10.0] - 2026-10-08

### Added
- Multi-domain connections: one kinitro.ai connection can serve several domains. Each session names its domain by slug (`probe` action `set-domain`, stored in `.kinitro-ai-domain`), and every kinitro.ai call of the plugin passes `domainRef`.
- `/kinitro` shows the domain slug; the marker line reminds the agent to pass `domainRef`.

### Fixed
- When no domain is set, the plugin stops retrying instead of calling kinitro.ai every 3 seconds.

## [0.9.0] - 2026-10-06

### Added
- Working memory in front of the agent: the agent's todo list (user-approved work in progress) is read fresh and shown on every prompt; its notes and a map of its memory topics are shown at session start and after a compaction.

## [0.8.0] - 2026-10-06

First public package, with a marketplace for installation in Claude Code.

### Added
- Marketplace entry, so the plugin installs with `/plugin marketplace add ThorstenHornung/kinitro.ai` and `/plugin install kinitro-ai@kinitro-ai`.
- Documentation in `docs/`.

### Changed
- Domain and agent are resolved from the seat, not hard-wired.
- Two instruction layers: the general briefing behind the domain's `general-procedures` edge, plus the agent's own instructions.
- A protocol section per domain holds the mirrored sessions.
- All texts are in English.

## [0.7.0] - 2026-10-06

### Changed
- Renamed from the internal prototype to `kinitro-ai`.

## [0.6.0] - 2026-10-05

### Changed
- Nodes are addressed by stable IDs.

## [0.5.0] - 2026-10-05

### Changed
- The persona comes from the agent node.

## [0.1.0 to 0.4.x] - 2026-10-05

Prototype.

### Added
- Start briefing.
- Every-turn reminder.
- Context-fill checkpoint.
- Compaction instruction.
- Turn mirror.
