import {createCipheriv, createDecipheriv, randomBytes, createHash, randomUUID} from 'node:crypto';
import {sheets, sheetsService, projectVisit} from './_lib.js';

function encryptionKey() {
  const value = process.env.SYNC_ENCRYPTION_KEY;
  if (!value || value.length < 32) throw new Error('SYNC_ENCRYPTION_KEY must be configured (32+ characters)');
  return createHash('sha256').update(value).digest();
}
function decryptText(encoded) {
  const input = Buffer.from(encoded || '', 'base64');
  if (input.length < 29) throw new Error('Invalid encrypted outbox payload');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), input.subarray(0, 12));
  decipher.setAuthTag(input.subarray(12, 28));
  return Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString('utf8');
}
function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function decryptJson(encoded) {
  return JSON.parse(decryptText(encoded));
}

// The detailed PM payload is encrypted while queued; Neon stores only projections
// plus opaque outbox ciphertext and synchronization metadata.
export async function queueVisit(sql, payload, actorEmail) {
  const id = String(payload.id || payload.syncId || randomUUID());
  const stablePayload = { ...payload };
  ['syncState','savedAt','owner','cloudId','syncError'].forEach(key => delete stablePayload[key]);
  const fingerprint = createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex').slice(0, 20);
  const eventId = 'visit:' + id + ':' + fingerprint;
  const email = String(actorEmail || '').toLowerCase();
  await sql`INSERT INTO sync_outbox
    (event_id,visit_id,action,payload,actor_token,actor_email,state,next_attempt_at)
    VALUES (${eventId},${id},'saveVisit','{}'::jsonb,${encryptJson({payload,actorEmail:email})},${email},'pending',now())
    ON CONFLICT (event_id) DO NOTHING`;
  return eventId;
}

export async function queueClientDecision(sql, payload) {
  const token = String(payload.token || '');
  if (token.length < 20 || token.length > 200) throw new Error('Invalid customer approval token');
  const digest = createHash('sha256').update(token).digest('hex');
  const eventId = 'approval:' + digest;
  await sql`INSERT INTO sync_outbox
    (event_id,visit_id,action,payload,actor_token,state,next_attempt_at)
    VALUES (${eventId},${eventId},'clientDecision','{}'::jsonb,${encryptJson(payload)},'pending',now())
    ON CONFLICT (event_id) DO NOTHING`;
  return eventId;
}

export async function queueProjectionRefresh(sql, visitId, updatedAt) {
  const id = String(visitId || '');
  if (!id) throw new Error('Visit ID required for dashboard reconciliation');
  const version = createHash('sha256').update(String(updatedAt || '')).digest('hex').slice(0, 16);
  const eventId = 'projection:' + id + ':' + version;
  await sql`INSERT INTO sync_outbox (event_id,visit_id,action,payload,state,next_attempt_at)
    VALUES (${eventId},${id},'refreshProjection','{}'::jsonb,'pending',now())
    ON CONFLICT (event_id) DO NOTHING`;
  return eventId;
}
export async function processEvent(sql, eventId) {
  const claimed = await sql`UPDATE sync_outbox
    SET state='processing', lease_until=now()+interval '90 seconds',
        attempts=attempts+1, updated_at=now()
    WHERE event_id=${eventId} AND state<>'done'
      AND (state<>'processing' OR lease_until IS NULL OR lease_until<now())
    RETURNING *`;
  if (!claimed.length) {
    const current = await sql`SELECT state FROM sync_outbox WHERE event_id=${eventId} LIMIT 1`;
    return {state: current[0]?.state || 'missing'};
  }

  const job = claimed[0];
  try {
    let result, detail;
    if (job.action === 'refreshProjection') {
      detail = await sheetsService('getVisitInternal', {id: job.visit_id});
      result = {id: job.visit_id, status: detail.status, projectionRefresh: true};
    } else if (job.action === 'clientDecision') {
      const approval = decryptJson(job.actor_token);
      result = await sheetsService('clientDecision', approval);
      detail = await sheetsService('getVisitInternal', {id: result.id});
    } else if (job.actor_email) {
      const queued = decryptJson(job.actor_token);
      result = await sheetsService(job.action, queued.payload, job.actor_email);
      detail = await sheetsService('getVisit', {id: result.id || job.visit_id}, job.actor_email);
    } else {
      // Backward compatibility for V7 rows that stored an encrypted employee session token.
      const legacyToken = decryptText(job.actor_token);
      result = await sheets(job.action, job.payload, legacyToken);
      detail = await sheets('getVisit', {id: result.id || job.visit_id}, legacyToken);
    }

    await projectVisit(sql, detail);
    await sql`UPDATE sync_outbox
      SET state='done', actor_token=NULL, payload='{}'::jsonb, last_error=NULL,
          lease_until=NULL, updated_at=now()
      WHERE event_id=${eventId}`;
    return {state:'done', result};
  } catch (error) {
    const message = String(error?.message || error).slice(0, 350);
    await sql`UPDATE sync_outbox
      SET state='retry', last_error=${message}, lease_until=NULL,
          next_attempt_at=now()+LEAST(3600,15*POWER(2,LEAST(attempts,8)))*interval '1 second',
          updated_at=now()
      WHERE event_id=${eventId}`;
    throw error;
  }
}

export async function dueEvents(sql, limit = 20) {
  return sql`SELECT event_id FROM sync_outbox
    WHERE (state IN ('pending','retry') AND next_attempt_at<=now())
       OR (state='processing' AND (lease_until IS NULL OR lease_until<now()))
    ORDER BY created_at ASC LIMIT ${limit}`;
}
