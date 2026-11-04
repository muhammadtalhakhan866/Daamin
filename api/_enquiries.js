'use strict';
/* Website enquiries (contact form and chatbot hand-overs).

   Each one is a small file in the PRIVATE store (REVIEWS_READ_WRITE_TOKEN), because it can hold a name
   and phone number. Only the logged-in admin can read them. They are logged when the visitor presses
   the button that opens WhatsApp, so the team can see who may be waiting for a reply. */
const { put, get, list, del } = require('@vercel/blob');
const R = require('./_reviews');

const STATUSES = ['pending', 'answered'];
const ID = R.ID;
const token = () => process.env.REVIEWS_READ_WRITE_TOKEN;

function clean(s, max) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/* Digits only; a leading 0 is Pakistan (92). Empty when nothing usable was given. */
function phoneOf(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  let n = digits.startsWith('00') ? digits.slice(2) : digits;
  if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
  return n.length >= 10 && n.length <= 15 ? n : '';
}

function cleanEnquiry(body) {
  if (!body || typeof body !== 'object') throw new R.Invalid('Invalid request.');
  const source = body.source === 'chatbot' ? 'chatbot' : 'form';
  const out = {
    source,
    ref: /^DQ-[A-Z0-9]{4}$/.test(body.ref) ? body.ref : '',
    name: clean(body.name, 60),
    phone: phoneOf(body.phone),
    email: clean(body.email, 120),
    interest: clean(body.interest, 80),
    project: clean(body.project, 80),
    message: clean(body.message, 1000),
    about: clean(body.about, 120),
    details: []
  };
  if (Array.isArray(body.details)) {
    body.details.slice(0, 10).forEach((d) => {
      if (Array.isArray(d)) { const k = clean(d[0], 40), v = clean(d[1], 200); if (k && v) out.details.push([k, v]); }
    });
  }
  if (source === 'form') {
    if (out.name.length < 2) throw new R.Invalid('Please enter your name.');
    if (!out.phone) throw new R.Invalid('Please enter a valid phone number.');
    if (out.message.length < 2) throw new R.Invalid('Please write a short message.');
  } else if (!out.about && !out.details.length && !out.message) {
    throw new R.Invalid('Nothing to record.');
  }
  return out;
}

async function readOne(pathname) {
  const res = await get(pathname, { access: 'private', token: token(), useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

const save = (e) => put('enquiries/' + e.id + '.json', JSON.stringify(e), {
  access: 'private', token: token(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
});

async function load(id) {
  if (!ID.test(id)) return null;
  try { return await readOne('enquiries/' + id + '.json'); } catch (e) { return null; }
}

const remove = (id) => del('enquiries/' + id + '.json', { token: token() });

async function all() {
  const paths = [];
  let cursor;
  do {
    const page = await list({ prefix: 'enquiries/', limit: 1000, cursor, token: token() });
    page.blobs.forEach((b) => paths.push(b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const out = [];
  for (let i = 0; i < paths.length; i += 10) {
    const batch = await Promise.all(paths.slice(i, i + 10).map((p) => readOne(p).catch(() => null)));
    batch.forEach((e) => { if (e && e.id) out.push(e); });
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { STATUSES, cleanEnquiry, save, load, remove, all };
