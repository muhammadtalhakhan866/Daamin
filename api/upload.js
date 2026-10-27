'use strict';
const { handleUpload } = require('@vercel/blob/client');
const { isAdmin, send, sameSiteWrite } = require('./_lib');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/* Browsers upload straight to storage (a video can be far larger than a server request may be).
   This route only decides whether a given upload is allowed, and only for a logged-in admin. */
module.exports = async function upload(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
  if (!sameSiteWrite(req)) return send(res, 403, { error: 'Request not allowed.' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again.' });

  try {
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const video = /^videos\//.test(pathname);
        const image = /^projects\//.test(pathname) || /^thumbs\//.test(pathname);
        if (!video && !image) throw new Error('Uploads must go in projects/, thumbs/ or videos/.');
        if (!/^[A-Za-z0-9._\/-]{3,160}$/.test(pathname) || pathname.includes('..')) throw new Error('Bad file name.');
        return {
          allowedContentTypes: video ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: video ? 600 * 1024 * 1024 : 12 * 1024 * 1024,
          addRandomSuffix: true
        };
      }
    });
    return send(res, 200, result, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return send(res, 400, { error: e && e.message ? e.message : 'Upload not allowed.' });
  }
};
