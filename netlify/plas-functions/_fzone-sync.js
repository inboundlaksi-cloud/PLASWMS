'use strict';
// PLAS-only Functions directory; intentionally isolated from legacy F-Zone helpers.

const L=require('./_bridge-lib');

function syncSecret(){
  const secret=String(process.env.PLAS_FZONE_SYNC_SECRET||'');
  if(secret.length<32){
    throw Object.assign(new Error('Missing/weak PLAS_FZONE_SYNC_SECRET (ต้องยาวอย่างน้อย 32 ตัวอักษร)'),{status:500});
  }
  return secret;
}

function fzoneBaseUrl(){
  const configured=String(process.env.FZONE_SYNC_URL||process.env.FZONE_PUBLIC_URL||'https://borneofzone.netlify.app/').trim();
  try{
    const url=new URL(configured);
    if(!/^https:$/.test(url.protocol)&&!/^http:$/.test(url.protocol))throw new Error('invalid protocol');
    return url.toString().replace(/\/+$/,'');
  }catch(_error){
    throw Object.assign(new Error('FZONE_SYNC_URL ไม่ถูกต้อง'),{status:500});
  }
}

function verifySession(session){
  const payload=L.verify(session,L.sessionSecret());
  if(payload.typ!=='plas-fzone-session'||payload.aud!=='plas-wms'||!payload.employeeId){
    throw Object.assign(new Error('PLAS Session ไม่ถูกต้อง'),{status:401});
  }
  return payload;
}

function normalizeAssignee(value){
  return String(value||'').replace(/^Admin:\s*/i,'').trim().toLowerCase();
}

function ownsJob(job,session,identity){
  const assigned=normalizeAssignee(job.assignedTo);
  if(!assigned)return false;
  const candidates=[
    session.employeeId,
    session.displayName,
    identity.username,
    identity.displayName
  ].map(normalizeAssignee).filter(Boolean);
  return candidates.includes(assigned);
}

async function loadContext(sessionToken,jobId,{requireOwner=false,allowedStatuses=[]}={}){
  const session=verifySession(sessionToken);
  const identity=await L.loadIdentity(session.employeeId);
  if(!identity.roles.length)throw Object.assign(new Error('ไม่พบบัญชีใน PLAS WMS'),{status:403});
  if(!identity.allowed)throw Object.assign(new Error('บัญชีนี้ไม่มีสิทธิ์เชื่อม F-Zone'),{status:403});
  const id=String(jobId||'').trim();
  if(!id)throw new Error('ไม่พบเลขงาน TopUp');
  const ref=L.db().collection('replenishmentJobs').doc(id);
  const snap=await ref.get();
  if(!snap.exists)throw Object.assign(new Error('ไม่พบงาน TopUp'),{status:404});
  const job=Object.assign({id},snap.data()||{});
  if(allowedStatuses.length&&!allowedStatuses.includes(String(job.status||''))){
    throw Object.assign(new Error('สถานะงานไม่พร้อมสำหรับรายการนี้'),{status:409});
  }
  if(requireOwner&&!ownsJob(job,session,identity)){
    throw Object.assign(new Error('งานนี้ไม่ได้อยู่กับบัญชีที่กำลังใช้งาน'),{status:403});
  }
  return{session,identity,job,ref};
}

async function callFzone(operation,context,extra={}){
  const now=Date.now();
  const payload=Object.assign({
    typ:'plas-fzone-sync',
    iss:'plas-wms',
    aud:'borneo-fzone',
    operation,
    employeeId:context.session.employeeId,
    displayName:context.identity.displayName||context.session.displayName||context.session.employeeId,
    roles:context.identity.roles,
    job:{
      id:String(context.job.id),
      docNo:String(context.job.docNo||''),
      item:String(context.job.item||''),
      itemPrimary:String(context.job.itemPrimary||context.job.primaryItem||''),
      itemSecondary:String(context.job.itemSecondary||context.job.secondaryItem||''),
      itemName:String(context.job.itemName||context.job.name||context.job.description||''),
      qty:Math.abs(Number(context.job.qty||0)),
      fromLoc:String(context.job.fromLoc||''),
      toLoc:String(context.job.toLoc||'')
    },
    iat:now,
    exp:now+60*1000,
    jti:L.randomId()
  },extra);
  const token=L.sign(payload,syncSecret());
  const response=await fetch(fzoneBaseUrl()+'/.netlify/functions/plas-topup-'+operation,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Plas-Fzone-Token':token
    },
    body:'{}',
    signal:AbortSignal.timeout(15000)
  });
  let data={};
  try{data=await response.json()}catch(_error){}
  if(!response.ok||data.ok===false){
    const error=Object.assign(new Error(data.error||('F-Zone HTTP '+response.status)),{
      status:response.status>=400&&response.status<600?response.status:502,
      code:data.code||'FZONE_SYNC_FAILED'
    });
    throw error;
  }
  return data;
}

module.exports={syncSecret,fzoneBaseUrl,verifySession,normalizeAssignee,ownsJob,loadContext,callFzone};
