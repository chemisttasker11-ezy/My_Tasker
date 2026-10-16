# Research summary: what My Planner must be

Sources: [competitors.md](competitors.md) (14 apps, Codex A) and [reddit.md](reddit.md) (5 subreddits, Codex B),
plus [../audit/design-critique.md](../audit/design-critique.md). Status: ✅ have it · 🟡 partly · ❌ missing.

## Top 10 must-haves

| # | Must-have | Evidence | My Planner today |
|---|---|---|---|
| 1 | **Small Today view**: top 3 up front, backlog hidden | Reddit love #2, competitors "copy" #1 | 🟡 Top-3 exists but Today opens empty and the rest is listed below. |
| 2 | **One-field quick capture**: no date, area or checklist needed | Reddit ask #1, love #1 | 🟡 The "New task" modal asks for many fields. No quick-add line. |
| 3 | **Time made visible**: durations, time left, a timeline with a now-line | Reddit love #3, ask #3. Tiimo/Structured/Llama Life core | ❌ No durations on the day, no timeline. |
| 4 | **Pull board tasks into a day/week plan without rescheduling the source** | Reddit ask #2 ("without duplicating"). HANDOVER features 1–4 | ❌ This is the unbuilt planning workflow. |
| 5 | **Forgiving rollover**: explicit, reversible, no overdue wall | Competitors copy #5/avoid #1, Reddit hate #2/implication #4 | 🟡 Postpone exists. No day-end "carry over?" flow. |
| 6 | **Focus mode with an optional timer** | Llama Life/Inflow/TickTick. Reddit ask #5 | ❌ |
| 7 | **Routines/recurrence with grouped checklists** | Reddit love #5, ask #4 | ✅ Recurrence plus checklists plus 64 templates. |
| 8 | **Task breakdown help** (editable steps, no AI required) | Goblin Tools, Reddit ask #6 | 🟡 Template checklists exist. No "break this down" helper for your own tasks. |
| 9 | **Free, no account, data stays local, easy backup** | Reddit hate #5, competitors copy #8 | ✅ localStorage plus JSON backup. Needs safer import (see audit). |
| 10 | **Printable plan** (paper is a real ADHD tool) | Reddit love #4, implication #10 | ✅ PDF tracker. Layout/font bugs are open. |

## Top 10 pain points to avoid

1. Setup as a project (Notion syndrome). Defaults must work with zero setup.
2. A list that becomes emotionally unmanageable (hundreds of equal items visible).
3. Punitive streaks, red overdue walls, compulsory scoring. *Our weekly score must stay optional.*
4. Rigid schedules where one late task means moving every block by hand. Need bulk shift.
5. Paywalls on essentials and surprise subscriptions.
6. Unreliable saves/notifications. *For us: storage-write failures must be loud, never silent.*
7. Dense dashboards before first value. *Our Overview leads with banner, hero and stats, so lead with the task instead.*
8. Auto-filling every calendar gap and treating AI estimates as commitments.
9. Treating missed routines as accumulated debt (don't pile up missed recurrences).
10. Forced reward/animation/sound. Make every celebration optional and respect reduced motion.

## Where My Planner can win (gaps competitors leave)

- **Free + truly local + printable.** Almost no ADHD app combines a generous free tier, no account and
  paper output. Tiimo/Structured/Sunsama/Motion charge for the core loop.
- **Board → day plan with independent copies.** Most apps either reschedule the task or duplicate it.
  Our planned-entry model (source stays reusable, each day's copy has its own checklist progress) fits
  how ADHD users actually reuse routines.
- **Gentle by design.** No streaks, encouraging quotes, an optional score. Market it as "no guilt".
- **Life-task templates with real steps.** 64 detailed templates already cover the "break it down" need
  without AI.
- **Restart-friendly.** A "welcome back, pick 3 for today" screen after an absence instead of an overdue
  wall. No competitor does this well.

## Mapped to the v1.0 backlog (feeds PRODUCTION-PLAN.md)

| Gap | Backlog item |
|---|---|
| 1, 3, 4 | Planning workflow (planned entries + picker + Today/Week/Calendar), with a timeline and durations on Today. |
| 2 | Quick-add line on Today and Board (title only, Enter to save). |
| 5, avoid 2/9 | Day-end/return "carry over" flow, with no auto-pile of missed recurrences. |
| 6 | Focus mode (single task, checklist, optional timer). |
| avoid 1/7 | Neutral seed data plus lighter Overview, with the banner only on Overview/Today. |
| avoid 6 | Storage-failure banner and safe import (preview, confirm, auto-backup before replace). |
| later | Bulk reschedule, reminders/notifications (PWA), "break this down" helper, optional sounds. |
