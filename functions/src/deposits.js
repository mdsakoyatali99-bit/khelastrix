'use strict';
// Automatic payment verification: SMS reader phones -> ingestSms (HTTPS, key-authenticated) -> wallet credit.
const { onCall, onRequest } = require('firebase-functions/v2/https');
const { db, HttpsError, REGION, ENFORCE_APPCHECK, requireAuth, rateLimit, sha256, now, money, mutateWallet, logTx, str } = require('./util');

const METHODS = ['bkash', 'nagad', 'rocket'];
const TRX_RE = /^[A-Za-z0-9]{6,20}$/;
const CLAIM_TTL = 24 * 3600e3;

/** Conservative fallback parser for raw SMS text (reader apps should send structured fields when possible). */
function parseSms(raw, address) {
  const text = String(raw || '');
  if (!/received|cash\s?in|deposit/i.test(text) || /cash\s?out|sent\s+to|payment\s+to/i.test(text)) return null;
  const amount = (text.match(/(?:Tk\.?|BDT|৳)\s?([\d,]+(?:\.\d{1,2})?)/i) || [])[1];
  const trx = (text.match(/(?:Trx\s?ID|Txn\s?ID|TxnId|Transaction\s?ID)[:\s]*([A-Za-z0-9]{6,20})/i) || [])[1];
  const sender = (text.match(/(?:from|sender)[:\s]*(?:A\/C[:\s]*)?(01\d{9})/i) || [])[1];
  const a = String(address || text).toLowerCase();
  const method = a.includes('bkash') ? 'bkash' : a.includes('nagad') ? 'nagad' : (a.includes('rocket') || a.includes('16216')) ? 'rocket' : null;
  if (!amount || !trx || !method) return null;
  return { amount: Number(amount.replace(/,/g, '')), trxId: trx.toUpperCase(), sender: sender || '', method };
}

/** Claim an inbox SMS for a user and credit the wallet. Returns credited amount or null if SMS not here yet. */
async function settleTrx(trxId, uid, method) {
  const smsRef = db.ref(`sms_inbox/${trxId}`);
  const cfg = (await db.ref('config/private/deposit').get()).val() || {};
  if (cfg.requireSenderMatch) {
    const phone = (await db.ref(`users/${uid}/phone`).get()).val();
    const sms = (await smsRef.get()).val();
    if (sms && (!phone || phone !== sms.sender)) throw new HttpsError('permission-denied', 'Sender number does not match your verified phone.');
  }
  const res = await smsRef.transaction((s) => {
    if (s === null) return null;
    if (s.used) return;
    if (method && s.method !== method) return;
    return { ...s, used: true, usedBy: uid, usedAt: now() };
  });
  if (!res.snapshot.exists()) return null; // not arrived yet
  if (!res.committed) {
    const s = (await smsRef.get()).val() || {};
    throw new HttpsError('already-exists', s.used ? 'This TrxID was already used.' : 'Payment method does not match this TrxID.');
  }
  const amount = money(res.snapshot.val().amount);
  try {
    await mutateWallet(uid, (d, w) => ({ deposit: d + amount, winning: w }));
  } catch (e) {
    await smsRef.update({ used: false, usedBy: null, usedAt: null }); // roll back claim
    throw e;
  }
  await logTx(uid, { type: 'Deposit', wallet: 'deposit', amount, method: res.snapshot.val().method, trxId });
  await db.ref(`deposit_claims/${uid}/${trxId}`).set({ status: 'success', amount, method: res.snapshot.val().method, ts: now() });
  await db.ref(`claims_index/${trxId}`).remove();
  return amount;
}

exports.claimDeposit = onCall({ region: REGION, enforceAppCheck: ENFORCE_APPCHECK }, async (req) => {
  const uid = requireAuth(req);
  await rateLimit(`claim_${uid}`, 8, 60);
  const trxId = str(req.data && req.data.trxId, { min: 6, max: 20, re: TRX_RE, name: 'TrxID' }).toUpperCase();
  const method = str(req.data && req.data.method, { name: 'Method' }).toLowerCase();
  if (!METHODS.includes(method)) throw new HttpsError('invalid-argument', 'Unknown payment method.');

  const amount = await settleTrx(trxId, uid, method);
  if (amount !== null) return { status: 'success', amount };

  // SMS has not arrived yet: register a pending claim; ingestSms will settle it the moment it lands.
  const idx = await db.ref(`claims_index/${trxId}`).transaction((c) => (c ? undefined : { uid, method, ts: now() }));
  if (!idx.committed && idx.snapshot.val() && idx.snapshot.val().uid !== uid) throw new HttpsError('already-exists', 'This TrxID is already being verified.');
  await db.ref(`deposit_claims/${uid}/${trxId}`).set({ status: 'pending', method, ts: now() });
  return { status: 'pending' };
});

exports.ingestSms = onRequest({ region: REGION, cors: false, maxInstances: 20 }, async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const key = String(req.get('x-reader-key') || '');
    if (!/^KX-[A-Z2-9-]{20,40}$/.test(key)) return res.status(401).json({ error: 'Invalid key' });
    const keyId = sha256(key);
    const readerRef = db.ref(`readerKeys/${keyId}`);
    const reader = (await readerRef.get()).val();
    if (!reader || reader.active !== true) return res.status(403).json({ error: 'Key revoked or disabled' });
    await rateLimit(`ingest_${keyId}`, 120, 60);

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    let sms = null;
    if (body.trxId && body.amount && body.method) {
      sms = { trxId: String(body.trxId).toUpperCase(), amount: Number(body.amount), method: String(body.method).toLowerCase(), sender: String(body.sender || '').replace(/\D/g, '').slice(0, 15) };
    } else if (body.raw) {
      sms = parseSms(String(body.raw).slice(0, 600), body.address);
    }
    if (!sms || !TRX_RE.test(sms.trxId) || !METHODS.includes(sms.method) || !(sms.amount > 0 && sms.amount <= 200000)) {
      return res.status(422).json({ error: 'Unrecognised or non-deposit SMS' });
    }
    if (Array.isArray(reader.methods) && reader.methods.length && !reader.methods.includes(sms.method)) {
      return res.status(403).json({ error: 'This key is not allowed for ' + sms.method });
    }
    sms.amount = money(sms.amount);

    const created = await db.ref(`sms_inbox/${sms.trxId}`).transaction((cur) =>
      cur ? undefined : { ...sms, used: false, readerId: keyId, readerName: reader.name || '', receivedAt: now() });
    await readerRef.update({ lastSeen: now() });
    if (!created.committed) return res.status(200).json({ ok: true, duplicate: true });

    // Auto-settle a pending claim, if any.
    const claim = (await db.ref(`claims_index/${sms.trxId}`).get()).val();
    let settled = false;
    if (claim && now() - claim.ts < CLAIM_TTL) {
      try { settled = (await settleTrx(sms.trxId, claim.uid, claim.method)) !== null; } catch (e) { console.warn('auto-settle failed', sms.trxId, e.message); }
    }
    return res.status(200).json({ ok: true, settled });
  } catch (e) {
    const code = e instanceof HttpsError && e.code === 'resource-exhausted' ? 429 : 500;
    if (code === 500) console.error('ingestSms', e);
    return res.status(code).json({ error: code === 429 ? 'Rate limited' : 'Server error' });
  }
});
