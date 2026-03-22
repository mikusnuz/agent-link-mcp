import { randomBytes } from 'node:crypto';
import { ConversationEntry } from './prompt-builder.js';

export interface Session {
  agentId: string;
  agent: string;
  status: 'working' | 'waiting_for_reply' | 'done' | 'error';
  conversation: ConversationEntry[];
  startedAt: Date;
  pid?: number;
  timeout: number;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  createSession(agent: string, timeout: number): Session {
    const agentId = `${agent}-${randomBytes(3).toString('hex')}`;
    const session: Session = {
      agentId,
      agent,
      status: 'working',
      conversation: [],
      startedAt: new Date(),
      timeout,
    };
    this.sessions.set(agentId, session);
    return session;
  }

  getSession(agentId: string): Session | undefined {
    return this.sessions.get(agentId);
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

  removeSession(agentId: string): void {
    this.sessions.delete(agentId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  killSession(agentId: string): boolean {
    const session = this.sessions.get(agentId);
    if (!session || session.pid === undefined) {
      return false;
    }
    try {
      process.kill(session.pid, 'SIGTERM');
      return true;
    } catch {
      return false;
    }
  }

  cleanupAll(): void {
    for (const session of this.sessions.values()) {
      if (session.pid !== undefined) {
        try {
          process.kill(session.pid, 'SIGTERM');
        } catch {
          // 이미 종료된 프로세스는 무시
        }
      }
    }
    this.sessions.clear();
  }
}
