# i-TEK V6 deployment and upgrade

1. **Back up first:** Export existing Google Sheets and save your V5 Apps Script and Vercel source. Do not delete historical visits.
2. **Apps Script:** Replace `Code.gs` with `apps-script/Code.gs`, save, then Deploy > Manage deployments > Edit > New version. Retain SPREADSHEET_ID, DRIVE_FOLDER_ID, PUBLIC_PORTAL_URL and any integration properties. Do not rerun HOD provisioning.
3. **Vercel:** Commit this project to your private repository. Configure `APPS_SCRIPT_URL` (deployed /exec URL) and `DATABASE_URL` (Neon pooled connection string) as server-only environment variables. Redeploy. Never expose secrets in public JS.
4. **Neon:** Existing V5 dashboard tables are unchanged; run `db/schema.sql` only for a new database.
5. **Check:** Sign in, create a test engineer, try duplicate username/email/name, submit a PM, verify Google Sheets and Neon, generate QR and scan from a different phone within 30 minutes, approve, verify dashboard and RM email.
6. **Historical import:** HOD/RM > Reports > Import previous visit Excel. Supports the uploaded workbook's `Visit_Detail` columns. Import is batched, skips duplicate Visit IDs, and is limited to manager zone. Existing historic visits will appear in Google Sheets but **will not automatically appear in Neon** until a separate authorized backfill is run. Test on a backup first.
7. **Email:** Notifications are sent via Apps Script MailApp to zone RMs only, not HOD. This is not Microsoft Graph / Outlook sending. Validate email quotas and RM addresses.
8. **Limitations:** The current Google Sheets-first then Neon write is not atomic and lacks a durable server reconciliation worker; verify both systems before production. Imported visit IDs may be partially processed if a batch fails; rerun to skip completed IDs. Existing Apps Script full-sheet reads and AMC checks can still be slow. Image/PDF archival and customer approval syncing need operational tests.
9. **Customer approval:** New QR links expire after 30 minutes. Already-issued tokens keep their original expiry until regenerated.
10. **User uniqueness:** Server checks username, email and full name under a script lock; front-end also prechecks visible users.

Do not declare company-wide readiness until security review, QR acceptance, backup restore and 300+ visit offline tests pass.
