(function(){
'use strict';
const VERSION='2.0.8-quota-diagnostics';
const KEY='plas_fzone_bridge_session_v2';
const DEFAULT_URL='https://borneofzone.netlify.app/';
const RETRY_COOLDOWN_MS=30000;
let ready=null;
let opening=false;
let lastSessionFailure=null;

function notify(message,type){
  try{
    if(window.app&&typeof window.app.toast==='function')window.app.toast(message,type||'info');
    else if(window.app&&type==='error'&&typeof window.app.showError==='function')window.app.showError(message);
    else console.log('[F-Zone Bridge]',message);
  }catch(_e){}
}

async function post(name,payload){
  const r=await fetch('/.netlify/functions/'+name,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload||{}),
    cache:'no-store'
  });
  let data={};
  try{data=await r.json()}catch(_e){}
  if(!r.ok||data.ok===false){
    const error=new Error(data.error||('HTTP '+r.status));
    error.status=r.status;
    error.code=data.code||'HTTP_'+r.status;
    error.data=data;
    throw error;
  }
  return data;
}

function normalizeRole(role){
  const r=String(role||'').toLowerCase().trim();
  if(['admin','administrator','receiver'].includes(r))return 'admin';
  if(['supervisor','senior','manager'].includes(r))return 'supervisor';
  return 'writer';
}

function stored(){
  try{
    const s=JSON.parse(sessionStorage.getItem(KEY)||'null');
    if(s&&s.session&&Number(s.expiresAt||0)>Date.now()+30000)return s;
  }catch(_e){}
  return null;
}

async function establishSession(username,pin,role){
  const normalizedRole=normalizeRole(role);
  console.log('🔄 Calling fzone-session for',username,'role',normalizedRole);
  ready=post('fzone-session',{username,pin,role:normalizedRole})
    .then(data=>{
      lastSessionFailure=null;
      sessionStorage.setItem(KEY,JSON.stringify(data));
      return data;
    })
    .catch(e=>{
      lastSessionFailure={error:e,at:Date.now()};
      ready=null;
      sessionStorage.removeItem(KEY);
      console.warn('F-Zone bridge session:',e);
      throw e;
    });
  return ready;
}

async function establishSessionNoPin(username,role){
  const normalizedRole=normalizeRole(role);
  console.log('🔄 Calling fzone-session (PLAS no-PIN account) for',username,'role',normalizedRole);
  ready=post('fzone-session',{username,role:normalizedRole,noPin:true})
    .then(data=>{
      lastSessionFailure=null;
      sessionStorage.setItem(KEY,JSON.stringify(data));
      return data;
    })
    .catch(e=>{
      lastSessionFailure={error:e,at:Date.now()};
      ready=null;
      sessionStorage.removeItem(KEY);
      console.warn('F-Zone no-PIN bridge session:',e);
      throw e;
    });
  return ready;
}

function appendParams(url,params){
  const u=new URL(url,location.href);
  Object.entries(params||{}).forEach(([k,v])=>{
    if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
  });
  return u.toString();
}

function popupIsUsable(popup){
  if(!popup)return false;
  try{return popup.closed!==true}catch(_e){return true}
}

function showPopupProgress(popup){
  if(!popupIsUsable(popup))return;
  try{
    popup.document.title='กำลังเปิด BORNEO F-Zone';
    popup.document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;margin:0;background:#f3f8f7;font-family:Tahoma,sans-serif;color:#17394a"><div style="text-align:center;padding:28px"><div style="font-size:38px">🗺️</div><h1 style="font-size:20px;margin:12px 0 5px">กำลังเปิดแผนผัง F-Zone</h1><p style="margin:0;color:#60788b">กำลังตรวจสอบบัญชีและตำแหน่งสินค้า…</p></div></main>';
  }catch(_e){}
}

function navigateToFZone(popup,url){
  if(popupIsUsable(popup)){
    try{
      popup.location.replace(url);
      if(typeof popup.focus==='function')popup.focus();
      return 'popup';
    }catch(_e){}
  }
  if(window.location&&typeof window.location.assign==='function')window.location.assign(url);
  else window.location.href=url;
  return 'same-tab';
}

function bridgeFailureKind(error){
  const status=Number(error&&error.status||0);
  const code=String(error&&error.code||'').toUpperCase();
  const message=String(error&&error.message||error||'');
  if(code==='BRIDGE_QUOTA_EXHAUSTED'||code==='RESOURCE_EXHAUSTED'||/RESOURCE_EXHAUSTED|quota exceeded|โควตา/i.test(message))return 'quota';
  if(/failed to fetch|networkerror|load failed|offline/i.test(message))return 'network';
  if(status===502||status===503||status===504||/temporarily unavailable/i.test(message))return 'service';
  return '';
}

function bridgeIsTemporarilyUnavailable(error){return !!bridgeFailureKind(error);}

