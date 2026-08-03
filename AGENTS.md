# Reqall Memory Autopilot For Grok Build

Reqall has two mandatory goals on non-trivial work:

1. Inject relevant context from prior records before implementation.
2. Persist completed work before ending the turn.

Do this automatically. Do not wait for the user to ask.

## Tools

Use the Reqall MCP tools exposed by the host. Tool names may be displayed
with host-specific prefixes (for example `reqall__search`), but they
correspond to these operations:

- `reqall:search`
- `reqall:upsert_project`
- `reqall:upsert_record`
- `reqall:get_record`
- `reqall:list_records`
- `reqall:upsert_link`
- `reqall:list_links`
- `reqall:impact`
- `reqall:sleep_candidates`
- `reqall:sleep_apply`
- `reqall:delete_record` (only if user explicitly asks)
- `reqall:delete_link` (only if user explicitly asks)

## Skills

Use the bundled skills when available:

- `reqall:context` — initialize the project and gather relevant context
- `reqall:document` — capture one meaningful tool action or work item
- `reqall:persist` — persist all meaningful session outcomes
- `reqall:triage` — classify and prioritize incoming issues or requests
- `reqall:review` — review and update open records
- `reqall:sleep` — run knowledge-graph maintenance

The automatic flow below is still mandatory even when skills are not exposed
by the current host.

## Trigger Policy

Apply the full memory flow for non-trivial requests:

- code edits
- bug fixes
- refactors
- migrations
- architecture or specification decisions
- test or build work

Skip or minimize for trivial requests:

- greetings
- simple Q&A
- formatting-only output
- one-line informational asks

## Phase A: Automatic Context Injection

Run this before editing files or running substantial commands.

1. Resolve project name in this order:
   - `REQALL_PROJECT_NAME`
   - git remote repo name as `org/repo`
   - current directory name
2. Call `reqall:upsert_project` with that exact name and store `project_id`.
3. Call `reqall:search` using the user task as query and the project name
   as hint.
4. Call `reqall:list_records` with `project_id` and `status: "open"` to
   surface active work.
5. If touching a specific file or component, perform an additional targeted
   search for that path/component before editing.
6. Call `reqall:get_record` for top relevant hits when details matter.
7. If changing existing tracked behavior, call `reqall:list_links` and
   `reqall:impact`.
8. Proceed with implementation using this context.

## Incremental Documentation

After meaningful edits, build/deploy commands, migrations, configuration
changes, or verification:

1. Note touched files and behavior changes.
2. Capture completed work, verification evidence, and unresolved risks.
3. Draft Reqall-ready records while the details are fresh.
4. Reuse these notes during final persistence.

Skip read-only, no-op, and formatting-only actions.

## Phase B: Automatic Persistence

Run this before the final user-facing answer.

1. Enumerate distinct work items completed in the turn.
2. For each meaningful item, call `reqall:upsert_record` with appropriate
   `kind`, `status`, `title`, and `body`.
3. Link related records with `reqall:upsert_link` when relationships are
   clear.
4. If verification was run, persist test/build evidence as `kind: "test"`.
5. Persist unresolved follow-ups as open records.
6. Run `reqall:list_records` to sanity-check persisted/open items.
7. In the final response, briefly report what was persisted and any
   remaining open follow-ups.

Never rely on the user to remind you to persist.

## Classification Defaults

- Bug fixed → `kind: "issue"`, `status: "resolved"`
- New unfixed bug → `kind: "issue"`, `status: "open"`
- Completed implementation → `kind: "todo"`, `status: "resolved"`
- Follow-up task → `kind: "todo"`, `status: "open"`
- Architecture decision → `kind: "arch"`, `status: "resolved"`
- New or updated spec → `kind: "spec"`, `status: "open"`
- Test/build evidence → `kind: "test"`, `status: "resolved"` when final,
  or `status: "active"` when ongoing
- Trivial/no-op → skip

## Title Conventions

- Issues: `BUG:`, `TASK:`, `BLOCKER:`, `QUESTION:`
- Specs/architecture: `ARCH:`, `API:`, `AUTH:`, `DATA:`, `UI:`
- Features/refactors: `FEAT:`, `REFACTOR:`
- Verification: `TEST:`

## Safety

- Prefer status transitions (`open` → `resolved` or `archived`) over
  deletion.
- Use destructive deletes only on explicit user request.
- If Reqall MCP is unavailable, continue the user task and state clearly
  that automatic context or persistence could not run.
