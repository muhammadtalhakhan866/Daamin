'use strict';
const crypto = require('crypto');
const { MAX_AGE, configured, sign, cookieHeader, send, sameSiteWrite } = require('./_lib');

/* Best-effort throttle. Serverless instances do not share memory, so this slows a single
   visitor down rather than guaranteeing a hard limit; the fixed delay on every miss does the rest. */
const misses = new Map();
const WINDOW = 15 * 60 * 1000;
const LIMIT = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function login(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!sameSiteWrite(req)) return send(res, 403, { error: 'Request not allowed.' });
  if (!configured()) {
    return send(res, 503, { error: 'The admin password has not been set up yet. Add ADMIN_PASSWORD in the Vercel project settings.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = (misses.get(ip) || []).filter((t) => now - t < WINDOW);
  if (entry.length >= LIMIT) return send(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });

  const given = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  /* Hash both sides first so the comparison is constant-time whatever the lengths. */
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    entry.push(now);
    misses.set(ip, entry);
    await sleep(800);
    return send(res, 401, { error: 'Wrong password.' });
  }

  misses.delete(ip);
  const token = sign({ exp: Math.floor(Date.now() / 1000) + MAX_AGE });
  return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(token, MAX_AGE, req), 'Cache-Control': 'no-store' });
};
