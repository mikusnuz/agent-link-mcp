import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../src/session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('creates session with correct format', () => {
    const session = manager.createSession('codex', 1800);
    assert.match(session.agentId, /^codex-[a-f0-9]{6}$/);
    assert.equal(session.agent, 'codex');
    assert.equal(session.status, 'working');
    assert.equal(session.timeout, 1800);
    assert.deepEqual(session.conversation, []);
  });

  it('retrieves session by id', () => {
    const created = manager.createSession('claude', 1800);
    const found = manager.getSession(created.agentId);
    assert.equal(found?.agentId, created.agentId);
  });

  it('returns undefined for unknown id', () => {
    assert.equal(manager.getSession('unknown-123456'), undefined);
  });

  it('updates status', () => {
    const session = manager.createSession('codex', 1800);
    manager.updateStatus(session.agentId, 'waiting_for_reply');
    assert.equal(manager.getSession(session.agentId)?.status, 'waiting_for_reply');
  });

  it('adds conversation entries', () => {
    const session = manager.createSession('codex', 1800);
    manager.addConversation(session.agentId, { role: 'agent', message: 'question?' });
    manager.addConversation(session.agentId, { role: 'host', message: 'answer' });
    const found = manager.getSession(session.agentId);
    assert.equal(found?.conversation.length, 2);
    assert.equal(found?.conversation[0].role, 'agent');
    assert.equal(found?.conversation[1].role, 'host');
  });

  it('sets pid', () => {
    const session = manager.createSession('codex', 1800);
    manager.setPid(session.agentId, 12345);
    assert.equal(manager.getSession(session.agentId)?.pid, 12345);
  });

  it('removes session', () => {
    const session = manager.createSession('codex', 1800);
    manager.removeSession(session.agentId);
    assert.equal(manager.getSession(session.agentId), undefined);
  });

  it('lists all sessions', () => {
    manager.createSession('codex', 1800);
    manager.createSession('claude', 1800);
    assert.equal(manager.getAllSessions().length, 2);
  });

  it('cleanupAll clears all sessions', () => {
    manager.createSession('codex', 1800);
    manager.createSession('claude', 1800);
    manager.cleanupAll();
    assert.equal(manager.getAllSessions().length, 0);
  });
});
