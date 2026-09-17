---
name: reqall:sleep
description: Compress project memory — consolidate, split, compact, skip, and crosslink records
---

# SLEEP — compress project memory

**Goal:** Preserve **knowledge** in a **minimal number of short, non-redundant records**.
User invoked sleep → rewrite and delete are expected. Compression is the point.
Knowledge = decisions, outcomes, constraints, IDs, contracts — not session prose.

Ops (when advertised): `consolidate` · `split` · `compact` · `skip` · `crosslink` · `promote` · `discard`

Rate-limited ~once per 24h per project. **Modest progress is success** — do not boil the ocean.

## Decision table

| Signal | Action |
|--------|--------|
| Server cluster of highly similar resolved/archived | **consolidate** → one terse record; **sources deleted** |
| Isolated resolved/archived; durable but verbose/redundant | **compact** |
| Isolated resolved/archived; pure noise (ack, empty, no durable fact) | **skip** |
| Active/open; 2+ clearly separable topics | **split** (original deleted by apply) |
| Active/open; single topic, already clear | leave (no op) |
| Cross-project pair; same concept, discovery-useful | **crosslink** |
| Cross-project pair; superficial token overlap | omit |
| `work_review`: unique durable information after comparison | **promote** to supported durable kind(s) |
| `work_review`: no unique durable information after comparison | **discard** when supported, after preserving useful relationships |
| Candidate unclear / not obvious | **omit this pass** (not a full-run refuse) |

Prefer clear, concise records and useful links over perfect coverage. A long but appropriate record can wait for a later sleep.

## WORK review policy

Use host equivalents of the tool names below, and only advertised operations/kinds.
If the required reads or operations are unavailable, omit the candidate this pass.

1. Read each WORK log with `get_record`, paginate incoming/outgoing `list_links`,
   and read linked ARCH/SPEC and other durable records. Use project-scoped `search`
   to find existing intent and knowledge, especially when links are missing.
2. **Alignment is not redundancy.** Preserve unique implementation constraints,
   regression fixes, test evidence, outcomes, and remaining limitations even when
   the work followed its spec. Use `promote` into appropriate durable kinds.
3. **Discard only after comparison shows no unique durable information.** Identify
   the surviving records that cover useful content; a knowledge-free log needs none.
   Preserve useful relationships on durable records before discarding: `discard`
   deletes the log's links too. If coverage or relationship meaning is unclear, omit.
4. Preserve an evidence-backed unresolved deviation as a linked `issue`, separating
   expected behavior, observed behavior, and uncertainty about the cause. The
   implementation or the spec may be wrong. Do not automatically rewrite ARCH/SPEC.
5. **Missing links do not prove new requirements.** Reuse intent found by search.
   Promote a novel fact to `info` (or another fitting durable kind); use `spec` only
   for confirmed requirements, never to turn an unapproved proposal into a decision.
6. **Leave ambiguous cases unchanged.** Preserve historical qualifications: dated
   test results and past PR state are not current deployment/runtime guarantees.
7. Before apply, snapshot source records/links and re-read touched records for drift.
   After apply, inspect every result, read back outputs and surviving links, and
   verify deleted sources return structured not-found. Link a new issue to its
   relevant intent with `upsert_link` if needed, then verify. Repair only confirmed
   missing edges. Never replay a destructive batch after an ambiguous response.

## Steps

1. **Project** — arg → `REQALL_PROJECT_NAME` → git `org/repo` → `.machine/<hostname>/<os-user>` → `upsert_project` → `project_id`.
2. **Candidates** — `sleep_candidates(project_id)`. If rate-limited, report next eligible time and stop.
3. **Summary** — counts: consolidate clusters, compact/skip pool, split, crosslink, work_review when returned. Empty → "No eligible candidates this pass."
4. **Select ops** — decision table and WORK review policy above. Prefer obvious wins; small batch is fine. Bodies: terse, non-redundant.
   - **consolidate** — `kind: "arch"`, `status: "resolved"`; best title; keep knowledge from all members; wording is disposable.
   - **compact** — same id; leaner form.
   - **split** — focused sub-records; kind/status fit each topic (usually match original).
   - **crosslink** — only when useful for discovery.
5. **Apply** — one `sleep_apply` with the batch. No per-op confirmation.
6. **Verify** — follow the WORK review readbacks above; inspect partial failures before reporting success.
7. **Report** — consolidated / compacted / split / crosslinked / skipped / promoted / discarded / errors. If candidates were capped: note to run again later.

## Rules

- Knowledge ≠ wording. Prose is disposable; durable facts are not.
- **consolidate always deletes sources** (server). **promote** and **discard** delete WORK logs only; never output `work` from SLEEP.
- Do not ask whether rewrite/delete is OK — user ran sleep.
- Unclear candidate → omit; do not invent merges or splits.
- Server authorization does not replace client judgment or record/link readback.
