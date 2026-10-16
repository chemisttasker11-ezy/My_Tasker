"""Architecture ratchet: protect domain ownership without freezing legitimate redesigns.

Runs in the CI acceptance workflow; changes require a deliberate reviewed
adjustment of these project-specific thresholds rather than silent growth.
"""
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parent.parent
ERRORS=[]

# Larger structured catalogues and purely style-token files are intentionally
# excluded: they are not models/controllers and are not duplicating behaviour.
LIMITS={
    "src/model.ts": 3000,                           # compatibility exports only
    "src/App.tsx": 16000,                           # now just orchestration; work belongs in hooks/controllers
    "src/views/CalendarView.tsx": 16500,           # shared header/dialogs extracted
    "src/views/WeekPlannerView.tsx": 9000,         # split week-specific visual panels
    "src/components/weekly/LegacyWeekSchedule.tsx": 6000,
    "src/components/weekly/WeeklyCommitmentsPanel.tsx": 6000,
    "src/components/weekly/WeeklyReviewPanel.tsx": 4000,
    "src/lib/boardSummary.ts": 4500,                # single pure derived projection
    "src/components/AdminDashboard.tsx": 7000,      # only tabs, authorised actions and loading
    "src/components/admin/AdminOverviewPanel.tsx": 4000,
    "src/components/admin/AdminUsersPanel.tsx": 4500,
    "src/components/admin/AdminAuditPanel.tsx": 3000,
    "src/components/admin/AdminSecurityPanel.tsx": 3000,
    "server/accounts/views.py": 1300,              # compatibility facade only
    "server/accounts/admin_api.py": 1300,          # compatibility facade only
    "server/accounts/admin_common.py": 3000,
    "server/accounts/admin_auth_api.py": 6000,
    "server/accounts/admin_users_api.py": 6000,
    "server/accounts/admin_reports_api.py": 5000,
    "server/accounts/board_api.py": 5000,
    "server/accounts/system_api.py": 3000,
    "server/accounts/auth_api.py": 12000,
    "server/accounts/security.py": 7000
}
for path,limit in LIMITS.items():
    f=ROOT/path
    if not f.is_file():
        ERRORS.append(f"Missing domain owner: {path}")
    elif len(f.read_bytes())>limit:
        ERRORS.append(f"{path} grew beyond {limit} bytes. Split by responsibility and update the architecture review.")

for location in sorted((ROOT/"src/domain").glob("*.ts")):
    content=location.read_text(encoding="utf-8")
    if re.search(r"""from\s+['"](?:\.\./)?model['"]""",content):
        ERRORS.append(f"{location.relative_to(ROOT)} imports the model facade (potential cycle). Use domain types/owners.")
    if location.name!="validation.ts" and "localStorage" in content and location.name!="localStore.ts":
        ERRORS.append(f"{location.relative_to(ROOT)} mixes domain state with browser storage.")
    if "fetch(" in content:
        ERRORS.append(f"{location.relative_to(ROOT)} has network I/O in a pure domain module.")

# The historical god stylesheet must remain a checked, import-only facade.
# Imported fragments retain their original cascade order; all new design rules
# belong in the relevant component/feature file, never in a rebuilt global blob.
legacy_css = [
    "legacy-core-dashboard.css",
    "legacy-task-board.css",
    "legacy-forms-views.css",
    "legacy-responsive-status.css",
    "legacy-calendar.css",
]
expected = "".join(f"@import './styles/{name}';\\n" for name in legacy_css).replace("\\n", "\n")
style_entry = (ROOT / "src/styles.css").read_text(encoding="utf-8")
if style_entry != expected:
    ERRORS.append("src/styles.css is no longer the ordered import-only facade. Use owned CSS modules.")
for name in legacy_css:
    if not (ROOT/"src/styles"/name).is_file():
        ERRORS.append(f"Missing original cascade domain file: {name}")

entry=(ROOT/"src/main.tsx").read_text(encoding="utf-8")
if "<AuthGate" not in entry or "<App" in entry:
    ERRORS.append("Production entry must use the AuthGate; no direct unauthenticated App.")
app=(ROOT/"src/App.tsx").read_text(encoding="utf-8")
for anti in ("saveCloudBoard(","loadCloudBoard(","localStorage.setItem(STORAGE_KEY"):
    if anti in app:
        ERRORS.append(f"App contains persistence implementation {anti} rather than delegating to useBoardPersistence.")
for owner in ("src/hooks/useBoardPersistence.ts","src/hooks/usePlanningController.ts",
              "src/components/WorkspaceChrome.tsx","src/components/calendar/CalendarHeader.tsx",
              "src/components/calendar/CalendarPlannerDialogs.tsx"):
    if not (ROOT/owner).is_file():
        ERRORS.append(f"Missing dedicated frontend owner: {owner}")

url=(ROOT/"server/my_tasker_server/urls.py").read_text(encoding="utf-8")
for owner in ("auth_api","board_api","system_api","admin_auth_api","admin_users_api","admin_reports_api"):
    if owner+"." not in url:
        ERRORS.append(f"URL router does not reference domain owner: {owner}")
for path in ("server/accounts/auth_api.py","server/accounts/board_api.py",
             "server/accounts/admin_users_api.py","server/accounts/admin_security.py"):
    data=(ROOT/path).read_text(encoding="utf-8")
    if re.search(r"from\s+\.views\s+import",data):
        ERRORS.append(f"{path}: domain endpoint cannot depend on the legacy views facade.")

if ERRORS:
    print("\n".join("ARCHITECTURE ERROR: "+e for e in ERRORS),file=sys.stderr)
    raise SystemExit(1)
print("Architecture ownership, bounded controllers and dependency direction verified.")
