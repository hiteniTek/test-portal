import { sqlClient } from './_lib.js';
import { dueEvents, processEvent } from './_outbox.js';
import { fail } from './errors.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return fail(res, new Error('Method not allowed'), 405, 'VALIDATION');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return fail(res, new Error('Unauthorized reconciliation request'), 401, 'AUTH');
  try {
    const sql = sqlClient();
    const due = await dueEvents(sql, 20);
    const results = [];
    for (const row of due) {
      try {
        const result = await processEvent(sql, row.event_id);
        results.push({ eventId: row.event_id, state: result.state });
      } catch (error) {
        results.push({ eventId: row.event_id, state: 'retry' });
      }
    }
    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (error) { return fail(res, error); }
}