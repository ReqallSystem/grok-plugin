---
name: reqall:review
description: Interactive review and triage of open records for the current project
---

# Review Open Records

Walk through open records for the current project and triage them
interactively with the user.

## Steps

1. Identify the project using the Project identity contract below. Call `reqall:upsert_project` with that exact name and retain `project_id`.

2. **Fetch open records** — Call `reqall:list_records` with `project_id`
   and `status: "open"`. If the user specified a kind filter (e.g.
   "review my issues"), add `kind` accordingly. Otherwise fetch all kinds.

3. **Present each record** — For each open record, show its kind, title,
   and status. Call `reqall:get_record` for the full body if needed.
   Ask the user:
   - Is this still relevant?
   - Should the status change? (resolve, archive)
   - Does it need more detail or updates?
   - Are there related records to link?

4. **Apply updates** — Based on user responses:
   - `reqall:upsert_record` to update status, title, or body
   - `reqall:upsert_link` to create new relationships
   - `reqall:delete_record` only if explicitly requested

5. **Summarize** — Report what changed: records updated, resolved,
   archived, and links created.

## Project identity contract

Reuse the exact host-provided project identity throughout recall, work, persistence, and verification. Without a host binding, resolve: trimmed `REQALL_PROJECT_NAME` → network Git `origin` (final two path segments, trailing slash/`.git` removed) → explicitly labelled `project_name`/`project` prompt selection or retained session selection → nearest valid ancestor `.reqall.yml`/`.reqall.yaml` → nearest package identity (`package.json`, `go.mod`, `Cargo.toml` at each directory) → exact cwd-relative path within a known workspace → `.machine/<short-lower-hostname>/<os-user>`. Never infer identity from arbitrary slash tokens or an unconstrained directory basename. Labels accept `:`/`=` and plain, single/double-quoted, or backtick values; first labelled match wins, not synthetic report examples. Environment and network Git override retained selections at the next turn; mid-turn hooks reuse the bound identity. `REQALL_MACHINE_NAME` overrides the whole sanitized lowercase host segment (including deliberate dots); use the OS account, not USER/USERNAME.

Read regular UTF-8 metadata files ≤64 KiB. Reqall YAML supports simple top-level string `project` (preferred) or `name`, matching quotes and trailing comments; reject duplicate keys, malformed quotes, nested/complex values, booleans/null/numbers. Package identity is string `package.json.name` (valid `@scope/name` becomes `scope/name`), complete Go `module`, or simple quoted Cargo `[package] name`. Skip invalid/unreadable values. Automatic identities allow ASCII letters/digits/`_-.` in nonempty slash segments; reject absolute/drive/UNC/backslash/tilde and `.`/`..` segments. Search ancestors through the containing workspace root inclusive, otherwise filesystem root. `REQALL_WORKSPACE_ROOT` (cwd-relative or `~/` supported), else nearest regular `.reqall-workspace`, sets the boundary; resolve symlinks before containment, do not replace an invalid explicit root with a marker, and do not use an empty root-relative identity. Preserve all relative segments. Deliberate manual SLEEP targets override automatic discovery; account preferences may deliberately target `.user`.
