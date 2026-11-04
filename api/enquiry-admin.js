'use strict';
const { isAdmin, send, sameSiteWrite } = require('./_lib');
const R = require('./_reviews');
const E = require('./_enquiries');

const ACTIONS = ['answered', 'pending', 'delete'];

/* For the logged-in admin only: list every enquiry, mark it answered or pending, or delete it. */
module.exports = async function enquiryAdmin(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again.' });
  if (!R.ready()) return send(res, 503, { error: 'The private storage is not connected.' });

  if (req.method === 'GET') {
    try { return send(res, 200, { enquiries: await E.all() }, { 'Cache-Control': 'no-store' }); }
    catch (e) { return send(res, 500, { error: 'Could not load the enquiries. ' + (e && e.message ? e.message : '') }); }
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });
  if (!sameSiteWrite(req)) return send(res, 403, { error: 'Request not allowed.' });
  const body = req.body || {};
  if (!ACTIONS.includes(body.action) || typeof body.id !== 'string') return send(res, 400, { error: 'Invalid request.' });
  const item = await E.load(body.id);
  if (!item) return send(res, 404, { error: 'That enquiry no longer exists.' });

  try {
    if (body.action === 'delete') { await E.remove(item.id); return send(res, 200, { deleted: true }, { 'Cache-Control': 'no-store' }); }
    item.status = body.action;
    if (body.action === 'answered') item.answeredAt = new Date().toISOString(); else delete item.answeredAt;
    await E.save(item);
    return send(res, 200, { enquiry: item }, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return send(res, 500, { error: 'Could not complete that. ' + (e && e.message ? e.message : '') });
  }
};
