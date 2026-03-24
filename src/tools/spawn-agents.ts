import fs from 'fs';
import { execSync } from 'node:child_process';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAgentProfile } from '../agent-registry.js';
import { SessionManager } from '../session-manager.js';
import { readFileContents, buildInitialPrompt, type TaskContext } from '../prompt-builder.js';
import { runAgent } from '../process-runner.js';
import { parseAgentOutput } from '../parser.js';

const DEFAULT_TIMEOUT_MS = 3_600_000;

function getGitDiff(cwd: string, diffMode: string): string {
  try {
    const args = diffMode === 'staged' ? ['diff', '--staged'] : ['diff'];
    return execSync(`git ${args.join(' ')}`, { cwd, encoding: 'utf8', maxBuffer: 500 * 1024 }).trim();
  } catch {
    return '';
  }
}

export function registerSpawnAgents(server: McpServer, sessionManager: SessionManager): void {
  server.tool(
    'spawn_agents',
    'Spawn multiple AI agents in parallel. Each agent runs independently and results are returned together. Great for getting multiple opinions, parallel code reviews, or distributing subtasks.',
    {
      agents: z.array(z.object({
        agent: z.string().describe('Agent name'),
        task: z.string().describe('Task description'),
        context: z.object({
          files: z.array(z.string()).optional(),
          intent: z.string().optional(),
          error: z.string().optional(),
          diff: z.union([z.boolean(), z.enum(['staged', 'unstaged'])]).optional(),
        }).optional(),
        model: z.string().optional(),
        thinking: z.string().optional(),
      })).describe('Array of agent tasks to run in parallel'),
      cwd: z.string().optional().describe('Working directory (shared for all agents)'),
      timeoutMs: z.number().int().positive().optional().describe(`Timeout per agent in ms (default: ${DEFAULT_TIMEOUT_MS})`),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params) => {
      const { agents: agentSpecs, cwd: rawCwd, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

      let cwd = process.cwd();
      if (rawCwd !== undefined) {
        if (rawCwd.includes('..')) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid cwd: path traversal not allowed.' }) }],
            isError: true,
          };
        }
        try {
          if (!fs.statSync(rawCwd).isDirectory()) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `Invalid cwd: "${rawCwd}" is not a directory.` }) }],
              isError: true,
            };
          }
          cwd = rawCwd;
        } catch {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Invalid cwd: "${rawCwd}" does not exist.` }) }],
            isError: true,
          };
        }
      }

      const promises = agentSpecs.map(async (spec) => {
        const profile = getAgentProfile(spec.agent);
        if (!profile) {
          return { agent: spec.agent, status: 'error' as const, error: `Agent "${spec.agent}" not found.` };
        }

        const session = sessionManager.createSession(spec.agent, timeoutMs, spec.model, spec.thinking);

        let taskContext: TaskContext = {};
        if (spec.context) {
          taskContext.intent = spec.context.intent;
          taskContext.error = spec.context.error;

          if (spec.context.files && spec.context.files.length > 0) {
            taskContext.files = spec.context.files;
            try {
              taskContext.fileContents = await readFileContents(spec.context.files);
            } catch (err) {
              sessionManager.removeSession(session.agentId);
              return { agent: spec.agent, agentId: session.agentId, status: 'error' as const, error: `Failed to read files: ${err instanceof Error ? err.message : String(err)}` };
            }
          }

          if (spec.context.diff) {
            const diffMode = typeof spec.context.diff === 'string' ? spec.context.diff : 'unstaged';
            const diffContent = getGitDiff(cwd, diffMode);
            if (diffContent) {
              taskContext.fileContents = {
                ...(taskContext.fileContents ?? {}),
                [`git diff${diffMode === 'staged' ? ' --staged' : ''}`]: diffContent,
              };
            }
          }
        }

        const prompt = buildInitialPrompt(spec.task, taskContext);

        try {
          const result = await runAgent(profile, prompt, { cwd, timeoutMs, model: spec.model, thinking: spec.thinking });

          if (result.timedOut) {
            sessionManager.updateStatus(session.agentId, 'error');
            sessionManager.removeSession(session.agentId);
            return { agent: spec.agent, agentId: session.agentId, status: 'timeout' as const, error: `Timed out after ${timeoutMs}ms` };
          }

          const parsed = parseAgentOutput(result.stdout);

          if (parsed.type === 'question') {
            sessionManager.updateStatus(session.agentId, 'waiting_for_reply');
            sessionManager.addConversation(session.agentId, { role: 'agent', message: parsed.message });
            return { agent: spec.agent, agentId: session.agentId, status: 'waiting_for_reply' as const, question: parsed.message };
          }

          sessionManager.updateStatus(session.agentId, 'done');
          sessionManager.addConversation(session.agentId, { role: 'agent', message: parsed.message });
          return { agent: spec.agent, agentId: session.agentId, status: 'done' as const, result: parsed.message };
        } catch (err) {
          sessionManager.updateStatus(session.agentId, 'error');
          sessionManager.removeSession(session.agentId);
          return { agent: spec.agent, agentId: session.agentId, status: 'error' as const, error: `${err instanceof Error ? err.message : String(err)}` };
        }
      });

      const results = await Promise.all(promises);
      const succeeded = results.filter(r => r.status === 'done').length;
      const failed = results.filter(r => r.status === 'error' || r.status === 'timeout').length;
      const waiting = results.filter(r => r.status === 'waiting_for_reply').length;

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          summary: { total: results.length, succeeded, failed, waiting },
          results,
        }, null, 2) }],
      };
    }
  );
}
