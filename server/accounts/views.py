"""Legacy public import facade only: endpoint ownership lives in specific APIs.

New code must import accounts.auth_api, board_api, system_api or security.
No new application logic belongs in this compatibility module.
"""
from .auth_api import (signup, verify_otp, resend_otp, signin, signout, request_reset, reset_password, me)
from .board_api import (board, delete_account)
from .system_api import (healthz, config, csrf, index)
