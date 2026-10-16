Read-only review complete; no files changed. TypeScript checking passed, and targeted in-memory reproductions confirmed the data and PDF failures below.

1. **High — [src/model.ts:363](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/model.ts:363>)**  
   A corrupt, partial, or unsupported saved board silently becomes notebook defaults, and the next edit overwrites the original stored data.  
   **Smallest fix:** Preserve the failed payload and show a recovery screen before allowing replacement writes.

2. **High — [src/components/TaskModal.tsx:34](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/components/TaskModal.tsx:34>), [src/model.ts:408](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/model.ts:408>)**  
   The editor permits more than 100 checklist items, but reloading rejects that board and falls back to defaults; accumulated focus dates and weekly plans have similar unenforced loader limits.  
   **Smallest fix:** Enforce shared limits when mutating state and recover existing over-limit data without resetting the workspace.

3. **High — [src/App.tsx:69](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:69>)**  
   Tabs write whole snapshots without conflict detection, so concurrent changes can overwrite each other and incoming storage events can discard unsaved changes after a quota failure.  
   **Smallest fix:** Serialize read-modify-write operations across tabs and preserve local changes when revisions conflict.

4. **High — [src/model.ts:433](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/model.ts:433>)**  
   Import accepts invalid completion timestamps such as `"not-a-date"`, which immediately crash App’s date formatting with `RangeError: Invalid time value`.  
   **Smallest fix:** Validate completion timestamps as finite dates before accepting the board.

5. **High — [src/model.ts:263](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/model.ts:263>)**  
   Changing a finished one-time task to Started in the editor removes its completion history but copies the old `completedAt` back, leaving it completed.  
   **Smallest fix:** Merge edits onto the reopened task returned by `toggleCompletion`, preserving its cleared completion fields.

6. **High — [src/App.tsx:59](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:59>)**  
   Postponed tasks remain excluded from Today even when their new due date arrives or becomes overdue.  
   **Smallest fix:** Exclude postponed tasks only while their due date is in the future.

7. **High — [src/components/CalendarEntry.tsx:42](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/components/CalendarEntry.tsx:42>)**  
   Changing a recurring occurrence’s status on a past or future calendar date updates today’s period instead, recording completion against the wrong occurrence.  
   **Smallest fix:** Pass the occurrence date through the status callback and use it to identify the completion period.

8. **Medium — [src/components/TaskModal.tsx:26](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/components/TaskModal.tsx:26>)**  
   The modal neither contains keyboard focus nor restores it on dismissal, allowing keyboard users to reach obscured background controls.  
   **Smallest fix:** Use a native modal dialog or implement focus containment, background inertness, and focus restoration.

9. **Medium — [src/styles.css:265](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/styles.css:265>)**  
   Closed mobile navigation is only translated offscreen, leaving its invisible buttons keyboard-focusable.  
   **Smallest fix:** Apply `visibility: hidden` while the mobile drawer is closed and restore visibility when opened.

10. **Medium — [src/lib/trackerPdf.ts:54](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/lib/trackerPdf.ts:54>)**  
    A valid 199-character multiline direction quote consumes more than the page height, producing negative panel heights and font sizes in the PDF.  
    **Smallest fix:** Bound header line counts and validate remaining layout space before sizing task panels.

11. **Medium — [src/App.tsx:38](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:38>), [src/App.tsx:60](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:60>)**  
    Every search keystroke serializes the entire board and repeats completion scans and date formatting; formatting just 1,000 history entries took approximately 100 ms in reproduction.  
    **Smallest fix:** Initialize the persistence ref once and memoize completion indexes and daily counts by history and date.

12. **Medium — [src/main.tsx:17](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/main.tsx:17>)**  
    There is no error boundary, so a render exception or failed lazy tracker download can remove the entire application UI.  
    **Smallest fix:** Add an error boundary with recovery controls and access to the saved backup data.

13. **Medium — [src/views/TodayView.tsx:16](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/views/TodayView.tsx:16>)**  
    Archiving or deleting selected priorities hides their rows but leaves their IDs consuming the three available focus slots.  
    **Smallest fix:** Remove archived or deleted task IDs from daily focus selections before enforcing the limit.

14. **Medium — [src/App.tsx:98](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:98>), [src/views/WeekPlannerView.tsx:138](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/views/WeekPlannerView.tsx:138>)**  
    Permanently deleting a committed task leaves its weekly commitment behind while removing every way to remove that commitment.  
    **Smallest fix:** Allow commitment removal by task ID even when the underlying task no longer exists.

15. **Medium — [src/App.tsx:114](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:114>)**  
    Editing and resaving a past weekly review replaces its saved score with a recalculation that discards historical partial progress, such as changing 60% to 0%.  
    **Smallest fix:** Preserve an existing past review’s score snapshot when updating its notes.

16. **Medium — [src/App.tsx:49](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/App.tsx:49>)**  
    An idle session retains yesterday’s task list, quote, and completion state after Brisbane midnight until another render occurs.  
    **Smallest fix:** Maintain the current day in state and refresh it at midnight and when the page becomes visible.

17. **Medium — [src/model.ts:135](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/model.ts:135>)**  
    The 5,000-iteration recurrence limit returns overdue dates for older daily anchors—for example, a 2000 anchor advances only to September 2013 when completed in 2026.  
    **Smallest fix:** Calculate an initial recurrence index near the target date before advancing to the next occurrence.

18. **Medium — [src/views/TrackerView.tsx:39](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/views/TrackerView.tsx:39>)**  
    The tracker’s text alternative omits task completion/status and checklist tick values, depriving screen-reader users of information shown in the preview.  
    **Smallest fix:** Include each item’s status and the applicable checklist completion state in the text alternative.

19. **Medium — [src/model.ts:413](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/model.ts:413>)**  
    Imported checklist IDs need not be unique, so toggling or removing one item can change or delete multiple items sharing its ID.  
    **Smallest fix:** Reject duplicate checklist IDs after normalization or regenerate them during import.

20. **Medium — [src/styles.css:425](<C:/Users/semse/OneDrive/Documents/Desktop/My Tasker/src/styles.css:425>)**  
    Year-calendar status colours provide only approximately 3.2–3.7:1 contrast for 8–9px date numerals, making those dates difficult to read.  
    **Smallest fix:** Darken the status text colours until every foreground/background pair reaches at least 4.5:1 contrast.