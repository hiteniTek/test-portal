import { sqlClient, sheets, scope } from './_lib.js';
import { queueVisit, queueClientDecision, queueProjectionRefresh, processEvent } from './_outbox.js';
import { fail, describeError } from './errors.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return fail(res, new Error('Method not allowed'), 405, 'VALIDATION');
  const { action, token = '', payload = {} } = req.body || {};
  if (!/^[a-zA-Z]{2,40}$/.test(action || '')) return fail(res, new Error('Invalid action'), 400, 'VALIDATION');
  try {
    const sql = sqlClient();
    if (action === 'saveVisit') {
      const actor = await scope(token);
      const eventId = await queueVisit(sql, payload, actor.email);
      try {
        const processed = await processEvent(sql, eventId);
        if (processed.state === 'done') return res.status(200).json({ ok: true, data: { ...(processed.result || {}), cloudSynced: true, neonSynced: true, syncState: 'synced' } });
        return res.status(202).json({ ok: true, data: { id: payload.id, syncState: 'queued', cloudSynced: false, neonSynced: false, message: 'Visit accepted; cloud synchronization is pending.' } });
      } catch (error) {
        const info = error.errorInfo || describeError(error, 'SYNC');
        return res.status(202).json({ ok: true, data: { id: payload.id, syncState: 'queued', cloudSynced: false, neonSynced: false, errorId: info.errorId, category: info.category, remark: 'Visit accepted; cloud synchronization will retry automatically.' } });
      }
    }
    if (action === 'clientDecision') {
      // Validate the public token and make repeated identical customer submissions idempotent.
      const validatedAt = new Date().toISOString();
      const existing = await sheets('clientRead', { token: payload.token });
      const requestedStatus = payload.decision === 'approve' ? 'Completed' : 'Rejected';
      if (existing.status !== 'Pending Client') {
        const sameDecision = existing.status === requestedStatus
          && String(existing.clientName || '') === String(payload.name || '').trim()
          && String(existing.clientStars || '') === String(Math.max(1, Math.min(5, Number(payload.stars) || 1)))
          && String(existing.clientFeedback || '') === String(payload.feedback || '').trim();
        if (sameDecision) {
          const refreshId = await queueProjectionRefresh(sql, existing.id, existing.updatedAt);
          try {
            const refreshed = await processEvent(sql, refreshId);
            if (refreshed.state === 'done') return res.status(200).json({ ok: true, data: { id: existing.id, status: existing.status, idempotent: true, neonSynced: true } });
          } catch (error) {
            // The queued projection refresh is retained for the reconciliation worker.
          }
          return res.status(202).json({ ok: true, data: { id: existing.id, status: existing.status, idempotent: true, syncState: 'queued', neonSynced: false } });
        }
        throw new Error('Decision already recorded for this approval link');
      }
      const acceptedPayload = { ...payload, validatedAt };
      const eventId = await queueClientDecision(sql, acceptedPayload);
      try {
        const processed = await processEvent(sql, eventId);
        if (processed.state === 'done') return res.status(200).json({ ok: true, data: processed.result || { status: payload.decision === 'approve' ? 'Completed' : 'Rejected', neonSynced: true } });
        return res.status(202).json({ ok: true, data: { status: payload.decision === 'approve' ? 'Completed' : 'Rejected', syncState: 'queued', neonSynced: false, message: 'Customer decision accepted; dashboard synchronization is pending.' } });
      } catch (error) {
        const info = error.errorInfo || describeError(error, 'SYNC');
        return res.status(202).json({ ok: true, data: { status: payload.decision === 'approve' ? 'Completed' : 'Rejected', syncState: 'queued', neonSynced: false, errorId: info.errorId, category: info.category, remark: 'Customer decision accepted; dashboard synchronization will retry automatically.' } });
      }
    }
    const data = await sheets(action, payload, token);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return fail(res, error);
  }
}