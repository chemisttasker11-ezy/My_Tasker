# My Tasker

**An energetic, board-first planner for real life.** React 19, TypeScript, Vite, Django 5.2 and dedicated PostgreSQL storage. Developed independently from ChemistTasker.

**Release status, 16 October 2026:** [PR #1](https://github.com/chemisttasker11-ezy/My_Tasker/pull/1) is still **draft and unmerged**. At code commit `e17e04d`, the exact-head [seven-job acceptance workflow](https://github.com/chemisttasker11-ezy/My_Tasker/actions/runs/38886300322) passed. The OVH environment is **not live-validated**: real HTTPS, SMTP OTP, Google reCAPTCHA, authenticator enrollment and real-user cross-device acceptance must be completed before inviting testers. Do not treat passing CI as evidence of a deployed website.

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

Automated gate on `e17e04d`: **48 Vitest**, **23 planner Chromium**, **4 authenticated Chromium**, **12 Django SQLite**, **12 Django PostgreSQL**, npm audit, **production Docker image build**, Compose validation, and runtime Django/image checks all passed. See [review evidence](REVIEW.md).

```bash
npm run build
npm test
VITE_DEMO_MODE=1 npm run test:e2e -- --grep-invert '@auth-gate'
VITE_DEMO_MODE=0 npm run test:e2e -- tests/auth-gate.spec.ts
```

Deploy using the isolated **OVH/Docker/PostgreSQL/shared-Nginx pattern** documented in [docs/OVH_DEPLOYMENT.md](docs/OVH_DEPLOYMENT.md). Do not reuse ChemistTasker's database, application secrets or hostname. `docker-compose.staging.yml` and `docker-compose.prod.yml` are independent.

**Privacy:** My Tasker is for personal productivity, not patient-identifiable or sensitive clinical records. Use the JSON export before destructive changes and maintain encrypted, off-server database backups.

Older `HANDOVER.md` and `REVIEW.md` snapshot sections are retained as history beneath an up-to-date PR status addendum. They must not be interpreted as current features being unfinished.