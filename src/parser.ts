export interface ParsedResponse {
  type: 'question' | 'result';
  message: string;
}

const ANSI_PATTERN = /[\u001b\u009b](?:[@-Z\\-_]|\[[0-9?]*(?:;[0-9]*)*[@-~])|[\u0090\u009d].*?[\u009c]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

export function parseAgentOutput(output: string, format: 'text' | 'json' = 'text'): ParsedResponse {
  let text = output;
  if (format === 'json') {
    let envelope: unknown;
    try { envelope = JSON.parse(stripAnsi(output)); }
    catch { throw new Error('Agent returned invalid JSON output.'); }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      throw new Error('Agent JSON output must be a result object.');
    }
    const result = envelope as { result?: unknown; is_error?: boolean; subtype?: string };
    if (result.is_error || (result.subtype && result.subtype.startsWith('error'))) {
      throw new Error(typeof result.result === 'string' ? result.result : 'Agent reported an unsuccessful result.');
    }
    if (typeof result.result !== 'string') throw new Error('Agent JSON output is missing a text result.');
    text = result.result;
  }
  const cleaned = stripAnsi(text);

  // Find the first [QUESTION] or [RESULT] tag and return everything after it
  const questionIdx = cleaned.indexOf('[QUESTION]');
  const resultIdx = cleaned.indexOf('[RESULT]');

  // Determine which tag comes first
  const hasQuestion = questionIdx !== -1;
  const hasResult = resultIdx !== -1;

  if (hasQuestion && (!hasResult || questionIdx < resultIdx)) {
    const message = cleaned.slice(questionIdx + '[QUESTION]'.length).trim();
    return { type: 'question', message };
  }

  if (hasResult) {
    const message = cleaned.slice(resultIdx + '[RESULT]'.length).trim();
    return { type: 'result', message };
  }

  // No tags found — return full output as result
  return { type: 'result', message: cleaned.trim() };
}
