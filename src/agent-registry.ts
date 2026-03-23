import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SERVER_TITLE = 'Agent Link';
export const SERVER_INSTRUCTIONS =
  'Spawn and collaborate with other AI coding agents. Use spawn_agent to start a task, reply to answer questions, and kill_agent to abort.';

export interface AgentProfile {
  command: string;
  args: string[];
  promptFlag: string | null;
  promptMode: 'stdin' | 'arg';
  outputFormat: 'text' | 'json';
}

export interface AgentInfo {
  name: string;
  command: string;
  source: 'auto' | 'config';
  available: boolean;
}

const BUILT_IN_PROFILES: Record<string, AgentProfile> = {
  claude: {
    command: 'claude',
    args: ['-p', '--output-format', 'json'],
    promptFlag: null,
    promptMode: 'stdin',
    outputFormat: 'json',
  },
  codex: {
    command: 'codex',
    args: ['exec'],
    promptFlag: null,
    promptMode: 'arg',
    outputFormat: 'text',
  },
  gemini: {
    command: 'gemini',
    args: [],
    promptFlag: null,
    promptMode: 'stdin',
    outputFormat: 'text',
  },
  aider: {
    command: 'aider',
    args: [],
    promptFlag: '--message',
    promptMode: 'arg',
    outputFormat: 'text',
  },
};

interface ConfigFile {
  agents?: Record<string, Partial<AgentProfile>>;
}

function resolvedConfigPath(): string {
  const envPath = process.env['AGENT_LINK_CONFIG'];
  if (envPath) {
    return envPath;
  }
  return join(homedir(), '.agent-link', 'config.json');
}

function isCommandAvailable(command: string): boolean {
  try {
    if (process.platform === 'win32') {
      execSync(`where ${command}`, { stdio: 'ignore' });
    } else {
      execSync(`command -v ${command}`, { stdio: 'ignore', shell: '/bin/sh' });
    }
    return true;
  } catch {
    return false;
  }
}

export function detectAgents(): string[] {
  return Object.keys(BUILT_IN_PROFILES).filter((name) => {
    const profile = BUILT_IN_PROFILES[name];
    return profile !== undefined && isCommandAvailable(profile.command);
  });
}

export function loadConfig(): Record<string, AgentProfile> {
  const configPath = resolvedConfigPath();
  let configAgents: Record<string, Partial<AgentProfile>> = {};

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as ConfigFile;
    if (parsed.agents && typeof parsed.agents === 'object') {
      configAgents = parsed.agents;
    }
  } catch {
    // config file missing or malformed — fall back to built-in profiles only
  }

  const merged: Record<string, AgentProfile> = { ...BUILT_IN_PROFILES };

  for (const [name, overrides] of Object.entries(configAgents)) {
    const base: AgentProfile = merged[name] ?? {
      command: name,
      args: [],
      promptFlag: null,
      promptMode: 'stdin',
      outputFormat: 'text',
    };

    merged[name] = {
      command: overrides.command ?? base.command,
      args: overrides.args ?? base.args,
      promptFlag: overrides.promptFlag !== undefined ? overrides.promptFlag : base.promptFlag,
      promptMode: overrides.promptMode ?? base.promptMode,
      outputFormat: overrides.outputFormat ?? base.outputFormat,
    };
  }

  return merged;
}

export function getAgentProfile(name: string): AgentProfile | undefined {
  const profiles = loadConfig();
  return profiles[name];
}

export function listAgents(): AgentInfo[] {
  const profiles = loadConfig();
  const builtInNames = new Set(Object.keys(BUILT_IN_PROFILES));

  return Object.entries(profiles).map(([name, profile]) => {
    const source: 'auto' | 'config' = builtInNames.has(name) ? 'auto' : 'config';
    return {
      name,
      command: profile.command,
      source,
      available: isCommandAvailable(profile.command),
    };
  });
}
