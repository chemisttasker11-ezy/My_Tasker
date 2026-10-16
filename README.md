# My Tasker

**An energetic, board-first planner for real life.** React 19, TypeScript, Vite, Django 5.2 and dedicated PostgreSQL storage. Developed independently from ChemistTasker.

**Release status, 16 October 2026:** [PR #1](https://github.com/chemisttasker11-ezy/My_Tasker/pull/1) is still **draft and unmerged**. At code commit `9d134f8`, the [eight-job acceptance workflow](https://github.com/chemisttasker11-ezy/My_Tasker/actions/runs/38894751487) passed, including a real React → Django → disposable PostgreSQL workflow. The OVH environment is **not live-validated**: real HTTPS, SMTP OTP, Google reCAPTCHA, authenticator enrollment and real-user cross-device acceptance must be completed before inviting testers. Do not treat passing CI as evidence of a deployed website.

## Your 60-second guide

1. **Sign up.** Enter your email and a strong password, complete CAPTCHA, then verify the six-digit email code. Your workspace is private. Four neutral sample tasks and an onboarding guide appear for a new account.
2. **Keep the board reusable.** Add or edit tasks in Urgent, Daily, Weekly, Monthly, Quarterly/Annual or Long-term Goals. This is your source task library, not a fixed calendar.
3. **Plan the whole week.** Open **Week planner**, set an achievable time budget and a meaningful outcome. Drag reusable tasks into any of the seven days, or choose a day and tap **Add**. Each planned copy has its **own** date, time, checklist, order, status and top-three focus selection.
4. **Copy and improve.** Select one or several calendar dates to copy their plans, then select destination date(s) and paste. Use the five progress states and the weekly weighted score to review wins and blockers, rather than endlessly rescheduling tasks.

**Scoring:** Not started = 0; Started = 25; Progressing = 60; Finished = 100; Postponed = 0. Priority weights: high ×3, medium ×2, low ×1. Commitments moved or postponed do not disappear from the denominator. An archived weekly review stores a score snapshot.

## What's included

- Six-lane drag/drop task board; optional checklists, recurring tasks, five statuses, duplication, postponing, archive/restore and JSON backup.
- Today and seven-day Week planner with searchable **My task board** source picker, drag-to-plan, click-to-add, independent daily copies, in-day reordering, moving across days, selected-day copy/paste and top-three focus.
- Calendar day/week/month/year, editable day planning window, weekly intentions/time capacity/score/review, goals, upcoming, completed and archived task views.
- Shared schedule projection for Calendar, printable tracker and motivational quote selection, with daily planned copies represented in dashboard summaries.
- Day/week/month/year printable tracker in SVG/PDF; Arabic or emoji uses image fallback when the chosen PDF font cannot render the glyph. PDF is a snapshot and cannot edit the task board.
- Editable task areas, 64 optional life-task templates, a personal direction quote plus 36 original positive reminders.
- Electric-blue, mint-green, bright coral and sunshine-yellow design, strong navy contrast and locally bundled Outfit/Nunito Sans fonts.
- A separate Django session-authenticated API: verified-email account registration, email OTP, CAPTCHA, login, password recovery, session revocation, private user boards, revision-conflict handling and explicit save-error recovery.
- A mandatory **authenticator-app 2FA** flow for staff/admin accounts, one-use recovery codes, security overview, user management, protected role changes and admin audit records. The admin API intentionally never returns other users' private task contents.

## Anti-spaghetti architecture

Planner data shape and reducers are owned by `src/domain/*`, independent day/copy flows by `src/lib/planning.ts`, and dashboard/Today metrics by the pure `src/lib/boardSummary.ts`. `src/App.tsx` orchestrates the screens while `useBoardPersistence`, `usePlanningController`, `taskController` and `WorkspaceChrome` own cloud state, planning commands, task CRUD and navigation respectively. Week Planner and administrator views are divided into focused panels. The original large stylesheet was partitioned into five ordered, CSS-equivalent legacy domain files.

Django endpoints are separated between account auth, private boards, system health, MFA setup, privileged user mutations and admin reporting. Compatibility facades preserve existing import contracts. CI enforces ownership/complexity bounds via `scripts/check-architecture-boundaries.py`. See [architecture contract](docs/ARCHITECTURE_BOUNDARIES.md).

## Online-first resilience and unsent edits

Signed-in task changes are saved to the server with revision checking. Before the
debounced save, My Tasker also stores a temporary **account-scoped recovery draft
in this browser** so an interrupted connection, tab crash or reload need not lose
the unsent edits.

- After signing in again, a recovery dialog offers **Restore edits**, **Download
  draft**, or **Discard this draft**. None of these actions silently replaces the
  server state. Download an important draft before deleting it.
- **Restore is allowed only when the saved server revision still matches the one
  the draft was based on.** If another device has saved a newer version, Restore
  is disabled; export the draft and reconcile it manually.
- A successful confirmed server save clears only drafts that match that exact
  acknowledged board. Newer unsent edits and drafts from other tabs remain
  intact. Logging into a different account does not surface another user's draft.
- **Privacy:** device recovery copies are stored unencrypted in that browser's
  origin storage, even after a crash. Only use trusted devices; never enter
  patient-identifiable or highly confidential records. Clear local drafts
  explicitly when finished. Disabling browser storage removes this safety net.
- My Tasker is **online-first**, not an offline-authenticated application.
  Internet access is needed to log in and safely compare account revisions.
  Browser private mode, quota limits and deleted browsing data can defeat local
  recovery. JSON export remains the independent backup.

The CI includes unit tests for per-account and multi-tab isolation, a browser
crash/reload scenario with revision conflicts, and a React→Django→PostgreSQL
recovery journey. These do not substitute for live OVH hostname and device tests.

## Local development

Install **Node.js 22+** and **Python 3.12+**.

Local task-planner demo (no real accounts or secrets):

```bash
npm ci
VITE_DEMO_MODE=1 npm run dev
```

Open `http://127.0.0.1:5180/`. Local demo retains compatibility with the original browser-local board at `my-command-centre:v1`. **Production does not use local-demo authentication.**

To run Django locally with an isolated development SQLite database:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r server/requirements.txt
export DEBUG=True
export SECRET_KEY=temporary-local-development-secret
export ADMIN_TOTP_ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
python server/manage.py migrate
python server/manage.py runserver 127.0.0.1:8000
```

From another terminal run `npm run dev` **without** `VITE_DEMO_MODE=1`; the Vite dev server proxies `/api` to Django. Live signup needs domain-authorised CAPTCHA credentials and working SMTP settings. The automated browser suite mocks these providers rather than delivering real email.

## Test and deployment

Automated gate on `9d134f8`: **54 Vitest**, **23 planner Chromium**, **6 authenticated Chromium**, **2 actual React → Django → disposable PostgreSQL browser tests**, **12 Django SQLite**, **12 Django PostgreSQL**, npm audit, **production Docker image build**, Compose isolation checks and runtime Django/image checks all passed. The real-stack job uses simulated SMTP/CAPTCHA; it is not evidence of provider-live delivery. See [review evidence](REVIEW.md).

```bash
npm run build
npm test
VITE_DEMO_MODE=1 npm run test:e2e -- --grep-invert '@auth-gate'
VITE_DEMO_MODE=0 npm run test:e2e -- tests/auth-gate.spec.ts
```

Deploy using the isolated **OVH/Docker/PostgreSQL/shared-Nginx pattern** documented in [docs/OVH_DEPLOYMENT.md](docs/OVH_DEPLOYMENT.md). Do not reuse ChemistTasker's database, application secrets or hostname. `docker-compose.staging.yml` and `docker-compose.prod.yml` are independent.

**Privacy:** My Tasker is for personal productivity, not patient-identifiable or sensitive clinical records. Use the JSON export before destructive changes and maintain encrypted, off-server database backups.

Older `HANDOVER.md` and `REVIEW.md` snapshot sections are retained as history beneath an up-to-date PR status addendum. They must not be interpreted as current features being unfinished.