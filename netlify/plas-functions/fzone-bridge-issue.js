'use strict';
// PLAS-only Functions directory; intentionally isolated from legacy F-Zone helpers.
const L=require('./_bridge-lib');
exports.handler=async event=>{
  const pf=L.preflight(event);if(pf)return pf;if(event.httpMethod!=='POST')return L.json(405,{ok:false,error:'Method not allowed'});
  try{
    const p=L.verify(L.body(event).session,L.sessionSecret());if(p.typ!=='plas-fzone-session'||p.aud!=='plas-wms'||!p.employeeId)throw new Error('PLAS Session ไม่ถูกต้อง');
    // ตรวจสิทธิ์กับ PLAS Firestore ซ้ำทุกครั้งก่อนออก Ticket เพื่อให้การยกเลิกสิทธิ์มีผลทันที
    const identity=await L.loadIdentity(p.employeeId);if(!identity.roles.length)throw Object.assign(new Error('ไม่พบบัญชีใน PLAS WMS'),{status:403});if(!identity.allowed)throw Object.assign(new Error('สิทธิ์เปิด BORNEO F-Zone ถูกยกเลิกแล้ว'),{status:403});
    const role=identity.roles.includes(p.plasRole)?p.plasRole:identity.roles[0],now=Date.now(),ticket={typ:'fzone-ticket',aud:'borneo-fzone',employeeId:p.employeeId,displayName:identity.displayName||p.displayName||p.employeeId,plasRole:role,iat:now,exp:now+60*1000,jti:L.randomId()};
    return L.json(200,{ok:true,ticket:L.sign(ticket,L.secret()),expiresAt:ticket.exp,fzoneUrl:process.env.FZONE_PUBLIC_URL||'https://borneofzone.netlify.app/'});
  }catch(e){return L.err(e)}
};
