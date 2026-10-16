---
name: My Planner
description: A calm, bright, local-first planner for adults with ADHD. One clear next step, time you can see, nothing to feel guilty about.
colors:
  cobalt: "#1648df"          # --purple (legacy name): primary action, links, selected state
  cobalt-deep: "#123dad"     # hover/pressed on cobalt
  cobalt-wash: "#e7efff"     # --soft-purple: selected rows, chips
  navy-ink: "#102c56"        # --ink: body text, headings
  muted-ink: "#34557c"       # --muted: secondary text (AA on bg and paper)
  sky-bg: "#f0f6ff"          # --bg
  paper: "#ffffff"           # --paper: cards, panels, modals
  lane-bg: "#e6f1ff"         # --lane-bg: board lanes, day columns
  border: "#c2d7f4"          # --border
  sidebar: "#102d72"         # --sidebar
  teal-done: "#007965"       # --positive: finished, progress, success
  sun: "#ffcf3d"             # highlight: today, focus pick, starter badge (never text on white)
  coral: "#d94c1c"           # attention: overdue, destructive (use sparingly)
  amber-caution: "#8a4100"   # --caution: warnings, postponed
  focus-ring: "#ba3a0c"      # --focus-outline (dark theme: #ffd34d)
  dark-bg: "#071c3c"
  dark-paper: "#102c56"
  dark-ink: "#ffffff"
  dark-cobalt: "#9cbcff"
typography:
  display:
    fontFamily: "Outfit, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "Nunito Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 700
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-deep}"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  chip-selected:
    backgroundColor: "{colors.cobalt-wash}"
    textColor: "{colors.cobalt}"
    rounded: "{rounded.pill}"
---

# Design System: My Planner

## Overview

**Creative North Star: "The Kind Coach's Clipboard."** Bright, confident, encouraging. Each screen answers
one question: *what do I do next, and how much time do I have?* Colour carries meaning, never decoration.
Mode: **Operate**. Scanning and finishing a task beat expressiveness. The brand lives in the cobalt/sun
accents, Outfit headings and warm copy.

This is a **refinement** of the existing look in `src/styles/energy.css`, `foundations.css` and `weekly.css`.
Keep the identity. Don't redesign it.

## ADHD principles (these override visual preference)

1. **One next step.** Each view has exactly one primary (cobalt) button. Today leads with the current
   or next task, big, with its time and a Start/Done action.
2. **Time is visible.** Show durations, start times and "time left today" as text and as bars. Show the
   current time on day/week grids.
3. **Low clutter.** Show at most 3 focus items before a "show more". Put secondary metadata behind
   disclosure. Empty space is fine.
4. **Forgiving.** No red streak resets, no "overdue" shaming. Unfinished items roll forward with a neutral
   "carry over" choice. Every destructive action gets an Undo toast (prefer it to a confirm dialog) or
   a confirm when it can't be undone.
5. **Focus mode.** One task, its checklist and a timer, with everything else hidden. Esc returns.
6. **Gentle reminders.** Use encouraging copy ("Ready when you are"), not alarms. Motion is opt-in and
   `prefers-reduced-motion` is respected.
7. **Low setup cost.** Defaults work with zero configuration. Templates over blank forms.

## Colors

- **Cobalt** is the only action colour. **Sun** marks *now/today/chosen*. **Teal** means *done*.
  **Coral** is reserved for real problems (failed save, destructive confirm), never for overdue tasks.
- Use tokens (`var(--…)`) in components. New raw hex values in component CSS are not allowed. Move existing
  ones (`#ffcf3d`, `#d94c1c`, `#ffdc64`, …) into `:root` tokens when you touch that code.
- Text contrast is ≥4.5:1 in both themes. Sun is a background only, with navy text on it.

## Typography

Outfit for headings and numbers (times, scores). Nunito Sans for everything else. Body is **16px** (currently
15px, so raise it). Labels are 14px bold. Nothing under 12px except PDF output. Line height is 1.5 for body.

## Layout

Breakpoints are 375 / 768 / 1024 / 1440. No horizontal page scroll at any width. The week planner shows all
7 days on ≥1024px and a single-day swipe/tab view below that. The task picker is a side panel on desktop
and a bottom sheet on mobile. Spacing follows the scale above.

## Elevation & Depth

Mostly flat: a 1px border plus the existing hard `--shadow` (0 6px 0) on cards. Modals and sheets get a
scrim. While dragging, an item lifts with a stronger shadow and a 2° tilt (no tilt under reduced motion).

## Shapes

Radii come from the scale only: 8 (controls), 12 (cards), 16 (panels/modals), pill (chips). The current
9/10/14/18/20px values collapse to the nearest step when touched.

## Components

- **Buttons:** ≥44×44px hit area. Primary is cobalt, secondary is outlined, ghost is for tertiary.
  Icon-only buttons need an `aria-label`.
- **Task card:** title, time/estimate, area dot, checklist progress (n/m). Metadata goes on one line.
  The menu holds the rest.
- **Planned entry:** like a task card, plus a drag handle, plus "Move up/down / Move to day" buttons
  (WCAG 2.2 dragging alternative).
- **Board task picker:** search, area filter, and a list with an "Add" button per row. Drag is optional.
- **Modals:** focus trap, Esc closes, focus returns to the opener, Save stays visible (sticky footer).
- **Toasts:** bottom-centre, `role="status"`, with Undo for 6s.
- **Icons:** SVG (stroke 2px). No emoji as UI icons. Emoji inside user content is fine.

## Do's and Don'ts

- Do: give each section one heading and one primary action, write encouraging copy, show time as text,
  provide keyboard and touch alternatives for every drag, use visible focus rings.
- Don't: use badges/counters that shout, use red for lateness, autoplay motion, stack modals, show
  more than 3 "focus" items, pick colours without meaning, or remove features as a fix for clutter (hide
  them behind disclosure instead).
