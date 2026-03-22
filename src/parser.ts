export interface ParsedResponse {
  type: 'question' | 'result';
  message: string;
}

const ANSI_PATTERN = /[\u001b\u009b](?:[@-Z\\-_]|\[[0-9?]*(?:;[0-9]*)*[@-~])|[\u0090\u009d].*?[\u009c]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

export function parseAgentOutput(output: string): ParsedResponse {
  const cleaned = stripAnsi(output);
  const lines = cleaned.split('\n');

  for (const line of lines) {
    const trimmed = line.trimStart();

    if (trimmed.startsWith('[QUESTION]')) {
      const message = trimmed.slice('[QUESTION]'.length).trimStart();
      return { type: 'question', message };
    }

    if (trimmed.startsWith('[RESULT]')) {
      const message = trimmed.slice('[RESULT]'.length).trimStart();
      return { type: 'result', message };
    }
  }

  return { type: 'result', message: cleaned.trim() };
}
