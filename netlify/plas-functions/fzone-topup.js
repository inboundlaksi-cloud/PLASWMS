'use strict';
// PLAS-only Functions directory; intentionally isolated from legacy F-Zone helpers.

const L=require('./_bridge-lib');
const S=require('./_fzone-sync');

const STATUS={OPEN:'Open',IN_PROGRESS:'In Progress',DONE:'Done'};

async function claimJobForReserve(context){
  const d=L.db(),now=Date.now();
  await d.runTransaction(async tx=>{
    const snap=await tx.get(context.ref);
    if(!snap.exists)throw Object.assign(new Error('ไม่พบงาน TopUp'),{status:404});
    const job=Object.assign({id:String(context.job.id)},snap.data()||{});
    if(job.status===STATUS.IN_PROGRESS){
      if(!S.ownsJob(job,context.session,context.identity)){
        throw Object.assign(new Error('งานนี้ถูกพนักงานคนอื่นรับไปแล้ว กรุณาโหลดรายการใหม่'),{status:409});
      }
      context.job=job;
      return;
    }
    if(job.status!==STATUS.OPEN){
      throw Object.assign(new Error('สถานะงานเปลี่ยนแล้ว กรุณาโหลดรายการใหม่'),{status:409});
    }
    if(job.assignedTo&&!S.ownsJob(job,context.session,context.identity)){
      throw Object.assign(new Error('งานนี้ถูกมอบหมายให้พนักงานคนอื่น'),{status:403});
    }
    const patch={
      status:STATUS.IN_PROGRESS,
      assignedTo:job.assignedTo||context.identity.displayName||context.session.displayName||context.session.employeeId,
      startTime:Number(job.startTime)||now,
      lastModified:now
    };
    tx.set(context.ref,patch,{merge:true});
    context.job=Object.assign({},job,patch);
  });
}

async function completePlasJob(context,fzone){
  const d=L.db(),now=Date.now();
  const historyRef=d.collection('history').doc('FZONE-TOP-'+String(context.job.id));
  let replayed=false,jobResult=null;
  await d.runTransaction(async tx=>{
    const snap=await tx.get(context.ref);
    if(!snap.exists)throw Object.assign(new Error('ไม่พบงาน TopUp'),{status:404});
    const job=Object.assign({id:String(context.job.id)},snap.data()||{});
    if(job.status===STATUS.DONE&&job.fzoneTopStatus==='completed'){
      replayed=true;
      jobResult=job;
      return;
    }
    if(job.status!==STATUS.IN_PROGRESS){
      throw Object.assign(new Error('สถานะงานเปลี่ยนแล้ว กรุณาโหลดใหม่'),{status:409});
    }
    if(!S.ownsJob(job,context.session,context.identity)){
      throw Object.assign(new Error('งานนี้ไม่ได้อยู่กับบัญชีที่กำลังใช้งาน'),{status:403});
    }
    const finishTime=now;
    const patch={
      status:STATUS.DONE,
      finishTime,
      finishTimeDisplay:new Date(finishTime).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok'}),
      lastModified:finishTime,
      fzoneTopStatus:'completed',
      fzoneTopBatchId:String(fzone.batchId||''),
      fzoneTopPalletIds:Array.isArray(fzone.palletIds)?fzone.palletIds:[],
      fzoneTopQty:Math.abs(Number(job.qty||0)),
      fzoneTopLocation:String(job.toLoc||''),
      fzoneTopCompletedAt:finishTime,
      fzoneTopCompletedBy:context.session.employeeId
    };
    tx.set(context.ref,patch,{merge:true});
    tx.set(historyRef,{
      id:'FZONE-TOP-'+String(job.id),
      date:new Date(finishTime).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'}),
      time:patch.finishTimeDisplay,
      user:job.assignedTo||context.identity.displayName||context.session.employeeId,
      item:job.item||'',
      qty:Math.abs(Number(job.qty||0)),
      loc:String(job.fromLoc||'')+' -> '+String(job.toLoc||''),
      remark:String(job.remark||''),
      action:'TopUp',
      timestamp:finishTime,
      sourceSystem:'FZONE',
      sourceJobId:String(job.id),
      fzoneBatchId:String(fzone.batchId||''),
      palletIds:patch.fzoneTopPalletIds
    },{merge:true});
    jobResult=Object.assign({},job,patch);
  });
  return{replayed,job:jobResult};
}

