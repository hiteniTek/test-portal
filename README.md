# i-TEK PM Portal V5 — Neon dashboard + Google Sheets detailed records

## Deployment (new staging deployment first)

1. Back up the existing Apps Script project, Google Spreadsheet and V4 ZIP. **Do not delete existing data.**
2. Create a Neon PostgreSQL Free project. In Neon SQL Editor execute `db/schema.sql`. Keep the connection string private.
3. Create a Vercel project from this folder (via GitHub). Framework preset **Other**, root at project root; output directory `public`.
4. In Vercel Project Settings > Environment Variables set `DATABASE_URL` to the Neon connection string and `APPS_SCRIPT_URL` to your deployed Google Apps Script `/exec` URL. Both are **server-only** variables; never prefix with `VITE_` or `NEXT_PUBLIC_`.
5. In your **existing** Apps Script project, update `Code.gs` from `apps-script/Code.gs`, keeping the current Script Properties (`SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, HOD configuration). Deploy **new version**. Do not rerun `provisionInitialHod` or import seeds into live sheets.
6. Deploy Vercel. In Apps Script Script Properties set `PUBLIC_PORTAL_URL` to the deployed Vercel URL (without slash).
7. Log in as an existing engineer and create a **new test visit**. Confirm: IndexedDB local save, Google Sheets Visits/Devices/Spares, Neon dashboard_visits/dashboard_devices/dashboard_spares, and spare-level dashboard.
8. Generate customer QR and scan with a separate phone (private window). The `/approve/TOKEN` route must display the customer report without employee login. Approve; confirm Sheets status and Neon dashboard status. Test rejection separately.
9. Test offline drafts, repeated sync, duplicate submissions, manager zone restrictions, at least 300 visits with representative photos, concurrency, PDF print and failure recovery before production rollout.

## Synchronization model and limitations

- Google Sheets is authoritative for **full operational detail**. Neon stores **only dashboard projections**, plus no passwords or customer text feedback.
- On visit submission, `/api/bridge` writes Google Sheets, reads back the visit details, then upserts the Neon projection. The browser retains its IndexedDB pending item if either operation fails, and retries. **These writes are sequential, not atomic or simultaneous.**
- On client approval, Sheets updates first, then Neon status updates. If Neon is down after Sheets accepts approval, the customer sees a temporary error although Sheets has recorded the decision. A reconciliation job is needed before calling this production-grade.
- The dashboard loads spare-level data from Neon with server-side role checks through Apps Script. The original Google Sheets dashboard remains as fallback. Existing visits **are not automatically backfilled** into Neon; use a controlled migration/backfill before rollout.
- Neon Free and Google Sheets API quotas, cold starts, and Vercel execution time limits apply. There is no unconditional zero-failure guarantee.
- Vtiger requires real integration credentials; automatic Outlook sending requires an approved Microsoft 365 integration. The existing PDF is browser Print / Save as PDF, not a signed immutable PDF.
- User passwords and permissions remain managed by Apps Script. For company-wide deployment, review authentication security, rate limiting, backup/restore, and logging.

## Source layout

- `public/`: frontend, IndexedDB, customer QR and report view
- `api/bridge.js`: Google Sheets writes followed by Neon projection
- `api/dashboard.js`: authorized Neon dashboard/spare drilldowns
- `api/_lib.js`: server-only Google Sheets bridge and Neon helpers
- `db/schema.sql`: Neon schema
- `apps-script/Code.gs`: existing Apps Script with a minimal `dashboardScope` API
- `apps-script/*.csv`: original seed files, **not for re-import into populated production**

## Quick local check

`npm install && npm test`

To run Vercel functions locally, install Vercel CLI and use `vercel dev` with environment variables configured. Do not commit `.env.local`.