function openDirectFallback(popup,params,error){
  const direct=appendParams(window.PLAS_FZONE_URL||DEFAULT_URL,params||{});
  navigateToFZone(popup,direct);
  const kind=bridgeFailureKind(error);
  const reason=kind==='quota'?'โควตาฐานข้อมูล PLAS เต็มชั่วคราว':kind==='network'?'เครือข่ายเชื่อมต่อ PLAS ขัดข้อง':'บริการเชื่อมบัญชี PLAS ไม่พร้อมชั่วคราว';
  notify(reason+' — เปิดหน้า F-Zone โดยตรงแล้ว กรุณาเข้าสู่ระบบ F-Zone','info');
  return true;
}

function currentIdentity(){
  const a=window.app;
  if(!a||!a.state||!a.state.ui)return null;
  const current=String(a.state.ui.currentUser||'').trim();
  if(!current)return null;

  let username=current;
  let role='writer';
  if(/^Admin:\s*/i.test(current)){
    username=current.replace(/^Admin:\s*/i,'').trim();
    role='admin';
  }else if(current==='Admin'){
    username=String((a.state.data&&a.state.data.admins&&a.state.data.admins[0])||'').trim();
    role='admin';
  }else if(current==='Supervisor'){
    try{username=String(a._activeSupervisorName||localStorage.getItem('plas_last_user')||'').trim()}catch(_e){username=String(a._activeSupervisorName||'').trim()}
    role='supervisor';
  }else{
    try{
      const rememberedRole=localStorage.getItem('plas_last_role');
      if(rememberedRole)role=normalizeRole(rememberedRole);
      else if(typeof a.getUserRoles==='function')role=normalizeRole((a.getUserRoles(username)||[])[0]);
    }catch(_e){}
  }
  return username?{username,role}:null;
}

async function sessionForCurrentAccount(options){
  const interactive=!options||options.interactive!==false;
  let s=stored();
  if(!s&&ready){try{s=await ready}catch(_e){}}
  if(s)return s;
  if(lastSessionFailure&&Date.now()-lastSessionFailure.at<RETRY_COOLDOWN_MS)throw lastSessionFailure.error;

  const identity=currentIdentity();
  if(!identity)return null;

  let profile=null;
  try{profile=window.app&&typeof window.app.getUserProfile==='function'?window.app.getUserProfile(identity.username):null}catch(_e){}
  if(!profile||!profile.pinEnabled||!/^[0-9]{4}$/.test(String(profile.pin||'').replace(/\D/g,''))){
    return establishSessionNoPin(identity.username,identity.role);
  }

  // Passive card matching must never interrupt warehouse work with a PIN
  // dialog. The dialog is reserved for an explicit F-Zone action only.
  if(!interactive){
    const error=new Error('ยังไม่ได้เชื่อม F-Zone · แตะปุ่ม F-Zone เมื่อต้องการตรวจ');
    error.status=401;
    error.code='FZONE_SESSION_REQUIRED';
    throw error;
  }

  const pin=window.prompt('กรอก PIN ของบัญชี '+identity.username+' เพื่อเปิด BORNEO F-Zone');
  if(pin===null)throw new Error('ยกเลิกการเปิด F-Zone');
  return establishSession(identity.username,String(pin).replace(/\D/g,''),identity.role);
}

async function request(name,payload,options){
  const session=await sessionForCurrentAccount(options);
  if(!session||!session.session)throw new Error('ไม่พบ Session PLAS สำหรับเชื่อม F-Zone');
  return post(name,Object.assign({},payload||{},{session:session.session}));
}

async function open(params){
  params=params||{};
  if(opening){
    notify('กำลังเปิด BORNEO F-Zone กรุณารอสักครู่','info');
    return false;
  }
  opening=true;
  let popup=null;
  try{popup=window.open('about:blank','_blank')}catch(_e){}
  showPopupProgress(popup);
  notify('กำลังเปิดแผนผัง BORNEO F-Zone…','info');
  try{
    const s=await sessionForCurrentAccount();
    if(!s){
      const direct=appendParams(window.PLAS_FZONE_URL||DEFAULT_URL,params);
      navigateToFZone(popup,direct);
      notify('ไม่พบข้อมูลบัญชี PLAS — เปิดหน้า Login ของ F-Zone','info');
      return true;
    }
    const data=await post('fzone-bridge-issue',{session:s.session});
    const url=appendParams(data.fzoneUrl||window.PLAS_FZONE_URL||DEFAULT_URL,Object.assign({},params,{ticket:data.ticket}));
    navigateToFZone(popup,url);
    return true;
  }catch(e){
    if(bridgeIsTemporarilyUnavailable(e))return openDirectFallback(popup,params,e);
    if(popupIsUsable(popup)){
      try{
        popup.document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;margin:0;background:#fff7f5;font-family:Tahoma,sans-serif;color:#7f2d25"><div style="max-width:480px;text-align:center;padding:28px"><div style="font-size:38px">⚠️</div><h1 style="font-size:20px;margin:12px 0 5px">เปิด F-Zone ไม่สำเร็จ</h1><p style="margin:0;color:#8f5b54">'+String(e&&e.message||e).replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]})+'</p><button onclick="window.close()" style="margin-top:18px;padding:10px 18px;border:0;border-radius:10px;background:#9b3f34;color:white;font-weight:700">ปิดหน้าต่าง</button></div></main>';
      }catch(_e){try{popup.close()}catch(_ignored){}}
    }
    notify('เปิด BORNEO F-Zone ไม่สำเร็จ: '+e.message,'error');
    return false;
  }finally{
    opening=false;
  }
}

