---
name: reqall:document
description: Document a single work item by upserting a record and any related links to Reqall
---

# Document Work Item

Called after meaningful tool use (PostToolUse hook nudge, or a background
sub-agent) to incrementally persist work as it happens. This is lighter-weight
than the full `reqall:persist` skill — it documents a single tool action
rather than an entire session.

## When to Skip

Do **not** create a record if the tool use was:
- A read-only operation (reading files, searching, listing)
- A trivial or failed command (e.g. `ls`, `pwd`, a no-op edit)
- A test run that produced no new findings
- A formatting-only change with no semantic impact

Only document **meaningful** work: file creation, substantive edits,
build/deploy commands, database migrations, configuration changes, etc.

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
| Trivial / no-op                    | --      | skip     |

## Title Conventions

Prefix titles to aid scanning:
- Issues: `BUG:`, `TASK:`, `BLOCKER:`
- Specs: `ARCH:`, `API:`, `AUTH:`, `DATA:`, `UI:`
- Features: `FEAT:`, `REFACTOR:`

## Steps

1. Identify the project using the Project identity contract below. Call `reqall:upsert_project` with that exact name and retain `project_id`.

2. **Evaluate the work** — Look at the tool name and summary provided.
   Decide whether this is worth documenting. If trivial, output
   "Nothing to document." and stop.

3. **Search for existing records** — Call `reqall:search` with a short
   description of the work to find records that may already track this
   item. If an existing record covers this work, update it via
   `reqall:upsert_record` (pass its `record_id`) rather than creating
   a duplicate.

4. **Upsert the record** — Call `reqall:upsert_record` with:
   - `project_id` from step 1
   - `kind` and `status` from the classification table
   - A short, descriptive `title` with the appropriate prefix
   - A `body` summarizing what was done and why. Include file paths,
     command output, or other details useful for future semantic search.

5. **Upsert links** — If the search in step 3 found related records,
   call `reqall:upsert_link` to connect them:
   - A bug fix `implements` a spec
   - A test `tests` an architecture decision
   - A new task is `related` to or `blocks` an existing record
   - A spec is `parent` of sub-specifications

6. **Summarize** — Output a one-line summary of what was documented
   (or "Nothing to document." if skipped).

## Project identity contract

Reuse the exact host-provided project identity throughout recall, work, persistence, and verification. Without a host binding, resolve: trimmed `REQALL_PROJECT_NAME` → network Git `origin` (final two path segments, trailing slash/`.git` removed) → explicitly labelled `project_name`/`project` prompt selection or retained session selection → nearest valid ancestor `.reqall.yml`/`.reqall.yaml` → nearest package identity (`package.json`, `go.mod`, `Cargo.toml` at each directory) → exact cwd-relative path within a known workspace → `.machine/<short-lower-hostname>/<os-user>`. Never infer identity from arbitrary slash tokens or an unconstrained directory basename. Labels accept `:`/`=` and plain, single/double-quoted, or backtick values; first labelled match wins, not synthetic report examples. Environment and network Git override retained selections at the next turn; mid-turn hooks reuse the bound identity. `REQALL_MACHINE_NAME` overrides the whole sanitized lowercase host segment (including deliberate dots); use the OS account, not USER/USERNAME.

Read regular UTF-8 metadata files ≤64 KiB. Reqall YAML supports simple top-level string `project` (preferred) or `name`, matching quotes and trailing comments; reject duplicate keys, malformed quotes, nested/complex values, booleans/null/numbers. Package identity is string `package.json.name` (valid `@scope/name` becomes `scope/name`), complete Go `module`, or simple quoted Cargo `[package] name`. Skip invalid/unreadable values. Automatic identities allow ASCII letters/digits/`_-.` in nonempty slash segments; reject absolute/drive/UNC/backslash/tilde and `.`/`..` segments. Search ancestors through the containing workspace root inclusive, otherwise filesystem root. `REQALL_WORKSPACE_ROOT` (cwd-relative or `~/` supported), else nearest regular `.reqall-workspace`, sets the boundary; resolve symlinks before containment, do not replace an invalid explicit root with a marker, and do not use an empty root-relative identity. Preserve all relative segments. Deliberate manual SLEEP targets override automatic discovery; account preferences may deliberately target `.user`.
