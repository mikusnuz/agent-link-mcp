#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
import { SessionManager } from './session-manager.js';
import { detectAgents, loadConfig } from './agent-registry.js';
import { registerSpawnAgent } from './tools/spawn-agent.js';
import { registerReply } from './tools/reply.js';
import { registerKillAgent } from './tools/kill-agent.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerGetStatus } from './tools/get-status.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

async function main(): Promise<void> {
  detectAgents();
  loadConfig();

  const sessionManager = new SessionManager();

  const server = new McpServer({
    name: 'agent-link-mcp',
    version: pkg.version,
  });

  registerSpawnAgent(server, sessionManager);
  registerReply(server, sessionManager);
  registerKillAgent(server, sessionManager);
  registerListAgents(server);
  registerGetStatus(server, sessionManager);

  const transport = new StdioServerTransport();

  const shutdown = (): void => {
    sessionManager.cleanupAll();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start agent-link-mcp:', err);
  process.exit(1);
});
