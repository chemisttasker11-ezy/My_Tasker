# Latest Senior Package Testing — My Tasker release gate

**Code acceptance validated at `e17e04d`:** npm audit; strict TypeScript build and **48 unit tests**; **23 Chromium planner tests** in local demo mode; **4 Chromium signed-in/authenticator-flow tests** with mocked network; **12 Django tests each on SQLite and PostgreSQL**; migration checks; production Docker build; staging/prod Compose validation; health and built-assets checks. [Seven-job CI run](https://github.com/chemisttasker11-ezy/My_Tasker/actions/runs/38886300322).

Run the two browser modes separately. Local planner tests use `VITE_DEMO_MODE=1`, while signed-in AuthGate tests use `VITE_DEMO_MODE=0`; **never** permit the local-demo bypass in production builds.

Current visual evidence is the headless Chromium automated tests and CI screenshots; a person still needs to inspect full mobile/tablet/desktop imagery and use real touch devices. Production/live-provider verification is **not done**. Consult [docs/OVH_DEPLOYMENT.md](OVH_DEPLOYMENT.md) for full service acceptance and rollback.

---

## Historical early Senior Package guidance (superseded where it says PDF/auth incomplete)


Workflow adapted from the ChemistTasker Ezy UI/UX Pro Max and Impeccable standing guidance; source: `chemisttasker11-ezy/ChemistTasker-Ezy1/.agents/skills/ui-ux-pro-max/SKILL.md` and `docs/frontend/IMPECCABLE_UI_UX_RULES.md`.

## User-facing design
Electric blue for focused actions; strong green for progress/finished; vivid coral for postponements and reschedules; yellow for priorities; deep navy for contrast. Locally bundled Nunito Sans and Outfit. Accessibility requirements: ordinary text contrast >= 4.5:1; focus outlines; mobile touch targets ideally 44px; meaningful success and error states; keyboard alternatives to drag-and-drop; no horizontal body overflow. Avoid psychological claims that any particular colour guarantees motivation.

## Functional contract
- `tasks` remains the original board source. `plannedEntries` are independent dated snapshots with ID, order, status, notes, time, and checklist.
- Add from board creates an independent entry, never shifts an existing recurring series. Copy a planned entry resets all checklist ticks and status. Drag an entry between days moves that instance only; toolbar arrow actions are touch and keyboard alternatives.
- Each day supports choosing up to three priorities. Weekly commitments do not disappear on moving, postponing or removing copies; removing a plan entry causes the associated commitment to contribute zero unless explicitly removed.
- Select source days and target days in the planner. Copy one day to many dates, pair equal-sized sets, or copy many days to one new start date preserving source offsets. Pasted entries are independent and reset their status/checklist.
- Backups remain version 1 and old backups import with empty `plannedEntries`. Area renaming/deletion reassigns planned entries.
- The existing legacy recurring calendar remains visible separately; board-derived day copies are the recommended planning surface. PDF tracker and quotes need to reflect the new day copies; verify those before release.

## Gate

```bash
npm ci
npm run build
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

CI workflow `.github/workflows/my-tasker-acceptance.yml` runs independently in GitHub Actions on every PR. Check React rendering and run desktop/mobile light/dark visual QA at 320, 375, 390, 768, 1024 and 1440 widths; inspect focus, touch drag alternatives, modal stacking, status changes, clipboard behaviour, restore, and PDF output. No production-ready assertion is permitted without clean evidence for build, unit, E2E, and visual gate. No change to main or deployment occurs automatically.

## Remaining acceptance risks
- No live browser/device visual review completed in the current session.
- Local GitHub and npm network access is unavailable in the current execution container; GitHub Actions is the primary executable gate.
- Existing calendar projected recurring occurrences are separate from the newly planned daily instances; users may see both when projecting the same source task. Carefully verify no misleading duplicate summaries.
- Date-specific quote recommendations and PDF allocation/font coverage remain open according to the original handover.
