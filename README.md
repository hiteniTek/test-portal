# i-TEK PM Portal V8 — durable dual-store synchronization candidate

V8 builds on the current portal without replacing the four-zone role model or employee password login.

## Main changes
- Neon dashboard projection writes are set-oriented and run in one Neon transaction, instead of one insert round trip per device and spare.
- Apps Script user/session/visit/device/spare lookups use targeted search where an exact key is available.
- New outbox jobs do not depend on an expiring employee session. They use an Apps Script service identity and a server-only shared secret.
- Customer approval decisions enter the same durable outbox, are processed idempotently and update Sheets plus Neon through the same worker.
- Outbox jobs use short processing leases so concurrent workers do not intentionally claim the same active job.
- GitHub Actions reconciliation is configured every five minutes, alongside the Vercel scheduled fallback.
- Existing V7 outbox rows are still attempted using their encrypted session tokens; those legacy jobs may fail if the old session expired.

## Data boundaries
Google Sheets remains authoritative for full visit, device, spare, feedback and operational details. Neon holds dashboard projections and sync metadata. While a job is pending, its detailed payload is held as authenticated ciphertext in the Neon outbox; after both stores are confirmed, that ciphertext is cleared. Photos remain in Drive.

## Deploy safely
Read V8-DEPLOY.md. All development work is isolated on branch v8-development. Validate in staging before merging.

## Checks
Run npm install followed by npm test. These are syntax checks only; they do not prove live integrations or production readiness.

## Operational constraints
Neon and Google Sheets do not share an atomic transaction. V8 implements durable eventual consistency with outbox retries, idempotent projections and customer-decision recovery. Provider outages, quotas, credential misconfiguration and scheduled-worker delays can still delay synchronization. Monitor sync_outbox and reconcile data counts before company-wide rollout.