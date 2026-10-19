import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AgentProfile } from '../src/agent-registry.js';
import { runAgent } from '../src/process-runner.js';
import { SessionManager } from '../src/session-manager.js';
import { runSessionAgent } from '../src/session-runner.js';
import { registerSpawnAgent } from '../src/tools/spawn-agent.js';
import { registerSpawnAgents } from '../src/tools/spawn-agents.js';
import { registerReply } from '../src/tools/reply.js';
import { registerKillAgent } from '../src/tools/kill-agent.js';

const fixture = fileURLToPath(new URL('./fixtures/agent.mjs', import.meta.url));
const profile = (mode: string, readyPath?: string): AgentProfile => ({
  command: process.execPath, args: [fixture, mode, ...(readyPath ? [readyPath] : [])],
  promptMode: 'stdin', promptFlag: null, outputFormat: mode === 'json' ? 'json' : 'text',
  modelFlag: null, thinkingFlag: null, thinkingFormat: 'flag',
});

async function until(check: () => boolean | Promise<boolean>, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= end) throw new Error('Fixture did not become ready.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function capture(manager: SessionManager) {
  const tools = new Map<string, { schema: z.ZodRawShape; handler: (args: any) => Promise<any> }>();
  const server = { tool(name: string, _description: string, schema: z.ZodRawShape, ...rest: any[]) {
    tools.set(name, { schema, handler: rest.at(-1) });
  } } as unknown as McpServer;
  registerSpawnAgent(server, manager);
  registerSpawnAgents(server, manager);
  registerReply(server, manager);
  registerKillAgent(server, manager);
  return async (name: string, args: Record<string, unknown>) => {
    const tool = tools.get(name)!;
    const result = await tool.handler(z.object(tool.schema).parse(args));
    return { ...JSON.parse(result.content[0].text), isError: result.isError };
  };
}

test('single and parallel sessions replay initial task, files, intent and cwd on reply', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-link-context-'));
  const oldConfig = process.env.AGENT_LINK_CONFIG;
  const manager = new SessionManager();
  try {
    const config = join(directory, 'config.json');
    const source = join(directory, 'example.txt');
    await writeFile(config, JSON.stringify({ agents: { fixture: profile('json') } }));
    await writeFile(source, 'Original source context');
    process.env.AGENT_LINK_CONFIG = config;
    const run = capture(manager);
    const spec = { agent: 'fixture', task: 'Fix the original task', context: { files: [source], intent: 'Keep compatibility', error: 'Example error' } };
    for (const parallel of [false, true]) {
      const initial = parallel
        ? (await run('spawn_agents', { agents: [spec], cwd: directory })).results[0]
        : await run('spawn_agent', { ...spec, cwd: directory });
      assert.equal(initial.question, 'Which option should I use?');
      assert.equal(manager.getSession(initial.agentId)?.pid, undefined);
      const reply = await run('reply', { agentId: initial.agentId, message: 'Use option A' });
      const result = JSON.parse(reply.result);
      assert.equal(result.cwd, await realpath(directory));
      for (const text of ['Task: Fix the original task', 'Original source context', 'Keep compatibility', 'Example error']) assert.ok(result.prompt.includes(text));
      assert.equal(result.prompt.split('Use option A').length - 1, 1);
      assert.equal(manager.getSession(initial.agentId)?.pid, undefined);
    }
  } finally {
    await manager.cleanupAll();
    if (oldConfig === undefined) delete process.env.AGENT_LINK_CONFIG;
    else process.env.AGENT_LINK_CONFIG = oldConfig;
    await rm(directory, { recursive: true, force: true });
  }
});

