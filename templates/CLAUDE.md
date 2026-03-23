# Agent Collaboration (agent-link-mcp)

## Rules

- When you fail to solve the same issue twice, use `spawn_agent` to ask another agent (codex, gemini, etc.) for help.
- Pass error messages, relevant files, and intent as context.
- Use `list_agents` to check which agents are available before spawning.
- If a spawned agent asks a question (`[QUESTION]`), answer it with `reply`.
- For code reviews, spawn a different model than yourself for diverse feedback.

## Examples

```
# Ask Codex for debugging help
spawn_agent("codex", "Fix this TypeScript error", {
  error: "Cannot find module './utils'",
  files: ["src/index.ts"],
  intent: "Module resolution bug"
})

# Ask Claude for code review
spawn_agent("claude", "Review for bugs and edge cases", {
  files: ["src/api.ts"]
})
```
