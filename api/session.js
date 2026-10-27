'use strict';
const { configured, isAdmin, send, MAX_PHOTOS } = require('./_lib');

module.exports = function session(req, res) {
  return send(res, 200, { admin: isAdmin(req), configured: configured(), maxPhotos: MAX_PHOTOS }, { 'Cache-Control': 'no-store' });
};
