import {sqlClient,sheets,scope,projectVisit} from './_lib.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
 const {action,token='',payload={}}=req.body||{};
 if(!/^[a-zA-Z]{2,40}$/.test(action||''))return res.status(400).json({ok:false,error:'Invalid action'});
 try{
  if(action==='saveVisit'){
   // Sheets remains authoritative for complete operational detail.
   const result=await sheets(action,payload,token);
   const detail=await sheets('getVisit',{id:result.id},token);
   const sql=sqlClient();await projectVisit(sql,detail);
   return res.status(200).json({ok:true,data:{...result,cloudSynced:true,neonSynced:true}});
  }
  if(action==='clientDecision'){
   const result=await sheets(action,payload,token);
   // Token becomes invalid after customer approval, so only update existing Neon projection.
   const sql=sqlClient();await sql`UPDATE dashboard_visits SET status=${result.status},rating=${Number(payload.stars)||null},updated_at=now(),sheets_synced_at=now() WHERE visit_id=${result.id}`;
   return res.status(200).json({ok:true,data:result});
  }
  const data=await sheets(action,payload,token);return res.status(200).json({ok:true,data});
 }catch(e){console.error('bridge',action,e);return res.status(503).json({ok:false,error:String(e.message||e)});}
}
