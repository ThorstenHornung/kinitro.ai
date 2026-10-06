# Changelog

All notable changes to the `kinitro-ai` plugin are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.0] - 2026-10-06

First public package, with a marketplace for installation in Claude Code.

### Added
- Marketplace entry, so the plugin installs with `/plugin install kinitro-ai --marketplace ThorstenHornung/kinitro.ai`.
- Documentation for beta partners in `docs/`.

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
