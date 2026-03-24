# Agent Collaboration (agent-link-mcp)

## Rules

- When you fail to solve the same issue twice, use `spawn_agent` with `retry: true, escalate: true` or ask another agent for help.
- Pass error messages, relevant files, and intent as context. Use `diff: true` to include git changes.
- Use `list_agents` to check which agents are available before spawning.
- If a spawned agent asks a question (`[QUESTION]`), answer it with `reply`.
- For code reviews, use `spawn_agents` to get parallel reviews from multiple models.
- Use `model` to specify the model, `thinking` to control reasoning depth.
- Default timeout is 1 hour. For complex tasks, increase with `timeoutMs`.

## Examples

```
# Auto-retry with escalation (thinking: low → medium → high)
spawn_agent("codex", "Fix this bug", {
  error: "Cannot find module './utils'",
  files: ["src/index.ts"],
  retry: true,
  escalate: true
})

# Code review with git diff context
spawn_agent("codex", "Review these changes", {
  context: { diff: "staged" },
  thinking: "high"
})

# Parallel reviews from multiple agents
spawn_agents({
  agents: [
    { agent: "codex", task: "Review for bugs", context: { diff: true } },
    { agent: "claude", task: "Review for security", context: { diff: true } }
  ]
})

# Specific model + high thinking
spawn_agent("codex", "Architect a new API", {
  model: "o3",
  thinking: "high"
})
```
