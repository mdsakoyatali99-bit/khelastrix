'use strict';
const v1 = require('firebase-functions/v1');
const { admin, db, REGION, now } = require('./src/util');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: REGION, maxInstances: 20 });

// New account -> profile with zero balances (clients can never write balances themselves).
exports.onUserCreate = v1.region(REGION).auth.user().onCreate(async (user) => {
  const base = (user.displayName || (user.email || 'player').split('@')[0]).replace(/[^A-Za-z0-9_ ]/g, '').slice(0, 20);
  await db.ref(`users/${user.uid}`).transaction((c) => c || {
    username: base.length >= 3 ? base : `player${user.uid.slice(0, 5)}`,
    email: user.email || '', deposit: 0, winning: 0, phoneVerified: false, createdAt: now(),
  });
});

Object.assign(exports,
  require('./src/adminAuth'),
  require('./src/deposits'),
  require('./src/keys'),
  require('./src/wallet'),
  require('./src/tournaments'),
  require('./src/games'),
  require('./src/otp'),
  require('./src/admin'));
// internal helpers must not be deployed as functions
delete exports.verifyScrypt; delete exports.assertNotBanned; delete exports.settleCore;
