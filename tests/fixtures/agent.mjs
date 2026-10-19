import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const [mode, readyPath] = process.argv.slice(2);
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  if (mode === 'tree') {
    spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], JSON.stringify({ pid: process.ppid, descendant: process.pid })); setInterval(() => {}, 1000);', readyPath], { stdio: 'ignore' });
    setInterval(() => {}, 1000);
    return;
  }
  if (mode === 'hang' || mode === 'stubborn' || prompt.includes('New clarification from the requesting agent:\nwait')) {
    if (mode === 'stubborn') process.on('SIGTERM', () => {});
    if (readyPath) writeFileSync(readyPath, String(process.pid));
    setInterval(() => {}, 1000);
    return;
  }
  const message = prompt.startsWith('Task:')
    ? '[QUESTION] Which option should I use?'
    : `[RESULT] ${JSON.stringify({ cwd: process.cwd(), prompt })}`;
  process.stdout.write(mode === 'json' ? JSON.stringify({ type: 'result', subtype: 'success', result: message, session_id: 'fixture-only' }) : message);
});
