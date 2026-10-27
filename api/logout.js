'use strict';
const { cookieHeader, send, sameSiteWrite } = require('./_lib');

module.exports = function logout(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!sameSiteWrite(req)) return send(res, 403, { error: 'Request not allowed.' });
  return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0, req), 'Cache-Control': 'no-store' });
};
