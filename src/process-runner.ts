import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AgentProfile } from './agent-registry.js';

export interface RunOptions {
  cwd?: string;
  timeoutMs: number;
  model?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export function killProcess(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  const deadline = Date.now() + 5000;
  const interval = setInterval(() => {
    if (Date.now() >= deadline) {
      clearInterval(interval);
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
      return;
    }
    try {
      process.kill(pid, 0);
    } catch {
      clearInterval(interval);
    }
  }, 200);
}

async function writeTempPrompt(prompt: string): Promise<string> {
  const tmpFile = join(tmpdir(), `agent-link-${randomBytes(8).toString('hex')}.txt`);
  await writeFile(tmpFile, prompt, 'utf8');
  return tmpFile;
}

function buildArgs(profile: AgentProfile, prompt: string, model?: string): string[] {
  const args = [...profile.args];

  if (model && profile.modelFlag) {
    args.push(profile.modelFlag, model);
  }

  if (profile.promptMode === 'arg') {
    if (profile.promptFlag !== null) {
      args.push(profile.promptFlag);
    }
    args.push(prompt);
  }

  return args;
}

export async function runAgent(
  profile: AgentProfile,
  prompt: string,
  options: RunOptions
): Promise<RunResult> {
  const tmpFile = await writeTempPrompt(prompt);

  const args = buildArgs(profile, prompt, options.model);

  let child: ChildProcess;

  try {
    child = spawn(profile.command, args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
  } catch (err) {
    await unlink(tmpFile).catch(() => undefined);
    throw new Error(
      `Failed to spawn agent process "${profile.command}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (profile.promptMode === 'stdin' && child.stdin) {
    child.stdin.write(prompt, 'utf8');
    child.stdin.end();
  } else if (child.stdin) {
    child.stdin.end();
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const exitCode = await new Promise<number | null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;

      const pid = child.pid;
      if (pid === undefined) {
        resolve(null);
        return;
      }

      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        resolve(null);
        return;
      }

      setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already gone
        }
        resolve(null);
      }, 5000);
    }, options.timeoutMs);

    child.on('close', (code) => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      resolve(code);
    });

    child.on('error', (err) => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      stderrChunks.push(Buffer.from(err.message, 'utf8'));
      resolve(null);
    });
  });

  await unlink(tmpFile).catch(() => undefined);

  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');

  if (!timedOut && exitCode !== 0) {
    const detail = stderr.trim() || '(no stderr output)';
    throw new Error(
      `Agent process exited with code ${exitCode ?? 'null'}.\nstderr: ${detail}`
    );
  }

  return { stdout, stderr, exitCode, timedOut };
}
