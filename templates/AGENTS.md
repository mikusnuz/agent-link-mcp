# Agent Collaboration (agent-link-mcp)

## Rules

- When you fail to solve the same issue twice, use `spawn_agent` with `retry: true, escalate: true` or ask another agent.
- Pass error messages, relevant files, and intent as context. Use `diff: true` to include git changes.
- Use `list_agents` to check which agents are available before spawning.
- If a spawned agent asks a question, answer it with the `reply` tool.
- For parallel reviews, use `spawn_agents` to run multiple agents simultaneously.
- Use `model` to pick the model, `thinking` to control reasoning depth.

## Available Tools

| Tool | Purpose |
|------|---------|
| `spawn_agent` | Start a task on another agent (supports `model`, `thinking`, `retry`, `escalate`, `context.diff`) |
| `spawn_agents` | Run multiple agents in parallel, get all results together |
| `reply` | Answer a spawned agent's question |
| `kill_agent` | Abort a running session |
| `list_agents` | List available agent CLIs |
| `get_status` | Check active sessions |
