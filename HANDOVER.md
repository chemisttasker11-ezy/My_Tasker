# CURRENT PR #1 STATUS — 16 October 2026

This section supersedes the historical extraction handover below, which described a **pre-enhancement snapshot** and is retained only for history.

- Architecture/acceptance checkpoint: `9d134f80706ae5f279ffde777ca26884faa55a3f`. [Acceptance workflow #38894751487](https://github.com/chemisttasker11-ezy/My_Tasker/actions/runs/38894751487) passed **all eight jobs** including actual React→Django→disposable PostgreSQL browser acceptance. Subsequent documentation and CI-ratchet changes must pass at their own exact head before release.
- Board-first Today/Week planner, searchable source task picker, independent daily copies, drag/reorder, selected-day calendar copy/paste, five statuses and weekly weighted scoring are **implemented and tested**.
- Dashboard/Today/Completed summaries include independent planned copies; quotes use chosen-day projection; Unicode SVG/PDF tracker includes planned entries.
- Account signup/login/OTP/CAPTCHA, per-user PostgreSQL boards, revision-guarded autosave, backups, admin authenticator TOTP and user/audit dashboard are **implemented and tested with mocked external providers**. They are not verified live against SMTP or Google reCAPTCHA.
- Separate OVH-style production and staging Docker Compose, private PostgreSQL volumes, same-origin React/Django container, dedicated env examples, `shared_backend_network` gateway snippets and backup-first deployment scripts have been written and passed Docker/Compose CI checks.
- **Anti-spaghetti refactor:** `model.ts` and Django `views.py`/`admin_api.py` are backward-compatible import facades; owned frontend domain modules, persistence and planning hooks, task controller, navigation shell, weekly/calendar panels, admin panels and isolated CSS modules now carry the functionality. The 52 KB legacy stylesheet was partitioned with an exact concatenation check. CI ratchets file sizes, dependency direction, stage/production routing, Django SQLite/PostgreSQL, Docker and authenticated browser integration. See [architecture boundaries](docs/ARCHITECTURE_BOUNDARIES.md).
- **Current automated counts:** 54 frontend unit tests; 23 planner browser, 6 auth browser, 2 real Django+PostgreSQL browser scenarios; 12 Django backend tests on each database; eight green jobs at the referenced checkpoint. Manual screenshots of responsive admin dashboard were reviewed and 320/375/390/768/1440 overflow was asserted; this does not replace testing all pages on physical devices.
- **Not completed:** live DNS/TLS/Nginx configuration on OVH; domain CAPTCHA credential registration; real SMTP OTP delivery; secure server env-file provisioning; cross-device/real-device checks on the deployed hostname; independent disaster-recovery restore rehearsal. Do not claim it is released to testers until these pass.
- Keep PR #1 **draft** until deployment readiness and visual acceptance are confirmed. Do not merge to main or alter the ChemistTasker production stack without a release decision.

See [README.md](README.md), [docs/OVH_DEPLOYMENT.md](docs/OVH_DEPLOYMENT.md) and [docs/SENIOR_PACKAGE_TESTING.md](docs/SENIOR_PACKAGE_TESTING.md).

---

## Historical 16 October extraction handover (superseded)


**Prepared:** 16 October 2026, Australia/Brisbane.

**Destination:** https://github.com/chemisttasker11-ezy/My_Tasker

**Status:** source snapshot with completed enhancements and unfinished planning work.

**Latest instruction:** create the handover and push everything together without running tests. Outstanding features are documented for continuation, not implemented in this delivery.

## Repository boundary

The contents of **`apps/my-command-centre/` become the root of this repository**. `package.json`, `src/`, `public/`, `tests/` and app configuration sit directly at the root. Do not wrap them in `apps/my-command-centre/` or include the entire ChemistTasker project.

Extracted from [ChemistTasker PR #180](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/180), head `e502bfb9e1c4485212e90198f40138bc14e1353c`. This app has separate Git history, dependencies and runtime. ChemistTasker services are not required or modified.

Local checkout: `C:\Users\semse\OneDrive\Documents\Desktop\My Tasker`. Development URL: **http://127.0.0.1:5180/**. Run `npm ci`, then `npm run dev`, or use `Start-My-Tasker.cmd` after installing dependencies. Keep the address consistent to access the same browser data.

## Implemented in this snapshot

| Area | Delivered behaviour |
| --- | --- |
| Standalone app | Root-level React/Vite/TypeScript project; app port 5180; isolated browser-test port 5181; separate Vite/Vitest config and npm lockfile. |
| Existing task features | Board drag/drop, editing, optional checklists, priorities, recurrence, five statuses, postponement, duplicate-and-edit, archive/restore, calendar, weekly commitments/scoring/reviews, daily top-three focus and JSON backups. |
| Life task library | 64 detailed templates across eight groups, including 12 practical starters; descriptions, suggested timing, estimates and 5–6 checklist steps. Selective/bulk addition avoids duplicate templates, including renamed/archived tasks with a template identity. |
| User's starter board | The 12 starters were added to the existing local board, giving 38 tasks at the last check while preserving existing progress. Browser state is not committed or included as a personal backup. Fresh browsers can add the starter set from the library. |
| Editable areas | Settings can add, rename and remove areas. Removal requires a destination and reassigns tasks and completion history. Filters and editors use the editable area list. |
| Quotes | Persistent direction reminder; 36 original encouraging quotes across six themes; custom library; date-specific chosen quotes; backup validation/persistence. Automatic relevance needs correction below. |
| Printable tracker | Day/week/month/year; full fit-page SVG preview, zoom/full screen, one-page A4/A3 landscape PDF, area filter, optional undated tasks/checklists. Shared coordinates drive preview/PDF. Year view groups repeat dates per month. |
| Design | Strong cobalt/teal/coral/yellow palette, navy type, bundled Nunito Sans/Outfit and responsive library/quote/settings/tracker screens. |
| Reported overlap | Postpone panel expands inside its card; completed-card opacity and menu layering adjusted. Modal appears above notifications so Save stays accessible. |
| Persistence | Existing storage key retained; import migration supports areas/quotes; same-origin tab updates added. Latest persistence changes still need final verification. |

## New requested work — not implemented

The user paused finalisation to request this workflow. It is the next main development task, not a delivered feature.

### 1. Use the task board as the default planning source

- Show a searchable/filterable picker of **existing My task board tasks** directly in Today, Week planner and the calendar day planning window.
- Drag an existing board task onto a day to add it to the plan. Provide an explicit Add action for touch and keyboard use.
- Keep the board source available for another day. Adding a planned copy must not silently reschedule its whole recurring series.

### 2. Today: arrange and open the day

- Make adding from the board and arranging the day the default interaction.
- Drag to reorder today's planned tasks and modify times/details.
- Open each planned entry to edit its details/checklist, with independent progress for that day's copy.
- Move or remove a planned entry without deleting its board source.

### 3. Week planner: all seven days together

- Show the entire week alongside the board task picker, with all seven day targets visible on desktop.
- Drag board tasks onto any day, reorder within a day and move planned entries between days.
- Copy a task to selected days or the whole week in one action, including its checklist on each copy.
- Keep completion/checklist progress independent for each scheduled copy. Completing Monday must not complete Tuesday or the reusable source.
- Preserve weekly commitments, score/review history and daily focus behaviour when adding this model.

### 4. Calendar: click a day to open a planning window

- Click a day to open an editable day planning window, rather than only changing calendar scale or opening a new-task form.
- Include the same board picker and add/drag/reorder/move/copy/edit behaviour as Today and Week planner.
- Show existing planned entries, allow rearrangement and return to the calendar context when closed.
- Keep day plans consistent across Today, Week planner, Calendar and the printable tracker.

### Suggested implementation direction

Current calendar projection uses `Task.dueDate` and `Task.recurrence`. There is no separate scheduled-entry identity or persisted per-day order. Introduce a validated planned-entry/occurrence model linking back to its board source, with independent date, order, status and checklist progress. Decide explicitly which task details are copied and how later source edits affect existing plans. Migrate existing dated tasks/completion history without data loss or duplicate entries.

Reuse one planning surface and mutation layer across the three entry points. The app already uses `@dnd-kit` for board dragging. Calendar uses native desktop drag/drop to reschedule whole tasks. Keep keyboard/touch alternatives. This is an implementation proposal; no new occurrence model or planning window has been added.

## Other outstanding work

| Priority | Task and acceptance requirement |
| --- | --- |
| High | **Unify quote relevance by selected day.** Banner uses today's outstanding tasks; quote editor receives today's list even for another selected date; tracker uses its displayed period's tasks. Reuse one deterministic date-specific relevant-task list so app/export agree. Preserve user-chosen daily quotes. |
| High | **Balance PDF day layout.** Sparse dated tasks can occupy most of the page while many undated tasks shrink into a small bottom panel. Allocate space by content. Review long quotes/titles, dense months/years and checklists for clipping. |
| High | **PDF character coverage.** Current embedded fonts are Latin subsets. Support non-Latin text/emoji or use a faithful fallback so custom quotes/tasks do not silently lose characters. |
| High | **Final verification when testing resumes.** Latest lazy-loading/cross-tab persistence changes lack a fresh complete gate. Once implemented, verify planning migration, backups, recurrence, independent checklist progress, ordering and tracker integration. |
| Medium | **Branding cleanup.** Update inherited `public/manifest.webmanifest` and `public/favicon.svg`; retire or archive `preview.html`, the old static mock-up. |
| Medium | **Manual visual/accessibility review.** Review new planning at mobile/tablet/desktop widths, both themes, focus, drag alternatives and modal behaviour. Existing postpone overlap is fixed, but new workflows need fresh checks. |

## Validation history and current gate

**No tests or build were run for this handover/push, per instruction.** Test source remains included for future use; skipping execution does not delete test files.

Earlier development reported 37 unit tests and 16 Chromium browser tests passing. A production build passed before final lazy-loading/persistence updates. Four sample PDFs exported one page each; visual inspection found the day allocation issue. These earlier results must not be presented as fresh validation of the delivered commit. See [REVIEW.md](REVIEW.md).

When testing is authorised again, retained commands are `npm run build`, `npm test` and `npm run test:e2e`, after installing Chromium as needed. Browser tests must stay on port 5181 with separate storage. Never clear/reset the user's live board on 5180.

## Data and operations

- State is browser-origin-local under `my-command-centre:v1`, retained for compatibility.
- No backend, sign-in, cross-device sync or automatic cloud backup. Use Settings JSON export/import to preserve or transfer a board.
- Recurring date changes currently move the whole series; completed history remains. Consider both during planning migration.
- PDFs are snapshots; handwriting or editing them does not update the board. Dense sheets trade type size for fitting content and show a warning.
- User browser data/backups, dependency caches, runtime logs, PDF/screenshot samples, `dist/` and `node_modules/` are excluded from Git.
- The destination repository was empty/public when checked for this handover. Source push is authorised; deployment is not part of delivery.

## Continuation map

Start with `src/model.ts`, `src/lib/calendar.ts`, `src/views/TodayView.tsx`, `src/views/WeekPlannerView.tsx`, `src/views/CalendarView.tsx` and `src/App.tsx` for planning. Then integrate `src/lib/tracker.ts` and `trackerPdf.ts` with planned occurrences. Quotes are in `src/lib/quotes.ts` and `src/views/QuotesView.tsx`; areas in `src/lib/areas.tsx` and `src/components/AreaManager.tsx`. Latest styling is in `src/styles/energy.css`.

Implement the requested planning workflow and outstanding corrections before claiming feature completion. This handover preserves the present state for that continuation.

## Full work and test record

[REVIEW.md](REVIEW.md) contains the completed-work record and a source-by-source inventory of all **37 earlier unit tests and 16 earlier Chromium browser tests**, including their scenarios. It also records the earlier build and PDF checks and states exactly which final checks have not been performed. No tests/build were rerun for this handover/push.
