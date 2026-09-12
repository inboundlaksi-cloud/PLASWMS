'use strict';
const crypto = require('crypto');
const L = require('./_bridge-lib');

function sameUser(a, b) {
  const clean = (value) => String(value || '').replace(/^(Admin|User|Supervisor):\s*/i, '').trim().toLowerCase();
  return clean(a) && clean(a) === clean(b);
}

exports.handler = async (event) => {
  const preflight = L.preflight(event); if (preflight) return preflight;
  if (event.httpMethod !== 'POST') return L.json(405, { ok: false, error: 'Method not allowed' });
  try {
    const input = L.body(event);
    const session = L.verify(input.session, L.gameSessionSecret());
    if (session.typ !== 'plas-game-session' || session.aud !== 'plas-wms' || !session.employeeId) throw new Error('PLAS Game Session ไม่ถูกต้อง');
    const eventId = String(input.eventId || '').trim();
    if (!eventId || eventId.length > 200) throw new Error('Event ID ไม่ถูกต้อง');
    const snapshot = await L.db().collection('academyEvents').doc(eventId).get();
    if (!snapshot.exists) throw Object.assign(new Error('ไม่พบเหตุการณ์งานใน Academy'), { status: 404 });
    const work = snapshot.data() || {};
    if (!sameUser(work.displayName, session.displayName) && !sameUser(work.displayName, session.employeeId)) {
      throw Object.assign(new Error('เหตุการณ์งานนี้ไม่ใช่ของบัญชีปัจจุบัน'), { status: 403 });
    }
    const payload = JSON.stringify({
      eventId: work.eventId || eventId,
      employeeId: session.employeeId,
      displayName: session.displayName,
      plasRole: session.plasRole,
      category: work.category,
      timestamp: work.timestamp || work.createdAt || Date.now(),
      reference: work.reference || '',
    });
    const signature = crypto.createHmac('sha256', L.gameEventSecret()).update(payload).digest('hex');
    const base = String(process.env.GAME_EVENT_INGEST_URL || process.env.GAME_PUBLIC_URL || 'https://borneo-plas-quest.netlify.app/').replace(/\/$/, '');
    const url = /\/\.netlify\/functions\/ingest-work-event$/.test(base) ? base : base + '/.netlify/functions/ingest-work-event';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PLAS-Game-Signature': signature },
      body: payload,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'ส่งเหตุการณ์งานไปเกมไม่สำเร็จ'), { status: 502 });
    return L.json(200, { ok: true, diceGranted: Number(result.diceGranted || 0) });
  } catch (error) { return L.err(error); }
};
