'use strict';
const { onCall } = require('firebase-functions/v2/https');
const { db, REGION, ENFORCE_APPCHECK, requireAdmin, now, audit, str } = require('./util');

const opts = { region: REGION, enforceAppCheck: ENFORCE_APPCHECK };

exports.adminSendNotification = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const title = str(req.data && req.data.title, { min: 2, max: 80, name: 'Title' });
  const body = str(req.data.body, { min: 2, max: 400, name: 'Message' });
  await db.ref('notifications').push({ title, body, ts: now() });
  await audit(adminUid, 'send_notification', null, { title });
  return { ok: true };
});

exports.adminSaveConfig = onCall(opts, async (req) => {
  const adminUid = await requireAdmin(req);
  const d = req.data || {};
  const num = (v, def) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : def);
  const url = (v) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
  const cfg = {
    notice: str(String(d.notice || ''), { max: 200, name: 'Notice' }),
    minWithdraw: num(d.minWithdraw, 100),
    minDeposit: num(d.minDeposit, 10),
    bkash: String(d.bkash || '').replace(/\D/g, '').slice(0, 11),
    nagad: String(d.nagad || '').replace(/\D/g, '').slice(0, 11),
    rocket: String(d.rocket || '').replace(/\D/g, '').slice(0, 12),
    support: url(d.support),
    gameUrls: { ludo: url(d.ludoUrl), carrom: url(d.carromUrl) },
  };
  await db.ref('config/public').update(cfg);
  await db.ref('config/private/deposit').update({ requireSenderMatch: d.requireSenderMatch === true });
  await audit(adminUid, 'save_config');
  return { ok: true };
});
