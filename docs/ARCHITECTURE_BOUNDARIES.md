# My Tasker domain boundaries — anti-spaghetti policy

Enforced by `scripts/check-architecture-boundaries.py` on every PR acceptance run.

## Frontend (React/Vite)

| Owner | Responsibilities | Must not own |
| --- | --- | --- |
| `src/domain/types.ts` | Versioned board/task/plan types | API or rendering |
| `src/domain/factory.ts` | Creating tasks and initial board | Browser network, saves |
| `src/domain/time.ts` | Date IDs, recurring-period calculations, ISO parsing | React |
| `src/domain/taskActions.ts` | Pure task reducers, checklists, completion | Drag UI |
| `src/domain/weekActions.ts` | Focus, weekly commitments and reviews | Pages or persistence |
| `src/domain/validation.ts` | Backup import contract, version migration | JSX, storage |
| `src/domain/localStore.ts` | Legacy browser-local demo import | Authenticated cloud storage |
| `src/model.ts` | Re-exports for backward compatibility only | New business logic |
| `src/lib/planning.ts` | Pure independent dated plan reducers/copy/drag policy | Network calls |
| `src/hooks/usePlanningController.ts` | Planner UI commands and day clipboard | New task-domain rules |
| `src/hooks/useBoardPersistence.ts` | Local-demo storage, cloud revisions and safe save/conflicts | View composition |
| `src/components/WorkspaceChrome.tsx` | Navigation, responsive shell, topbar | Task or account data writes |
| `src/views/CalendarView.tsx` | Calendar projections and displayed grid | Modal/header implementation |
| `src/components/calendar/*` | Reusable navigation + day/copy planning dialogs | Date/recurrent task mutations |
| `src/App.tsx` | Thin orchestrator of pages/handlers | Direct cloud save and schema validation |

`src/lib/lifeLibrary.ts` is intentionally a large *static catalogue*, not a god model. CSS styles are constrained by theme and component ownership instead of artificial overall byte counts.

## Backend (Django)

| Owner | Responsibilities |
| --- | --- |
| `accounts.security` | Request parsing, IP controls, rate limits, CAPTCHA, OTP hashing/sending |
| `accounts.auth_api` | Session login/logout, verified signup, email code and reset |
| `accounts.board_api` | Authenticated per-user board reads/writes, revision protection, account deletion |
| `accounts.system_api` | Health/config/CSRF/SPA entrypoint (never task data) |
| `accounts.admin_security` | TOTP secrets, MFA sessions, audit primitives |
| `accounts.admin_auth_api` | Authenticator challenge/enrollment |
| `accounts.admin_users_api` | Audited role/status/session admin mutations |
| `accounts.admin_reports_api` | Read-only user counts, audit and health; **never private board payloads** |
| `accounts.admin_common` | Shared staff permissions and safe user summaries |
| `accounts.models` | Small explicit Django model declarations; migrations preserve schema |

`views.py` and `admin_api.py` are temporary import compatibility facades only. New code must depend on the owning domain module, not reverse-import these shims. Existing URL names, database schema, backup version 1, and route responses are preserved by refactors.

## Release procedure

1. Run architecture check and source/test migration checks, then TypeScript build, unit and browser tests.
2. Run Django migrations/tests separately on SQLite and PostgreSQL, check role boundaries and OTP/session workflows.
3. Build exact Docker image and verify staging/production Nginx upstream isolation.
4. Review responsive screenshots and perform live isolated OVH staging acceptance (real SMTP, CAPTCHA, MFA, two-device conflicts). Never claim live acceptance from mocked browser API tests.
5. Only modify complexity thresholds with evidence of an intentional domain split and regression tests. No automatic merge or deployment from PR #1.
