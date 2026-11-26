# i-TEK PM Portal V8 — implementation and staging deployment

## 0. Safety first
1. Keep production main and the existing Vercel production deployment unchanged.
2. Export a Google Sheets backup and take a Neon backup or branch.
3. Use a staging spreadsheet, staging Apps Script deployment, Neon branch/database and Vercel preview deployment for initial validation.
4. Do not run seed imports or initial HOD provisioning against populated production data.

## 1. Apply the additive Neon migration
1. Open Neon SQL Editor for the intended staging database.
2. Run the complete db/schema.sql from this branch.
3. The migration uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS; it does not delete existing dashboard rows.
4. Verify sync_outbox has actor_email and lease_until columns:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sync_outbox'
ORDER BY ordinal_position;
```

## 2. Configure Apps Script service identity
1. Open the existing Apps Script project used by the staging portal.
2. Back up its current Code.gs.
3. Replace Code.gs with apps-script/Code.gs from this branch.
4. In Project Settings → Script Properties, retain SPREADSHEET_ID, DRIVE_FOLDER_ID, PUBLIC_PORTAL_URL and existing account settings.
5. Add SERVICE_API_SECRET with a newly generated random secret of at least 32 characters.
6. Generate a different secret for Vercel SYNC_ENCRYPTION_KEY; do not reuse the service secret.
7. Deploy the existing Apps Script web app as a new version.
8. Do not rerun setupDatabase if the tabs already exist, and do not rerun HOD provisioning.

The service route allows only saveVisit, getVisit, getVisitInternal and clientDecision. It checks the shared secret and, for employee actions, rechecks that the actor exists and is active.

## 3. Configure Vercel Preview environment variables
Add these to the Preview environment:
- DATABASE_URL: staging Neon connection string
- APPS_SCRIPT_URL: staging Apps Script /exec URL
- SYNC_ENCRYPTION_KEY: a random secret of at least 32 characters
- SHEETS_SERVICE_SECRET: exactly the same value as Apps Script SERVICE_API_SECRET
- CRON_SECRET: a separate random secret for the reconciliation endpoint

Never expose these values in browser code or commit them to Git.

## 4. Configure GitHub Actions reconciliation
The workflow .github/workflows/reconcile.yml runs every five minutes and can also be started manually.
1. Open GitHub repository Settings → Secrets and variables → Actions.
2. Add repository secret CRON_SECRET with the same value configured in Vercel.
3. Add repository variable VERCEL_PRODUCTION_URL with the staging Vercel URL while testing. Change it to the production URL only when promoting.
4. Open Actions and verify the workflow completes.

GitHub scheduled workflows can be delayed. They are retry infrastructure, not a hard real-time guarantee. Vercel's configured daily cron remains a fallback.

## 5. Deploy Vercel Preview
1. Push branch v8-development to GitHub.
2. Vercel should create a Preview deployment when the GitHub repository is connected.
3. Configure Preview environment variables and redeploy the preview.
4. Verify root public assets and root api functions are served.

## 6. Validate visit dual-write
Use a staging engineer account and a staging store:
1. Create a draft and submit a visit with at least two device types and several spares.
2. Confirm IndexedDB has the visit and its sync state.
3. Confirm Google Sheets has Visit, Device and Spare rows with the same Visit ID.
4. Confirm Neon dashboard_visits, dashboard_devices and dashboard_spares show matching counts.
5. Confirm the outbox job is done and its payload and actor token are cleared.

Inspect the outbox:
```sql
SELECT event_id, visit_id, action, state, attempts, next_attempt_at, lease_until, last_error
FROM sync_outbox ORDER BY created_at DESC LIMIT 30;
```

## 7. Validate customer approval recovery
1. Generate a new QR link (30-minute validity).
2. Scan from a separate device or private browser; employee login must not be required.
3. Submit approval and rating.
4. Confirm the clientDecision outbox job completes, Sheets status changes, and Neon visit status/rating changes.
5. Repeat with a different visit and reject it.
6. Test repeated identical submissions: an identical decision is idempotent; a conflicting second decision is rejected.

## 8. Failure and recovery tests
- Temporarily set an incorrect staging Apps Script URL; submit a visit and confirm local save is retained and an outbox retry is recorded.
- Restore the URL and run the GitHub reconciliation workflow manually. Confirm the job completes without duplicate visit/device/spare events.
- Simulate a Neon failure after the Sheets action in staging. Confirm the outbox remains retryable and the worker can reread Sheets and repair Neon.
- Stop a worker during processing; after its 90-second lease expires, the next worker should reclaim the job.
- Deactivate an employee while their visit is queued; the service worker should refuse the inactive actor and retain the error for an administrator.
- Verify unique error IDs in API responses and logs.

## 9. Production promotion
Only after staging tests pass:
1. Take fresh production backups.
2. Apply the additive schema migration to production Neon.
3. Add SERVICE_API_SECRET to production Apps Script properties and the matching SHEETS_SERVICE_SECRET to Vercel Production.
4. Add production DATABASE_URL, APPS_SCRIPT_URL, SYNC_ENCRYPTION_KEY and CRON_SECRET to Vercel Production.
5. Configure GitHub Actions secret CRON_SECRET and variable VERCEL_PRODUCTION_URL for the production domain.
6. Deploy a new Apps Script version, then merge the reviewed pull request to main.
7. Verify production with a controlled test visit before enabling the full engineer team.

## Important constraints
- Sheets and Neon cannot commit atomically. V8 uses an outbox and idempotent projections for eventual consistency, not an absolute zero-failure guarantee.
- New queued visit payloads are encrypted in Neon until both operations are confirmed; Neon keeps compact dashboard projections after completion.
- Old V7 queued jobs use encrypted expiring employee sessions. V8 attempts legacy processing, but an expired legacy session may require manual remediation.
- Apps Script targeted lookups reduce some full-sheet reads, but HOD-wide, historical import and some administrative paths still need broader data reads.
- Vercel Free cron is daily. GitHub Actions runs every five minutes but can be delayed. Monitor the outbox.
- Validate data counts, concurrency, image uploads, QR approval, user scope, PDF generation and backup restoration before rollout.