# Agent Collaboration (agent-link-mcp)

## Rules

- When you fail to solve the same issue twice, use `spawn_agent` to ask another agent (codex, gemini, etc.) for help.
- Pass error messages, relevant files, and intent as context.
- Use `list_agents` to check which agents are available before spawning.
- If a spawned agent asks a question (`[QUESTION]`), answer it with `reply`.
- For code reviews, spawn a different model than yourself for diverse feedback.
- Use the `model` parameter to specify which model the agent should use (e.g. `"o3"`, `"gpt-5.4"`).
- Use the `thinking` parameter to control reasoning depth (`"low"`, `"medium"`, `"high"`, `"max"`).
- Default timeout is 1 hour. For complex tasks, increase with `timeoutMs`.

## Examples

```
# Ask Codex with a specific model for debugging help
spawn_agent("codex", "Fix this TypeScript error", {
  error: "Cannot find module './utils'",
  files: ["src/index.ts"],
  intent: "Module resolution bug",
  model: "o3"
})

# Ask Claude for code review
spawn_agent("claude", "Review for bugs and edge cases", {
  files: ["src/api.ts"],
  model: "claude-sonnet-4"
})

# Long-running task with extended timeout (2 hours)
spawn_agent("codex", "Refactor the entire auth system", {
  files: ["src/auth/"],
  timeoutMs: 7200000
})
```
