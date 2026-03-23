# agent-link-mcp

[![npm version](https://img.shields.io/npm/v/agent-link-mcp.svg)](https://www.npmjs.com/package/agent-link-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**English** | [한국어](README.ko.md)

MCP server for bidirectional AI agent collaboration. Spawn and communicate with any AI coding agent CLI — Claude Code, Codex, Gemini, Aider, and more.

[![agent-link-mcp MCP server](https://glama.ai/mcp/servers/mikusnuz/agent-link-mcp/badges/card.svg)](https://glama.ai/mcp/servers/mikusnuz/agent-link-mcp)

## When to Use

- **Stuck on a bug?** — Your agent tried twice and failed. Let it ask another agent for a fresh perspective.
- **Need a second opinion?** — Get code review or architectural advice from a different AI model.
- **Cross-model strengths** — Use Claude for planning, Codex for execution, Gemini for research.
- **Parallel work** — Spawn multiple agents to tackle independent subtasks simultaneously.
- **Rubber duck debugging** — Have one agent explain the problem to another and get back a solution.

## Use Cases

### Get Help When Stuck

Your primary agent keeps failing on the same issue? Ask another agent:

```
# Claude Code is stuck on a TypeScript error it can't resolve.
# It spawns Codex for a second opinion:

spawn_agent("codex", "This TypeScript error keeps appearing. How do I fix it?", {
  error: "Type 'string' is not assignable to type 'number'",
  files: ["src/utils.ts"]
})
```

### Cross-Agent Code Review

Have another model review your agent's code changes:

```
spawn_agent("claude", "Review these changes for bugs and edge cases", {
  files: ["src/api.ts", "src/handler.ts"],
  intent: "Code review before merge"
})
```

### Multi-Agent Pipeline

Build a pipeline where agents handle different stages:

```
# Agent 1: Research
spawn_agent("gemini", "Find the best approach for WebSocket reconnection")

# Agent 2: Implementation (using Agent 1's advice)
spawn_agent("codex", "Implement WebSocket reconnection with exponential backoff", {
  files: ["src/ws-client.ts"]
})

# Agent 3: Review
spawn_agent("claude", "Review this implementation for production readiness", {
  files: ["src/ws-client.ts"]
})
```

### Bidirectional Collaboration

Agents can ask questions back. The host answers, and work continues:

```
Host: spawn_agent("codex", "Add caching to the API layer")
Codex: [QUESTION] Should I use Redis or in-memory cache?
Host: reply("codex-a1b2c3", "Use Redis, we have it in our docker-compose")
Codex: [RESULT] Added Redis caching with 5-minute TTL...
```

## Why

AI coding agents get stuck sometimes. Instead of waiting for you, they can ask another agent for help. **agent-link-mcp** lets any MCP-compatible agent spawn other agent CLIs as collaborators, exchange questions, and get results back — all through standard MCP tools.

- **One-side install** — only the host agent needs this MCP server. Spawned agents are just CLI subprocesses.
- **Bidirectional** — the host can ask questions to the spawned agent, and the spawned agent can ask questions back.
- **Any agent** — works with any CLI that accepts a prompt and returns text. Built-in profiles for Claude, Codex, Gemini, and Aider.
- **Multi-agent** — spawn multiple agents simultaneously for parallel collaboration.

## Prerequisites

agent-link-mcp spawns other AI agents as CLI subprocesses. **You need to install and authenticate the agent CLIs you want to collaborate with:**

| Agent | Install | Auth |
|-------|---------|------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude login` |
| Codex | `npm install -g @openai/codex` | `codex login` |
| Gemini CLI | `npm install -g @anthropic-ai/gemini-cli` | `gemini login` |
| Aider | `pip install aider-chat` | Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |

You only need the ones you plan to use. agent-link-mcp auto-detects which CLIs are installed.

## Install

```bash
# Claude Code
claude mcp add agent-link npx agent-link-mcp

# Codex
codex mcp add agent-link npx agent-link-mcp

# Any MCP client
npx agent-link-mcp
```

> **Note:** Only the agent you're working in needs this MCP server installed. The other agents are spawned as subprocesses — they don't need agent-link-mcp.

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