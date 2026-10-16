# Review and validation record

## Handover snapshot — 16 October 2026

This is an initial standalone My Tasker source delivery with unfinished work tracked in [HANDOVER.md](HANDOVER.md). It is not a claim that every requested feature is complete or this snapshot is release-validated.

**No tests or production build were run for this handover/push**, at the user's request. Existing test files are retained. Delivery checks are limited to source/documentation inspection, staged paths, Git destination/root layout and push verification.

## Earlier development evidence

These results were obtained before the pause and handover request; they are historical, not a fresh validation of the delivered commit:

- Initial extraction: production TypeScript/Vite build, 28 unit tests and 10 Chromium browser tests passed after configuration/selector fixes.
- Expanded features: 37 unit tests and 16 Chromium browser tests passed. Coverage included starter persistence, areas, quotes/backups, single-page PDF downloads, postponement card bounds and responsive overflow.
- The last production build passed before the latest tracker lazy-loading and cross-tab persistence changes. Those final changes lack a fresh complete build/test gate.
- Four single-page landscape PDFs were exported and rendered. Day, month and year renderings were visually inspected. The sparse-day/dense-undated allocation issue was found and remains open. PDF visual acceptance is incomplete.
- The app ran separately at `http://127.0.0.1:5180/`; browser tests used 5181 with separate storage.

## Open findings

1. Board-to-day/week drag-and-copy planning and the calendar day planning window are unimplemented. Current rescheduling changes a task's due date/series; independent copies and arbitrary per-day ordering are missing.
2. Suggested quote input differs between banner, quote editor and tracker. The editor uses today's task list even for another selected date. Unify date-specific relevance.
3. Sparse day PDFs reserve too much space for scheduled tasks and squeeze undated tasks. Balance by content and review dense/checklist layouts.
4. Embedded PDF fonts are Latin subsets. Non-Latin custom text/emoji need supported rendering or a faithful fallback.
5. Manifest/favicon retain inherited branding; `preview.html` is an old static mock-up.
6. Final build, integration, PDF and manual accessibility checks remain outstanding. Resume testing only when authorised again.

## Isolation

Only `apps/my-command-centre/` was extracted from source PR #180 at `e502bfb9e1c4485212e90198f40138bc14e1353c`. Its contents are now the repository root. No ChemistTasker services, parent history, monorepo configuration or unrelated app source are included.

The source PR was open/draft when inspected earlier. Inspected CI annotations reported jobs unable to start due to account billing/spending limits, separately from local validation. Nothing was pushed back to that source PR.

Dependencies, build output, logs, screenshot/PDF samples, caches, browser-test output and user backups are excluded from the source delivery.

## Complete earlier test inventory

The following is an inventory of the retained test cases that made up the earlier passing runs: **37 Vitest unit tests in four files and 16 Playwright Chromium browser tests in three files**. This list is read from source for the handover; it does not rerun tests. These cases do not cover the unimplemented new planning workflow or close the outstanding review findings.

### src/model.test.ts

- computes Australia/Brisbane date correctly
- uses Monday as start of week
- recognises quarterly and yearly periods
- logs a recurring task once per period and resets next day
- keeps a one-time completion completed
- rolls monthly due dates from January 31 safely
- validates backups, never executing arbitrary text
- permits independent tasks in all six lanes
- moves a notebook card into a different lane without losing its identity
- reorders tasks inside the same lane
- undoes a recurring task without losing its original due date
- ignores unknown cards and refuses to move archived cards
- starts every notebook task as Not started and migrates old local backups
- moves Not started -> Started -> Progressing without creating completion records
- requires a later date to postpone and removes a postponed task from current focus
- logs Finished and undo restores previous status, due date and checklist
- copies title and checklist headings but not identity, ticks, status or completion
- records Finished when saving an edited task, but editing its notes again does not duplicate history

### src/lib/calendar.test.ts

- uses Brisbane dates and Monday-start weeks
- handles leap years and last days correctly
- never invents a date for undated notebook routines
- projects repeating tasks from their anchor and recognises a Finished occurrence
- reschedules or removes events without deleting the task or its checklist

### src/lib/scoring.test.ts

- documents status points and priority weighting
- postponing cannot silently improve a weekly score or remove a commitment
- saves an immutable review score for later comparison
- limits each day to three distinct priorities and preserves legacy backups
- rejects imported plans with duplicated IDs or invalid scores

### src/lib/lifeFeatures.test.ts

- adds a detailed starter set once, preserving all existing records and progress
- all 64 templates create valid, independent checklists and survive export/import
- migrates original backups without areas or quotes
- renames and removes areas without losing tasks, history or plans
- rejects duplicate names and invalid destinations and uses surviving areas for templates
- keeps daily choices and custom quotes through a backup round trip
- suggests consistently from the relevant collection
- includes every day entry, groups year repeats, and separates undated tasks
- shows undated recurring completion for the selected day without carrying it forward

### tests/task-board.spec.ts

- loads notebook tasks and navigation views
- creates, edits, moves and persists a task
- recurring completion can be undone without duplicating a task
- restores archived tasks
- renders mobile navigation without horizontal page overflow
- duplicates a task into an independently editable new task
- sets simple progress and postpones to a later date
- calendar supports day/week/month/year, adding, editing and unscheduling

### tests/weekly-planner.spec.ts

- weekly planner supports explicit commitments and weighted status scores
- today view limits focus choices to three without marking tasks completed

### tests/life-features.spec.ts

- starter routines are detailed, editable, persistent and only added once
- areas can be added, renamed and removed with safe reassignment
- custom direction and daily quote persist and travel in backups
- day, week, month and year trackers export a complete single PDF page
- postpone panel stays within its completed card and does not overlap the next card
- new screens fit narrow and wide viewports in both colour themes

## Work completed before this delivery

- Inspected PR #180 and its source head; copied only the standalone app folder into My Tasker, leaving ChemistTasker files/services untouched. Inspected source CI failures and identified account billing/spending-limit start failures.
- Installed standalone dependencies, added a lockfile, corrected the Vite/Vitest configuration type conflict and repaired three existing browser selectors without removing assertions. Added a fixed local launcher and isolated test port/storage.
- Added the 64-template life library, practical starter selection and duplicate prevention. Applied 12 starters to the existing user board without resetting existing completion progress.
- Implemented editable areas, task/history reassignment, template fallback to surviving areas and validated migration of legacy backups.
- Added the original quote library, custom/daily/direction settings, persistence and backup validation. Date-specific automatic relevance remains an open finding.
- Added shared tracker data projection and vector PDF/SVG layout, four periods, A4/A3, checklists, undated sections, year recurrence grouping, text alternative, fit/zoom/full screen and density warnings. Bundled PDF fonts with their licence. Final layout/character coverage work remains open.
- Reworked colours/type/layout with locally installed fonts and responsive styles. Fixed the reported postpone-panel overlap, completed-card opacity stacking and notification/modal overlap.
- Added storage-event tab updates, persistence-write guarding and lazy loading of the PDF tracker. A fresh final gate for these changes remains outstanding.
- Added nine unit tests and six browser scenarios beyond the extracted app's 28 unit/10 browser cases. Earlier runs reached 37/37 and 16/16 passing, after fixing issues found during development. Rendered PDF samples and recorded remaining visual findings.
- Replaced outdated extraction documentation with this review record, current README and HANDOVER.md, including all new and outstanding work. Prepared the root-only standalone snapshot for the requested GitHub push without executing tests/build again.
