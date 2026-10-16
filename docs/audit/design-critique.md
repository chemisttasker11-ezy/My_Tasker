# Design critique: ADHD lens (17 Oct 2026)

Method: live app on a separate port (sample data), screens Overview, Today, Board, Week planner,
Calendar, Library, Tracker, Settings at ~800px (tablet/small laptop) and 375px (mobile). Checked
against [docs/DESIGN.md](../DESIGN.md). Impeccable critique + ui-ux-pro-max checklist.

## Scores (1–5)

| Heuristic | Score | Why |
|---|---|---|
| Low clutter | 2 | The direction/quote banner takes the first ~200px of **every** screen. Overview stacks a hero, week card and 4 stat tiles before any task. |
| Clear next step | 2 | No screen leads with "do this now". Today opens on an empty "Choose your top three" card. On mobile the first task is below the second scroll. |
| Time visibility | 1 | No current-time line, no durations or "time left today", no timeline for the day. Week planner shows scores, not hours. |
| Forgiving flows | 3 | Postpone exists and there's no streak shaming. But it's unclear what happens to unfinished tasks at day end, and destructive actions have no Undo toast. |
| Focus mode | 1 | None. There's no single-task view or timer. |
| Gentle reminders | 2 | Encouraging copy and quotes are good. There are no reminders or notifications at all (local-only). |
| Visual craft / brand | 4 | Confident cobalt/sun palette, strong Outfit headings, consistent cards, good dark theme. |
| Accessibility basics | 3 | Skip link, `aria-current` and labelled icon buttons are present. The 15px body is small, and drag needs a keyboard-friendly alternative in the new planning flow. |

## Priority issues

1. **[P0] Personal seed data ships to every new user.** The `src/model.ts:294-322` defaults include
   "ChemistTasker", "Pharmacy" and "HMR/RMMR reports" tasks and areas. Production needs generic areas
   (Home, Health, Work, People, Money, Me) and a small, neutral starter set, or an empty board with a
   2-step onboarding. *Existing users keep their saved data; only fresh installs change.*
2. **[P1] Banner on every screen.** Show direction/quote on Overview and Today only, and make it
   collapsible elsewhere (or remove it there). That frees the first viewport for the task.
3. **[P1] Today needs a "Now" card.** Show the current/next planned task with its time, estimate, a Start
   (focus) button and Done. Put the top-3 picker below it. Add a day timeline with a now-line (ties into
   the planning workflow).
4. **[P1] Focus mode.** One task, its checklist, a visible countdown/elapsed bar, Esc to exit. This is a
   top Reddit ask (see research) and the cheapest big win.
5. **[P1] Week planner above the fold.** At ≤1024px the 7 days start ~650px down, under the
   nav/progress cards. Move the score card to the side or below the days.
6. **[P2] Horizontal overflow in Settings** at ~736px: `.suggestion-row` + small secondary button are
   26px too wide (verified, scrollWidth 762 > 736).
7. **[P2] Mobile header:** "New task" wraps to 2 lines at 375px. Use an icon + short label, or a FAB.
8. **[P2] Calendar:** at 800px the month grid starts below the fold. The controls (PDF button, nav,
   scale, search, area, legend) take 5 rows. Collapse them into one toolbar row.
9. **[P2] Type and radii:** body 15px → 16px. Radii 8/9/10/12/14/16/18/20 → 8/12/16/pill. Move raw hex
   in component CSS to tokens.
10. **[P3] Navigation is buttons with no URLs.** There are no deep links and browser Back leaves the app.
    Hash routes (`#/today`) would fix both with minimal code.

Unverified: content looked clipped mid-page after scrolling on Today/Board in the preview pane. It didn't
reproduce after a repaint (probably a pane paint artifact). Re-check in Playwright screenshots.
