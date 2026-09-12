'use strict';
const crypto = require('crypto');
const L = require('./_bridge-lib');

function safeId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9ก-๙_-]+/g, '_').slice(0, 180) || `id_${Date.now()}`;
}
function userKey(value) { return safeId(String(value || '').trim().replace(/^User:\s*/i, '').toLowerCase()); }
function signature(event) { return String(event.headers['x-plas-game-signature'] || event.headers['X-PLAS-Game-Signature'] || ''); }
function validSignature(raw, received) {
  const expected = crypto.createHmac('sha256', L.gameEventSecret()).update(raw).digest('hex');
  return L.safeEqual(expected, received);
}
function cleanRow(row) {
  const displayName = String(row && row.displayName || '').trim().slice(0, 100);
  if (!displayName) throw new Error('พบรายการที่ไม่มีชื่อพนักงาน');
  const points = Math.max(0, Math.min(100000, Math.floor(Number(row.points || 0))));
  return {
    uid: String(row.uid || '').slice(0, 128), employeeId: String(row.employeeId || '').slice(0, 80), displayName,
    rank: Math.max(1, Math.floor(Number(row.rank || 0))), gameScore: Math.max(0, Math.floor(Number(row.gameScore || 0))),
    tier: String(row.tier || 'Bronze').slice(0, 32), points,
    breakdown: row.breakdown && typeof row.breakdown === 'object' ? row.breakdown : {},
  };
}

exports.handler = async (event) => {
  const preflight = L.preflight(event); if (preflight) return preflight;
  if (event.httpMethod !== 'POST') return L.json(405, { ok: false, error: 'Method not allowed' });
  try {
    const raw = String(event.body || '');
    if (!validSignature(raw, signature(event))) { const error = new Error('ลายเซ็นสรุปคะแนนเกมไม่ถูกต้อง'); error.status = 401; throw error; }
    const input = L.body(event), settlementId = safeId(input.settlementId), seasonId = safeId(input.seasonId);
    const rows = Array.isArray(input.rows) ? input.rows.map(cleanRow) : [];
    if (!input.settlementId || !input.seasonId || !rows.length) throw new Error('ข้อมูลสรุปคะแนนไม่ครบ');
    if (rows.length > 250) throw new Error('สรุปคะแนนหนึ่งครั้งรองรับไม่เกิน 250 คน');
    const database = L.db(), settlementRef = database.collection('academyGameSettlements').doc(settlementId);
    const result = await database.runTransaction(async (tx) => {
      const settlementSnapshot = await tx.get(settlementRef);
      if (settlementSnapshot.exists && settlementSnapshot.data().status === 'applied') return { alreadyApplied: true, applied: Number(settlementSnapshot.data().applied || 0), totalPoints: Number(settlementSnapshot.data().totalPoints || 0) };
      const refs = rows.map((row) => ({
        row,
        eventRef: database.collection('academyEvents').doc(safeId(`game_${settlementId}_${row.uid || userKey(row.displayName)}`)),
        profileRef: database.collection('academyProfiles').doc(userKey(row.displayName)),
      }));
      const snapshots = await Promise.all(refs.flatMap((item) => [tx.get(item.eventRef), tx.get(item.profileRef)]));
      let applied = 0, totalPoints = 0;
      refs.forEach((item, index) => {
        const eventSnapshot = snapshots[index * 2], profileSnapshot = snapshots[index * 2 + 1];
        if (eventSnapshot.exists) return;
        const profile = profileSnapshot.exists ? profileSnapshot.data() : {};
        const timestamp = Number(input.createdAt || Date.now());
        tx.set(item.eventRef, {
          eventId: `game:${settlementId}:${item.row.uid || userKey(item.row.displayName)}`,
          category: 'game_season', group: 'game', label: `PLAS Quest · ${String(input.seasonTitle || seasonId).slice(0, 120)}`,
          reference: `อันดับ ${item.row.rank} · ${item.row.tier}`, displayName: item.row.displayName,
          userKey: userKey(item.row.displayName), exp: 0, points: item.row.points, multiplier: 1,
          timestamp, dayKey: new Date(timestamp).toISOString().slice(0, 10), weekKey: seasonId,
          seasonId, meta: { source: 'plas_quest', settlementId, gameScore: item.row.gameScore, rank: item.row.rank, tier: item.row.tier, breakdown: item.row.breakdown },
          createdAt: Date.now(), version: '5.13.0',
        });
        tx.set(item.profileRef, {
          userKey: userKey(item.row.displayName), displayName: item.row.displayName,
          lifetimeExp: Number(profile.lifetimeExp || 0), rewardPoints: Number(profile.rewardPoints || 0) + item.row.points,
          updatedAt: Date.now(), lastEventAt: timestamp,
        }, { merge: true });
        applied += 1; totalPoints += item.row.points;
      });
      tx.set(settlementRef, {
        settlementId, seasonId, seasonTitle: String(input.seasonTitle || seasonId).slice(0, 120), status: 'applied',
        applied, totalPoints, rowCount: rows.length, createdAt: Number(input.createdAt || Date.now()), receivedAt: Date.now(),
      }, { merge: true });
      return { alreadyApplied: false, applied, totalPoints };
    });
    return L.json(200, { ok: true, settlementId, seasonId, rowCount: rows.length, ...result });
  } catch (error) { return L.err(error); }
};
