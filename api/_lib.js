'use strict';
/* Shared helpers for the admin API: signed session cookie, request guards, content validation.
   Files starting with "_" inside /api are not exposed as routes. */
const crypto = require('crypto');

const COOKIE = 'daamin_admin';
const MAX_AGE = 60 * 60 * 12; /* a login lasts 12 hours */
const MAX_PHOTOS = 10;        /* pictures allowed per project album */

/* The session key is derived from the admin password itself, so there is one secret to manage
   and changing the password signs every existing session out. */
function sessionKey() {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? crypto.createHash('sha256').update('daamin-session:' + pw).digest() : null;
}

function configured() { return !!process.env.ADMIN_PASSWORD; }

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionKey()).update(body).digest('base64url');
  return body + '.' + sig;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function isAdmin(req) {
  const key = sessionKey();
  if (!key) return false;
  const token = readCookie(req, COOKIE);
  if (!token) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = crypto.createHmac('sha256', key).update(body).digest();
  let given;
  try { given = Buffer.from(sig, 'base64url'); } catch (e) { return false; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000;
  } catch (e) { return false; }
}

function cookieHeader(value, maxAge, req) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
  return COOKIE + '=' + value + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + (local ? '' : '; Secure');
}

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  for (const k of Object.keys(headers || {})) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(body));
}

/* Guard for anything that changes data: a custom header a cross-site form cannot send, and an
   Origin that matches this host. Together with SameSite=Strict this closes off cross-site requests. */
function sameSiteWrite(req) {
  if (req.headers['x-requested-with'] !== 'daamin-admin') return false;
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return false; } catch (e) { return false; }
  }
  return true;
}

const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>]+$/;
const SITE_PATH = /^(images|videos)\/[A-Za-z0-9._-]+$/;
function okAsset(v) {
  return typeof v === 'string' && v.length < 700 && (BLOB_URL.test(v) || SITE_PATH.test(v));
}
const isBlobUrl = (v) => typeof v === 'string' && BLOB_URL.test(v);

function text(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
}

/* Accepts only the shape the site understands, so nothing arbitrary is stored or later rendered. */
const CATEGORIES = ['development', 'construction', 'interior'];

function cleanPhotos(photos, id) {
  if (!Array.isArray(photos) || photos.length < 1) throw new Error('Project ' + id + ' needs at least one picture.');
  if (photos.length > MAX_PHOTOS) throw new Error('Project ' + id + ' has more than ' + MAX_PHOTOS + ' pictures.');
  return photos.map((p) => {
    if (!p || !okAsset(p.l) || !okAsset(p.s)) throw new Error('Bad picture address in ' + id + '.');
    const out = { l: p.l, s: p.s };
    /* Optional "added on" date, shown to visitors. Must be a real calendar day. */
    if (typeof p.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.d)) {
      const t = new Date(p.d + 'T00:00:00Z');
      if (!isNaN(t) && t.toISOString().slice(0, 10) === p.d) out.d = p.d;
      else throw new Error('Bad date on a picture in ' + id + '.');
    }
    return out;
  });
}

/* The wording shown for a project. Only the fields that are present are kept, so a built-in project can
   change just its description and leave everything else as the page has it. */
function cleanProjectText(src, id, out, requireName) {
  if (src.name !== undefined || requireName) {
    const name = text(src.name, 80);
    if (name.length < 2) throw new Error('Project ' + id + ' needs a name (at least 2 characters).');
    out.name = name;
  }
  if (src.location !== undefined) out.location = text(src.location, 80);
  if (src.status !== undefined) out.status = text(src.status, 30);
  if (src.description !== undefined) out.description = text(src.description, 500);
  if (src.category !== undefined) {
    if (!CATEGORIES.includes(src.category)) throw new Error('Project ' + id + ' has an unknown type.');
    out.category = src.category;
  }
}

function cleanContent(input) {
  if (!input || typeof input !== 'object') throw new Error('Content must be an object.');
  const out = { projects: {}, added: [], videos: {} };

  /* Built-in projects: new pictures and/or new wording. */
  const projects = input.projects && typeof input.projects === 'object' ? input.projects : {};
  const ids = Object.keys(projects);
  if (ids.length > 60) throw new Error('Too many projects.');
  for (const id of ids) {
    if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Error('Bad project id: ' + id);
    const src = projects[id] || {};
    const entry = {};
    if (src.photos !== undefined) entry.photos = cleanPhotos(src.photos, id);
    cleanProjectText(src, id, entry, false);
    if (Object.keys(entry).length) out.projects[id] = entry;
  }

  /* Projects the owner has added: complete records, with their own pictures. */
  const added = Array.isArray(input.added) ? input.added : [];
  if (added.length > 40) throw new Error('Too many added projects.');
  const seen = new Set();
  for (const p of added) {
    if (!p || typeof p.id !== 'string' || !/^new-[a-z0-9]{3,30}$/.test(p.id)) throw new Error('Bad id on an added project.');
    if (seen.has(p.id)) throw new Error('Duplicate project id.');
    seen.add(p.id);
    const entry = { id: p.id, location: '', status: '', description: '', category: 'development' };
    cleanProjectText(p, p.id, entry, true);
    entry.photos = cleanPhotos(p.photos, p.id);
    out.added.push(entry);
  }

  const videos = input.videos && typeof input.videos === 'object' ? input.videos : {};
  const slots = Object.keys(videos);
  if (slots.length > 12) throw new Error('Too many videos.');
  for (const slot of slots) {
    if (!/^[0-9]{1,2}$/.test(slot)) throw new Error('Bad video slot: ' + slot);
    const v = videos[slot] || {};
    if (!okAsset(v.src) || !okAsset(v.poster)) throw new Error('Bad video or thumbnail address in slot ' + slot + '.');
    out.videos[slot] = { src: v.src, poster: v.poster, title: text(v.title, 80), desc: text(v.desc, 160) };
  }
  return out;
}

function blobUrlsIn(content) {
  const urls = new Set();
  const add = (v) => { if (isBlobUrl(v)) urls.add(v); };
  for (const id of Object.keys((content && content.projects) || {})) {
    for (const p of content.projects[id].photos || []) { add(p.l); add(p.s); }
  }
  for (const proj of (content && content.added) || []) {
    for (const p of proj.photos || []) { add(p.l); add(p.s); }
  }
  for (const slot of Object.keys((content && content.videos) || {})) {
    add(content.videos[slot].src); add(content.videos[slot].poster);
  }
  return urls;
}

module.exports = { COOKIE, MAX_AGE, MAX_PHOTOS, configured, sign, isAdmin, cookieHeader, send, sameSiteWrite, cleanContent, blobUrlsIn, readCookie };
