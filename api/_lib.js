import {neon} from '@neondatabase/serverless';
export function sqlClient(){if(!process.env.DATABASE_URL)throw Error('DATABASE_URL not configured');return neon(process.env.DATABASE_URL);}
export async function sheets(action,payload={},token=''){
 const url=process.env.APPS_SCRIPT_URL;if(!url)throw Error('APPS_SCRIPT_URL not configured');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),24000);
 try {const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,payload,token}),redirect:'follow',signal:controller.signal});
 const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{throw Error('Apps Script returned non-JSON; check web app deployment')}if(!result.ok)throw Error(result.error||'Google Sheets request failed');return result.data;
 }finally{clearTimeout(timer)}
}
export async function scope(token){if(!token)throw Error('Sign in required');return sheets('dashboardScope',{},token)}
export async function projectVisit(sql,detail){
 const v=detail;const devices=Array.isArray(v.devices)?v.devices:[];
 const spareRows=devices.flatMap((d,i)=>(d.spares||[]).map(s=>({index:i,name:String(s.name||'').slice(0,120)}))).filter(s=>s.name);
 const visitId=String(v.id||'');if(!visitId)throw Error('Missing visit ID');
 const existing=await sql`SELECT visit_id FROM dashboard_visits WHERE visit_id=${visitId}`;
 // This projection is idempotent: every retry replaces its child rows.
 await sql`INSERT INTO dashboard_visits(visit_id,store_code,zone,engineer_email,engineer_name,visit_type,status,created_at,updated_at,rating,damaged,device_count,spare_count,sheets_synced_at)
 VALUES(${visitId},${v.storeCode||''},${v.zone||''},${v.engineerEmail||''},${v.engineerName||''},${v.visitType||''},${v.status||'Draft'},${v.createdAt||new Date().toISOString()},${v.updatedAt||new Date().toISOString()},${v.clientStars?Number(v.clientStars):null},${v.damaged==='Yes'},${devices.length},${spareRows.length},now())
 ON CONFLICT(visit_id) DO UPDATE SET store_code=excluded.store_code,zone=excluded.zone,engineer_email=excluded.engineer_email,engineer_name=excluded.engineer_name,visit_type=excluded.visit_type,status=excluded.status,updated_at=excluded.updated_at,rating=excluded.rating,damaged=excluded.damaged,device_count=excluded.device_count,spare_count=excluded.spare_count,sheets_synced_at=now()`;
 await sql`DELETE FROM dashboard_spares WHERE visit_id=${visitId}`;
 await sql`DELETE FROM dashboard_devices WHERE visit_id=${visitId}`;
 for(let i=0;i<devices.length;i++){
  const d=devices[i];await sql`INSERT INTO dashboard_devices(visit_id,device_index,device_type,subtype,amc_status) VALUES(${visitId},${i},${d.type||''},${d.subtype||''},${d.amc||'Unknown'})`;
 }
 for(const s of spareRows)await sql`INSERT INTO dashboard_spares(visit_id,device_index,spare_name) VALUES(${visitId},${s.index},${s.name}) ON CONFLICT DO NOTHING`;
 return {visitId,devices:devices.length,spares:spareRows.length,existed:existing.length>0};
}
