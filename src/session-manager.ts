import { randomBytes } from 'node:crypto';
import { ConversationEntry } from './prompt-builder.js';

export interface Session {
  agentId: string;
  agent: string;
  status: 'working' | 'waiting_for_reply' | 'done' | 'error' | 'cancelled';
  conversation: ConversationEntry[];
  startedAt: Date;
  pid?: number;
  timeout: number;
  model?: string;
  thinking?: string;
  cwd: string;
}

interface ActiveRun {
  controller: AbortController;
  done: Promise<void>;
  resolve: () => void;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private runs: Map<string, ActiveRun> = new Map();
  private shuttingDown = false;

  createSession(agent: string, timeout: number, model?: string, thinking?: string, cwd = process.cwd()): Session {
    if (this.shuttingDown) throw new Error('Agent server is shutting down.');
    const agentId = `${agent}-${randomBytes(3).toString('hex')}`;
    const session: Session = {
      agentId,
      agent,
      status: 'working',
      conversation: [],
      startedAt: new Date(),
      timeout,
      model,
      thinking,
      cwd,
    };
    this.sessions.set(agentId, session);
    return session;
  }

  getSession(agentId: string): Session | undefined {
    return this.sessions.get(agentId);
  }

  isCancelled(agentId: string): boolean {
    const session = this.sessions.get(agentId);
    return !session || session.status === 'cancelled';
  }

  updateStatus(agentId: string, status: Session['status']): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.status = status;
    }
  }

  addConversation(agentId: string, entry: ConversationEntry): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.conversation.push(entry);
    }
  }

  setPid(agentId: string, pid: number): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.pid = pid;
    }
  }

  beginRun(agentId: string): AbortSignal {
    if (this.shuttingDown) throw new Error('Agent server is shutting down.');
    const session = this.sessions.get(agentId);
    if (!session || session.status === 'cancelled') throw new Error('Agent session has been cancelled.');
    if (this.runs.has(agentId)) throw new Error('Agent session is already running.');
    let resolve!: () => void;
    const done = new Promise<void>((complete) => { resolve = complete; });
    const run = { controller: new AbortController(), done, resolve };
    this.runs.set(agentId, run);
    session.status = 'working';
    return run.controller.signal;
  }

  endRun(agentId: string): void {
    const run = this.runs.get(agentId);
    this.runs.delete(agentId);
    const session = this.sessions.get(agentId);
    if (session) delete session.pid;
    run?.resolve();
  }

  removeSession(agentId: string): void {
    this.sessions.delete(agentId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  async killSession(agentId: string): Promise<boolean> {
    const session = this.sessions.get(agentId);
    if (!session) return false;
    session.status = 'cancelled';
    const run = this.runs.get(agentId);
    if (!run) return false;
    run.controller.abort();
    await run.done;
    return true;
  }

  async cleanupAll(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all([...this.sessions.keys()].map((id) => this.killSession(id)));
    this.sessions.clear();
  }
}
