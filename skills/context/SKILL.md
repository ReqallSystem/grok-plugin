---
name: reqall:context
description: Initialize project and gather relevant context from the Reqall knowledgebase
---

# Gather Context

Load project context from Reqall before starting work.

## Steps

1. Identify the project using the Project identity contract below.

2. **Ensure the project exists** — Call `reqall:upsert_project` with the
   project name. Note the returned `project_id`.

3. **Search for relevant context** — Call `reqall:search` with a natural
   language query derived from the user's prompt or task description. Use
   the project name as the `project_name` parameter to prioritize results
   from the current project.

4. **List open records** — Call `reqall:list_records` with the `project_id`
   and `status: "open"` to surface active issues, specs, and todos.

5. **Check impact (if relevant)** — If the task involves changing an
   existing record or component, call `reqall:impact` with the relevant
   entity to show downstream records that may be affected. Skip this step
   for new work or simple questions.

6. **Present context** — Summarize findings concisely:
   - Relevant records from search
   - Open items for this project
   - Impact analysis results (if run)

   Call `reqall:get_record` for full details on any records that look
   particularly relevant.

## When to Skip Steps

- Simple question or chat (no coding task): only run step 3 (search).
- Search returns nothing: say so and proceed — the project may be new.
- No open records: skip step 4 output.

## Automatic Hooks

On Grok Build, lifecycle hooks already:

1. **UserPromptSubmit** — call `upsert_project` + semantic `search` + open
   `list_records` and inject results as additional context.
2. **PreToolUse** — path/command-focused search before file edits and
   mutating shell commands.

Use this skill when you need a deeper manual pass (impact analysis, full
record bodies) beyond what the hooks injected.

## Project identity contract

Reuse the exact host-provided project identity throughout recall, work, persistence, and verification. Without a host binding, resolve: trimmed `REQALL_PROJECT_NAME` → network Git `origin` (final two path segments, trailing slash/`.git` removed) → explicitly labelled `project_name`/`project` prompt selection or retained session selection → nearest valid ancestor `.reqall.yml`/`.reqall.yaml` → nearest package identity (`package.json`, `go.mod`, `Cargo.toml` at each directory) → exact cwd-relative path within a known workspace → `.machine/<short-lower-hostname>/<os-user>`. Never infer identity from arbitrary slash tokens or an unconstrained directory basename. Labels accept `:`/`=` and plain, single/double-quoted, or backtick values; first labelled match wins, not synthetic report examples. Environment and network Git override retained selections at the next turn; mid-turn hooks reuse the bound identity. `REQALL_MACHINE_NAME` overrides the whole sanitized lowercase host segment (including deliberate dots); use the OS account, not USER/USERNAME.

Read regular UTF-8 metadata files ≤64 KiB. Reqall YAML supports simple top-level string `project` (preferred) or `name`, matching quotes and trailing comments; reject duplicate keys, malformed quotes, nested/complex values, booleans/null/numbers. Package identity is string `package.json.name` (valid `@scope/name` becomes `scope/name`), complete Go `module`, or simple quoted Cargo `[package] name`. Skip invalid/unreadable values. Automatic identities allow ASCII letters/digits/`_-.` in nonempty slash segments; reject absolute/drive/UNC/backslash/tilde and `.`/`..` segments. Search ancestors through the containing workspace root inclusive, otherwise filesystem root. `REQALL_WORKSPACE_ROOT` (cwd-relative or `~/` supported), else nearest regular `.reqall-workspace`, sets the boundary; resolve symlinks before containment, do not replace an invalid explicit root with a marker, and do not use an empty root-relative identity. Preserve all relative segments. Deliberate manual SLEEP targets override automatic discovery; account preferences may deliberately target `.user`.
