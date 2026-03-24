import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAgentProfile } from '../agent-registry.js';
import { SessionManager } from '../session-manager.js';
import { buildReplyPrompt } from '../prompt-builder.js';
import { runAgent } from '../process-runner.js';
import { parseAgentOutput } from '../parser.js';

export function registerReply(server: McpServer, sessionManager: SessionManager): void {
  server.tool(
    'reply',
    'Reply to an agent that is waiting for clarification. Continues the conversation until the agent returns a result or asks another question.',
    {
      agentId: z.string().describe('Session ID returned from spawn_agent'),
      message: z.string().describe('Clarification or additional information to send to the agent'),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (params) => {
      const { agentId, message } = params;

      const session = sessionManager.getSession(agentId);

      if (!session) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Session "${agentId}" not found. It may have already completed or been killed.`,
              }),
            },
          ],
          isError: true,
        };
      }

      if (session.status !== 'waiting_for_reply') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Session "${agentId}" is not waiting for a reply. Current status: ${session.status}`,
                agentId,
                status: session.status,
              }),
            },
          ],
          isError: true,
        };
      }

      sessionManager.addConversation(agentId, { role: 'host', message });

      const updatedSession = sessionManager.getSession(agentId)!;
      const prompt = buildReplyPrompt(updatedSession.conversation, message);

      const profile = getAgentProfile(session.agent);
      if (!profile) {
        sessionManager.updateStatus(agentId, 'error');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Agent profile "${session.agent}" no longer found.`,
                agentId,
              }),
            },
          ],
          isError: true,
        };
      }

      sessionManager.updateStatus(agentId, 'working');

      let result;
      try {
        result = await runAgent(profile, prompt, { timeoutMs: session.timeout, model: session.model });
      } catch (err) {
        sessionManager.updateStatus(agentId, 'error');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Agent process failed: ${err instanceof Error ? err.message : String(err)}`,
                agentId,
              }),
            },
          ],
          isError: true,
        };
      }

      if (result.timedOut) {
        sessionManager.updateStatus(agentId, 'error');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Agent timed out after ${session.timeout}ms`,
                agentId,
              }),
            },
          ],
          isError: true,
        };
      }

      const parsed = parseAgentOutput(result.stdout);

      if (parsed.type === 'question') {
        sessionManager.updateStatus(agentId, 'waiting_for_reply');
        sessionManager.addConversation(agentId, { role: 'agent', message: parsed.message });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                agentId,
                status: 'waiting_for_reply',
                question: parsed.message,
              }),
            },
          ],
        };
      }

      sessionManager.updateStatus(agentId, 'done');
      sessionManager.addConversation(agentId, { role: 'agent', message: parsed.message });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              agentId,
              status: 'done',
              result: parsed.message,
            }),
          },
        ],
      };
    }
  );
}
