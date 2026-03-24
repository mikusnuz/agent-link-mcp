import fs from 'fs';
import { execSync } from 'node:child_process';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAgentProfile, type AgentProfile } from '../agent-registry.js';
import { SessionManager } from '../session-manager.js';
import { readFileContents, buildInitialPrompt, type TaskContext } from '../prompt-builder.js';
import { runAgent, type RunResult } from '../process-runner.js';
import { parseAgentOutput, type ParsedResponse } from '../parser.js';

const DEFAULT_TIMEOUT_MS = 3_600_000;
const THINKING_ESCALATION = ['low', 'medium', 'high', 'max'];

function validateCwd(rawCwd: string | undefined): { cwd: string; error?: undefined } | { cwd?: undefined; error: string } {
  if (rawCwd === undefined) {
    return { cwd: process.cwd() };
  }
  if (rawCwd.includes('..')) {
    return { error: 'Invalid cwd: path traversal with ".." is not allowed.' };
  }
  try {
    const stat = fs.statSync(rawCwd);
    if (!stat.isDirectory()) {
      return { error: `Invalid cwd: "${rawCwd}" is not a directory.` };
    }
    return { cwd: rawCwd };
  } catch {
    return { error: `Invalid cwd: "${rawCwd}" does not exist.` };
  }
}

function getGitDiff(cwd: string, diffMode: string): string {
  try {
    const args = diffMode === 'staged' ? ['diff', '--staged'] : ['diff'];
    return execSync(`git ${args.join(' ')}`, { cwd, encoding: 'utf8', maxBuffer: 500 * 1024 }).trim();
  } catch {
    return '';
  }
}

function escalateThinking(current: string | undefined): string | undefined {
  if (!current) return 'medium';
  const idx = THINKING_ESCALATION.indexOf(current);
  if (idx === -1 || idx >= THINKING_ESCALATION.length - 1) return current;
  return THINKING_ESCALATION[idx + 1];
}

function errorResponse(msg: string, extra?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: msg, ...extra }) }],
    isError: true,
  };
}

async function executeAgent(
  profile: AgentProfile,
  prompt: string,
  options: { cwd: string; timeoutMs: number; model?: string; thinking?: string },
): Promise<{ result: RunResult; parsed: ParsedResponse } | { error: string }> {
  let result: RunResult;
  try {
    result = await runAgent(profile, prompt, options);
  } catch (err) {
    return { error: `Agent process failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (result.timedOut) {
    return { error: `Agent timed out after ${options.timeoutMs}ms` };
  }
  return { result, parsed: parseAgentOutput(result.stdout) };
}

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
          diff: z.union([z.boolean(), z.enum(['staged', 'unstaged'])]).optional().describe('Include git diff as context. true = all changes, "staged" = staged only, "unstaged" = unstaged only.'),
        })
        .optional()
        .describe('Optional task context'),
      cwd: z.string().optional().describe('Working directory for the agent process'),
      model: z.string().optional().describe('Model to use (e.g. "o3", "gpt-5.4", "claude-sonnet-4", "gemini-2.5-pro"). Passed via --model flag to the agent CLI.'),
      thinking: z.string().optional().describe('Thinking/reasoning depth level (e.g. "low", "medium", "high", "max"). Controls how deeply the agent reasons.'),
      retry: z.boolean().optional().describe('Auto-retry on failure (default: false).'),
      escalate: z.boolean().optional().describe('On retry, escalate thinking level automatically (default: false). Requires retry: true.'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})`),
    },
    { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async (params) => {
      const { agent, task, context, cwd: rawCwd, model, thinking, retry, escalate, timeoutMs = DEFAULT_TIMEOUT_MS } = params;

      const cwdResult = validateCwd(rawCwd);
      if (cwdResult.error) return errorResponse(cwdResult.error);
      const cwd = cwdResult.cwd!;

      const profile = getAgentProfile(agent);
      if (!profile) return errorResponse(`Agent "${agent}" not found. Use list_agents to see available agents.`);

      const session = sessionManager.createSession(agent, timeoutMs, model, thinking);

      let taskContext: TaskContext = {};

      if (context) {
        taskContext.intent = context.intent;
        taskContext.error = context.error;

        if (context.files && context.files.length > 0) {
          taskContext.files = context.files;
          try {
            taskContext.fileContents = await readFileContents(context.files);
          } catch (err) {
            sessionManager.removeSession(session.agentId);
            return errorResponse(`Failed to read files: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (context.diff) {
          const diffMode = typeof context.diff === 'string' ? context.diff : 'unstaged';
          const diffContent = getGitDiff(cwd, diffMode);
          if (diffContent) {
            taskContext.fileContents = {
              ...(taskContext.fileContents ?? {}),
              [`git diff${diffMode === 'staged' ? ' --staged' : ''}`]: diffContent,
            };
          }
        }
      }

      const prompt = buildInitialPrompt(task, taskContext);

      let currentThinking = thinking;
      const maxAttempts = retry ? 3 : 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const execResult = await executeAgent(profile, prompt, { cwd, timeoutMs, model, thinking: currentThinking });

        if ('error' in execResult) {
          if (attempt < maxAttempts - 1) {
            if (escalate) currentThinking = escalateThinking(currentThinking);
            continue;
          }
          sessionManager.updateStatus(session.agentId, 'error');
          sessionManager.removeSession(session.agentId);
          return errorResponse(execResult.error, { agentId: session.agentId, attempts: attempt + 1 });
        }

        const { parsed } = execResult;

        if (parsed.type === 'question') {
          sessionManager.updateStatus(session.agentId, 'waiting_for_reply');
          sessionManager.addConversation(session.agentId, { role: 'agent', message: parsed.message });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              agentId: session.agentId, status: 'waiting_for_reply', question: parsed.message,
              ...(attempt > 0 ? { attempts: attempt + 1, thinkingUsed: currentThinking } : {}),
            }) }],
          };
        }

        sessionManager.updateStatus(session.agentId, 'done');
        sessionManager.addConversation(session.agentId, { role: 'agent', message: parsed.message });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            agentId: session.agentId, status: 'done', result: parsed.message,
            ...(attempt > 0 ? { attempts: attempt + 1, thinkingUsed: currentThinking } : {}),
          }) }],
        };
      }

      sessionManager.removeSession(session.agentId);
      return errorResponse('All retry attempts exhausted', { agentId: session.agentId });
    }
  );
}
