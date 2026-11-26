# i-TEK V7 upgrade and validation

1. Back up V6 Google Sheets, Apps Script and Neon first. Do not recreate production tables.
2. Run `db/schema.sql` in Neon SQL Editor (CREATE IF NOT EXISTS statements).
3. Generate a strong random `SYNC_ENCRYPTION_KEY` (32+ characters) and add it in Vercel Production environment variables, along with `DATABASE_URL`, `APPS_SCRIPT_URL`, `CRON_SECRET`. Never put secrets in Git.
4. Replace Apps Script `Code.gs`, save and deploy a **new version** of the existing `/exec` deployment. Preserve spreadsheet properties.
5. Upload V7 project to the existing private GitHub repository, deploy to Vercel and verify `/api/reconcile` returns HTTP 401 without cron authorization.
6. Check `sync_outbox` rows in Neon: `state=done` means both destinations verified; `retry` means the job is awaiting reconciliation. The Vercel cron is daily on the Free plan, not real-time. For faster retries use an approved external scheduler; do not expose `CRON_SECRET`.
7. Test visit submit, lost Sheets connection, reconnect, QR client approval and dashboard refresh. Verify counts and duplicate-free retry.
8. Historical importer resumes from local browser checkpoint and groups all rows of a visit into the same batch. Test with a COPY of your real workbook. Do not clear browser site data during import.
9. Dashboard tiles can be rearranged via drag-and-drop on desktop; ordering is per browser, not server-synced.
10. Error responses contain `errorId`, `category`, `code`, `remark`, `reason`, `timestamp`. Give the error ID to support, not passwords.

## Important remaining limitations
- Neon and Google Sheets **cannot commit atomically**. The outbox offers eventual consistency with retries.
- Customer approvals are written to Sheets first, then Neon. The client approval Neon failure still needs a dedicated reconciliation event and operational alert; do not assume automatic recovery of this path.
- Apps Script still uses some full-sheet scans for bootstrap and historical imports; the targeted lookup changes mainly accelerate AMC and individual visit/store reads.
- Server-generated PDF is available through authenticated `/api/report` using pdf-lib; signature lines are placeholders, not cryptographic signatures.
- Production reliability, security and large-workbook performance must be verified in your deployed accounts.
