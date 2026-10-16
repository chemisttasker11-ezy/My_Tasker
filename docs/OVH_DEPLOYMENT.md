# My Tasker — OVH deployment and test-admission runbook

Architecture follows the ChemistTasker Ezy OVH deployment conventions: separate Docker Compose project, private PostgreSQL data volume, `shared_backend_network`, externally managed shared Nginx TLS termination, and server-only environment files. **Do not merge My_Tasker into ChemistTasker's production or staging databases, containers, or Django accounts.**

## Prepare an independent hostname and environment

1. Choose a hostname, add DNS to the OVH host, and obtain a valid certificate through the existing shared-Nginx TLS workflow. No domain is assumed by this repository.
2. Inspect the existing `shared_backend_network` and confirm Nginx and the new web service can resolve one another over Docker. Add a **new** TLS-host entry and include `deploy/shared-nginx-location.conf` for production or the no-index staging variant. Do not modify ChemistTasker's existing public/staging server blocks.
3. Check out the reviewed My_Tasker release into a separate `/opt/apps/mytasker` directory, not the ChemistTasker application folder.
4. Create `env/` with permissions `0700`, and create `env/mytasker.prod.env` or `env/mytasker.staging.env` with permissions `0600`. Use the corresponding example file for environment-variable names only. Do not copy actual ChemistTasker `.env` files or commit secrets.
5. Generate independent Django `SECRET_KEY`, PostgreSQL password, and `ADMIN_TOTP_ENCRYPTION_KEY` for each environment. Fernet keys can be generated offline with `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`. Keep and back up the active encryption key; losing it makes existing authenticators unrecoverable without an audited reset.
6. Set SMTP settings using the same validated provider setup as ChemistTasker, ideally with an app-specific sender. Register the chosen My_Tasker hostname separately for Google's reCAPTCHA and install matching public site/private verification keys.
7. Determine the actual shared reverse-proxy Docker subnet before populating `TRUSTED_PROXY_CIDRS`. An arbitrary web-request forwarding header is not a trustworthy client IP.

## Deploy the isolated stack

On the server, execute `bash scripts/deploy-mytasker-staging.sh` with the staging secrets before any production rollout. Once accepted and the PR has been reviewed and merged, execute `bash scripts/deploy-mytasker.sh` with the production secrets.

These scripts validate Compose without disclosing secrets, build the application image before replacement, start a **dedicated** PostgreSQL container, create and validate a database backup under `/opt/backups/mytasker/`, run schema migrations, replace the My_Tasker web container and check its isolated health endpoint. No production DNS, TLS, ChemistTasker service, SSH key or actual secret is changed by the repository changes.

The image serves the Vite React bundle and Django API from the **same origin**. The shared Nginx container connects only to port 8000 on the external `shared_backend_network`; no public port mapping exists. The database is accessible only from the app's private Docker network. Both environments have separate databases, volumes and container names.

Once the certificate and public host are configured, run `bash scripts/smoke-mytasker.sh https://ACTUAL_HOSTNAME`. This is a read-only HTTP smoke check, not a substitute for account acceptance.

## First administrator and live tester acceptance

Use the separate service management command to create the initial administrator after migrations: `docker compose --env-file env/mytasker.prod.env -f docker-compose.prod.yml exec web python /app/server/manage.py createsuperuser`. Use a unique email, never a reused ChemistTasker production password. Even a superuser cannot open the administration API until an authenticator-app TOTP challenge succeeds.

Before inviting testers, complete the following:

- Sign up using real registered-domain CAPTCHA, deliver a **real** six-digit email through SMTP, verify the email and confirm login works only afterward.
- Verify a user can save a task on device A, reopen it on device B, detect a simultaneous-save revision conflict and export local unsaved changes before reloading.
- Create two independent accounts and confirm neither can read or overwrite the other's task plans; test signout and password recovery.
- Confirm admin password alone cannot open the admin overview, private boards or admin APIs. Test fresh authenticator QR enrollment, wrong/expired/replayed OTPs, single-use recovery codes, staff roles, session revocation and audit trails.
- Test a seven-day drag-to-plan workflow, independent checklists/statuses, copy/paste selected days and Unicode PDF output on desktop and mobile.
- Review the actual responsive screenshots at 320, 375, 390, 768 and 1440 px, both themes, keyboard and touch controls, and long text/PDF cases.
- Check that admin panels never return another person's private task data. Run the security and PostgreSQL test jobs on the exact release commit.

## Recovery and isolation

Protect the dedicated `mytasker_pgdata` and `mytasker_staging_pgdata` volumes. Replicate validated `pg_dump -Fc` archives to a separately secured location. Test a restore against a disposable My_Tasker database before launch. Do not restore into any ChemistTasker database. Rollback requires the previous reviewed My_Tasker container image plus compatible My_Tasker database snapshot; review schema changes before any rollback.

Production acceptance remains conditional on a real OVH deployment and provider-verified test. GitHub CI is necessary but not sufficient to certify the public authentication service.