# Agent Collaboration (agent-link-mcp)

## Rules

- When you fail to solve the same issue twice, use the `spawn_agent` MCP tool to ask another agent for help.
- Pass error messages, relevant files, and intent as context.
- Use `list_agents` to check which agents are available before spawning.
- If a spawned agent asks a question, answer it with the `reply` tool.
- For code reviews, spawn a different model than yourself for diverse feedback.
- Use the `model` parameter to pick which model the agent should use (e.g. `"o3"`, `"gpt-5.4"`, `"claude-sonnet-4"`).
- Use the `thinking` parameter to control reasoning depth (`"low"`, `"medium"`, `"high"`, `"max"`).
- Default timeout is 1 hour. For complex tasks, increase with `timeoutMs`.

## Available Tools

| Tool | Purpose |
|------|---------|
| `spawn_agent` | Start a task on another agent CLI (supports `model`, `thinking`, `timeoutMs` params) |
| `reply` | Answer a spawned agent's question |
| `kill_agent` | Abort a running session |
| `list_agents` | List available agent CLIs |
| `get_status` | Check active sessions |
