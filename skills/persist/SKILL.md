---
name: reqall:persist
description: Classify and persist all work completed in this session to Reqall
---

# Persist Work

Classify the work completed in this session and save it to the Reqall
knowledgebase. Create one record per distinct work item — sessions often
produce multiple artifacts worth tracking.

## Classification Table

| Work type                          | kind    | status   |
|------------------------------------|---------|----------|
| Bug fix                            | issue   | resolved |
| New bug discovered (not yet fixed) | issue   | open     |
| Completed task                     | todo    | resolved |
| New task identified (not yet done) | todo    | open     |
| Architectural change or decision   | arch    | resolved |
| New or updated specification       | spec    | open     |
| Test scenario added                | test    | open     |
| Trivial / Q&A / unclassifiable     | --      | skip     |

## Title Conventions

Prefix titles to aid scanning:
- Issues: `BUG:`, `TASK:`, `BLOCKER:`, `QUESTION:`
- Specs: `ARCH:`, `API:`, `AUTH:`, `DATA:`, `UI:`

## Steps

1. Identify the project using the Project identity contract below. Call `reqall:upsert_project` with that exact name and retain `project_id`.

2. **Analyze the session** — Review the conversation to identify all
   distinct work items. Scan each category explicitly:
   - Files created or modified
   - Bugs fixed or discovered
   - Architectural or design decisions made
   - Specs written, changed, or discussed
   - Tests added or updated
   - Tasks identified for future work
   - Plans produced by subagents

   A session may produce multiple records, e.g. a bug fix
   (issue/resolved), a new spec (spec/open), and a follow-up task
   (todo/open).

3. **Create records** — For each non-trivial work item, call
   `reqall:upsert_record` with:
   - `project_id` from step 1
   - `kind` and `status` from the classification table
   - A short, descriptive `title` with the appropriate prefix
   - A `body` summarizing what was done, why, and any relevant context.
     Include enough detail for semantic search to find this later.

4. **Create links** — For each meaningful relationship between records
   (new or existing), call `reqall:upsert_link`:
   - A bug fix `implements` a spec
   - A test `tests` an architecture decision
   - A new task is `related` to or `blocks` an existing record
   - A spec is `parent` of sub-specifications

   Use `reqall:search` to find existing records worth linking to.

5. **Summarize** — Tell the user what was persisted: records
   created/updated, links established.

6. **Verify** — Call `reqall:list_records` with the `project_id` to
   review the records just created or updated. Cross-check against the
   work items identified in step 2. If anything was missed, create it
   now.

## When to Skip

If the session was purely Q&A, informational, or trivial (no code changes,
no decisions made), do not create any records. Say "Nothing to persist."

## Project identity contract

Reuse the exact host-provided project identity throughout recall, work, persistence, and verification. Without a host binding, resolve: trimmed `REQALL_PROJECT_NAME` → network Git `origin` (final two path segments, trailing slash/`.git` removed) → explicitly labelled `project_name`/`project` prompt selection or retained session selection → nearest valid ancestor `.reqall.yml`/`.reqall.yaml` → nearest package identity (`package.json`, `go.mod`, `Cargo.toml` at each directory) → exact cwd-relative path within a known workspace → `.machine/<short-lower-hostname>/<os-user>`. Never infer identity from arbitrary slash tokens or an unconstrained directory basename. Labels accept `:`/`=` and plain, single/double-quoted, or backtick values; first labelled match wins, not synthetic report examples. Environment and network Git override retained selections at the next turn; mid-turn hooks reuse the bound identity. `REQALL_MACHINE_NAME` overrides the whole sanitized lowercase host segment (including deliberate dots); use the OS account, not USER/USERNAME.

Read regular UTF-8 metadata files ≤64 KiB. Reqall YAML supports simple top-level string `project` (preferred) or `name`, matching quotes and trailing comments; reject duplicate keys, malformed quotes, nested/complex values, booleans/null/numbers. Package identity is string `package.json.name` (valid `@scope/name` becomes `scope/name`), complete Go `module`, or simple quoted Cargo `[package] name`. Skip invalid/unreadable values. Automatic identities allow ASCII letters/digits/`_-.` in nonempty slash segments; reject absolute/drive/UNC/backslash/tilde and `.`/`..` segments. Search ancestors through the containing workspace root inclusive, otherwise filesystem root. `REQALL_WORKSPACE_ROOT` (cwd-relative or `~/` supported), else nearest regular `.reqall-workspace`, sets the boundary; resolve symlinks before containment, do not replace an invalid explicit root with a marker, and do not use an empty root-relative identity. Preserve all relative segments. Deliberate manual SLEEP targets override automatic discovery; account preferences may deliberately target `.user`.
