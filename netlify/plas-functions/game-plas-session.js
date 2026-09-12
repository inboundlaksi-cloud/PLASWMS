'use strict';
const crypto = require('crypto');
const L = require('./_bridge-lib');

function attemptId(ip, user) {
  return crypto.createHash('sha256').update('game|' + String(ip) + '|' + user.toLowerCase()).digest('hex');
}

async function fail(ref) {
  const database = L.db();
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const old = snapshot.exists ? snapshot.data() : {};
    const now = Date.now();
    let count = Number(old.n || 0) + 1;
    let until = Number(old.until || 0);
    if (until > now) return;
    if (count >= 5) { count = 0; until = now + 5 * 60 * 1000; }
    transaction.set(ref, {
      n: count,
      until,
      updatedAt: now,
      cleanupAt: L.admin().firestore.Timestamp.fromMillis(Math.max(until, now) + 24 * 60 * 60 * 1000),
    }, { merge: true });
  });
}

function noPinEnabled() {
  return !/^(0|false|off|no)$/i.test(String(process.env.PLAS_GAME_ALLOW_NO_PIN == null ? 'true' : process.env.PLAS_GAME_ALLOW_NO_PIN).trim());
}

exports.handler = async (event) => {
  const preflight = L.preflight(event); if (preflight) return preflight;
  if (event.httpMethod !== 'POST') return L.json(405, { ok: false, error: 'Method not allowed' });
  try {
    const input = L.body(event);
    const username = L.cleanName(input.username);
    const requestedRole = String(input.role || '').toLowerCase();
    const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
    const identity = await L.loadIdentity(username);
    const storedPin = String(identity.profile.pin || '').replace(/\D/g, '');
    const hasStoredPin = identity.profile.pinEnabled === true && /^\d{4}$/.test(storedPin);
    if (!identity.roles.length) throw Object.assign(new Error('ไม่พบผู้ใช้ใน PLAS WMS'), { status: 403 });
    let authMode = 'pin';
    if (hasStoredPin) {
      const pin = L.cleanPin(input.pin);
      const ref = L.db().collection('game_bridge_attempts').doc(attemptId(ip, username));
      const attempt = await ref.get();
      if (attempt.exists && Number(attempt.data().until || 0) > Date.now()) throw Object.assign(new Error('ลอง PIN ผิดหลายครั้ง กรุณารอ 5 นาที'), { status: 429 });
      if (!L.safeEqual(pin, storedPin)) { await fail(ref); throw Object.assign(new Error('PIN ไม่ถูกต้อง'), { status: 401 }); }
      await ref.delete().catch(() => {});
    } else {
      if (input.noPin !== true) throw Object.assign(new Error('บัญชีนี้ยังไม่ได้ตั้ง PIN — กรุณาเข้าใหม่ผ่านหน้า PLAS WMS'), { status: 401 });
      if (!noPinEnabled()) throw Object.assign(new Error('ระบบปิดการเข้าเกมสำหรับบัญชีที่ไม่มี PIN'), { status: 403 });
      authMode = 'plas-no-pin';
    }
    const role = identity.roles.includes(requestedRole) ? requestedRole : identity.roles[0];
    const now = Date.now();
    const payload = {
      typ: 'plas-game-session', aud: 'plas-wms', employeeId: username,
      displayName: identity.displayName, plasRole: role, authMode,
      iat: now, exp: now + 8 * 60 * 60 * 1000, jti: L.randomId(),
    };
    return L.json(200, {
      ok: true,
      session: L.sign(payload, L.gameSessionSecret()),
      expiresAt: payload.exp,
      user: { employeeId: username, displayName: payload.displayName, role, authMode },
    });
  } catch (error) { return L.err(error); }
};