async function reopenAcceptedJob(context,fzone){
  const d=L.db(),now=Date.now();
  let jobResult=null;
  await d.runTransaction(async tx=>{
    const snap=await tx.get(context.ref);
    if(!snap.exists)throw Object.assign(new Error('ไม่พบงาน TopUp'),{status:404});
    const job=Object.assign({id:String(context.job.id)},snap.data()||{});
    if(job.status!==STATUS.IN_PROGRESS){
      throw Object.assign(new Error('สถานะงานเปลี่ยนแล้ว กรุณาโหลดใหม่'),{status:409});
    }
    if(!S.ownsJob(job,context.session,context.identity)){
      throw Object.assign(new Error('ยกเลิกได้เฉพาะงานที่บัญชีนี้รับไว้'),{status:403});
    }
    const audit=Array.isArray(job.topupAudit)?job.topupAudit.slice(-79):[];
    audit.push({
      at:now,
      by:context.identity.displayName||context.session.displayName||context.session.employeeId,
      action:'EMPLOYEE_ACCEPT_CANCELLED',
      detail:'พนักงานคืนงานเข้าคิว เนื่องจากรับงานผิด'
    });
    const patch={
      status:STATUS.OPEN,
      assignedTo:'',
      startTime:null,
      lastModified:now,
      fzoneTopStatus:fzone&&fzone.released?'released':String(job.fzoneTopStatus||'')==='reserved'?'released':String(job.fzoneTopStatus||''),
      fzoneTopPalletIds:[],
      fzoneTopReservationExpiresAt:0,
      acceptanceCancelledBy:context.session.employeeId,
      acceptanceCancelledAt:now,
      acceptanceCancelCount:Number(job.acceptanceCancelCount||0)+1,
      topupAudit:audit
    };
    tx.set(context.ref,patch,{merge:true});
    jobResult=Object.assign({},job,patch);
  });
  return jobResult;
}

exports.handler=async event=>{
  const pf=L.preflight(event);if(pf)return pf;
  if(event.httpMethod!=='POST')return L.json(405,{ok:false,error:'Method not allowed'});
  try{
    const body=L.body(event),action=String(body.action||'match').toLowerCase();
    if(!['match','reserve','release','complete','cancel'].includes(action))throw new Error('Action ไม่รองรับ');
    const ownerRequired=!['match','reserve'].includes(action);
    const statuses=['match','reserve'].includes(action)
      ?[STATUS.OPEN,STATUS.IN_PROGRESS]
      :[STATUS.IN_PROGRESS];
    const context=await S.loadContext(body.session,body.jobId,{requireOwner:ownerRequired,allowedStatuses:statuses});
    const extra={};
    if(action==='reserve')extra.palletIds=[...new Set((body.palletIds||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];
    if(action==='reserve')await claimJobForReserve(context);
    if(action==='cancel'){
      let fzone={released:false,skipped:true};
      const hasReservation=String(context.job.fzoneTopStatus||'')==='reserved'||
        (Array.isArray(context.job.fzoneTopPalletIds)&&context.job.fzoneTopPalletIds.length>0);
      if(hasReservation){
        try{
          fzone=Object.assign({released:true},await S.callFzone('release',context,extra));
        }catch(error){
          if(!['TOPUP_NOT_RESERVED','TOPUP_RESERVATION_EXPIRED'].includes(String(error&&error.code||'')))throw error;
          fzone={released:true,alreadyReleased:true,code:error.code};
        }
      }
      const job=await reopenAcceptedJob(context,fzone);
      return L.json(200,{ok:true,action,fzone,job});
    }
    const fzone=await S.callFzone(action,context,extra);
    if(action==='reserve'){
      await context.ref.set({
        fzoneTopStatus:'reserved',
        fzoneTopPalletIds:fzone.palletIds||[],
        fzoneTopReservedAt:Date.now(),
        fzoneTopReservationExpiresAt:Number(fzone.expiresAt||0),
        fzoneTopQty:Number(fzone.totalQty||0)
      },{merge:true});
    }else if(action==='release'){
      await context.ref.set({
        fzoneTopStatus:'released',
        fzoneTopPalletIds:[],
        fzoneTopReservationExpiresAt:0,
        lastModified:Date.now()
      },{merge:true});
    }else if(action==='complete'){
      const completed=await completePlasJob(context,fzone);
      return L.json(200,{ok:true,action,fzone,replayed:fzone.replayed||completed.replayed,job:completed.job});
    }
    return L.json(200,Object.assign({ok:true,action},fzone));
  }catch(error){
    console.error('F-Zone TopUp integration',error);
    return L.json(Number(error.status||400),{ok:false,code:error.code||'TOPUP_SYNC_FAILED',error:error.message||String(error)});
  }
};