test('kill_agent cancels an active child and does not auto-retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-link-cancel-'));
  const oldConfig = process.env.AGENT_LINK_CONFIG;
  const manager = new SessionManager();
  try {
    const config = join(directory, 'config.json');
    await writeFile(config, JSON.stringify({ agents: { fixture: profile('hang') } }));
    process.env.AGENT_LINK_CONFIG = config;
    const run = capture(manager);
    const running = run('spawn_agent', { agent: 'fixture', task: 'Wait', cwd: directory, retry: true });
    await until(() => Boolean(manager.getAllSessions()[0]?.pid));
    const session = manager.getAllSessions()[0];
    const pid = session.pid!;
    assert.equal((await run('kill_agent', { agentId: session.agentId })).killed, true);
    assert.equal((await running).isError, true);
    assert.equal(manager.getAllSessions().length, 0);
    assert.throws(() => process.kill(pid, 0));
  } finally {
    await manager.cleanupAll();
    if (oldConfig === undefined) delete process.env.AGENT_LINK_CONFIG;
    else process.env.AGENT_LINK_CONFIG = oldConfig;
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent replies cannot launch a second process and cleanup waits for cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-link-reply-'));
  const oldConfig = process.env.AGENT_LINK_CONFIG;
  const manager = new SessionManager();
  try {
    const config = join(directory, 'config.json');
    await writeFile(config, JSON.stringify({ agents: { fixture: profile('text') } }));
    process.env.AGENT_LINK_CONFIG = config;
    const run = capture(manager);
    const initial = await run('spawn_agent', { agent: 'fixture', task: 'Start', cwd: directory });
    const running = run('reply', { agentId: initial.agentId, message: 'wait' });
    const duplicate = await run('reply', { agentId: initial.agentId, message: 'Do not launch this' });
    assert.equal(duplicate.isError, true);
    await until(() => Boolean(manager.getSession(initial.agentId)?.pid));
    const pid = manager.getSession(initial.agentId)!.pid!;
    await manager.cleanupAll();
    assert.equal((await running).isError, true);
    assert.throws(() => process.kill(pid, 0));
    assert.equal(manager.getAllSessions().length, 0);
    assert.throws(() => manager.createSession('fixture', 1000), /shutting down/);
  } finally {
    await manager.cleanupAll();
    if (oldConfig === undefined) delete process.env.AGENT_LINK_CONFIG;
    else process.env.AGENT_LINK_CONFIG = oldConfig;
    await rm(directory, { recursive: true, force: true });
  }
});

test('cancel before a process starts never spawns it', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runAgent(profile('hang'), 'unused', { timeoutMs: 1000, signal: controller.signal, onSpawn: () => assert.fail('Must not spawn') });
  assert.equal(result.cancelled, true);
});

test('SIGTERM-resistant fixtures are force-stopped on cancellation and timeout', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-link-force-'));
  try {
    for (const reason of ['cancel', 'timeout']) {
      const ready = join(directory, reason);
      const controller = new AbortController();
      const running = runAgent(profile('stubborn', ready), '', { timeoutMs: reason === 'timeout' ? 500 : 5000, signal: controller.signal, killGraceMs: 50 });
      await until(async () => { try { await access(ready); return true; } catch { return false; } });
      const pid = Number(await readFile(ready, 'utf8'));
      if (reason === 'cancel') controller.abort();
      const result = await running;
      assert.equal(result.cancelled, reason === 'cancel');
      assert.equal(result.timedOut, reason === 'timeout');
      assert.throws(() => process.kill(pid, 0));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('cancellation also kills descendants after their parent exits', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-link-tree-'));
  const controller = new AbortController();
  try {
    const ready = join(directory, 'ready');
    const running = runAgent(profile('tree', ready), '', { timeoutMs: 5000, signal: controller.signal, killGraceMs: 100 });
    await until(async () => { try { await access(ready); return true; } catch { return false; } });
    const { pid, descendant } = JSON.parse(await readFile(ready, 'utf8'));
    controller.abort();
    assert.equal((await running).cancelled, true);
    await until(() => { try { process.kill(descendant, 0); return false; } catch { return true; } });
    assert.throws(() => process.kill(pid, 0));
  } finally { controller.abort(); await rm(directory, { recursive: true, force: true }); }
});

test('failed spawns clear execution bookkeeping and reject overlapping runs', async () => {
  const manager = new SessionManager();
  const session = manager.createSession('missing', 1000);
  const running = runSessionAgent(manager, session, { ...profile('text'), command: '/__missing_agent_link_fixture__' }, '');
  await assert.rejects(runSessionAgent(manager, session, profile('text'), ''), /already running/);
  await assert.rejects(running, /exited with code/);
  assert.equal(session.pid, undefined);
  await manager.cleanupAll();
});
