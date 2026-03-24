#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SessionManager } from './session-manager.js';
import { z } from 'zod';
import { detectAgents, loadConfig, listAgents as listAgentsData } from './agent-registry.js';
import { registerSpawnAgent } from './tools/spawn-agent.js';
import { registerReply } from './tools/reply.js';
import { registerKillAgent } from './tools/kill-agent.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerGetStatus } from './tools/get-status.js';

const PKG_VERSION = '0.3.2';

async function main(): Promise<void> {
  detectAgents();
  loadConfig();

  const sessionManager = new SessionManager();

  const server = new McpServer({
    name: 'agent-link-mcp',
    version: PKG_VERSION,
  });

  registerSpawnAgent(server, sessionManager);
  registerReply(server, sessionManager);
  registerKillAgent(server, sessionManager);
  registerListAgents(server);
  registerGetStatus(server, sessionManager);

  // MCP Prompts
  server.prompt(
    'collaborate',
    'Generate a collaboration prompt for asking another agent for help',
    { task: z.string().describe('The task or question to send to another agent') },
    ({ task }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use the spawn_agent tool to ask another AI agent for help with this task:\n\n${task}\n\nAvailable agents can be listed with the list_agents tool. Pick the best-suited agent for the task.`,
          },
        },
      ],
    })
  );

  server.prompt(
    'debug-with-agent',
    'Ask another agent to help debug an error',
    {
      error: z.string().describe('The error message or stack trace'),
      file: z.string().optional().describe('File path where the error occurs'),
    },
    ({ error, file }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use spawn_agent to ask another AI agent to help debug this error:\n\nError: ${error}${file ? `\nFile: ${file}` : ''}\n\nProvide the error and relevant file as context. If you've already tried fixing this twice, definitely ask another agent for a fresh perspective.`,
          },
        },
      ],
    })
  );

  server.prompt(
    'code-review',
    'Request a code review from another agent',
    { files: z.string().describe('Comma-separated file paths to review') },
    ({ files }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use spawn_agent to request a code review from another AI agent.\n\nFiles to review: ${files}\n\nAsk the agent to check for bugs, edge cases, performance issues, and security concerns.`,
          },
        },
      ],
    })
  );

  // MCP Resources
  server.resource(
    'agents',
    'agent-link://agents',
    { description: 'List of all configured agents and their availability', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'agent-link://agents',
          text: JSON.stringify(listAgentsData(), null, 2),
          mimeType: 'application/json',
        },
      ],
    })
  );

  server.resource(
    'config',
    'agent-link://config',
    { description: 'Current agent-link configuration', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'agent-link://config',
          text: JSON.stringify({
            configPath: process.env['AGENT_LINK_CONFIG'] || '~/.agent-link/config.json',
            profiles: loadConfig(),
          }, null, 2),
          mimeType: 'application/json',
        },
      ],
    })
  );

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

// Smithery sandbox server export for registry scanning
export function createSandboxServer(): McpServer {
  const sessionManager = new SessionManager();

  const server = new McpServer({
    name: 'agent-link-mcp',
    version: '0.2.0',
  });

  registerSpawnAgent(server, sessionManager);
  registerReply(server, sessionManager);
  registerKillAgent(server, sessionManager);
  registerListAgents(server);
  registerGetStatus(server, sessionManager);

  server.prompt(
    'collaborate',
    'Generate a collaboration prompt for asking another agent for help',
    { task: z.string().describe('The task or question to send to another agent') },
    ({ task }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use the spawn_agent tool to ask another AI agent for help with this task:\n\n${task}`,
          },
        },
      ],
    })
  );

  server.prompt(
    'debug-with-agent',
    'Ask another agent to help debug an error',
    {
      error: z.string().describe('The error message or stack trace'),
      file: z.string().optional().describe('File path where the error occurs'),
    },
    ({ error, file }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use spawn_agent to debug this error:\n\nError: ${error}${file ? `\nFile: ${file}` : ''}`,
          },
        },
      ],
    })
  );

  server.prompt(
    'code-review',
    'Request a code review from another agent',
    { files: z.string().describe('Comma-separated file paths to review') },
    ({ files }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Use spawn_agent to request a code review.\n\nFiles to review: ${files}`,
          },
        },
      ],
    })
  );

  server.resource(
    'agents',
    'agent-link://agents',
    { description: 'List of all configured agents and their availability', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'agent-link://agents',
          text: JSON.stringify([]),
          mimeType: 'application/json',
        },
      ],
    })
  );

  server.resource(
    'config',
    'agent-link://config',
    { description: 'Current agent-link configuration', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'agent-link://config',
          text: JSON.stringify({ configPath: '~/.agent-link/config.json', profiles: {} }),
          mimeType: 'application/json',
        },
      ],
    })
  );

  return server;
}
