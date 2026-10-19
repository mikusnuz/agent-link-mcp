import { spawn, type ChildProcess } from 'node:child_process';
import { AgentProfile } from './agent-registry.js';

export interface RunOptions {
  cwd?: string;
  timeoutMs: number;
  model?: string;
  thinking?: string;
  signal?: AbortSignal;
  onSpawn?: (pid: number) => void;
  killGraceMs?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
}

function signalChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore' });
      killer.on('error', () => { child.kill(signal); });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    // The child may already have exited.
  }
}

export function buildArgs(profile: AgentProfile, prompt: string, model?: string, thinking?: string): string[] {
  const args = [...profile.args];
  if (model && profile.modelFlag) args.push(profile.modelFlag, model);
  if (thinking && profile.thinkingFlag) {
    if (profile.thinkingFormat === 'config') args.push('-c', `${profile.thinkingFlag}="${thinking}"`);
    else args.push(profile.thinkingFlag, thinking);
  }
  if (profile.promptMode === 'arg') {
    if (profile.promptFlag !== null) args.push(profile.promptFlag);
    args.push(prompt);
  }
  return args;
}

export async function runAgent(profile: AgentProfile, prompt: string, options: RunOptions): Promise<RunResult> {
  if (options.signal?.aborted) {
    return { stdout: '', stderr: '', exitCode: null, timedOut: false, cancelled: true };
  }
  const child = spawn(profile.command, buildArgs(profile, prompt, options.model, options.thinking), {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: process.platform !== 'win32',
  });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  child.stdin?.on('error', () => { /* A cancelled child may close stdin early. */ });
  let timedOut = false;
  let cancelled = false;
  let stopping = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const exitCode = await new Promise<number | null>((resolve) => {
    let closed = false;
    let closedCode: number | null = null;
    let forced = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    const groupAlive = () => {
      if (process.platform === 'win32' || child.pid === undefined) return false;
      try { process.kill(-child.pid, 0); return true; } catch { return false; }
    };
    const finish = () => {
      if (!closed || (stopping && !forced && groupAlive())) return;
      if (timeout) clearTimeout(timeout);
      if (escalation) clearTimeout(escalation);
      if (poll) clearInterval(poll);
      options.signal?.removeEventListener('abort', abort);
      resolve(closedCode);
    };
    const stop = (reason: 'timeout' | 'cancel') => {
      if (stopping) return;
      stopping = true;
      timedOut = reason === 'timeout';
      cancelled = reason === 'cancel';
      signalChild(child, 'SIGTERM');
      poll = setInterval(finish, 50);
      escalation = setTimeout(() => {
        signalChild(child, 'SIGKILL');
        forced = true;
        finish();
      }, options.killGraceMs ?? 5000);
    };
    const abort = () => stop('cancel');
    child.on('error', (err) => stderrChunks.push(Buffer.from(err.message)));
    child.once('close', (code) => {
      closed = true;
      closedCode = code;
      finish();
    });
    child.once('spawn', () => {
      if (child.pid !== undefined) options.onSpawn?.(child.pid);
    });
    timeout = setTimeout(() => stop('timeout'), options.timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    if (profile.promptMode === 'stdin') child.stdin?.end(prompt, 'utf8');
    else child.stdin?.end();
  });
  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  if (!timedOut && !cancelled && exitCode !== 0) {
    throw new Error(`Agent process exited with code ${exitCode ?? 'null'}.\nstderr: ${stderr.trim() || '(no stderr output)'}`);
  }
  return { stdout, stderr, exitCode, timedOut, cancelled };
}
