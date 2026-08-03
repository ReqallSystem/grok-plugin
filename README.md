# Reqall Grok Build Plugin

Persistent semantic memory for [Grok Build](https://grok.com) agents.

Automatically gathers context before prompts, classifies completed work, and
saves plans and specifications via the Reqall MCP server.

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

| Event | Description |
|-------|-------------|
| `UserPromptSubmit` | Reminds the agent to run `reqall:context` for the current project |
| `PreToolUse` | Before file edits, search Reqall for path-specific records |
| `PostToolUse` | After meaningful tools, document the work via `reqall:document` |
| `Stop` | Mandatory `reqall:persist` before the turn ends |
| `SubagentStop` | Capture planning output as specs; note other significant results |

### Skills

- `reqall:context` — Initialize project and gather relevant context
- `reqall:document` — Document a single meaningful work item
- `reqall:persist` — Classify and persist all session work
- `reqall:triage` — Classify incoming issues and create prioritized records
- `reqall:review` — Interactive review of open records
- `reqall:sleep` — Knowledge-graph maintenance

### MCP Server

Connects to `https://www.reqall.net/mcp` (HTTP) so Grok can search, create,
and link records. Prefer native MCP auth; fall back to `REQALL_API_KEY` when
needed.

### AGENTS.md

Bundled autopilot policy for context-before-work and persist-before-done.
Copy or merge into a project `AGENTS.md` if you want the same guidance outside
the plugin package.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REQALL_API_KEY` | (optional with MCP auth) | API key for Reqall |
| `REQALL_URL` | `https://www.reqall.net` | Reqall server URL |
| `REQALL_PROJECT_NAME` | auto-detected | Override project name (`org/repo`) |

## Development

No build step — static plugin files only.

```bash
# Validate with Grok when available
grok plugin validate .
```

## License

MIT
