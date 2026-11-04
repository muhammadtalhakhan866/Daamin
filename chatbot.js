/* Daamin website assistant: answers common questions from faq-data.js in the browser, and hands over to
   a person on WhatsApp when it has no good answer. Nothing typed here is sent anywhere or stored. */
(function () {
  var F = window.DAAMIN_FAQ;
  if (!F || !F.items || document.getElementById('dbot')) return;

  /* ---------- matching ---------- */
  var STOP = {};
  ('a an the is are am was were be been to of in on at for from by with and or but if so as it its this that these those i me my we our you your ' +
   'do does did can could would should will shall may might have has had how what which whom why there here about into out up than then ' +
   'please tell us want need like get got know let just also any some very really much more kya hai hain ho hoga hogi ka ki ke ko mein me se aur ya ap aap hum ' +
   'main mujhe mera meri mere kar karna karen kare karo chahiye chahye tha thi the kaise kahan kab kon kaun kitna kitni na nahi nhi bhi to ye woh wo yeh').split(' ')
    .forEach(function (w) { STOP[w] = 1; });

  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(ed|es)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(text) {
    return String(text).toLowerCase().replace(/([a-z0-9])-([a-z0-9])/g, '$1$2').replace(/&/g, ' and ').replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter(function (w) { return w && !STOP[w]; }).map(stem);
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  var docs = F.items.map(function (it, idx) {
    var w = {}, add = function (list, weight) { list.forEach(function (t) { w[t] = Math.max(w[t] || 0, weight); }); };
    add(tokens(it[3] || ''), 1);
    add(tokens(it[1]), 2);
    var bi = {}, pairs = function (list) { for (var k = 0; k < list.length - 1; k++) bi[list[k] + ' ' + list[k + 1]] = 1; };
    pairs(tokens(it[1])); pairs(tokens(it[3] || ''));
    return { i: idx, cat: it[0], q: it[1], a: it[2], links: it[4] || [], w: w, bi: bi, norm: tokens(it[1]).join(' ') };
  });
  var df = {};
  docs.forEach(function (d) { Object.keys(d.w).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
  var vocab = Object.keys(df);
  var idf = function (t) { return Math.log(1 + docs.length / (df[t] || 1)); };

  /* Fix small typos by snapping to a known word (only for longer words). */
  function snap(t) {
    if (df[t] || t.length < 5) return t;
    var max = t.length >= 8 ? 2 : 1, best = null, bd = max + 1;
    vocab.forEach(function (v) { var d = lev(t, v, max); if (d < bd) { bd = d; best = v; } });
    return best && bd <= max ? best : t;
  }

  function rank(text) {
    var qt = tokens(text).map(snap);
    if (!qt.length) return { top: [], coverage: 0, unknown: 1 };
    var qset = {}; qt.forEach(function (t) { qset[t] = 1; });
    var uniq = Object.keys(qset);
    var total = uniq.reduce(function (s, t) { return s + (df[t] ? idf(t) : 1.2); }, 0);
    var unknown = uniq.filter(function (t) { return !df[t]; }).length / uniq.length;
    var qbi = []; for (var b = 0; b < qt.length - 1; b++) qbi.push(qt[b] + ' ' + qt[b + 1]);
    var scored = docs.map(function (d) {
      var score = 0, hit = 0;
      uniq.forEach(function (t) { if (d.w[t]) { score += idf(t) * d.w[t]; hit += idf(t); } });
      var qn = qt.join(' ');
      if (d.norm && (qn === d.norm)) score += 100;
      qbi.forEach(function (p) { if (d.bi[p]) score += 2.5; });
      return { d: d, score: score, coverage: total ? hit / total : 0 };
    }).filter(function (s) { return s.score > 0; }).sort(function (a, b) { return b.score - a.score; });
    return { top: scored.slice(0, 3), coverage: scored.length ? scored[0].coverage : 0, unknown: unknown };
  }

  var HANDOFF = /\b(agent|human|representative|real person|live (chat|person|support)|customer (care|service|support)|talk to (a |an )?(person|someone|somebody|team)|speak (to|with) (a |an )?(person|someone|somebody|team)|connect me|whatsapp me)\b/i;
  var YES = /^(y|yes|yeah|yep|yup|ok|okay|sure|please|haan|han|ji|ji haan|theek hai|connect|connect me|yes please)\b/i;
  var NO = /^(n|no|nope|nah|not now|nahi|nahin|no thanks|cancel)\b/i;

  /* ---------- interface ---------- */
  var css = '' +
    '#dbot,#dbot *{box-sizing:border-box}' +
    '#dbot{position:fixed;z-index:40;right:22px;bottom:90px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#172033}' +
    '@property --dbang{syntax:"<angle>";inherits:false;initial-value:0deg}' +
    '.dbot-launch{display:inline-flex;padding:2.5px;border:0;border-radius:999px;color:#fff;font:inherit;font-weight:750;font-size:.92rem;cursor:pointer;background:conic-gradient(from var(--dbang),#ee652d,#ffb27a 22%,#ff7a2f 46%,rgba(238,101,45,.12) 72%,#ee652d);animation:dbotRun 3.4s linear infinite;box-shadow:0 10px 30px rgba(18,25,66,.34),0 0 22px rgba(238,101,45,.22);transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s}' +
    '.dbot-launch .in{display:flex;align-items:center;gap:9px;height:50px;padding:0 20px 0 16px;border-radius:999px;background:#121942;transition:background .2s}' +
    '.dbot-launch:hover{transform:translateY(-2px) scale(1.03);box-shadow:0 14px 36px rgba(18,25,66,.4),0 0 30px rgba(238,101,45,.4)}.dbot-launch:hover .in{background:#1b2563}' +
    '.dbot-launch:focus-visible{outline:3px solid #fff;outline-offset:3px}' +
    '@keyframes dbotRun{to{--dbang:360deg}}' +
    '.dbot-launch svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.dbot-launch .dot{width:9px;height:9px;border-radius:50%;background:#ee652d;box-shadow:0 0 0 0 rgba(238,101,45,.6);animation:dbotPulse 2.4s infinite}' +
    '@keyframes dbotPulse{70%{box-shadow:0 0 0 10px rgba(238,101,45,0)}100%{box-shadow:0 0 0 0 rgba(238,101,45,0)}}' +
    '.dbot-panel{position:absolute;right:0;bottom:66px;width:min(390px,calc(100vw - 28px));height:min(590px,calc(100dvh - 170px));display:none;flex-direction:column;overflow:hidden;border-radius:22px;background:#fff;border:1px solid #e7e9ef;box-shadow:0 30px 90px rgba(10,15,44,.34);transform-origin:bottom right}' +
    '#dbot.open .dbot-panel{display:flex;animation:dbotIn .38s cubic-bezier(.22,1,.36,1)}' +
    '#dbot.closing .dbot-panel{display:flex;animation:dbotOut .2s ease forwards}' +
    '@keyframes dbotIn{from{opacity:0;transform:translateY(14px) scale(.9)}to{opacity:1;transform:none}}' +
    '@keyframes dbotOut{to{opacity:0;transform:translateY(10px) scale(.94)}}' +
    '.dbot-head{display:flex;align-items:center;gap:11px;padding:14px 16px;background:linear-gradient(135deg,#121942,#243175);color:#fff}' +
    '.dbot-head img{width:38px;height:38px;border-radius:12px;background:#fff;padding:4px;object-fit:contain}' +
    '.dbot-head b{display:block;font-size:.98rem;line-height:1.2}.dbot-head small{display:block;color:rgba(255,255,255,.7);font-size:.74rem}' +
    '.dbot-x{margin-left:auto;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;cursor:pointer;transition:background .2s}' +
    '.dbot-x:hover{background:#ee652d}.dbot-x svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round}' +
    '.dbot-log{flex:1;overflow-y:auto;padding:16px 14px 8px;background:#f6f7fa;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}' +
    '.dbot-msg{max-width:86%;padding:10px 13px;border-radius:16px;font-size:.9rem;line-height:1.5;animation:dbotMsg .3s ease both;overflow-wrap:anywhere;white-space:pre-line}' +
    '@keyframes dbotMsg{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '.dbot-msg.bot{align-self:flex-start;background:#fff;border:1px solid #e7e9ef;border-bottom-left-radius:5px}' +
    '.dbot-msg.me{align-self:flex-end;background:#ee652d;color:#fff;border-bottom-right-radius:5px}' +
    '.dbot-row{display:flex;flex-wrap:wrap;gap:7px;align-self:flex-start;max-width:100%;animation:dbotMsg .3s .08s ease both}' +
    '.dbot-chip,.dbot-link{font:inherit;font-size:.83rem;font-weight:650;padding:8px 13px;border-radius:999px;border:1px solid #d7dbe6;background:#fff;color:#121942;cursor:pointer;text-align:left;text-decoration:none;transition:background .2s,color .2s,border-color .2s,transform .2s}' +
    '.dbot-chip:hover,.dbot-link:hover{border-color:#ee652d;color:#ee652d;transform:translateY(-1px)}' +
    '.dbot-chip.q{border-radius:14px;line-height:1.35}' +
    '.dbot-chip.go,.dbot-link.go{background:#1eae63;border-color:#1eae63;color:#fff}.dbot-chip.go:hover,.dbot-link.go:hover{background:#17995a;border-color:#17995a;color:#fff}' +
    '.dbot-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#fff;border:1px solid #e7e9ef;border-radius:16px;border-bottom-left-radius:5px}' +
    '.dbot-typing i{width:6px;height:6px;border-radius:50%;background:#9aa3b8;animation:dbotDot 1s infinite}.dbot-typing i:nth-child(2){animation-delay:.15s}.dbot-typing i:nth-child(3){animation-delay:.3s}' +
    '@keyframes dbotDot{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-4px)}}' +
    '.dbot-form{display:flex;gap:8px;padding:10px 12px 12px;background:#fff;border-top:1px solid #e7e9ef}' +
    '.dbot-form input{flex:1;min-width:0;padding:11px 14px;border:1px solid #d7dbe6;border-radius:999px;font:inherit;font-size:.92rem;color:#172033;background:#fff}' +
    '.dbot-form input:focus{outline:2px solid #ee652d;outline-offset:1px;border-color:transparent}' +
    '.dbot-send{flex:none;display:grid;place-items:center;width:42px;height:42px;border:0;border-radius:50%;background:#ee652d;color:#fff;cursor:pointer;transition:background .2s,transform .2s}' +
    '.dbot-send:hover{background:#d95420;transform:scale(1.05)}.dbot-send svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
    '@media(max-width:560px){#dbot{right:14px;bottom:86px}.dbot-launch span.lbl{display:none}.dbot-launch .in{width:50px;padding:0;justify-content:center}.dbot-launch .dot{display:none}' +
    '.dbot-panel{position:fixed;right:10px;left:10px;bottom:10px;width:auto;height:min(640px,calc(100dvh - 20px))}}' +
    '@media(prefers-reduced-motion:reduce){#dbot *,.dbot-launch{animation:none!important;transition:none!important}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var root = el('div'); root.id = 'dbot';
  var launch = el('button', 'dbot-launch'); launch.type = 'button'; launch.setAttribute('aria-label', 'Open the Daamin assistant'); launch.setAttribute('aria-expanded', 'false');
  launch.innerHTML = '<span class="in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg><span class="lbl">Ask us</span><span class="dot" aria-hidden="true"></span></span>';
  var panel = el('div', 'dbot-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Daamin assistant');
  var head = el('div', 'dbot-head');
  var logo = el('img'); logo.src = 'images/daamin-mark.png'; logo.alt = '';
  var title = el('div'); title.append(el('b', '', 'Daamin Assistant'), el('small', '', 'Automated answers. A person is one tap away.'));
  var xbtn = el('button', 'dbot-x'); xbtn.type = 'button'; xbtn.setAttribute('aria-label', 'Close'); xbtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.append(logo, title, xbtn);
  var log = el('div', 'dbot-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
  var form = el('form', 'dbot-form');
  var input = el('input'); input.type = 'text'; input.maxLength = 200; input.placeholder = 'Type your question...'; input.setAttribute('aria-label', 'Your question'); input.autocomplete = 'off';
  var send = el('button', 'dbot-send'); send.type = 'submit'; send.setAttribute('aria-label', 'Send'); send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  form.append(input, send);
  panel.append(head, log, form);
  root.append(launch, panel);
  document.body.appendChild(root);

  var started = false, lastUnanswered = '', misses = 0, awaitingHandoff = false, lastQuestion = '', flow = null;
  var DEFAULT_HINT = input.placeholder;
  var onHome = /(^|\/)(index\.html)?$/.test(location.pathname);

  function scroll() { log.scrollTop = log.scrollHeight; }
  function say(text, who) { var m = el('div', 'dbot-msg ' + who, text); log.appendChild(m); scroll(); return m; }
  function row(items) {
    var r = el('div', 'dbot-row');
    items.forEach(function (it) { r.appendChild(it); });
    log.appendChild(r); scroll(); return r;
  }
  function chip(label, cls, fn) { var b = el('button', 'dbot-chip' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function href(url) { return onHome ? url.replace(/^index\.html(?=#)/, '') : url; }
  /* The WhatsApp button: when it is pressed, a copy of the enquiry is kept for the team (once per button). */
  function newRef() { return 'DQ-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X'); }
  function logEnquiry(record) {
    try {
      fetch('/api/enquiries', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }).catch(function () {});
    } catch (e) { /* the WhatsApp message still opens */ }
  }
  function linkBtn(label, url, go, onGo) {
    var a = el('a', 'dbot-link' + (go ? ' go' : ''), label); a.href = go ? url : href(url);
    if (go) {
      a.target = '_blank'; a.rel = 'noopener';
      var sent = false;
      a.addEventListener('click', function () { if (!sent && onGo) { sent = true; onGo(); } });
    }
    else a.addEventListener('click', function () { if (window.innerWidth < 760) closePanel(); });
    return a;
  }
  /* The assistant says one thing at a time: replies queue up so two never talk over each other. */
  var queue = [], talking = false;
  function enqueue(job) { queue.push(job); if (!talking) pump(); }
  function pump() {
    if (!queue.length) { talking = false; return; }
    talking = true;
    queue.shift()(function () { pump(); });
  }
  /* A short pause with typing dots, then the reply. */
  function reply(fn) {
    enqueue(function (done) {
      var t = el('div', 'dbot-typing'); t.append(el('i'), el('i'), el('i')); log.appendChild(t); scroll();
      setTimeout(function () { t.remove(); fn(); done(); }, 420);
    });
  }

  /* Long replies are sent the way a person would: a few short messages with a pause (and typing dots) before each. */
  function pieces(text) {
    if (text.indexOf('\n') >= 0) return [text];                       /* lists and summaries stay together */
    var safe = text.replace(/e\.g\./g, 'e~g~').replace(/i\.e\./g, 'i~e~');
    var sentences = safe.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [safe];
    var out = [], cur = '';
    sentences.forEach(function (s) {
      s = s.replace(/~/g, '.').trim();
      if (!s) return;
      if (cur && (cur + ' ' + s).length > 105 && out.length < 2) { out.push(cur); cur = s; }
      else cur = cur ? cur + ' ' + s : s;
    });
    if (cur) out.push(cur);
    return out;
  }
  function typing() { var t = el('div', 'dbot-typing'); t.append(el('i'), el('i'), el('i')); log.appendChild(t); scroll(); return t; }
  function speak(text, then) {
    var parts = pieces(text);
    enqueue(function (done) {
      (function next(i) {
        if (i >= parts.length) { if (then) then(); done(); return; }
        var t = typing();
        var wait = Math.min(1250, 380 + parts[i].length * 11) + (i === 0 ? 0 : 120);
        setTimeout(function () { t.remove(); say(parts[i], 'bot'); next(i + 1); }, wait);
      })(0);
    });
  }

  function topics() {
    row(F.categories.map(function (c) { return chip(c.label, '', function () { ask(c.label, true); showCategory(c.key); }); }));
  }
  function showCategory(key) {
    var qs = docs.filter(function (d) { return d.cat === key; });
    reply(function () {
      say('Here are common questions about ' + F.categories.filter(function (c) { return c.key === key; })[0].label.toLowerCase() + '. Tap one, or type your own.', 'bot');
      var make = function (d) { return chip(d.q, 'q', function () { ask(d.q); answer(d); }); };
      row(qs.slice(0, 6).map(make));
      if (qs.length > 6) {
        var more = chip('More questions', '', function () { more.remove(); row(qs.slice(6).map(make)); });
        row([more]);
      }
    });
  }
  function answer(d) {
    if (flow) endFlow();
    if (FLOW_AUTO[d.q]) { startFlow(FLOW_AUTO[d.q]); return; }
    showAnswer(d, FLOW_OFFER[d.q]);
  }
  function showAnswer(d, offer) {
    speak(d.a, function () {
      if (d.links.length) row(d.links.map(function (l) { return linkBtn(l[0], l[1]); }));
      var more = [];
      if (offer && FLOWS[offer]) more.push(chip(FLOWS[offer].offer, 'go', function () { say(FLOWS[offer].offer, 'me'); startFlow(offer); }));
      more.push(chip('Ask something else', '', function () { say('Ask something else', 'me'); reply(function () { say('Of course. Type your question, or pick a topic.', 'bot'); topics(); }); }));
      row(more);
    });
  }

  /* ---------- guided questions: collect a few details, then hand over to WhatsApp ---------- */
  var BUDGET = ['Under 50 lakh', '50 lakh to 1 crore', '1 to 2 crore', '2 crore or more', 'Not sure yet'];
  var hasDigit = function (v) { return /\d/.test(v); };
  var plain = function (v) { return v.replace(/[^a-z]/gi, '').length >= 2; };
  var FLOWS = {
    estimate: { offer: 'Get a cost estimate', about: 'a construction cost estimate', steps: [
      { key: 'Plot size', ask: 'What is the size of your plot in square feet? For example: 1800 sq ft. If you only know it in marla or square yards, that works too.', hint: 'e.g. 1800 sq ft', ok: hasDigit, err: 'Please include the size as a number, for example 1800 sq ft or 5 marla.' },
      { key: 'Location', ask: 'Where is the plot? Please tell me the area and city.', hint: 'e.g. Scheme 33, Karachi', ok: plain, err: 'Please tell me the area or city.' },
      { key: 'Budget range', ask: 'What budget range do you have in mind?', chips: BUDGET, hint: 'or type your own range', ok: function (v) { return v.length > 0; } }
    ] },
    buy: { offer: 'Find a property', about: 'buying a property', steps: [
      { key: 'Property type', ask: 'What kind of property are you looking for?', chips: ['House', 'Apartment / flat', 'Plot', 'Commercial'], hint: 'or type your own', ok: plain },
      { key: 'Preferred area', ask: 'Which area would you like to buy in?', hint: 'e.g. Scheme 33, Karachi', ok: plain, err: 'Please tell me the area or city.' },
      { key: 'Budget range', ask: 'What is your budget range?', chips: BUDGET, hint: 'or type your own range', ok: function (v) { return v.length > 0; } }
    ] },
    sell: { offer: 'Sell my property', about: 'selling a property', steps: [
      { key: 'Property type', ask: 'What kind of property would you like to sell?', chips: ['House', 'Apartment / flat', 'Plot', 'Commercial'], hint: 'or type your own', ok: plain },
      { key: 'Location', ask: 'Where is it located? Please tell me the area and city.', hint: 'e.g. Gulshan-e-Iqbal, Karachi', ok: plain, err: 'Please tell me the area or city.' },
      { key: 'Size', ask: 'What is its size (sq ft, marla or sq yards)? You can skip this.', optional: true, hint: 'e.g. 120 sq yards', ok: hasDigit, err: 'Please include the size as a number, or tap Skip.' },
      { key: 'Expected price', ask: 'Do you have an expected price in mind? You can skip this.', optional: true, hint: 'optional', ok: function (v) { return v.length > 0; } }
    ] },
    rent: { offer: 'Rent a property', about: 'renting or leasing a property', steps: [
      { key: 'Property type', ask: 'What would you like to rent, or rent out?', chips: ['House', 'Apartment / flat', 'Shop / office', 'Other'], hint: 'or type your own', ok: plain },
      { key: 'Area', ask: 'Which area is it in, or where are you looking?', hint: 'e.g. Scheme 33, Karachi', ok: plain, err: 'Please tell me the area or city.' },
      { key: 'Monthly rent range', ask: 'What monthly rent range do you have in mind?', chips: ['Under 50,000', '50,000 to 100,000', '100,000 to 200,000', 'Over 200,000', 'Not sure yet'], hint: 'or type your own range', ok: function (v) { return v.length > 0; } }
    ] },
    reno: { offer: 'Plan my renovation', about: 'a renovation or interior project', steps: [
      { key: 'What to renovate', ask: 'What would you like to renovate or fit out?', chips: ['Whole house', 'Kitchen', 'Bathrooms', 'Interiors and finishing', 'Other'], hint: 'or type your own', ok: plain },
      { key: 'Location', ask: 'Where is the property? Please tell me the area and city.', hint: 'e.g. New Malir, Karachi', ok: plain, err: 'Please tell me the area or city.' },
      { key: 'Size', ask: 'What is its size (sq ft, marla or sq yards)? You can skip this.', optional: true, hint: 'e.g. 1500 sq ft', ok: hasDigit, err: 'Please include the size as a number, or tap Skip.' },
      { key: 'Budget range', ask: 'What budget range do you have in mind?', chips: BUDGET, hint: 'or type your own range', ok: function (v) { return v.length > 0; } }
    ] }
  };
  /* Questions that begin a guided flow on their own, and ones that only offer it afterwards. */
  var FLOW_AUTO = { 'Can I get a cost estimate for construction?': 'estimate', 'How do I buy a property?': 'buy', 'How do I sell my property?': 'sell', 'Do you help with renting?': 'rent', 'How do I list my property with you?': 'sell' };
  var FLOW_OFFER = { 'Can you build my house?': 'estimate', 'How long does construction take?': 'estimate', 'Do you renovate old houses?': 'reno', 'Do you do interior work?': 'reno', 'Do you have houses for sale?': 'buy', 'Do you sell plots?': 'buy', 'Do you have apartments or flats?': 'buy' };
  var INTENT = [
    ['estimate', /(cost|estimate|quotation|quote|rate|price|budget|charges?).{0,40}(construct|build|building|house|home)|(construct|build|building).{0,40}(cost|estimate|quotation|quote|rate|price|budget)|how much.{0,30}(build|construct)/i],
    ['buy', /\b(want|wanna|looking|like|need|interested|planning|how)\b.{0,25}\b(buy|purchase)\b/i],
    ['sell', /\b(want|wanna|looking|like|need|planning|how|can i)\b.{0,25}\bsell\b|\bsell my\b/i],
    ['rent', /\b(want|looking|need|interested|planning)\b.{0,25}\b(rent|lease|rental)\b|\brent my\b|\bkiraye\b/i],
    ['reno', /\b(want|need|looking|planning|how)\b.{0,25}\b(renovat\w*|remodel\w*|refurbish\w*)\b|\brenovate my\b/i]
  ];
  var CANCEL = /^(cancel|stop|exit|quit|never ?mind|back|start over|reset)\b/i;
  var SKIP = /^(skip|pass|no|none|n\/a)\b/i;

  function startFlow(id) {
    flow = { id: id, i: 0, data: [] };
    lastUnanswered = ''; misses = 0; awaitingHandoff = false;
    speak('Happy to help with ' + FLOWS[id].about + '. I just need a few details so our team can guide you properly. You can type "cancel" at any time.', flowAsk);
  }
  function flowAsk() {
    var s = FLOWS[flow.id].steps[flow.i];
    speak(s.ask, function () {
      input.placeholder = s.hint || 'Type your answer...';
      var opts = [];
      (s.chips || []).forEach(function (label) { opts.push(chip(label, '', function () { say(label, 'me'); flowAnswer(label); })); });
      if (s.optional) opts.push(chip('Skip', '', function () { say('Skip', 'me'); flowAnswer(''); }));
      if (opts.length) row(opts);
    });
  }
  function flowAnswer(value) {
    var f = FLOWS[flow.id], s = f.steps[flow.i];
    if (value) flow.data.push([s.key, value]);
    flow.i++;
    if (flow.i < f.steps.length) { flowAsk(); return; }
    flowFinish();
  }
  function flowInput(t) {
    var s = FLOWS[flow.id].steps[flow.i];
    if (CANCEL.test(t)) { endFlow(); reply(function () { say('No problem, I have cancelled that. Pick a topic or type another question.', 'bot'); topics(); }); return; }
    if (HANDOFF.test(t)) { flowFinish(); return; }
    if (s.optional && SKIP.test(t)) { flowAnswer(''); return; }
    if (s.ok && !s.ok(t)) { reply(function () { say(s.err || 'Sorry, I did not catch that. Please try again.', 'bot'); }); return; }
    flowAnswer(t);
  }
  function endFlow() { flow = null; input.placeholder = DEFAULT_HINT; }
  /* Everything collected goes into one WhatsApp message that the visitor reviews and sends themselves. */
  function flowFinish() {
    var f = FLOWS[flow.id], data = flow.data.slice();
    endFlow();
    var lines = data.map(function (d) { return d[0] + ': ' + d[1]; });
    var ref = newRef();
    var msg = 'Hello Daamin, I used the website assistant and I am interested in ' + f.about + '.' + (lines.length ? '\n' + lines.map(function (l) { return '- ' + l; }).join('\n') : '') + '\nPlease guide me on the next steps.\nRef: ' + ref;
    var url = 'https://wa.me/' + F.whatsapp + '?text=' + encodeURIComponent(msg);
    var finish = function () {
      speak('I have put everything in a WhatsApp message for you. Tap the button below to send it to our team. Nothing is sent on WhatsApp until you press send there, and a copy of these details is kept for our team.', function () {
        row([linkBtn('Continue on WhatsApp', url, true, function () { logEnquiry({ source: 'chatbot', ref: ref, about: f.about, details: data }); })]);
        row([chip('Start over', '', function () { say('Start over', 'me'); reply(function () { say('Sure. What would you like to know?', 'bot'); topics(); }); }),
             chip('Ask something else', '', function () { say('Ask something else', 'me'); reply(function () { say('Of course. Type your question, or pick a topic.', 'bot'); topics(); }); })]);
        speak('You can also call us on ' + F.phone1 + ' or ' + F.phone2 + '.');
      });
    };
    if (lines.length) speak('Thank you, that is everything I need.', function () { speak('Here is what I have:\n' + lines.join('\n'), finish); });
    else speak('Of course. Let me connect you with our team.', finish);
  }

  function ask(text, quiet) { if (!quiet) lastQuestion = text; say(text, 'me'); }

  function offerAgent(reason) {
    awaitingHandoff = true;
    speak(reason, function () {
      row([chip('Yes, connect me with an agent', 'go', function () { say('Yes, connect me with an agent', 'me'); connect(); }),
           chip('No, show me topics', '', function () { say('No, show me topics', 'me'); awaitingHandoff = false; reply(function () { say('No problem. Pick a topic or type another question.', 'bot'); topics(); }); })]);
    });
  }

  /* The hand-over: a WhatsApp link with the visitor's last unanswered question ready to send. */
  function connect() {
    awaitingHandoff = false;
    var q = lastUnanswered || lastQuestion;
    var ref = newRef();
    var msg = 'Hello Daamin, I was using the website assistant and would like to speak to someone.' + (q ? ' My question: ' + q : '') + '\nRef: ' + ref;
    var url = 'https://wa.me/' + F.whatsapp + '?text=' + encodeURIComponent(msg);
    speak('Of course. I will connect you with our team. Tap the button to continue on WhatsApp. Your message is ready, and nothing is sent on WhatsApp until you press send there. A note of your question is kept for our team.', function () {
      row([linkBtn('Continue on WhatsApp', url, true, function () { logEnquiry({ source: 'chatbot', ref: ref, about: 'Wants to speak to the team', message: q || '' }); })]);
      speak('You can also call us on ' + F.phone1 + ' or ' + F.phone2 + '.');
    });
  }

  /* How sure we are: answer, offer a few guesses, or admit we do not know. Words the FAQ has never seen count against it. */
  function classify(r) {
    var best = r.top[0];
    if (!best) return 'none';
    if (best.score >= 100 || (best.coverage >= 0.5 && best.score >= 2.2 && r.unknown < 0.5)) return 'strong';
    if (best.coverage >= 0.35 && best.score >= 1.4 && r.unknown < 0.5) return 'suggest';
    return 'none';
  }

  function handle(text) {
    var t = text.trim();
    if (!t) return;
    ask(t, true);
    if (flow) { flowInput(t); return; }
    if (awaitingHandoff) {
      if (YES.test(t)) { connect(); return; }
      if (NO.test(t)) { awaitingHandoff = false; reply(function () { say('No problem. Pick a topic or type another question.', 'bot'); topics(); }); return; }
    }
    if (HANDOFF.test(t)) { lastQuestion = lastUnanswered; connect(); return; }
    for (var n = 0; n < INTENT.length; n++) { if (INTENT[n][1].test(t)) { lastQuestion = t; startFlow(INTENT[n][0]); return; } }
    var r = rank(t), best = r.top[0], kind = classify(r);
    if (kind === 'strong') {
      misses = 0; lastQuestion = t;
      /* If two answers are nearly tied and the question is short, show both as options. */
      var second = r.top[1];
      if (second && second.score > best.score * 0.92 && best.score < 100 && tokens(t).length <= 2) {
        reply(function () { say('I found a couple of answers that might fit. Which one do you mean?', 'bot'); row(r.top.slice(0, 3).map(function (s) { return chip(s.d.q, 'q', function () { ask(s.d.q, true); answer(s.d); }); })); });
        return;
      }
      answer(best.d); return;
    }
    if (kind === 'suggest') {
      lastUnanswered = t;
      speak('I am not completely sure what you mean. Did you mean one of these?', function () {
        row(r.top.map(function (s) { return chip(s.d.q, 'q', function () { ask(s.d.q, true); answer(s.d); }); }));
        row([chip('None of these, connect me with an agent', 'go', function () { say('None of these, connect me with an agent', 'me'); connect(); })]);
      });
      return;
    }
    misses++; lastUnanswered = t;
    offerAgent(misses > 1
      ? 'I still could not find an answer to that. It is best to talk to our team directly. Would you like me to connect you with an agent on WhatsApp?'
      : 'Sorry, I do not have an answer for that. Would you like me to connect you with an agent on WhatsApp?');
  }

  function openPanel() {
    if (root.classList.contains('open')) return;
    root.classList.remove('closing'); root.classList.add('open');
    launch.setAttribute('aria-expanded', 'true');
    if (!started) {
      started = true;
      speak('Hello! I am the Daamin assistant. Ask me about our services, projects, the gallery or how to reach us, or pick a topic.', topics);
    }
    setTimeout(function () { input.focus({ preventScroll: true }); }, 60);
  }
  function closePanel() {
    if (!root.classList.contains('open')) return;
    root.classList.add('closing');
    setTimeout(function () { root.classList.remove('open', 'closing'); }, 200);
    launch.setAttribute('aria-expanded', 'false');
    launch.focus({ preventScroll: true });
  }

  launch.addEventListener('click', function () { root.classList.contains('open') ? closePanel() : openPanel(); });
  xbtn.addEventListener('click', closePanel);
  form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; handle(v); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });

  /* Test hook, harmless in production. */
  window.__dbot = { rank: rank, classify: classify, total: docs.length };
})();
