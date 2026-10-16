# PR #3 — PR #2 selective integration onto merged main

Base: merged PR #1 / `main` at `a54f89230d43ed49c056f46cf64adc9f66a072a9`.
Reference branch: PR #2 `feature/my-planner-v1` at `2bd29646a526f86d16c405eb1690f82099b5926b`.

## Non-negotiable

- **No whole-file replacement** of the parallel PR #2 `App.tsx`, `model.ts`, planning core, Today/Week/Calendar pages, tracker or persistence.
- The existing Django/PostgreSQL authentication, private accounts, revision-safe cloud synchronization, unsynced draft recovery and signed-out local demo stay authoritative.
- Preserve the canonical `PlannedEntry` representation: `description`, `scheduledTime`, `estimateMinutes`, `subtasks`, `completedAt` and weekly `entryId`. PR #2's `notes`/`startTime`/`durationMin`/`checklist` schema is *not* copied.
- Keep domain rules in `src/domain/*`, planning mutations in `src/lib/planning.ts`, commands in controllers/hooks, page composition in views.
- Preserve current PDF Unicode raster fallback; take only compatible layout and warning improvements from PR #2.
- No silent truncation, destructive automatic import, data reset, account/private-board exposure or deployment.

## Integration batches

1. **Domain and data safety:** postponed dates, recurrence advancement, stale focus IDs, historical snapshots, calendar occurrence completion, migration-safe checklist repair, safe import/backup & recovery/error boundary.
2. **Daily workflow:** one-field quick add; single-task focus mode with optional timer; Now card, day timeline; gentle carry-over of unfinished independently planned copies.
3. **Polish and validation:** keyboard/modal focus, calendar compactness, responsive clarity, printable-tracker bounds & Unicode coverage, branding/research docs as appropriate. Bring useful PR #2 tests across, adapted to the *current* data model and auth context.

## Acceptance before merge

- Existing frontend build/unit/browser tests; domain ownership checker.
- Django backend tests on SQLite **and PostgreSQL**, React → real Django → PostgreSQL end-to-end journey; auth, MFA, session, signed-out isolation; two-device revision conflict/draft recovery.
- Regression: old backup & cloud board round trip; independent checklist/completion times; weekly commitments/copy-paste; calendar-specific recurring period; duplicate IDs; overflow/corrupt data; imports with international text; PDF preview and exported PDF; mobile/touch/keyboard flows.
- CI evidence must be from PR #3 HEAD. PR #2's reported 352 unit/143 E2E passes apply to PR #2 only.
- No staging/production deployment, merge or destructive cleanup from this PR.

## Notes
- PR #2 remains open as the historical source until accepted features are in PR #3.
- A feature is not counted delivered until wired through current auth-safe persistence and regression-tested.
