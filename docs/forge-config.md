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
      "id": "codex-high-review",
      "label": "Codex High Review",
      "agent": "codex",
      "command": "codex",
      "reasoning": "high",
      "mode": "review",
      "description": "High-reasoning review profile"
    }
  ]
}
```

Common fields:

- `id`
- `label`
- `agent`: `codex`, `claude_code`, or `shell`
- `command`
- `args`
- `model`
- `reasoning`
- `mode`
- `description`
- `skills`
- `templates`

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
      "id": "codex-high",
      "label": "Codex High",
      "agent": "codex",
      "reasoning": "high",
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
