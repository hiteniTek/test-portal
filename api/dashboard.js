import {sqlClient,scope} from './_lib.js';\nimport {fail} from './errors.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
 try{
 const token=req.body?.token;const user=await scope(token);const sql=sqlClient();
 // Authorization comes from Apps Script, never from a client-provided zone.
 const zone=user.role==='HOD'?null:user.zone;
 const email=user.role==='Engineer'?user.email:null;
 const visits=await sql`SELECT visit_id AS id,store_code AS "storeCode",zone,engineer_email AS "engineerEmail",engineer_name AS "engineerName",visit_type AS "visitType",status,created_at AS "createdAt",updated_at AS "updatedAt",rating AS "clientStars",damaged,device_count AS "deviceCount",spare_count AS "spareCount" FROM dashboard_visits WHERE (${zone}::text IS NULL OR zone=${zone}) AND (${email}::text IS NULL OR engineer_email=${email}) ORDER BY created_at DESC LIMIT 2000`;
 const spares=await sql`SELECT s.spare_name AS name,v.zone,v.store_code AS "storeCode",v.engineer_name AS "engineerName",v.created_at AS "createdAt",d.device_type AS "deviceType",v.visit_id AS "visitId" FROM dashboard_spares s JOIN dashboard_visits v ON v.visit_id=s.visit_id JOIN dashboard_devices d ON d.visit_id=s.visit_id AND d.device_index=s.device_index WHERE (${zone}::text IS NULL OR v.zone=${zone}) AND (${email}::text IS NULL OR v.engineer_email=${email}) ORDER BY v.created_at DESC LIMIT 5000`;
 return res.status(200).json({ok:true,data:{visits,spares}});
 }catch(e){return fail(res,e,503,'DATABASE');}
}
