import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialPrompt, buildReplyPrompt, FORMAT_RULES } from '../src/prompt-builder.js';

describe('buildInitialPrompt', () => {
  it('builds basic prompt with task only', () => {
    const prompt = buildInitialPrompt('Fix the bug', {});
    assert.ok(prompt.includes('Task: Fix the bug'));
    assert.ok(prompt.includes(FORMAT_RULES));
  });

  it('includes intent when provided', () => {
    const prompt = buildInitialPrompt('Refactor', { intent: 'Performance' });
    assert.ok(prompt.includes('Intent: Performance'));
  });

  it('includes error when provided', () => {
    const prompt = buildInitialPrompt('Fix', { error: 'TypeError: null' });
    assert.ok(prompt.includes('Error: TypeError: null'));
  });

  it('includes file contents when provided', () => {
    const prompt = buildInitialPrompt('Review', {
      files: ['src/app.ts'],
      fileContents: { 'src/app.ts': 'const x = 1;' },
    });
    assert.ok(prompt.includes('--- src/app.ts ---'));
    assert.ok(prompt.includes('const x = 1;'));
  });

  it('handles fileContents without files array', () => {
    const prompt = buildInitialPrompt('Review', {
      fileContents: { 'a.ts': 'code' },
    });
    assert.ok(prompt.includes('--- a.ts ---'));
    assert.ok(prompt.includes('code'));
  });

  it('omits empty sections', () => {
    const prompt = buildInitialPrompt('Task', {});
    assert.ok(!prompt.includes('Intent:'));
    assert.ok(!prompt.includes('Error:'));
    assert.ok(!prompt.includes('Files:'));
  });
});

describe('buildReplyPrompt', () => {
  it('builds reply with conversation history', () => {
    const prompt = buildReplyPrompt(
      [
        { role: 'agent', message: 'What does this do?' },
        { role: 'host', message: 'It parses JSON' },
      ],
      'Continue with that understanding',
    );
    assert.ok(prompt.includes('Agent: What does this do?'));
    assert.ok(prompt.includes('Host: It parses JSON'));
    assert.ok(prompt.includes('Continue with that understanding'));
    assert.ok(prompt.includes(FORMAT_RULES));
  });

  it('handles empty conversation history', () => {
    const prompt = buildReplyPrompt([], 'Start fresh');
    assert.ok(prompt.includes('Start fresh'));
  });
});
