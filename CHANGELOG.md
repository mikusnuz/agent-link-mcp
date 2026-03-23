# Changelog

## [0.1.0] - 2026-03-23

### Added
- `spawn_agent` tool — spawn any AI CLI (Claude, Codex, Gemini, Aider) as subprocess
- `reply` tool — continue conversation with spawned agent
- `kill_agent` tool — abort running agent sessions
- `list_agents` tool — auto-detect available CLIs + config file support
- `get_status` tool — check active session status
- Question/Result protocol for structured agent communication
- Multi-agent concurrent sessions
- 30min default timeout with graceful shutdown
- Cross-platform CLI detection (Unix + Windows)
- Custom agent registration via `~/.agent-link/config.json`
