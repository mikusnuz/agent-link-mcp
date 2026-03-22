import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from '../session-manager.js';

export function registerKillAgent(server: McpServer, sessionManager: SessionManager): void {
  server.tool(
    'kill_agent',
    'Terminate an active agent session and clean up its resources.',
    {
      agentId: z.string().describe('Session ID of the agent to kill'),
    },
    async (params) => {
      const { agentId } = params;

      const session = sessionManager.getSession(agentId);

      if (!session) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Session "${agentId}" not found.`,
                agentId,
                killed: false,
              }),
            },
          ],
        };
      }

      const killed = sessionManager.killSession(agentId);
      sessionManager.removeSession(agentId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              agentId,
              killed,
              message: killed
                ? `Agent "${agentId}" has been terminated.`
                : `Agent "${agentId}" session removed (process was not running or already exited).`,
            }),
          },
        ],
      };
    }
  );
}
