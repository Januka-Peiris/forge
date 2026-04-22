# Forge Workspace Config

Forge reads optional workspace configuration from:

```text
.forge/config.json
```

This file is repo/workspace-local and is intended for local orchestration: setup commands, check commands, teardown commands, agent profiles, and MCP metadata.

Forge does **not** treat this as a cloud/platform config. It should stay practical, inspectable, and safe by default.

## Minimal Example

```json
{
  "setup": ["npm install"],
  "run": ["npm run typecheck", "npm run lint", "npm test"],
  "teardown": ["pkill -f 'vite --host 127.0.0.1'"]
}
```

## Fields

### `setup`

Array of shell commands for preparing a workspace.

```json
{
  "setup": ["npm install", "cp .env.example .env.local"]
}
```

Notes:

- Auto-run setup is off by default.
- Setup can be started manually from Forge.
- Risky setup commands are blocked unless explicitly allowed in Settings.

### `run`

Array of shell commands for checks, tests, dev servers, or other workspace runs.

```json
{
  "run": ["npm run typecheck", "npm run lint", "cargo test"]
}
```

Notes:

- Run commands execute in inspectable terminals.
- Forge records script execution in activity.
- Risky run commands are blocked unless explicitly allowed in Settings.

### `teardown`

Array of shell commands to run during cleanup.

```json
{
  "teardown": ["npm run stop-dev"]
}
```

Notes:

- Safe cleanup starts teardown commands but does not remove worktrees or kill ports by default.
- Risky teardown commands are blocked unless explicitly allowed in Settings.

## Agent Profiles

Use `agentProfiles` or `agent_profiles` to define additional local agent profiles.

```json
{
  "agentProfiles": [
    {
      "id": "claude-sonnet-review",
      "label": "Claude Sonnet Review",
      "agent": "claude_code",
      "command": "claude",
      "model": "claude-sonnet-4-6",
      "mode": "review",
      "description": "Repo-defined review profile"
    }
  ]
}
```

Common fields:

- `id`
- `label`
- `agent`: `codex`, `claude_code`, `kimi_code`, `local_llm`, `openai`, or `shell`
- `command`
- `args`
- `model`
- `reasoning`
- `mode`
- `provider`
- `endpoint`
- `local`
- `description`
- `skills`
- `templates`

## Local LLM Profiles

Local LLMs are configured as normal agent profiles. Forge does not start or manage model servers for you; it launches the configured local command in an inspectable terminal and passes normal Forge prompt metadata into that session.

You can create app-wide local profiles from:

```text
Settings → Agent Profiles & Local LLMs
```

App-level profiles are saved in Forge settings and are available to every workspace. Repo/workspace `.forge/config.json` profiles can still add or override profiles for a specific codebase. For Ollama, Settings can also discover installed models from `ollama list` so you can pick a local model instead of typing it manually.

Use the **Test** action in Settings to validate a local profile before launching it in a workspace. The diagnostic checks command availability, local endpoint metadata, localhost TCP reachability, and Ollama model presence when relevant. It does not send a prompt, pull models, or start/stop servers.

Example local profile:

- `ollama-qwen-coder`
  - agent: `local_llm`
  - command: `ollama`
  - args: `["run", "qwen2.5-coder"]`
  - provider: `ollama`
  - endpoint: `http://localhost:11434`

You can override or add repo-specific profiles:

```json
{
  "agentProfiles": [
    {
      "id": "ollama-qwen-coder",
      "label": "Ollama Qwen Coder",
      "agent": "local_llm",
      "provider": "ollama",
      "endpoint": "http://localhost:11434",
      "local": true,
      "command": "ollama",
      "args": ["run", "qwen2.5-coder"],
      "model": "qwen2.5-coder",
      "mode": "act",
      "description": "Local Ollama coding model"
    },
    {
      "id": "local-openai-wrapper",
      "label": "Local OpenAI-Compatible CLI",
      "agent": "local_llm",
      "provider": "openai-compatible",
      "endpoint": "http://localhost:1234/v1",
      "local": true,
      "command": "my-local-agent",
      "args": ["--model", "local-model"],
      "model": "local-model"
    }
  ]
}
```

Notes:

- Local profiles are developer-depth configuration, not cloud-agent hosting.
- `endpoint` is metadata for visibility and prompt context; Forge does not inject secrets.
- `command` and `args` stay visible and inspectable.
- Common aliases such as `ollama`, `llama.cpp`, `lmstudio`, and `openai-compatible` normalize to `local_llm`.
- If a local model server is not running, the terminal command will fail visibly instead of Forge silently managing it.
- Profile resolution order is built-in defaults, then app-level profiles, then workspace `.forge/config.json` profiles.

## MCP Servers

Use `mcpServers`, `mcp_servers`, or `mcp` to describe MCP servers available for this workspace.

This is currently metadata/config discovery. Forge passes enabled MCP server metadata into agent prompt context, but does not yet launch or manage MCP server processes.

### Object Form

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "linear-mcp"],
      "env": {
        "LINEAR_API_KEY": "..."
      }
    },
    "docs": {
      "transport": "http",
      "url": "http://localhost:7777/mcp"
    }
  }
}
```

### Array Form

```json
{
  "mcpServers": [
    {
      "id": "docs",
      "transport": "http",
      "url": "http://localhost:7777/mcp",
      "enabled": true
    }
  ]
}
```

MCP fields:

- `id`
- `enabled`
- `transport`
- `command`
- `args`
- `env`
- `url`

Validation notes:

- Enabled MCP entries need either `command` or `url`.
- Invalid MCP entries produce non-blocking MCP warnings.
- MCP env keys are parsed as config metadata, but env values are redacted before being returned to the frontend.
- MCP env values are not injected into agent prompt metadata.

## Full Example

```json
{
  "setup": ["npm install"],
  "run": ["npm run typecheck", "npm run lint", "npm run build"],
  "teardown": [],
  "agentProfiles": [
    {
      "id": "claude-opus-act",
      "label": "Claude Opus Act",
      "agent": "claude_code",
      "command": "claude",
      "model": "claude-opus-4-7",
      "mode": "act"
    }
  ],
  "mcpServers": {
    "docs": {
      "transport": "http",
      "url": "http://localhost:7777/mcp"
    }
  }
}
```

## Safety Defaults

- Auto-run setup is off by default.
- Auto-rebase is off by default.
- Risky setup/run/teardown scripts are blocked by default.
- Script approvals, denials, and starts are recorded in workspace activity.
- Startup recovery marks orphaned terminal sessions and agent runs visibly in activity.
