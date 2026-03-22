import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listAgents } from '../agent-registry.js';

export function registerListAgents(server: McpServer): void {
  server.tool(
    'list_agents',
    'List all known agents and their availability on this system.',
    {},
    async () => {
      const agents = listAgents();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              agents,
              total: agents.length,
              available: agents.filter((a) => a.available).length,
            }),
          },
        ],
      };
    }
  );
}
