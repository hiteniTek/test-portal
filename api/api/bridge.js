import {sqlClient,sheets,scope} from './_lib.js';
import {queueVisit,processEvent} from './_outbox.js';
import {fail} from './errors.js';
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return fail(res,Error('Method not allowed'),405,'VALIDATION');const {action,token='',payload={}}=req.body||{};if(!/^[a-zA-Z]{2,40}$/.test(action||''))return fail(res,Error('Invalid action'),400,'VALIDATION');try{
 if(action==='saveVisit'){await scope(token);const sql=sqlClient();const eventId=await queueVisit(sql,payload,token);try{const done=await processEvent(sql,eventId);return res.status(200).json({ok:true,data:{...(done.result||{}),cloudSynced:true,neonSynced:true}})}catch(e){return res.status(202).json({ok:true,data:{id:payload.id||payload.syncId,syncState:'queued',cloudSynced:false,neonSynced:false,message:'Saved for retry; not yet fully synchronized'}})}}
 if(action==='clientDecision'){const result=await sheets(action,payload,token);const sql=sqlClient();try{await sql`UPDATE dashboard_visits SET status=${result.status},rating=${Number(payload.stars)||null},updated_at=now(),sheets_synced_at=now() WHERE visit_id=${result.id}`;}catch(e){console.error('Client decision Neon projection pending',e);return res.status(202).json({ok:true,data:{...result,neonSynced:false,message:'Decision saved to Sheets; Neon reconciliation pending'}})}return res.status(200).json({ok:true,data:result});}
 const data=await sheets(action,payload,token);return res.status(200).json({ok:true,data});
 }catch(e){return fail(res,e)} }
