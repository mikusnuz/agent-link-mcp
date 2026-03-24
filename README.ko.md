[English](README.md) | **한국어**

# agent-link-mcp

[![npm version](https://img.shields.io/npm/v/agent-link-mcp.svg)](https://www.npmjs.com/package/agent-link-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI 에이전트 간 양방향 협업을 위한 MCP 서버입니다. Claude Code, Codex, Gemini, Aider 등 어떤 AI 코딩 에이전트 CLI든 생성하고 소통할 수 있습니다.

## 언제 사용하나요

- **버그에서 막혔을 때** — 에이전트가 두 번 시도했지만 실패했다면, 다른 에이전트에게 새로운 시각을 요청하세요.
- **두 번째 의견이 필요할 때** — 다른 AI 모델에게 코드 리뷰나 아키텍처 조언을 받으세요.
- **모델별 강점 활용** — 계획은 Claude, 실행은 Codex, 리서치는 Gemini.
- **병렬 작업** — 여러 에이전트를 동시에 생성해 독립적인 하위 작업을 병렬로 처리하세요.
- **러버덕 디버깅** — 한 에이전트가 다른 에이전트에게 문제를 설명하고 해결책을 받으세요.

## 사용 사례

### 막혔을 때 도움 요청

주 에이전트가 같은 문제에서 계속 실패한다면, 다른 에이전트에게 물어보세요:

```
# Claude Code가 해결하지 못하는 TypeScript 에러가 발생했습니다.
# Codex에게 두 번째 의견을 요청합니다:

spawn_agent("codex", "This TypeScript error keeps appearing. How do I fix it?", {
  error: "Type 'string' is not assignable to type 'number'",
  files: ["src/utils.ts"]
})
```

### 에이전트 간 코드 리뷰

다른 모델에게 에이전트의 코드 변경 사항을 리뷰 받으세요:

```
spawn_agent("claude", "Review these changes for bugs and edge cases", {
  files: ["src/api.ts", "src/handler.ts"],
  intent: "Code review before merge"
})
```

### 멀티 에이전트 파이프라인

각 에이전트가 다른 단계를 담당하는 파이프라인을 구성하세요:

```
# 에이전트 1: 리서치
spawn_agent("gemini", "Find the best approach for WebSocket reconnection")

# 에이전트 2: 구현 (에이전트 1의 조언 활용)
spawn_agent("codex", "Implement WebSocket reconnection with exponential backoff", {
  files: ["src/ws-client.ts"]
})

# 에이전트 3: 리뷰
spawn_agent("claude", "Review this implementation for production readiness", {
  files: ["src/ws-client.ts"]
})
```

### 양방향 협업

에이전트가 질문을 되물을 수 있습니다. 호스트가 답변하면 작업이 계속됩니다:

```
Host: spawn_agent("codex", "Add caching to the API layer")
Codex: [QUESTION] Should I use Redis or in-memory cache?
Host: reply("codex-a1b2c3", "Use Redis, we have it in our docker-compose")
Codex: [RESULT] Added Redis caching with 5-minute TTL...
```

## 왜 만들었나요

AI 코딩 에이전트는 가끔 막힙니다. 당신을 기다리는 대신, 다른 에이전트에게 도움을 요청할 수 있다면 어떨까요? **agent-link-mcp**는 MCP 호환 에이전트가 다른 에이전트 CLI를 협업자로 생성하고, 질문을 주고받으며, 결과를 돌려받을 수 있게 합니다 — 모두 표준 MCP 도구를 통해서요.

- **단방향 설치** — 호스트 에이전트에만 이 MCP 서버를 설치하면 됩니다. 생성된 에이전트는 단순한 CLI 서브프로세스입니다.
- **양방향** — 호스트가 생성된 에이전트에게 질문할 수 있고, 생성된 에이전트도 호스트에게 질문을 되물을 수 있습니다.
- **범용** — 프롬프트를 받아 텍스트를 반환하는 모든 CLI와 호환됩니다. Claude, Codex, Gemini, Aider에 대한 내장 프로파일을 제공합니다.
- **멀티 에이전트** — 병렬 협업을 위해 여러 에이전트를 동시에 생성할 수 있습니다.

## 사전 요구사항

agent-link-mcp는 다른 AI 에이전트를 CLI 서브프로세스로 생성합니다. **협업에 사용할 에이전트 CLI를 미리 설치하고 인증해야 합니다:**

| 에이전트 | 설치 | 인증 |
|---------|------|------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude login` |
| Codex | `npm install -g @openai/codex` | `codex login` |
| Gemini CLI | `npm install -g @anthropic-ai/gemini-cli` | `gemini login` |
| Aider | `pip install aider-chat` | `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY` 환경변수 설정 |

사용할 에이전트만 설치하면 됩니다. agent-link-mcp가 설치된 CLI를 자동으로 감지합니다.

## 설치

```bash
# Claude Code
claude mcp add agent-link npx agent-link-mcp

# Codex
codex mcp add agent-link npx agent-link-mcp

# 모든 MCP 클라이언트
npx agent-link-mcp
```

> **참고:** 현재 작업 중인 에이전트에만 이 MCP 서버를 설치하면 됩니다. 다른 에이전트들은 서브프로세스로 생성되므로 agent-link-mcp가 필요 없습니다.

## 도구

### `spawn_agent`

에이전트를 생성하고 작업을 전달합니다.

```json
{
  "agent": "codex",
  "task": "Refactor this function for better performance",
  "context": {
    "files": ["src/utils.ts"],
    "error": "TypeError: Cannot read property 'x' of undefined",
    "intent": "Performance improvement"
  },
  "model": "o3",
  "timeoutMs": 7200000
}
```

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|-------|------|
| `agent` | string | *필수* | 에이전트 이름 (`"claude"`, `"codex"`, `"gemini"`, `"aider"`) |
| `task` | string | *필수* | 작업 설명 |
| `context` | object | — | 선택 `{ files, error, intent }` |
| `cwd` | string | cwd | 에이전트 프로세스의 작업 디렉토리 |
| `model` | string | — | 사용할 모델 (예: `"o3"`, `"gpt-5.4"`, `"claude-sonnet-4"`, `"gemini-2.5-pro"`). `--model` 플래그로 전달됩니다. |
| `timeoutMs` | number | 3600000 | 타임아웃 (ms). 기본값: **1시간**. |

반환값:
- `{ status: "done", agentId: "codex-a1b2c3", result: "..." }` — 작업 완료
- `{ status: "waiting_for_reply", agentId: "codex-a1b2c3", question: "..." }` — 에이전트가 추가 정보를 요청함
- `{ error: "...", agentId: "codex-a1b2c3" }` — 오류 발생

### `reply`

생성된 에이전트의 질문에 답변하고 대화를 이어갑니다.

```json
{
  "agentId": "codex-a1b2c3",
  "message": "Yes, you can remove the side effects"
}
```

### `kill_agent`

실행 중인 에이전트 세션을 중단합니다.

```json
{
  "agentId": "codex-a1b2c3"
}
```

### `list_agents`

사용 가능한 에이전트 CLI 목록을 조회합니다.

```json
{
  "agents": [
    { "name": "claude", "command": "claude", "source": "auto", "available": true },
    { "name": "codex", "command": "codex", "source": "auto", "available": true },
    { "name": "gemini", "command": "gemini", "source": "auto", "available": false }
  ]
}
```

### `get_status`

활성 에이전트 세션을 조회합니다.

```json
{
  "sessions": [
    { "agentId": "codex-a1b2c3", "agent": "codex", "status": "waiting_for_reply", "startedAt": "..." }
  ]
}
```

## 동작 원리

```
사용자 (Claude Code 사용 중)
  ↓
"Ask Codex to help with this refactoring"
  ↓
Claude Code → spawn_agent("codex", task, context)
  ↓
agent-link-mcp 서버 → `codex` CLI를 서브프로세스로 생성
  ↓
Codex가 작업 처리 중...
  ↓
Codex: "[QUESTION] Should I remove the side effects?"
  ↓
agent-link-mcp → 응답 파싱 → Claude Code에 반환
  ↓
Claude Code → reply("codex-a1b2c3", "Yes, remove them")
  ↓
agent-link-mcp → 누적된 컨텍스트로 Codex 재호출
  ↓
Codex: "[RESULT] Refactoring complete. Here's what I changed..."
  ↓
Claude Code가 결과를 받아 작업 계속
```

## 설정

### 자동 감지

agent-link-mcp는 설치된 에이전트 CLI를 자동으로 감지합니다:

| 에이전트 | CLI 명령어 |
|---------|-----------|
| Claude Code | `claude` |
| Codex | `codex` |
| Gemini | `gemini` |
| Aider | `aider` |

### 커스텀 에이전트

`~/.agent-link/config.json` 설정 파일을 통해 커스텀 에이전트를 추가할 수 있습니다:

```json
{
  "agents": {
    "codex": {
      "command": "/usr/local/bin/codex",
      "args": ["--full-auto"],
      "promptFlag": null,
      "outputFormat": "text"
    },
    "my-local-llm": {
      "command": "ollama",
      "args": ["run", "codellama"],
      "promptFlag": null,
      "outputFormat": "text"
    }
  }
}
```

`AGENT_LINK_CONFIG` 환경변수로 설정 파일 경로를 재정의할 수 있습니다.

## 모델 선택

`model` 파라미터로 생성된 에이전트가 사용할 모델을 지정할 수 있습니다:

```
# Codex에 특정 모델 지정
spawn_agent("codex", "Debug this issue", { model: "o3" })

# Claude에 특정 모델 지정
spawn_agent("claude", "Review this code", { model: "claude-sonnet-4" })
```

모델 이름은 에이전트 CLI의 `--model` 플래그로 전달됩니다. 생략하면 에이전트의 기본 모델이 사용됩니다.

## 타임아웃

기본 타임아웃은 **1시간** (3,600,000ms)입니다. 호출별로 재정의할 수 있습니다:

```
# 복잡한 작업을 위한 2시간 타임아웃
spawn_agent("codex", "Refactor the entire auth system", { timeoutMs: 7200000 })
```

## 대화 프로토콜

생성된 에이전트는 응답 형식을 지정하는 지침을 받습니다:

- `[QUESTION] ...` — 호스트 에이전트에게 추가 정보 요청
- `[RESULT] ...` — 작업 완료

에이전트가 형식을 따르지 않으면 전체 출력이 결과로 처리됩니다.

## 라이선스

MIT
