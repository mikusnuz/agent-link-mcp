import fs from 'fs';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAgentProfile } from '../agent-registry.js';
import { SessionManager } from '../session-manager.js';
import { readFileContents, buildInitialPrompt, type TaskContext } from '../prompt-builder.js';
import { runAgent } from '../process-runner.js';
import { parseAgentOutput } from '../parser.js';

const DEFAULT_TIMEOUT_MS = 3_600_000; // 1 hour — large models can take significant time

export function registerSpawnAgent(server: McpServer, sessionManager: SessionManager): void {
  server.tool(
    'spawn_agent',
    'Spawn an AI agent to work on a task. Returns a question if the agent needs clarification, or a result when done.',
    {
      agent: z.string().describe('Agent name (e.g. "claude", "codex", "gemini", "aider")'),
      task: z.string().describe('Task description to send to the agent'),
      context: z
        .object({
          files: z.array(z.string()).optional().describe('Absolute file paths to include as context'),
          intent: z.string().optional().describe('High-level intent or goal behind the task'),
          error: z.string().optional().describe('Error message to include as context'),
        })
        .optional()
        .describe('Optional task context'),
      cwd: z.string().optional().describe('Working directory for the agent process'),
      model: z.string().optional().describe('Model to use (e.g. "o3", "gpt-5.4", "claude-sonnet-4", "gemini-2.5-pro"). Passed via --model flag to the agent CLI.'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params) => {
      const { agent, task, context, cwd: rawCwd, model, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

      let cwd: string | undefined;
      if (rawCwd !== undefined) {
        if (rawCwd.includes('..')) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Invalid cwd: path traversal with ".." is not allowed.',
                }),
              },
            ],
            isError: true,
          };
        }
        try {
          const stat = fs.statSync(rawCwd);
          if (!stat.isDirectory()) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: `Invalid cwd: "${rawCwd}" is not a directory.`,
                  }),
                },
              ],
              isError: true,
            };
          }
          cwd = rawCwd;
        } catch {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Invalid cwd: "${rawCwd}" does not exist.`,
                }),
              },
            ],
            isError: true,
          };
        }
      } else {
        cwd = process.cwd();
      }

      const profile = getAgentProfile(agent);
      if (!profile) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Agent "${agent}" not found. Use list_agents to see available agents.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const session = sessionManager.createSession(agent, timeoutMs, model);

      let taskContext: TaskContext = {};

      if (context) {
        taskContext.intent = context.intent;
        taskContext.error = context.error;

        if (context.files && context.files.length > 0) {
          taskContext.files = context.files;
          try {
            taskContext.fileContents = await readFileContents(context.files);
          } catch (err) {
            sessionManager.updateStatus(session.agentId, 'error');
            sessionManager.removeSession(session.agentId);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: `Failed to read files: ${err instanceof Error ? err.message : String(err)}`,
                  }),
                },
              ],
              isError: true,
            };
          }
        }
      }

      const prompt = buildInitialPrompt(task, taskContext);

      let result;
      try {
        result = await runAgent(profile, prompt, { cwd, timeoutMs, model });
      } catch (err) {
        sessionManager.updateStatus(session.agentId, 'error');
        sessionManager.removeSession(session.agentId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Agent process failed: ${err instanceof Error ? err.message : String(err)}`,
              }),
            },
          ],
          isError: true,
        };
      }

      if (result.timedOut) {
        sessionManager.updateStatus(session.agentId, 'error');
        sessionManager.removeSession(session.agentId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Agent timed out after ${timeoutMs}ms`,
                agentId: session.agentId,
              }),
            },
          ],
          isError: true,
        };
      }

      const parsed = parseAgentOutput(result.stdout);

      if (parsed.type === 'question') {
        sessionManager.updateStatus(session.agentId, 'waiting_for_reply');
        sessionManager.addConversation(session.agentId, { role: 'agent', message: parsed.message });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                agentId: session.agentId,
                status: 'waiting_for_reply',
                question: parsed.message,
              }),
            },
          ],
        };
      }

      sessionManager.updateStatus(session.agentId, 'done');
      sessionManager.addConversation(session.agentId, { role: 'agent', message: parsed.message });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              agentId: session.agentId,
              status: 'done',
              result: parsed.message,
            }),
          },
        ],
      };
    }
  );
}
