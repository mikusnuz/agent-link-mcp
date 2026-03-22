import { readFile } from 'node:fs/promises';

export interface TaskContext {
  files?: string[];
  fileContents?: Record<string, string>;
  error?: string;
  intent?: string;
}

export interface ConversationEntry {
  role: 'agent' | 'host';
  message: string;
}

export const FORMAT_RULES = `You are a collaborative agent working on a task given by another AI agent.
When you need clarification from the requesting agent, respond with exactly:

[QUESTION] your question here

When you have completed the task, respond with:

[RESULT] your result here

Always use one of these two formats. Do not omit the prefix tags.`;

const MAX_FILE_BYTES = 500 * 1024;

export async function readFileContents(files: string[]): Promise<Record<string, string>> {
  let totalBytes = 0;
  const result: Record<string, string> = {};

  for (const filepath of files) {
    const buf = await readFile(filepath);
    totalBytes += buf.byteLength;

    if (totalBytes > MAX_FILE_BYTES) {
      throw new Error(
        `Total file size exceeds 500KB limit (reached while reading "${filepath}")`
      );
    }

    result[filepath] = buf.toString('utf8');
  }

  return result;
}

export function buildInitialPrompt(
  task: string,
  context: TaskContext,
  formatRules: string = FORMAT_RULES
): string {
  const parts: string[] = [];

  parts.push(`Task: ${task}`);

  if (context.intent) {
    parts.push(`Intent: ${context.intent}`);
  }

  const fileContents: Record<string, string> = context.fileContents ?? {};

  if (context.files && context.files.length > 0) {
    const fileSections: string[] = [];

    for (const filepath of context.files) {
      const content = fileContents[filepath] ?? '';
      fileSections.push(`--- ${filepath} ---\n${content}\n---`);
    }

    if (fileSections.length > 0) {
      parts.push(`Files:\n${fileSections.join('\n\n')}`);
    }
  } else if (Object.keys(fileContents).length > 0) {
    const fileSections: string[] = [];

    for (const [filepath, content] of Object.entries(fileContents)) {
      fileSections.push(`--- ${filepath} ---\n${content}\n---`);
    }

    parts.push(`Files:\n${fileSections.join('\n\n')}`);
  }

  if (context.error) {
    parts.push(`Error: ${context.error}`);
  }

  parts.push(formatRules);

  return parts.join('\n\n');
}

export function buildReplyPrompt(
  conversationHistory: ConversationEntry[],
  replyMessage: string,
  formatRules: string = FORMAT_RULES
): string {
  const historyLines = conversationHistory
    .map((entry) => {
      const label = entry.role === 'agent' ? 'Agent' : 'Host';
      return `${label}: ${entry.message}`;
    })
    .join('\n');

  const parts: string[] = [];

  parts.push(`Previous conversation:\n---\n${historyLines}\n---`);
  parts.push(`New clarification from the requesting agent:\n${replyMessage}`);
  parts.push(`Continue working on the task with the above clarification.`);
  parts.push(formatRules);

  return parts.join('\n\n');
}
