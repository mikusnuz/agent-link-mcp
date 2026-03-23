import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripAnsi, parseAgentOutput } from '../src/parser.js';

describe('stripAnsi', () => {
  it('removes basic ANSI color codes', () => {
    assert.equal(stripAnsi('\x1b[32mhello\x1b[0m'), 'hello');
  });

  it('removes CSI sequences', () => {
    assert.equal(stripAnsi('\x1b[1;31mbold red\x1b[0m'), 'bold red');
  });

  it('returns plain text unchanged', () => {
    assert.equal(stripAnsi('hello world'), 'hello world');
  });

  it('handles empty string', () => {
    assert.equal(stripAnsi(''), '');
  });
});

describe('parseAgentOutput', () => {
  it('detects [QUESTION] prefix', () => {
    const result = parseAgentOutput('[QUESTION] What is the intent?');
    assert.equal(result.type, 'question');
    assert.equal(result.message, 'What is the intent?');
  });

  it('detects [RESULT] prefix', () => {
    const result = parseAgentOutput('[RESULT] Refactoring complete');
    assert.equal(result.type, 'result');
    assert.equal(result.message, 'Refactoring complete');
  });

  it('handles [QUESTION] with ANSI codes', () => {
    const result = parseAgentOutput('\x1b[32m[QUESTION]\x1b[0m Should I remove this?');
    assert.equal(result.type, 'question');
  });

  it('handles [RESULT] with leading whitespace', () => {
    const result = parseAgentOutput('  [RESULT] Done');
    assert.equal(result.type, 'result');
    assert.equal(result.message, 'Done');
  });

  it('falls back to result when no tag found', () => {
    const result = parseAgentOutput('Just some regular output\nwith multiple lines');
    assert.equal(result.type, 'result');
    assert.equal(result.message, 'Just some regular output\nwith multiple lines');
  });

  it('handles empty output', () => {
    const result = parseAgentOutput('');
    assert.equal(result.type, 'result');
    assert.equal(result.message, '');
  });

  it('picks first tag when multiple exist', () => {
    const result = parseAgentOutput('[QUESTION] first\n[RESULT] second');
    assert.equal(result.type, 'question');
    assert.equal(result.message, 'first');
  });

  it('handles multiline question', () => {
    const result = parseAgentOutput('Some preamble\n[QUESTION] Is this correct?\nMore text');
    assert.equal(result.type, 'question');
    assert.equal(result.message, 'Is this correct?');
  });
});
