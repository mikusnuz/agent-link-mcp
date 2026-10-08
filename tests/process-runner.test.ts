import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAgentProfile, type AgentProfile } from '../src/agent-registry.js';
import { buildArgs, runAgent } from '../src/process-runner.js';

test('Codex uses the documented reasoning configuration key', () => {
  const previous = process.env.AGENT_LINK_CONFIG;
  process.env.AGENT_LINK_CONFIG = '/__agent_link_test_missing_config__';
  try {
    const profile = getAgentProfile('codex');
    assert.ok(profile);
    assert.deepEqual(buildArgs(profile, 'Review the patch', 'test-model', 'high'), [
      'exec', '--model', 'test-model', '-c', 'model_reasoning_effort="high"', 'Review the patch',
    ]);
    assert.deepEqual(buildArgs(profile, 'Review the patch'), ['exec', 'Review the patch']);
  } finally {
    if (previous === undefined) delete process.env.AGENT_LINK_CONFIG;
    else process.env.AGENT_LINK_CONFIG = previous;
  }
});

test('argument-mode prompts arrive unchanged without a temporary prompt file', async () => {
  const profile: AgentProfile = {
    command: process.execPath,
    args: ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--'],
    promptFlag: null, promptMode: 'arg', outputFormat: 'text',
    modelFlag: null, thinkingFlag: null, thinkingFormat: 'flag',
  };
  const prompt = 'Line one\nQuotes: "hello"; $(not-a-command)';
  const result = await runAgent(profile, prompt, { timeoutMs: 5_000 });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), [prompt]);
});

test('stdin-mode prompts do not become command arguments', async () => {
  const profile: AgentProfile = {
    command: process.execPath,
    args: ['-e', 'process.stdin.pipe(process.stdout)'],
    promptFlag: null, promptMode: 'stdin', outputFormat: 'text',
    modelFlag: null, thinkingFlag: null, thinkingFormat: 'flag',
  };
  const result = await runAgent(profile, 'A private prompt\n', { timeoutMs: 5_000 });
  assert.equal(result.stdout, 'A private prompt\n');
});
