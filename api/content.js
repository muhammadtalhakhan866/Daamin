'use strict';
const { list, put, del } = require('@vercel/blob');
const { isAdmin, send, sameSiteWrite, cleanContent, blobUrlsIn } = require('./_lib');

const PATH = 'content/site.json';

async function readStored() {
  const { blobs } = await list({ prefix: PATH, limit: 5 });
  const found = blobs.find((b) => b.pathname === PATH);
  if (!found) return {};
  /* The stored file is cached at the edge for a minute. The listing's own timestamp can lag a save,
     so ask with a marker that rolls every 5 seconds instead; that bounds how stale a read can be. */
  const res = await fetch(found.url + '?v=' + Math.floor(Date.now() / 5000), { cache: 'no-store' });
  return res.ok ? res.json() : {};
}

module.exports = async function content(req, res) {
  if (req.method === 'GET') {
    try {
      const data = await readStored();
      const cache = isAdmin(req) ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30';
      return send(res, 200, data, { 'Cache-Control': cache });
    } catch (e) {
      /* Storage missing or unreachable: the site simply shows its built-in pictures and videos. */
      return send(res, 200, {}, { 'Cache-Control': 'public, s-maxage=5' });
    }
  }

  if (req.method === 'PUT') {
    if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again.' });
    if (!sameSiteWrite(req)) return send(res, 403, { error: 'Request not allowed.' });
    let next;
    try { next = cleanContent(req.body); } catch (e) { return send(res, 400, { error: e.message }); }
    try {
      let previous = {};
      try { previous = await readStored(); } catch (e) { previous = {}; }
      await put(PATH, JSON.stringify(next), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60
      });
      /* Free the storage taken by pictures and videos that are no longer used anywhere. */
      const keep = blobUrlsIn(next);
      const drop = [...blobUrlsIn(previous)].filter((u) => !keep.has(u));
      if (drop.length) { try { await del(drop); } catch (e) { /* leftovers are harmless */ } }
      return send(res, 200, next, { 'Cache-Control': 'no-store' });
    } catch (e) {
      return send(res, 500, { error: 'Could not save. ' + (e && e.message ? e.message : '') });
    }
  }

  return send(res, 405, { error: 'Use GET or PUT.' });
};
