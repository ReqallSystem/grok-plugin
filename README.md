# Reqall Grok Build Plugin

Persistent semantic memory for [Grok Build](https://grok.com) agents.

Automatically retrieves context before work, tracks meaningful tool use, and
requires persistence before a non-trivial turn ends — via lifecycle hooks and
the Reqall MCP server.

## Installation

### Marketplace (recommended)

```bash
grok plugin marketplace add ReqallSystem/plugins
grok plugin install reqall --trust
```

Then enable the plugin if it is not already enabled (`Space` in the Plugins
tab, or add it under `[plugins].enabled` in `~/.grok/config.toml`). Press `r`
in the Plugins / MCP panels, or restart Grok, so skills and the MCP server load.

`--trust` is required for the plugin’s hooks and MCP server to activate.

### Manual (without marketplace)

1. Clone or copy this package somewhere stable, for example:

   ```bash
   git clone https://github.com/ReqallSystem/grok-plugin.git ~/reqall-grok-plugin
   ```

2. Point Grok at it:

   ```toml
   # ~/.grok/config.toml
   [plugins]
   paths = ["~/reqall-grok-plugin"]
   enabled = ["reqall"]
   ```

   Or install from a local path:

   ```bash
   grok plugin install ~/reqall-grok-plugin --trust
   ```

3. Optionally merge `config.toml.example` into `~/.grok/config.toml` if you
   prefer configuring MCP outside the plugin.

## Requirements

- **Node.js 20+** on `PATH` (hook scripts are plain Node ESM; no install step)
- Grok Build with plugin support
- Reqall auth: native MCP OAuth when available, or `REQALL_API_KEY`

## Setup

If your Grok session supports MCP authentication, log in when prompted.

Otherwise create an API key at [reqall.net](https://www.reqall.net) and set:

```bash
# Linux / macOS
export REQALL_API_KEY="your-api-key-here"

# Windows (PowerShell)
[System.Environment]::SetEnvironmentVariable("REQALL_API_KEY", "your-api-key-here", "User")
```

Optional:

```bash
export REQALL_URL="https://www.reqall.net"
export REQALL_PROJECT_NAME="org/repo"
```

## What It Does

### Hooks

Hooks run a cross-platform Node script (`scripts/reqall-hook.mjs`) that speaks
Grok’s structured hook JSON (`hookSpecificOutput.additionalContext`,
`decision: block`).

| Event | Behavior |
|-------|----------|
| `SessionStart` | Warm the Reqall project; note autopilot is active |
| `UserPromptSubmit` | **Retrieve context**: `upsert_project` + semantic `search` + open `list_records`, inject as additional context |
| `PreToolUse` | Path/command-focused search before file edits and shell mutations |
| `PostToolUse` | Mark non-trivial tool use dirty; nudge `reqall:document` / `upsert_record` |
| `Stop` | **Once per turn**, block completion until the agent runs `reqall:persist` (when work was non-trivial) |
| `SubagentStop` | Capture planning output as specs; note other significant results |

All handlers are **fail-open**: network/auth failures never trap the agent.

### Skills

- `reqall:context` — Initialize project and gather relevant context
- `reqall:document` — Document a single meaningful work item
- `reqall:persist` — Classify and persist all session work
- `reqall:triage` — Classify incoming issues and create prioritized records
- `reqall:review` — Interactive review of open records
- `reqall:sleep` — Compress memory (consolidate / split / compact / skip / crosslink)

### MCP Server

Connects to `https://www.reqall.net/mcp` (HTTP) so Grok can search, create,
and link records. Prefer native MCP auth; fall back to `REQALL_API_KEY` when
needed. Hooks use the same API key (or stored `reqall login` token) for
background retrieval.

### AGENTS.md

Bundled autopilot policy for context-before-work and persist-before-done.
Copy or merge into a project `AGENTS.md` if you want the same guidance outside
the plugin package.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REQALL_API_KEY` | (optional with MCP auth) | API key for Reqall (hooks + MCP) |
| `REQALL_URL` | `https://www.reqall.net` | Reqall server URL |
| `REQALL_PROJECT_NAME` | auto-detected | Override project detection (else git `origin` org/repo, else the machine project `.machine/<hostname>/<os-user>`) |
| `REQALL_MACHINE_NAME` | short hostname | Overrides the hostname segment of the machine project — set in CI/containers with ephemeral hostnames |
| `REQALL_PROJECT_NAME` | auto-detected | Override project name (`org/repo`) |

## Development

No build step — static plugin files + Node hook scripts.

```bash
# Smoke-test hook handlers
npm test

# Validate with Grok when available
grok plugin validate .
```

### Local hook smoke test

```bash
# UserPromptSubmit (requires REQALL_API_KEY for live search)
echo '{"hookEventName":"UserPromptSubmit","prompt":"review plugin hooks","cwd":"."}' | node scripts/reqall-hook.mjs

# Stop after dirty work (simulates post-edit gate)
# First run PostToolUse to mark dirty, then Stop.
```

## License

MIT
