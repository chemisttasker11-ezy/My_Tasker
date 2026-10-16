"""Compatibility exports only. New endpoints belong in admin_*_api modules."""
from .admin_auth_api import status, enroll, verify_admin
from .admin_users_api import set_user_status, revoke_sessions, set_staff
from .admin_reports_api import overview, users, audit, health
