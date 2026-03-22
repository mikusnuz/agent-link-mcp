import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from '../session-manager.js';

export function registerGetStatus(server: McpServer, sessionManager: SessionManager): void {
  server.tool(
    'get_status',
    'Get the status of all active agent sessions.',
    {},
    async () => {
      const sessions = sessionManager.getAllSessions();

      const sessionSummaries = sessions.map((s) => ({
        agentId: s.agentId,
        agent: s.agent,
        status: s.status,
        conversationLength: s.conversation.length,
        startedAt: s.startedAt.toISOString(),
        pid: s.pid,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              sessions: sessionSummaries,
              total: sessionSummaries.length,
            }),
          },
        ],
      };
    }
  );
}
