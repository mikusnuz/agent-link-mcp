# agent-link-mcp

[![npm version](https://img.shields.io/npm/v/agent-link-mcp.svg)](https://www.npmjs.com/package/agent-link-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server for bidirectional AI agent collaboration. Spawn and communicate with any AI coding agent CLI — Claude Code, Codex, Gemini, Aider, and more.

## Why

AI coding agents get stuck sometimes. Instead of waiting for you, they can ask another agent for help. **agent-link-mcp** lets any MCP-compatible agent spawn other agent CLIs as collaborators, exchange questions, and get results back — all through standard MCP tools.

- **One-side install** — only the host agent needs this MCP server. Spawned agents are just CLI subprocesses.
- **Bidirectional** — the host can ask questions to the spawned agent, and the spawned agent can ask questions back.
- **Any agent** — works with any CLI that accepts a prompt and returns text. Built-in profiles for Claude, Codex, Gemini, and Aider.
- **Multi-agent** — spawn multiple agents simultaneously for parallel collaboration.

## Install

```bash
# Claude Code
claude mcp add agent-link npx agent-link-mcp

# Codex
codex mcp add agent-link npx agent-link-mcp

# Any MCP client
npx agent-link-mcp
```

## Tools

### `spawn_agent`

Spawn an agent and send it a task.

```json
{
  "agent": "codex",
  "task": "Refactor this function for better performance",
  "context": {
    "files": ["src/utils.ts"],
    "error": "TypeError: Cannot read property 'x' of undefined",
    "intent": "Performance improvement"
  },
  "timeout": 1800
}
```

Returns one of:
- `{ type: "question", agentId: "codex-a1b2c3", message: "..." }` — agent needs clarification
- `{ type: "result", agentId: "codex-a1b2c3", message: "..." }` — task completed
- `{ type: "error", agentId: "codex-a1b2c3", message: "..." }` — something went wrong
- `{ type: "timeout", agentId: "codex-a1b2c3" }` — timed out

### `reply`

Answer a spawned agent's question and continue the conversation.

```json
{
  "agentId": "codex-a1b2c3",
  "message": "Yes, you can remove the side effects"
}
```

### `kill_agent`

Abort a running agent session.

```json
{
  "agentId": "codex-a1b2c3"
}
```

### `list_agents`

List available agent CLIs.

```json
{
  "agents": [
    { "name": "claude", "command": "claude", "source": "auto", "available": true },
    { "name": "codex", "command": "codex", "source": "auto", "available": true },
    { "name": "gemini", "command": "gemini", "source": "auto", "available": false }
  ]
}
```

### `get_status`

Get active agent sessions.

```json
{
  "sessions": [
    { "agentId": "codex-a1b2c3", "agent": "codex", "status": "waiting_for_reply", "startedAt": "..." }
  ]
}
```

## How It Works

```
You (using Claude Code)
  ↓
"Ask Codex to help with this refactoring"
  ↓
Claude Code → spawn_agent("codex", task, context)
  ↓
agent-link-mcp server → spawns `codex` CLI as subprocess
  ↓
Codex processes the task...
  ↓
Codex: "[QUESTION] Should I remove the side effects?"
  ↓
agent-link-mcp → parses response → returns to Claude Code
  ↓
Claude Code → reply("codex-a1b2c3", "Yes, remove them")
  ↓
agent-link-mcp → re-invokes Codex with accumulated context
  ↓
Codex: "[RESULT] Refactoring complete. Here's what I changed..."
  ↓
Claude Code receives the result and continues working
```

## Configuration

### Auto-detection

agent-link-mcp automatically detects installed agent CLIs:

| Agent | CLI Command |
|-------|------------|
| Claude Code | `claude` |
| Codex | `codex` |
| Gemini | `gemini` |
| Aider | `aider` |

### Custom agents

Add custom agents via config file at `~/.agent-link/config.json`:

```json
{
  "agents": {
    "codex": {
      "command": "/usr/local/bin/codex",
      "args": ["--full-auto"],
      "promptFlag": null,
      "outputFormat": "text"
    },
    "my-local-llm": {
      "command": "ollama",
      "args": ["run", "codellama"],
      "promptFlag": null,
      "outputFormat": "text"
    }
  }
}
```

Override config path with `AGENT_LINK_CONFIG` environment variable.

## Conversation Protocol

Spawned agents receive instructions to format their responses:

- `[QUESTION] ...` — needs clarification from the host agent
- `[RESULT] ...` — task completed

If the agent doesn't follow the format, the entire output is treated as a result.

## License

MIT
