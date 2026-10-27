'use strict';
const { isAdmin, send, sameSiteWrite } = require('./_lib');
const R = require('./_reviews');

const ACTIONS = ['save', 'approve', 'reject', 'pending', 'delete'];

/* Moderation, for the logged-in admin only: list every submission (with WhatsApp numbers), correct
   wording, then approve, reject, restore or delete. The public list is rebuilt whenever the set of
   approved reviews could have changed. */
module.exports = async function reviewAdmin(req, res) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again.' });
  if (!R.ready()) return send(res, 503, { error: 'The private review storage is not connected.' });

  if (req.method === 'GET') {
    try {
      R.pruneLimits(); /* housekeeping, not awaited */
      const submissions = await R.allSubmissions();
      return send(res, 200, { submissions, services: R.SERVICES }, { 'Cache-Control': 'no-store' });
    } catch (e) {
      return send(res, 500, { error: 'Could not load the reviews. ' + (e && e.message ? e.message : '') });
    }
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });
  if (!sameSiteWrite(req)) return send(res, 403, { error: 'Request not allowed.' });

  const body = req.body || {};
  if (!ACTIONS.includes(body.action) || typeof body.id !== 'string') return send(res, 400, { error: 'Invalid request.' });
  const sub = await R.loadSubmission(body.id);
  if (!sub) return send(res, 404, { error: 'That review no longer exists.' });
  const wasApproved = sub.status === 'approved';

  try {
    if (body.action === 'delete') {
      await R.removeSubmission(sub.id);
      if (wasApproved) await R.publish();
      return send(res, 200, { deleted: true }, { 'Cache-Control': 'no-store' });
    }

    /* Wording fixes: the admin may correct spelling and tidy the text; the customer's own words are
       kept in `original` so nothing is lost. */
    if (body.edits && typeof body.edits === 'object') {
      const next = R.cleanVisible(Object.assign({}, sub, body.edits), false);
      if (next.name !== sub.name || next.service !== sub.service || next.stars !== sub.stars || next.text !== sub.text) sub.editedAt = new Date().toISOString();
      Object.assign(sub, next);
    }
    if (body.action === 'approve') { sub.status = 'approved'; sub.approvedAt = new Date().toISOString(); }
    if (body.action === 'reject') sub.status = 'rejected';
    if (body.action === 'pending') sub.status = 'pending';

    await R.saveSubmission(sub);
    if (wasApproved || sub.status === 'approved') await R.publish();
    return send(res, 200, { submission: sub }, { 'Cache-Control': 'no-store' });
  } catch (e) {
    if (e instanceof R.Invalid) return send(res, 400, { error: e.message });
    return send(res, 500, { error: 'Could not complete that. ' + (e && e.message ? e.message : '') });
  }
};
