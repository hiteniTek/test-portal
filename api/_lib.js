import { neon } from '@neondatabase/serverless';

export function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not configured');
  return neon(process.env.DATABASE_URL);
}

async function parseJsonResponse(response, action) {
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch {
    console.error('Apps Script response metadata', { action, status: response.status, contentType: response.headers.get('content-type'), redirected: response.redirected });
    throw new Error('Apps Script returned non-JSON HTML or unexpected content');
  }
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  if (!body.ok) throw new Error(body.error || 'Google Sheets operation failed');
  return body.data;
}

async function postAppsScript(body, action) {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) throw new Error('APPS_SCRIPT_URL not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: controller.signal, cache: 'no-store' });
    return await parseJsonResponse(response, action);
  } finally { clearTimeout(timer); }
}

export function sheets(action, payload = {}, token = '') {
  return postAppsScript({ action, payload, token }, action);
}

// Server identity is used only by durable background jobs. The secret must never reach the browser.
export function sheetsService(action, payload = {}, actorEmail = '') {
  const serviceSecret = process.env.SHEETS_SERVICE_SECRET;
  if (!serviceSecret || serviceSecret.length < 32) throw new Error('SHEETS_SERVICE_SECRET must be configured (32+ characters)');
  return postAppsScript({ action, payload, actorEmail, serviceSecret }, `service:${action}`);
}

export async function scope(token) {
  if (!token) throw new Error('Sign in required');
  return sheets('dashboardScope', {}, token);
}

// The dashboard projection is compact and excludes photos, raw IPs, long remarks and credentials.
// A Neon transaction keeps parent/device/spare projections consistent and uses one DB round trip.
export async function projectVisit(sql, detail) {
  const v = detail || {};
  const devices = Array.isArray(v.devices) ? v.devices : [];
  const visitId = String(v.id || '');
  if (!visitId) throw new Error('Missing visit ID for Neon projection');
  const deviceRows = devices.map((d, i) => ({ visit_id: visitId, device_index: i, device_type: String(d.type || '').slice(0, 100), subtype: String(d.subtype || '').slice(0, 100), amc_status: String(d.amc || 'Unknown').slice(0, 40) }));
  const spareRows = devices.flatMap((d, i) => (Array.isArray(d.spares) ? d.spares : []).map(s => ({ visit_id: visitId, device_index: i, spare_name: String((String(s.name || '').toLowerCase() === 'others' && s.otherText) ? 'Others: ' + s.otherText : (s.name || '')).slice(0, 120) })).filter(s => s.spare_name));
  const rating = v.clientStars ? Number(v.clientStars) : null;
  const queries = [
    sql`INSERT INTO dashboard_visits (visit_id,store_code,zone,engineer_email,engineer_name,visit_type,status,created_at,updated_at,rating,damaged,device_count,spare_count,sheets_synced_at)
      VALUES (${visitId},${v.storeCode || ''},${v.zone || ''},${v.engineerEmail || ''},${v.engineerName || ''},${v.visitType || ''},${v.status || 'Draft'},${v.createdAt || new Date().toISOString()},${v.updatedAt || new Date().toISOString()},${rating},${v.damaged === 'Yes'},${devices.length},${spareRows.length},now())
      ON CONFLICT (visit_id) DO UPDATE SET store_code=excluded.store_code,zone=excluded.zone,engineer_email=excluded.engineer_email,engineer_name=excluded.engineer_name,visit_type=excluded.visit_type,status=excluded.status,updated_at=excluded.updated_at,rating=excluded.rating,damaged=excluded.damaged,device_count=excluded.device_count,spare_count=excluded.spare_count,sheets_synced_at=now()`,
    sql`DELETE FROM dashboard_spares WHERE visit_id = ${visitId}`,
    sql`DELETE FROM dashboard_devices WHERE visit_id = ${visitId}`,
    sql`INSERT INTO dashboard_devices (visit_id,device_index,device_type,subtype,amc_status)
      SELECT x.visit_id,x.device_index,x.device_type,x.subtype,x.amc_status
      FROM jsonb_to_recordset(${JSON.stringify(deviceRows)}::jsonb) AS x(visit_id text,device_index integer,device_type text,subtype text,amc_status text)`,
    sql`INSERT INTO dashboard_spares (visit_id,device_index,spare_name)
      SELECT x.visit_id,x.device_index,x.spare_name
      FROM jsonb_to_recordset(${JSON.stringify(spareRows)}::jsonb) AS x(visit_id text,device_index integer,spare_name text)
      ON CONFLICT (visit_id,device_index,spare_name) DO NOTHING`
  ];
  await sql.transaction(queries);
  return { visitId, devices: deviceRows.length, spares: spareRows.length };
}