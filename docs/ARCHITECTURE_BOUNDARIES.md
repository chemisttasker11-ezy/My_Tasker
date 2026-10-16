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
| `src/views/WeekPlannerView.tsx` | Seven-day page coordination, intention and summary | Recurring table, commitment editor, review form |
| `src/components/weekly/LegacyWeekSchedule.tsx` | Existing due-date series shown in an expandable panel | Day-copy state or cloud storage |
| `src/components/weekly/WeeklyCommitmentsPanel.tsx` | Weighted commitment list and task candidates | Saving the score |
| `src/components/weekly/WeeklyReviewPanel.tsx` | Weekly reflection draft, keyed to the chosen week | Global week state |
| `src/lib/boardSummary.ts` | Pure today/overview projection and actual completion-date counts | React, storage or network |
| `src/components/AdminDashboard.tsx` | Admin tabs, session-verified controller and feedback | Large reports or complex list forms |
| `src/components/admin/AdminOverviewPanel.tsx` | Counts and recent activity | Per-user board payloads |
| `src/components/admin/AdminUsersPanel.tsx` | Search, listing and delegated account actions | Direct network requests, private task data |
| `src/components/admin/AdminAuditPanel.tsx` | Audit trail paging | Authentication/permission logic |
| `src/components/admin/AdminSecurityPanel.tsx` | Service health view | Secrets or privileged state mutation |
| `src/components/calendar/*` | Reusable navigation + day/copy planning dialogs | Date/recurrent task mutations |
| `src/App.tsx` | Thin orchestrator of pages/handlers | Direct cloud save and schema validation |

`src/lib/lifeLibrary.ts` is intentionally a large *static catalogue*, not a god model. The historical 52 KB base stylesheet is now split, without changing cascade order, into
`src/styles/legacy-core-dashboard.css`, `legacy-task-board.css`, `legacy-forms-views.css`,
`legacy-responsive-status.css` and `legacy-calendar.css`. `src/styles.css` is an imports-only
compatibility entrypoint; add NEW styling to the owning module/component stylesheet,
not to the legacy bundles. Theme and app-specific overrides remain in `src/styles/*.css`.
Never reorder these files without reviewed screenshots and a visual regression acceptance.

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
