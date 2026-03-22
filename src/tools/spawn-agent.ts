import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAgentProfile } from '../agent-registry.js';
import { SessionManager } from '../session-manager.js';
import { readFileContents, buildInitialPrompt, type TaskContext } from '../prompt-builder.js';
import { runAgent } from '../process-runner.js';
import { parseAgentOutput } from '../parser.js';

const DEFAULT_TIMEOUT_MS = 120_000;

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
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`),
    },
    async (params) => {
      const { agent, task, context, cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

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
        };
      }

      const session = sessionManager.createSession(agent, timeoutMs);

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
            };
          }
        }
      }

      const prompt = buildInitialPrompt(task, taskContext);

      let result;
      try {
        result = await runAgent(profile, prompt, { cwd, timeoutMs });
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
