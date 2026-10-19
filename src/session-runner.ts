import type { AgentProfile } from './agent-registry.js';
import { runAgent, type RunOptions, type RunResult } from './process-runner.js';
import { SessionManager, type Session } from './session-manager.js';

export async function runSessionAgent(manager: SessionManager, session: Session, profile: AgentProfile, prompt: string, overrides: Pick<RunOptions, 'thinking'> = {}): Promise<RunResult> {
  const signal = manager.beginRun(session.agentId);
  try {
    return await runAgent(profile, prompt, {
      cwd: session.cwd, timeoutMs: session.timeout, model: session.model,
      thinking: overrides.thinking ?? session.thinking, signal,
      onSpawn: (pid) => manager.setPid(session.agentId, pid),
    });
  } finally {
    manager.endRun(session.agentId);
  }
}
