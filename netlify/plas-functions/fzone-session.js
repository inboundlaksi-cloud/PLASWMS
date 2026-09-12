'use strict';
// PLAS-only Functions directory; intentionally isolated from legacy F-Zone helpers.
const crypto=require('crypto');
const L=require('./_bridge-lib');
function attemptId(ip,user){return crypto.createHash('sha256').update(String(ip)+'|'+user.toLowerCase()).digest('hex')}
async function fail(ref){
  const d=L.db();await d.runTransaction(async tx=>{const s=await tx.get(ref),old=s.exists?s.data():{},now=Date.now();let n=Number(old.n||0)+1,until=Number(old.until||0);if(until>now)return;if(n>=5){n=0;until=now+5*60*1000}tx.set(ref,{n,until,updatedAt:now,cleanupAt:L.admin().firestore.Timestamp.fromMillis(Math.max(until,now)+24*60*60*1000)},{merge:true})})
}
function noPinEnabled(){return !/^(0|false|off|no)$/i.test(String(process.env.PLAS_BRIDGE_ALLOW_NO_PIN==null?'true':process.env.PLAS_BRIDGE_ALLOW_NO_PIN).trim())}
exports.handler=async event=>{
  const pf=L.preflight(event);if(pf)return pf;if(event.httpMethod!=='POST')return L.json(405,{ok:false,error:'Method not allowed'});
  try{
    const b=L.body(event),username=L.cleanName(b.username),requested=String(b.role||'').toLowerCase(),ip=event.headers['x-nf-client-connection-ip']||event.headers['x-forwarded-for']||'unknown';
    const identity=await L.loadIdentity(username),stored=String(identity.profile.pin||'').replace(/\D/g,''),hasStoredPin=identity.profile.pinEnabled===true&&/^\d{4}$/.test(stored),requestedNoPin=b.noPin===true;
    if(!identity.roles.length)throw Object.assign(new Error('ไม่พบผู้ใช้ใน PLAS WMS'),{status:403});
    if(!identity.allowed)throw Object.assign(new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์เปิด BORNEO F-Zone'),{status:403});
    let authMode='pin';
    if(hasStoredPin){
      const pin=L.cleanPin(b.pin),attemptRef=L.db().collection('fzone_bridge_attempts').doc(attemptId(ip,username)),attempt=await attemptRef.get();
      if(attempt.exists&&Number(attempt.data().until||0)>Date.now())throw Object.assign(new Error('ลอง PIN ผิดหลายครั้ง กรุณารอ 5 นาที'),{status:429});
      if(!L.safeEqual(pin,stored)){await fail(attemptRef);throw Object.assign(new Error('PIN ไม่ถูกต้อง'),{status:401})}
      await attemptRef.delete().catch(()=>{});
    }else{
      if(!requestedNoPin)throw Object.assign(new Error('บัญชีนี้ยังไม่ได้ตั้ง PIN — กรุณาเข้าใหม่ผ่านหน้า PLAS WMS'),{status:401});
      if(!noPinEnabled())throw Object.assign(new Error('ระบบปิดการเชื่อมบัญชี PLAS ที่ไม่มี PIN'),{status:403});
      authMode='plas-no-pin';
    }
    const role=identity.roles.includes(requested)?requested:identity.roles[0],now=Date.now(),payload={typ:'plas-fzone-session',aud:'plas-wms',employeeId:username,displayName:identity.displayName,plasRole:role,authMode,iat:now,exp:now+8*60*60*1000,jti:L.randomId()};
    return L.json(200,{ok:true,session:L.sign(payload,L.sessionSecret()),expiresAt:payload.exp,user:{employeeId:username,displayName:payload.displayName,role,authMode}});
  }catch(e){return L.err(e)}
};
