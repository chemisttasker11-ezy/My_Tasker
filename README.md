# My Tasker

A standalone personal task board and planner built with React, TypeScript and Vite. Only the contents of `apps/my-command-centre/` from ChemistTasker PR #180 were extracted. App files are directly at this repository's root; the parent ChemistTasker project and backend are not included.

**Delivery status:** development snapshot with unfinished planning work. Read [HANDOVER.md](HANDOVER.md) for implemented features, the user's latest requirements and outstanding issues. The new drag-from-board planning workflow has not been implemented.

## Run locally

Use Node.js 20.19+ or a current supported LTS release and npm:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5180/**. On Windows, after installing dependencies, double-click `Start-My-Tasker.cmd`. Keep this address to access the same browser data. This app runs independently from ChemistTasker and needs no backend or environment secrets.

```sh
npm run build
npm run preview
```

The static output goes to `dist/`. Vercel and Netlify configurations are included. A GitHub push does not deploy the app.

## Included features

- Six-lane task board with drag/drop, editing, checklists, priorities, recurrence, five progress states, duplication, postponement and archive/restore.
- Today, weekly commitments/reviews/scoring, calendar day/week/month/year, upcoming tasks, goals and completion history.
- Life task library: 64 detailed templates, including 12 starters, with descriptions, timing, estimates and checklists. Selective/bulk addition avoids duplicate templates.
- Editable areas in **Settings & backup**, with task/history reassignment when removing an area.
- Persistent direction reminder, 36 original positive quotes, custom quotes and daily selections in **Direction & quotes**.
- **Printable tracker** with day/week/month/year sheets, fit-page preview, zoom/full screen, one-page A4/A3 landscape PDF, area filter and optional checklists/undated tasks. Year sheets group repeating dates per month.
- Strong cobalt, teal, coral and yellow palette; bundled Nunito Sans/Outfit fonts; responsive screens and the reported postpone-panel overlap fix.
- Local browser persistence, same-origin tab updates, JSON backup/import.

The 12 starters were added to the user's existing local board during development. Browser data is not committed. A fresh browser can add its own set in **Life task library → Add starter set (12)**.

## Data and current limits

Data lives in `localStorage`, using `my-command-centre:v1` for compatibility. Use **Settings & backup → Download backup** to preserve or transfer it. A different browser, device, hostname or port has separate data. There are no accounts, cloud sync or server backups.

Calendar occurrences currently derive from a task's due date and recurrence. Rescheduling a repeating task moves its series. Independent scheduled copies and manual per-day ordering are outstanding work.

PDFs are snapshots; editing a downloaded PDF does not update the board. Dense sheets shrink text and show a warning. PDF layout, quote consistency and broader character support need the follow-ups in the handover.

## Validation

No tests or build were run for this handover/push, as requested. Existing test source and configuration are retained for future work:

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests use port **5181** with separate browser storage. They must not reset the user's storage on 5180. See [REVIEW.md](REVIEW.md) for earlier results and the final validation gap.

## Main files

- `src/model.ts`: domain types, state changes, recurrence, initial tasks, backup validation.
- `src/App.tsx`: navigation, mutations and persistence.
- `src/views/`: application screens.
- `src/lib/lifeLibrary.ts`, `areas.tsx`, `quotes.ts`: templates, editable areas and encouragement.
- `src/lib/calendar.ts`, `tracker.ts`, `trackerPdf.ts`: occurrence projection and shared SVG/PDF layout.
- `src/styles/energy.css`: latest design and overlap fixes, loaded after earlier styles.
- `public/fonts/`: PDF fonts and licence.
- `tests/`, `src/**/*.test.ts`: retained browser/unit tests.
- `preview.html`: inherited static mock-up; the React app is authoritative.

Source: [ChemistTasker PR #180](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/180), extracted at `e502bfb9e1c4485212e90198f40138bc14e1353c` on 16 October 2026.
