import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {sheets} from './_lib.js';
import {fail} from './errors.js';
export default async function handler(req,res){
 if(req.method!=='POST')return fail(res,Error('Method not allowed'),405);
 try{
  const {token,id}=req.body||{};if(!token||!id)throw Error('Sign in and visit ID required');
  const v=await sheets('getVisit',{id},token);const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page,y;const black=rgb(.1,.12,.16),grey=rgb(.35,.38,.42);
  function newPage(){page=pdf.addPage([595.28,841.89]);y=795;page.drawText('i-TEK  |  PREVENTIVE MAINTENANCE VISIT & SIGN-OFF',{x:42,y,font:bold,size:13,color:black});y-=12;page.drawLine({start:{x:42,y},end:{x:553,y},thickness:1,color:black});y-=25;}
  function wrap(text,max=95){const words=String(text??'—').replace(/[^\x20-\x7E]/g,' ').split(/\s+/),lines=[];let line='';for(const w of words){if((line+' '+w).length>max){if(line)lines.push(line);line=w}else line=line?line+' '+w:w}if(line)lines.push(line);return lines.length?lines:['—']}
  function line(label,value){const lines=wrap(`${label}: ${value}`,93);for(const text of lines){if(y<70)newPage();page.drawText(text,{x:45,y,font,size:9,color:grey});y-=15}}
  function heading(text){if(y<110)newPage();y-=7;page.drawText(text,{x:43,y,font:bold,size:11,color:black});y-=19}
  newPage();line('Report ID',v.id);line('Store',v.storeCode);line('Zone',v.zone);line('Engineer',v.engineerName);line('Visit type',v.visitType);line('Visit date',v.createdAt);line('Status',v.status);
  heading(`DEVICE INSPECTION (${(v.devices||[]).length})`);
  for(const [i,d] of (v.devices||[]).entries()){heading(`${i+1}. ${d.type||''} - ${d.subtype||''}`);line('Serial',d.serial);line('IP',d.ip);if(d.rposIp)line('RPOS IP',d.rposIp);line('AMC',d.amc);line('Activity',d.activity);line('Spares',(d.spares||[]).map(s=>s.name==='others'?s.otherText:s.name).join(', ')||'None');line('Remarks',d.remarks)}
  heading('VISIT SUMMARY');line('Remarks',v.remarks);line('Pune HO escalation',v.damaged==='Yes'?'Yes':'No');if(v.damageNote)line('Damage note',v.damageNote);
  heading('CUSTOMER ACKNOWLEDGEMENT');line('Customer',v.clientName||'Pending');line('Decision',v.status);line('Rating',v.clientStars||'Not rated');line('Feedback',v.clientFeedback);line('Decision date',v.clientDecidedAt||'Pending');
  if(y<110)newPage();y-=38;page.drawLine({start:{x:45,y},end:{x:250,y},thickness:.7,color:grey});page.drawLine({start:{x:335,y},end:{x:550,y},thickness:.7,color:grey});y-=14;page.drawText('Engineer signature',{x:45,y,font,size:9});page.drawText('Customer signature',{x:335,y,font,size:9});
  const bytes=await pdf.save();res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition',`attachment; filename="iTEK_PM_${String(v.storeCode||'Store').replace(/[^a-zA-Z0-9_-]/g,'')}_${String(v.id).replace(/[^a-zA-Z0-9_-]/g,'')}.pdf"`);return res.status(200).send(Buffer.from(bytes));
 }catch(e){return fail(res,e)}
}