function clear(){
  ready=null;
  lastSessionFailure=null;
  try{sessionStorage.removeItem(KEY)}catch(_e){}
}

function installLoginHook(){
  const a=window.app;
  if(!a||typeof a.verifyPINAndLogin!=='function')return false;
  if(a.verifyPINAndLogin.__plasFZoneBridgeHook)return true;
  const original=a.verifyPINAndLogin;
  function wrappedVerifyPINAndLogin(username){
    let pin='';
    try{pin=String(this._pinValue||(document.getElementById('pin-input')||{}).value||'').replace(/\D/g,'')}catch(_e){}
    const role=normalizeRole(this._pendingRole||((typeof this.getUserRoles==='function'&&(this.getUserRoles(username)||[])[0])||'writer'));
    let valid=false;
    try{valid=pin.length===4&&typeof this.verifyPIN==='function'&&this.verifyPIN(username,pin)}catch(_e){}
    const previousReady=ready;
    const result=original.apply(this,arguments);
    // Universal role hook: writer, admin and supervisor all establish the same
    // PLAS bridge session after their named account PIN is verified.
    if(valid&&ready===previousReady){
      console.log('🔐 PLAS F-Zone Bridge: establishing session for',username,'role',role);
      this._fzoneBridgeReady=establishSession(username,pin,role).catch(function(err){
        console.warn('F-Zone Bridge login hook unavailable:',err&&err.message||err);
        return null;
      });
    }
    return result;
  }
  wrappedVerifyPINAndLogin.__plasFZoneBridgeHook=true;
  wrappedVerifyPINAndLogin.__original=original;
  a.verifyPINAndLogin=wrappedVerifyPINAndLogin;

  if(typeof a.enterRole==='function'&&!a.enterRole.__plasFZoneBridgeNoPinHook){
    const originalEnterRole=a.enterRole;
    const wrappedEnterRole=function(username,roleKey){
      let hasPin=false;
      try{const profile=typeof this.getUserProfile==='function'?this.getUserProfile(username):null;hasPin=!!(profile&&profile.pinEnabled&&/^[0-9]{4}$/.test(String(profile.pin||'').replace(/\D/g,'')))}catch(_e){}
      const previousReady=ready,result=originalEnterRole.apply(this,arguments);
      if(!hasPin&&ready===previousReady){
        console.log('🔓 PLAS F-Zone Bridge: no-PIN account',username,'role',roleKey);
        this._fzoneBridgeReady=establishSessionNoPin(username,roleKey).catch(function(err){
          console.warn('F-Zone no-PIN login hook unavailable:',err&&err.message||err);
          return null;
        });
      }
      return result;
    };
    wrappedEnterRole.__plasFZoneBridgeNoPinHook=true;
    wrappedEnterRole.__original=originalEnterRole;
    a.enterRole=wrappedEnterRole;
  }

  if(typeof a.logout==='function'&&!a.logout.__plasFZoneBridgeLogoutHook){
    const originalLogout=a.logout;
    const wrappedLogout=function(){clear();return originalLogout.apply(this,arguments)};
    wrappedLogout.__plasFZoneBridgeLogoutHook=true;
    wrappedLogout.__original=originalLogout;
    a.logout=wrappedLogout;
  }

  console.log('✅ PLAS_FZONE_LOGIN_HOOK_'+VERSION.toUpperCase().replace(/[^A-Z0-9]+/g,'_')+'_ACTIVE');
  return true;
}

window.PlasFZoneBridge={
  establishSession,
  establishSessionNoPin,
  open,
  request,
  ensureSession:sessionForCurrentAccount,
  clear,
  installLoginHook,
  currentIdentity,
  bridgeFailureKind,
  bridgeIsTemporarilyUnavailable,
  get ready(){return ready},
  hasSession:()=>!!stored()
};

if(!installLoginHook()){
  let attempts=0;
  const timer=setInterval(function(){
    attempts++;
    if(installLoginHook()||attempts>100)clearInterval(timer);
  },50);
}
})();
