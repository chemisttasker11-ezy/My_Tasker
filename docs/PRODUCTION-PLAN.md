# My Planner: production plan (v1.0)

Inputs: [HANDOVER.md](../HANDOVER.md), [REVIEW.md](../REVIEW.md), [research/SUMMARY.md](research/SUMMARY.md),
[audit/code-review.md](audit/code-review.md) (Codex, 20 findings, "CR-n" below),
[audit/design-critique.md](audit/design-critique.md) ("DC-n"), [audit/gates.md](audit/gates.md) (build/test run).
Design rules: [DESIGN.md](DESIGN.md). **v1** = must-have for v1.0 · **later** = after v1.0.

## Data-safety rule for every batch

The storage key `my-command-centre:v1` stays. New data is **additive**: new optional fields (e.g. `plannedEntries`)
default to empty when an old board loads, and a migration test proves an old backup and an old saved board load
with nothing lost. Before any migration write, the app saves the old raw value under
`my-command-centre:v1:backup-<date>`. Nothing here breaks existing saved data. If a later item would, I stop and ask.

## Batch 1: make it safe (3 agy profiles in parallel)

| Piece | Owner / lane | Files (exclusive) | Work | Tag |
|---|---|---|---|---|
| **1A Data & logic** | g1 · `complex` | `src/model.ts`, `src/model.test.ts`, `src/App.tsx`, `src/main.tsx`, `src/views/SettingsView.tsx`, `src/views/TodayView.tsx`, `src/views/WeekPlannerView.tsx` | Corrupt-storage recovery (keep the raw payload, show a recovery screen, never auto-overwrite) CR-1. Enforce loader limits at edit time and recover over-limit data CR-2. Cross-tab revision check CR-3. Validate timestamps CR-4 and dedupe checklist IDs CR-19 on import. Safe import: preview counts, confirm, auto-backup before replace. Storage-failure banner. Error boundary CR-12. Logic fixes CR-5, 6, 13, 14, 15, 16, 17. Memoize hot paths CR-11. **Neutral seed data and areas for fresh installs** DC-1 (existing boards untouched). Banner only on Overview/Today DC-2. | v1 |
| **1B Calendar, quotes, PDF** | g2 · `fix` | `src/components/CalendarEntry.tsx`, `src/views/CalendarView.tsx`, `src/lib/calendar*.ts`, `src/lib/quotes.ts`, `src/views/QuotesView.tsx`, `src/lib/tracker.ts`, `src/lib/trackerPdf.ts`, `src/views/TrackerView.tsx`, `public/fonts/*` | Occurrence-date status CR-7. One shared date-specific quote relevance (HANDOVER high #1; App.tsx call site changed by me at merge). PDF space by content (high #2) and bounded header CR-10. Non-Latin/emoji fallback (high #3: detect unsupported glyphs, warn, and use a system font for the SVG preview). Tracker text alternative with status/ticks CR-18. Compact calendar toolbar DC-8. | v1 |
| **1C Accessibility & responsive** | g3 · `ui` | `src/components/TaskModal.tsx`, `src/styles.css`, `src/styles/*.css`, `src/components/TaskBoard.tsx` | Modal focus trap and restore with a sticky Save CR-8. Hide the closed mobile drawer from the keyboard CR-9. Year-calendar contrast CR-20. Settings overflow DC-6. Mobile header wrap DC-7. Body 16px, radii scale and colour tokens DC-9. Visible focus everywhere. Reduced motion. | v1 |

Gate: build, unit tests and e2e green. Then a Codex review of each diff, agy `fix` for real findings, and I merge 1A → 1B → 1C.

## Batch 2: the planning model + focus mode (parallel)

| Piece | Owner / lane | Files | Work | Tag |
|---|---|---|---|---|
| **2A Planned entries** | g1 · `complex` | `src/model.ts`, new `src/lib/planning.ts` (+test), new `src/components/planning/{BoardPicker,DayPlan,PlannedEntryCard}.tsx`, `src/styles/planning.css` | `PlannedEntry {id, sourceTaskId, date, order, startTime?, durationMin?, status, checklist (own ticks), titleOverride?, notes?}`. Copy rule: title, checklist headings and estimate are copied at planning time. Later edits to the source don't touch existing entries, except for an explicit "update from source". Mutations: add, copyToDays (selected or whole week), move, reorder, remove, setStatus/tick. These never touch the source task or its recurrence. Migration: existing dated tasks stay as they are (no auto-conversion, so nothing is duplicated). Shared surfaces: a board picker (search, area filter, Add button per row, optional drag via @dnd-kit) and a day plan list (reorder by drag **and** Move up/down/to-day buttons). | v1 |
| **2B Focus mode** | g2 · `feature` | new `src/views/FocusView.tsx`, `src/styles/focus.css`, 1 line in the nav (done by me) | One task, its checklist, an optional countdown/elapsed bar with +5 min, Done/Not now, Esc exits. Reduced-motion safe. Works for a board task or a planned entry (uses the 2A types through an interface stub). | v1 |
| **2C Quick add** | g3 · `feature` | new `src/components/QuickAdd.tsx` (+test) | One-field capture: Enter saves to the Board inbox lane with defaults. Mounted in Today/Board by 3A/me. | v1 |

## Batch 3: wire planning into the three screens (parallel, after 2A merges)

| Piece | Owner / lane | Files | Work | Tag |
|---|---|---|---|---|
| **3A Today** | g1 · `ui` | `src/views/TodayView.tsx`, `src/styles/today.css` | A "Now" card first (current/next entry with time, Start focus, Done) DC-3. Day timeline with durations, a now-line and time left. Board picker side panel / bottom sheet. Top 3 is kept. QuickAdd. Gentle "carry over unfinished?" prompt for yesterday's entries (Keep for today / Back to board / Pick later). | v1 |
| **3B Week planner** | g2 · `ui` | `src/views/WeekPlannerView.tsx`, `src/styles/weekly.css` | All 7 days visible at ≥1024px (tabs below that) with the picker beside them. Drag/Add to any day, move between days, copy to days or the whole week. Commitments, score, reviews and daily focus preserved. Score card moved below or aside DC-5. | v1 |
| **3C Calendar day window + tracker** | g3 · `ui` | `src/views/CalendarView.tsx`, new `src/components/planning/DayPlanModal.tsx`, `src/lib/tracker.ts` | Clicking a day opens the planning window (same DayPlan + picker). Close returns to the same calendar context. Tracker/PDF show planned entries with their own status/ticks. | v1 |

## Batch 4: test A to Z (Phase 6, parallel by area)

g1: unit tests for every `src/lib/*` and `model.ts` function, including migration from the original backup format.
g2: Playwright flows for Board, Today, Week, Calendar and the planning workflow (drag **and** keyboard paths).
g3: Playwright flows for backups (export → import round trip, a corrupt file, a non-Latin file), PDF export, recurrence, areas, quotes, focus mode, a mobile viewport, keyboard-only navigation and axe checks.
Gate: everything green **twice in a row**. (Note: e2e can't run inside agy's `--sandbox`; see gates.md. agy writes tests and I run the e2e gate.)

## Batch 5: production (Phase 7, me + one agy run)

Branding to "My Planner" (title, manifest, favicon, the "MyTasker" logo text, `Start-My-Tasker.cmd`). Remove
`preview.html`, the `~/` folder and committed `dist/` and `test-results/` if tracked (**I'll ask before deleting**). Update .gitignore,
README (features, screenshots, run/build/deploy), CHANGELOG, LICENSE (**your choice**), and check the netlify/vercel
build. Then ask about creating `chemisttasker11-ezy/My-Planner` (private/public), push and tag `v1.0.0`.

## Later (after v1.0)

Reminders/notifications (PWA + service worker, offline install). Bulk reschedule ("shift the rest of today +1h"). A
"break this down" helper for your own tasks. Optional completion sounds/celebrations toggle. Hash routes and deep
links DC-10. "Welcome back" restart screen after an absence. Optional cloud sync (backend, so **ask first**).

## Questions for you before Batch 1

1. **Seed data:** new users get (a) a neutral starter board (Home, Health, Work, People, Money, Me + 6 example tasks) or (b) an empty board with a 2-step "pick some starters" onboarding? *(Recommend b: zero clutter, uses the existing library.)*
2. **Weekly score:** keep it on by default, or make it opt-in (research says compulsory scoring puts ADHD users off)? *(Recommend opt-in, keeping the existing data.)*
3. **Orchestrator account:** this session reports Claude A's email. Continue here, or move to Claude B?

## Status (17 Oct 2026, 07:30)

| Batch | State |
|---|---|
| 1 Safe (1A data/logic, 1B calendar/quotes/PDF, 1C a11y/responsive) | ✅ merged, reviewed, fixes merged |
| 2 Planning model, focus mode, quick add | ✅ merged |
| 3 Today, Week planner, Calendar day window (+ shared Undo) | ✅ merged, reviewed, fixes merged |
| 4 Unit coverage (every exported function), e2e coverage, axe scans (18, zero serious/critical) | ✅ merged |
| Extra data-safety: over-limit saves keep a recovery copy; missing areas restored instead of rejecting the board | ✅ merged |
| Phase 6 gate | ✅ green twice in a row: build, 352 unit, 143 e2e |
| 5 Production | 🟡 branding, README, CHANGELOG, .gitignore done. **Waiting on you:** delete `preview.html` and the `~` folder (and rename `Start-My-Tasker.cmd`?), LICENSE choice, create `chemisttasker11-ezy/My-Planner` (private/public), push, tag v1.0.0 |

Known, accepted: dates before year 100 get a 1900 offset (documented as `it.fails`). The build warns about a large chunk (main JS ~430 kB); code-splitting is a "later" item.
