'use strict';
/* Customer review submissions.

   Submissions (which include a WhatsApp number) live ONLY in the private store, reachable with
   REVIEWS_READ_WRITE_TOKEN. What the public site shows is a separate, number-free list in the public
   store (content/reviews.json), rebuilt from the approved submissions every time one changes. */
const crypto = require('crypto');
const { put, get, list, del } = require('@vercel/blob');

const SERVICES = [
  'Real Estate', 'Construction', 'Renovation', 'Property Development',
  'Property Investment Guidance', 'Property Buying & Selling', 'Project Sales & Marketing', 'Other'
];
const STATUSES = ['pending', 'approved', 'rejected'];
const PUBLISHED = 'content/reviews.json';

const privateToken = () => process.env.REVIEWS_READ_WRITE_TOKEN;
const ready = () => !!privateToken();

class Invalid extends Error {}

function clean(s, max) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/* The visible parts of a review. The admin may use shorter text than a customer is allowed to. */
function cleanVisible(input, strict) {
  const name = clean(input.name, 60);
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'\-]{1,59}$/u.test(name)) throw new Invalid('Please enter your name (letters only, at least 2).');
  const service = SERVICES.includes(input.service) ? input.service : 'Other';
  const stars = Math.round(Number(input.stars) * 2) / 2;
  if (!(stars >= 0.5 && stars <= 5)) throw new Invalid('Please choose a star rating.');
  const text = clean(input.text, 600);
  if (text.length < (strict ? 20 : 1)) throw new Invalid(strict ? 'Please write at least a sentence or two (20 characters).' : 'The review cannot be empty.');
  if (/https?:\/\/|www\./i.test(text)) throw new Invalid('Please leave web links out of your review.');
  return { name, service, stars, text };
}

/* WhatsApp number: keep digits, treat a leading 0 as Pakistan (92), require a plausible length. */
function cleanPhone(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  let n = digits.startsWith('00') ? digits.slice(2) : digits;
  if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
  if (n.length < 10 || n.length > 15) throw new Invalid('Please enter a valid WhatsApp number, for example 0300 1234567.');
  return n;
}

function cleanSubmission(input) {
  if (!input || typeof input !== 'object') throw new Invalid('Invalid request.');
  if (input.consent !== true) throw new Invalid('Please tick the box to agree before sending.');
  return Object.assign(cleanVisible(input, true), { phone: cleanPhone(input.phone) });
}

function newId() { return Date.now() + '-' + crypto.randomBytes(6).toString('hex'); }
const ID = /^\d{13}-[a-f0-9]{12}$/;

async function readPrivate(pathname) {
  const res = await get(pathname, { access: 'private', token: privateToken(), useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

async function saveSubmission(sub) {
  await put('submissions/' + sub.id + '.json', JSON.stringify(sub), {
    access: 'private', token: privateToken(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
  });
}

async function loadSubmission(id) {
  if (!ID.test(id)) return null;
  try { return await readPrivate('submissions/' + id + '.json'); } catch (e) { return null; }
}

async function removeSubmission(id) {
  await del('submissions/' + id + '.json', { token: privateToken() });
}

async function allSubmissions() {
  const paths = [];
  let cursor;
  do {
    const page = await list({ prefix: 'submissions/', limit: 1000, cursor, token: privateToken() });
    page.blobs.forEach((b) => paths.push(b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const out = [];
  for (let i = 0; i < paths.length; i += 10) {
    const batch = await Promise.all(paths.slice(i, i + 10).map((p) => readPrivate(p).catch(() => null)));
    batch.forEach((s) => { if (s && s.id) out.push(s); });
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/* Rebuild the public list from what is approved. Only name, service, rating and text go public. */
async function publish() {
  const subs = await allSubmissions();
  const reviews = subs
    .filter((s) => s.status === 'approved')
    .sort((a, b) => String(a.approvedAt || a.createdAt).localeCompare(String(b.approvedAt || b.createdAt)))
    .map((s) => ({ name: s.name, service: s.service, text: s.text, stars: s.stars }));
  await put(PUBLISHED, JSON.stringify({ reviews }), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60
  });
  return reviews;
}

/* Per-visitor limit kept in the private store, so it holds across serverless instances. The visitor is
   only ever a hash, and a counter is per hour. Returns true when the visitor is over the limit. */
async function overLimit(ip, limit) {
  const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
  const key = 'rl/' + crypto.createHash('sha256').update(ip + '|daamin-reviews').digest('hex').slice(0, 24) + '-' + hour + '.json';
  let n = 0;
  try {
    const res = await get(key, { access: 'private', token: privateToken(), useCache: false });
    if (res && res.statusCode === 200) n = Number(JSON.parse(await new Response(res.stream).text()).n) || 0;
  } catch (e) { n = 0; }
  if (n >= limit) return true;
  await put(key, JSON.stringify({ n: n + 1 }), { access: 'private', token: privateToken(), addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  return false;
}

/* Counters older than two days are of no use; clear them out whenever the admin loads the list. */
async function pruneLimits() {
  try {
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 13).replace(/[-T]/g, '');
    const page = await list({ prefix: 'rl/', limit: 1000, token: privateToken() });
    const stale = page.blobs.filter((b) => (b.pathname.match(/-(\d{10})\.json$/) || [])[1] < cutoff).map((b) => b.pathname);
    if (stale.length) await del(stale, { token: privateToken() });
  } catch (e) { /* housekeeping only */ }
}

async function readPublished() {
  const { blobs } = await list({ prefix: PUBLISHED, limit: 5 });
  const found = blobs.find((b) => b.pathname === PUBLISHED);
  if (!found) return { reviews: [] };
  const res = await fetch(found.url + '?v=' + Math.floor(Date.now() / 5000), { cache: 'no-store' });
  return res.ok ? res.json() : { reviews: [] };
}

module.exports = {
  SERVICES, STATUSES, Invalid, ready, cleanSubmission, cleanVisible, newId, ID,
  loadSubmission, saveSubmission, removeSubmission, allSubmissions, publish, readPublished, overLimit, pruneLimits
};
