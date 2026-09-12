'use strict';
const L = require('./_bridge-lib');

exports.handler = async (event) => {
  const preflight = L.preflight(event); if (preflight) return preflight;
  if (event.httpMethod !== 'POST') return L.json(405, { ok: false, error: 'Method not allowed' });
  try {
    const session = L.verify(L.body(event).session, L.gameSessionSecret());
    if (session.typ !== 'plas-game-session' || session.aud !== 'plas-wms' || !session.employeeId) throw new Error('PLAS Game Session ไม่ถูกต้อง');
    const identity = await L.loadIdentity(session.employeeId);
    if (!identity.roles.length) throw Object.assign(new Error('ไม่พบบัญชีใน PLAS WMS'), { status: 403 });
    const role = identity.roles.includes(session.plasRole) ? session.plasRole : identity.roles[0];
    const now = Date.now();
    const ticket = {
      typ: 'plas-game-launch', aud: 'plas-quest', employeeId: session.employeeId,
      displayName: identity.displayName || session.displayName || session.employeeId,
      plasRole: role, iat: now, exp: now + 90 * 1000, jti: L.randomId(),
    };
    return L.json(200, {
      ok: true,
      ticket: L.sign(ticket, L.gameSecret()),
      expiresAt: ticket.exp,
      gameUrl: process.env.GAME_PUBLIC_URL || 'https://borneo-plas-quest.netlify.app/',
    });
  } catch (error) { return L.err(error); }
};
