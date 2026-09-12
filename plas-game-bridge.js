(function(){
'use strict';
var VERSION='5.13.1';
var SESSION_KEY='plas_game_bridge_session_v1';
var QUEUE_KEY='plas_game_work_queue_v1';
var DEFAULT_URL='https://borneo-plas-quest.netlify.app/';
var ready=null,opening=false,flushing=false;

function notify(message,type){
  try{
    if(window.app&&typeof window.app.toast==='function')window.app.toast(message,type||'info');
    else if(window.app&&type==='error'&&typeof window.app.showError==='function')window.app.showError(message);
    else console.log('[PLAS Quest]',message);
  }catch(_e){}
}

async function post(name,payload){
  var response=await fetch('/.netlify/functions/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{}),cache:'no-store'});
  var data={};try{data=await response.json();}catch(_e){}
  if(!response.ok||data.ok===false){var error=new Error(data.error||('HTTP '+response.status));error.status=response.status;throw error;}
  return data;
}

function normalizeRole(role){
  var value=String(role||'').toLowerCase().trim();
  if(['admin','administrator','receiver'].indexOf(value)>=0)return 'admin';
  if(['supervisor','senior','manager'].indexOf(value)>=0)return 'supervisor';
  return 'writer';
}

function stored(){
  try{var value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(value&&value.session&&Number(value.expiresAt||0)>Date.now()+30000)return value;}catch(_e){}
  return null;
}

function currentIdentity(){
  var app=window.app;if(!app||!app.state||!app.state.ui)return null;
  var current=String(app.state.ui.currentUser||'').trim();if(!current)return null;
  var username=current,role='writer';
  if(/^Admin:\s*/i.test(current)){username=current.replace(/^Admin:\s*/i,'').trim();role='admin';}
  else if(current==='Admin'){username=String((app.state.data&&app.state.data.admins&&app.state.data.admins[0])||'').trim();role='admin';}
  else if(current==='Supervisor'){
    try{username=String(app._activeSupervisorName||localStorage.getItem('plas_last_user')||'').trim();}catch(_e){username=String(app._activeSupervisorName||'').trim();}
    role='supervisor';
  }else{
    try{var remembered=localStorage.getItem('plas_last_role');if(remembered)role=normalizeRole(remembered);else if(typeof app.getUserRoles==='function')role=normalizeRole((app.getUserRoles(username)||[])[0]);}catch(_e){}
  }
  return username?{username:username,role:role}:null;
}

function establishSession(username,pin,role,noPin){
  ready=post('game-plas-session',{username:username,pin:pin,role:normalizeRole(role),noPin:noPin===true}).then(function(data){
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(data));
    flushWorkEvents(data).catch(function(error){console.warn('PLAS Quest work sync:',error);});
    return data;
  }).catch(function(error){ready=null;sessionStorage.removeItem(SESSION_KEY);throw error;});
  return ready;
}

function establishSessionNoPin(username,role){return establishSession(username,'',role,true);}

async function sessionForCurrentAccount(){
  var session=stored();if(!session&&ready){try{session=await ready;}catch(_e){}}
  if(session)return session;
  var identity=currentIdentity();if(!identity)return null;
  var profile=null;try{profile=window.app&&typeof window.app.getUserProfile==='function'?window.app.getUserProfile(identity.username):null;}catch(_e){}
  if(!profile||!profile.pinEnabled||!/^\d{4}$/.test(String(profile.pin||'').replace(/\D/g,'')))return establishSessionNoPin(identity.username,identity.role);
  var pin=window.prompt('กรอก PIN ของบัญชี '+identity.username+' เพื่อเข้า PLAS Quest');
  if(pin===null)throw new Error('ยกเลิกการเข้าเกม');
  return establishSession(identity.username,String(pin).replace(/\D/g,''),identity.role,false);
}

function popupUsable(popup){if(!popup)return false;try{return popup.closed!==true;}catch(_e){return true;}}
function showProgress(popup){
  if(!popupUsable(popup))return;
  try{
    popup.document.title='กำลังเปิด PLAS Quest Online';
    popup.document.head.innerHTML='<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}html,body{margin:0;background:#173743}.pq{min-height:100vh;display:grid;place-items:center;padding:22px;font-family:Tahoma,sans-serif;color:#f8edcf;background:#102d39}.card{width:min(600px,100%);padding:28px;border:2px solid #d3b961;border-radius:24px;text-align:center;background:#183b47}.yard{position:relative;height:150px;margin:20px 0;overflow:hidden;border-radius:15px;background:linear-gradient(#aac1b6 0 62%,#d9c99e 62%);border:3px solid #0e2832}.rack{position:absolute;inset:18px 9% 54px;border:7px solid #36545d;background:repeating-linear-gradient(90deg,transparent 0 23%,#36545d 24% 27%,transparent 28% 48%)}.fork{position:absolute;bottom:22px;left:-90px;width:86px;height:48px;border-radius:8px;background:#e3b83e;border:3px solid #513f27;animation:drive 2.6s ease-in-out infinite}.fork:before{content:"👷";position:absolute;left:12px;top:-27px;font-size:34px}.fork:after{content:"";position:absolute;left:70px;top:32px;width:58px;border-top:7px solid #403829;box-shadow:0 11px 0 #403829}.progress{height:10px;margin:18px 0 12px;overflow:hidden;border-radius:99px;background:#0d2934}.progress b{display:block;width:42%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#c96555,#d4b94d);animation:pulse 1.3s ease-in-out infinite alternate}@keyframes drive{0%{left:-90px}55%,75%{left:52%}100%{left:110%}}@keyframes pulse{to{width:72%}}@media(prefers-reduced-motion:reduce){.fork,.progress b{animation:none}.fork{left:52%}.progress b{width:55%}}</style>';
    popup.document.body.innerHTML='<main class="pq" role="status" aria-live="polite"><section class="card"><small>BORNEO · PLAS QUEST ONLINE</small><h1>กำลังเปิดประตูคลัง</h1><div class="yard" aria-hidden="true"><span class="rack"></span><span class="fork"></span></div><h2>กำลังยืนยันบัญชี PLASWMS</h2><p>เตรียมชื่อพนักงานและสิทธิ์เข้า Warehouse Board…</p><div class="progress"><b></b></div></section></main>';
  }catch(_e){}
}
function navigate(popup,url){
  if(popupUsable(popup)){try{popup.location.replace(url);if(typeof popup.focus==='function')popup.focus();return;}catch(_e){}}
  location.assign(url);
}
function withTicket(url,ticket){var value=new URL(url||DEFAULT_URL,location.href);value.searchParams.set('ticket',ticket);return value.toString();}

function queued(){try{var value=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');return Array.isArray(value)?value:[];}catch(_e){return [];}}
function saveQueue(value){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(value.slice(-100)));}catch(_e){}}
function syncWorkEvent(eventId){
  var id=String(eventId||'').trim();if(!id)return Promise.resolve(false);
  var queue=queued();if(queue.indexOf(id)<0)queue.push(id);saveQueue(queue);
  var session=stored();if(session)return flushWorkEvents(session);
  return Promise.resolve(true);
}
async function flushWorkEvents(session){
  if(flushing||!session||!session.session)return false;
  flushing=true;
  try{
    var queue=queued(),remaining=queue.slice(),batch=queue.slice(0,25);
    for(var i=0;i<batch.length;i++){
      try{
        var result=await post('game-work-sync',{session:session.session,eventId:batch[i]});
        remaining=remaining.filter(function(id){return id!==batch[i];});
        saveQueue(remaining);
        if(Number(result.diceGranted||0)>0)notify('งานครบเกณฑ์ ได้รับลูกเต๋าเกม +'+result.diceGranted,'success');
      }catch(error){
        if(Number(error.status||0)===404||Number(error.status||0)===403){remaining=remaining.filter(function(id){return id!==batch[i];});saveQueue(remaining);}
        else break;
      }
    }
    return true;
  }finally{flushing=false;}
}

async function open(){
  if(opening){notify('กำลังเปิด PLAS Quest กรุณารอสักครู่','info');return false;}
  opening=true;
  var popup=null;try{popup=window.open('about:blank','_blank');}catch(_e){}
  showProgress(popup);
  var button=document.querySelector('[data-plas-game-launch]');if(button)button.classList.add('is-launching');
  notify('กำลังเปิด PLAS Quest…','info');
  try{
    var session=await sessionForCurrentAccount();
    if(!session||!session.session)throw new Error('ไม่พบบัญชี PLAS สำหรับเข้าเกม');
    flushWorkEvents(session).catch(function(error){console.warn('PLAS Quest work sync:',error);});
    var data=await post('game-launch-issue',{session:session.session});
    navigate(popup,withTicket(data.gameUrl||window.PLAS_GAME_URL||DEFAULT_URL,data.ticket));
    return true;
  }catch(error){
    if(popupUsable(popup)){
      try{popup.document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;margin:0;background:#23192b;font-family:Tahoma,sans-serif;color:#ffeef1"><div style="max-width:460px;text-align:center;padding:28px"><div style="font-size:38px">⚠</div><h1 style="font-size:20px;margin:12px 0 5px">เข้า PLAS Quest ไม่สำเร็จ</h1><p style="margin:0;color:#d5aeb8">'+String(error&&error.message||error).replace(/[&<>\"]/g,function(character){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[character];})+'</p><button onclick="window.close()" style="margin-top:18px;padding:10px 18px;border:0;border-radius:10px;background:#f0c45a;color:#18263a;font-weight:800">ปิดหน้าต่าง</button></div></main>'; }catch(_e){try{popup.close();}catch(_ignored){}}
    }
    notify('เข้า PLAS Quest ไม่สำเร็จ: '+error.message,'error');
    return false;
  }finally{opening=false;if(button)button.classList.remove('is-launching');}
}

function clear(){ready=null;try{sessionStorage.removeItem(SESSION_KEY);}catch(_e){}}

function installLoginHook(){
  var app=window.app;if(!app||typeof app.verifyPINAndLogin!=='function')return false;
  app.hubGoGame=function(){if(typeof this._closeQuickHub==='function')this._closeQuickHub();return open();};
  if(app.verifyPINAndLogin.__plasGameBridgeHook)return true;
  var original=app.verifyPINAndLogin;
  function wrapped(username){
    var pin='';try{pin=String(this._pinValue||(document.getElementById('pin-input')||{}).value||'').replace(/\D/g,'');}catch(_e){}
    var role=normalizeRole(this._pendingRole||((typeof this.getUserRoles==='function'&&(this.getUserRoles(username)||[])[0])||'writer'));
    var valid=false;try{valid=pin.length===4&&typeof this.verifyPIN==='function'&&this.verifyPIN(username,pin);}catch(_e){}
    var previous=ready,result=original.apply(this,arguments);
    if(valid&&ready===previous)this._plasGameBridgeReady=establishSession(username,pin,role,false).catch(function(error){console.warn('PLAS Quest login hook:',error&&error.message||error);return null;});
    return result;
  }
  wrapped.__plasGameBridgeHook=true;wrapped.__original=original;app.verifyPINAndLogin=wrapped;

  if(typeof app.enterRole==='function'&&!app.enterRole.__plasGameBridgeNoPinHook){
    var originalEnter=app.enterRole;
    var wrappedEnter=function(username,roleKey){
      var hasPin=false;try{var profile=typeof this.getUserProfile==='function'?this.getUserProfile(username):null;hasPin=!!(profile&&profile.pinEnabled&&/^\d{4}$/.test(String(profile.pin||'').replace(/\D/g,'')));}catch(_e){}
      var previous=ready,result=originalEnter.apply(this,arguments);
      if(!hasPin&&ready===previous)this._plasGameBridgeReady=establishSessionNoPin(username,roleKey).catch(function(error){console.warn('PLAS Quest no-PIN hook:',error&&error.message||error);return null;});
      return result;
    };
    wrappedEnter.__plasGameBridgeNoPinHook=true;wrappedEnter.__original=originalEnter;app.enterRole=wrappedEnter;
  }
  if(typeof app.logout==='function'&&!app.logout.__plasGameBridgeLogoutHook){
    var originalLogout=app.logout;
    var wrappedLogout=function(){clear();return originalLogout.apply(this,arguments);};
    wrappedLogout.__plasGameBridgeLogoutHook=true;wrappedLogout.__original=originalLogout;app.logout=wrappedLogout;
  }
  return true;
}

window.PlasGameBridge={open:open,establishSession:establishSession,establishSessionNoPin:establishSessionNoPin,ensureSession:sessionForCurrentAccount,syncWorkEvent:syncWorkEvent,flushWorkEvents:flushWorkEvents,currentIdentity:currentIdentity,clear:clear,installLoginHook:installLoginHook,hasSession:function(){return !!stored();}};

if(!installLoginHook()){
  var attempts=0,timer=setInterval(function(){attempts++;if(installLoginHook()||attempts>100)clearInterval(timer);},50);
}
console.log('✅ PLAS_GAME_BRIDGE_'+VERSION.replace(/\./g,'_')+'_ACTIVE');
})();
