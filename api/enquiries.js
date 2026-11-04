'use strict';
const { send } = require('./_lib');
const R = require('./_reviews');
const E = require('./_enquiries');

const LIMIT = 12; /* enquiries per visitor per hour, counted in the private store */

/* Public: the website records an enquiry at the moment the visitor opens WhatsApp with it. */
module.exports = async function enquiries(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!/^application\/json/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Invalid request.' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Request not allowed.' }); } catch (e) { return send(res, 403, { error: 'Request not allowed.' }); } }
  if (!R.ready()) return send(res, 503, { error: 'Not recorded.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.website) return send(res, 200, { ok: true }); /* hidden field: a bot. Pretend it worked. */

  let clean;
  try { clean = E.cleanEnquiry(body); } catch (e) {
    if (e instanceof R.Invalid) return send(res, 400, { error: e.message });
    throw e;
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  try { if (await R.overLimit(ip, LIMIT, 'enquiries')) return send(res, 429, { error: 'Too many enquiries. Please try again later.' }); } catch (e) { /* accept rather than lose a real one */ }

  try {
    await E.save(Object.assign({ id: R.newId(), createdAt: new Date().toISOString(), status: 'pending' }, clean));
  } catch (e) {
    return send(res, 500, { error: 'Not recorded.' });
  }
  return send(res, 200, { ok: true });
};
