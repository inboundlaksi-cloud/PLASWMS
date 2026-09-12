'use strict';
// PLAS-only Functions directory; intentionally isolated from legacy F-Zone helpers.
const admin=require('firebase-admin');
const crypto=require('crypto');
function getAdmin(){
  const name='plas-bridge-admin';const app=admin.apps.find(x=>x.name===name);if(app)return admin;
  const raw=process.env.PLAS_FIREBASE_SERVICE_ACCOUNT_JSON;if(!raw)throw new Error('Missing PLAS_FIREBASE_SERVICE_ACCOUNT_JSON');
  let svc;try{svc=JSON.parse(raw)}catch(_e){throw new Error('Invalid PLAS_FIREBASE_SERVICE_ACCOUNT_JSON')}
  if(svc.private_key)svc.private_key=svc.private_key.replace(/\\n/g,'\n');admin.initializeApp({credential:admin.credential.cert(svc)},name);return admin;
}
function db(){getAdmin();return admin.app('plas-bridge-admin').firestore()}
function json(status,data){const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};if(process.env.PLAS_ALLOWED_ORIGIN)headers['Access-Control-Allow-Origin']=process.env.PLAS_ALLOWED_ORIGIN;return{statusCode:status,headers,body:JSON.stringify(data)}}
function preflight(e){return e.httpMethod==='OPTIONS'?json(204,{}):null}
function body(e){try{return JSON.parse(e.body||'{}')}catch(_e){throw new Error('JSON ไม่ถูกต้อง')}}
function cleanName(v){const s=String(v||'').trim().slice(0,100);if(!s)throw new Error('ไม่พบชื่อผู้ใช้');return s}
function cleanPin(v){const p=String(v||'').replace(/\D/g,'');if(!/^\d{4}$/.test(p))throw new Error('PIN ต้องเป็นตัวเลข 4 หลัก');return p}
function safeEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function sign(payload,secret){const data=Buffer.from(JSON.stringify(payload)).toString('base64url'),sig=crypto.createHmac('sha256',secret).update(data).digest('base64url');return data+'.'+sig}
function verify(token,secret){const parts=String(token||'').split('.');if(parts.length!==2)throw new Error('Session format ไม่ถูกต้อง');const expected=crypto.createHmac('sha256',secret).update(parts[0]).digest(),got=Buffer.from(parts[1],'base64url');if(expected.length!==got.length||!crypto.timingSafeEqual(expected,got))throw new Error('Session signature ไม่ถูกต้อง');const p=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));if(Number(p.exp||0)<Date.now())throw new Error('Session PLAS หมดอายุ');return p}
function secret(){const s=process.env.PLAS_BRIDGE_SECRET;if(!s||s.length<32)throw new Error('Missing/weak PLAS_BRIDGE_SECRET (ต้องยาวอย่างน้อย 32 ตัวอักษร)');return s}
function sessionSecret(){return crypto.createHash('sha256').update(secret()+':plas-session').digest('hex')}
function gameSecret(){const s=process.env.PLAS_GAME_BRIDGE_SECRET;if(s){if(s.length<32)throw new Error('Weak PLAS_GAME_BRIDGE_SECRET (ต้องยาวอย่างน้อย 32 ตัวอักษร)');return s}return crypto.createHash('sha256').update(secret()+':plas-game-ticket').digest('hex')}
function gameSessionSecret(){return crypto.createHash('sha256').update(gameSecret()+':plas-game-session').digest('hex')}
function gameEventSecret(){const s=process.env.PLAS_GAME_EVENT_SECRET;if(s){if(s.length<32)throw new Error('Weak PLAS_GAME_EVENT_SECRET (ต้องยาวอย่างน้อย 32 ตัวอักษร)');return s}return crypto.createHash('sha256').update(secret()+':plas-game-event').digest('hex')}
function randomId(){return crypto.randomBytes(18).toString('base64url')}
async function loadIdentity(username){
  username=cleanName(username);const d=db(),[profilesSnap,usersSnap]=await Promise.all([d.collection('profiles').doc('user_profiles').get(),d.collection('users').doc('main').get()]);
  const profiles=profilesSnap.exists&&profilesSnap.data().data||{},profile=profiles[username]||{},users=usersSnap.exists?usersSnap.data()||{}:{};
  const writers=Array.isArray(users.users)?users.users:[],admins=Array.isArray(users.admins)?users.admins:[],supervisors=Array.isArray(users.supervisors)?users.supervisors:[],roles=[];
  if(writers.includes(username))roles.push('writer');if(admins.includes(username))roles.push('admin');if(supervisors.includes(username))roles.push('supervisor');if(!roles.length&&users.userRoles&&users.userRoles[username])roles.push('writer');
  const cfg=users.userRoles&&users.userRoles[username]||{},allowed=cfg.fzoneMove===true||(cfg.permissions&&cfg.permissions.fzoneMove===true)||roles.includes('admin')||roles.includes('supervisor');
  return{username,profile,users,roles,cfg,allowed,displayName:String(profile.displayName||username)};
}
function err(e){
  console.error(e);
  const rawCode=String(e&&e.code||'').toLowerCase(),message=String(e&&e.message||e||'');
  const quotaExceeded=rawCode==='8'||rawCode==='resource-exhausted'||rawCode==='firestore/resource-exhausted'||/RESOURCE_EXHAUSTED|quota exceeded|โควตา/i.test(message);
  if(quotaExceeded)return json(503,{ok:false,code:'BRIDGE_QUOTA_EXHAUSTED',error:'บริการเชื่อมบัญชี F-Zone ใช้โควตาครบชั่วคราว'});
  return json(e.status||400,{ok:false,code:e.code||undefined,error:e.message||String(e)});
}
module.exports={admin:getAdmin,db,json,preflight,body,cleanName,cleanPin,safeEqual,sign,verify,secret,sessionSecret,gameSecret,gameSessionSecret,gameEventSecret,randomId,loadIdentity,err};
