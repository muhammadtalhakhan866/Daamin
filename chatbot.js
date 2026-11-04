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
    '.dbot-launch{display:flex;align-items:center;gap:9px;height:54px;padding:0 20px 0 16px;border:0;border-radius:999px;background:#121942;color:#fff;font:inherit;font-weight:750;font-size:.92rem;cursor:pointer;box-shadow:0 12px 34px rgba(18,25,66,.38);transition:transform .25s cubic-bezier(.34,1.56,.64,1),background .2s}' +
    '.dbot-launch:hover{transform:translateY(-2px) scale(1.03);background:#1b2563}' +
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
    '.dbot-agent{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;padding:9px 12px;border:0;border-top:1px solid #e7e9ef;background:#fff;color:#17995a;font:inherit;font-size:.82rem;font-weight:750;cursor:pointer}' +
    '.dbot-agent:hover{background:#f0faf4}' +
    '.dbot-form{display:flex;gap:8px;padding:10px 12px 12px;background:#fff;border-top:1px solid #e7e9ef}' +
    '.dbot-form input{flex:1;min-width:0;padding:11px 14px;border:1px solid #d7dbe6;border-radius:999px;font:inherit;font-size:.92rem;color:#172033;background:#fff}' +
    '.dbot-form input:focus{outline:2px solid #ee652d;outline-offset:1px;border-color:transparent}' +
    '.dbot-send{flex:none;display:grid;place-items:center;width:42px;height:42px;border:0;border-radius:50%;background:#ee652d;color:#fff;cursor:pointer;transition:background .2s,transform .2s}' +
    '.dbot-send:hover{background:#d95420;transform:scale(1.05)}.dbot-send svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
    '@media(max-width:560px){#dbot{right:14px;bottom:86px}.dbot-launch span.lbl{display:none}.dbot-launch{width:54px;padding:0;justify-content:center}.dbot-launch .dot{display:none}' +
    '.dbot-panel{position:fixed;right:10px;left:10px;bottom:10px;width:auto;height:min(640px,calc(100dvh - 20px))}}' +
    '@media(prefers-reduced-motion:reduce){#dbot *{animation:none!important;transition:none!important}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var root = el('div'); root.id = 'dbot';
  var launch = el('button', 'dbot-launch'); launch.type = 'button'; launch.setAttribute('aria-label', 'Open the Daamin assistant'); launch.setAttribute('aria-expanded', 'false');
  launch.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/></svg><span class="lbl">Ask us</span><span class="dot" aria-hidden="true"></span>';
  var panel = el('div', 'dbot-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Daamin assistant');
  var head = el('div', 'dbot-head');
  var logo = el('img'); logo.src = 'images/daamin-mark.png'; logo.alt = '';
  var title = el('div'); title.append(el('b', '', 'Daamin Assistant'), el('small', '', 'Automated answers. A person is one tap away.'));
  var xbtn = el('button', 'dbot-x'); xbtn.type = 'button'; xbtn.setAttribute('aria-label', 'Close'); xbtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.append(logo, title, xbtn);
  var log = el('div', 'dbot-log'); log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite');
  var agentBar = el('button', 'dbot-agent'); agentBar.type = 'button'; agentBar.textContent = 'Talk to a person on WhatsApp';
  var form = el('form', 'dbot-form');
  var input = el('input'); input.type = 'text'; input.maxLength = 200; input.placeholder = 'Type your question...'; input.setAttribute('aria-label', 'Your question'); input.autocomplete = 'off';
  var send = el('button', 'dbot-send'); send.type = 'submit'; send.setAttribute('aria-label', 'Send'); send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  form.append(input, send);
  panel.append(head, log, agentBar, form);
  root.append(launch, panel);
  document.body.appendChild(root);

  var started = false, lastUnanswered = '', misses = 0, awaitingHandoff = false, lastQuestion = '';
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
  function linkBtn(label, url, go) {
    var a = el('a', 'dbot-link' + (go ? ' go' : ''), label); a.href = go ? url : href(url);
    if (go) { a.target = '_blank'; a.rel = 'noopener'; }
    else a.addEventListener('click', function () { if (window.innerWidth < 760) closePanel(); });
    return a;
  }
  /* A short pause with typing dots, then the reply. */
  function reply(fn) {
    var t = el('div', 'dbot-typing'); t.append(el('i'), el('i'), el('i')); log.appendChild(t); scroll();
    setTimeout(function () { t.remove(); fn(); }, 420);
  }

  function topics() {
    row(F.categories.map(function (c) { return chip(c.label, '', function () { ask(c.label, true); showCategory(c.key); }); }));
  }
  function showCategory(key) {
    var qs = docs.filter(function (d) { return d.cat === key; });
    reply(function () {
      say('Here are common questions about ' + F.categories.filter(function (c) { return c.key === key; })[0].label.toLowerCase() + '. Tap one, or type your own.', 'bot');
      row(qs.slice(0, 12).map(function (d) { return chip(d.q, 'q', function () { ask(d.q); answer(d); }); }));
    });
  }
  function answer(d) {
    reply(function () {
      say(d.a, 'bot');
      if (d.links.length) row(d.links.map(function (l) { return linkBtn(l[0], l[1]); }));
      row([chip('Ask something else', '', function () { say('Ask something else', 'me'); reply(function () { say('Of course. Type your question, or pick a topic.', 'bot'); topics(); }); })]);
    });
  }
  function ask(text, quiet) { if (!quiet) lastQuestion = text; say(text, 'me'); }

  function offerAgent(reason) {
    awaitingHandoff = true;
    reply(function () {
      say(reason, 'bot');
      row([chip('Yes, connect me with an agent', 'go', function () { say('Yes, connect me with an agent', 'me'); connect(); }),
           chip('No, show me topics', '', function () { say('No, show me topics', 'me'); awaitingHandoff = false; reply(function () { say('No problem. Pick a topic or type another question.', 'bot'); topics(); }); })]);
    });
  }

  /* The hand-over: a WhatsApp link with the visitor's last unanswered question ready to send. */
  function connect() {
    awaitingHandoff = false;
    var q = lastUnanswered || lastQuestion;
    var msg = 'Hello Daamin, I was using the website assistant and would like to speak to someone.' + (q ? ' My question: ' + q : '');
    var url = 'https://wa.me/' + F.whatsapp + '?text=' + encodeURIComponent(msg);
    reply(function () {
      say('Connecting you to our team. Tap the button to continue on WhatsApp. Your message is ready to send, and nothing is sent until you press send there.', 'bot');
      row([linkBtn('Continue on WhatsApp', url, true)]);
      say('You can also call us on ' + F.phone1 + ' or ' + F.phone2 + '.', 'bot');
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
    if (awaitingHandoff) {
      if (YES.test(t)) { connect(); return; }
      if (NO.test(t)) { awaitingHandoff = false; reply(function () { say('No problem. Pick a topic or type another question.', 'bot'); topics(); }); return; }
    }
    if (HANDOFF.test(t)) { lastQuestion = lastUnanswered; connect(); return; }
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
      reply(function () {
        say('I am not completely sure what you mean. Did you mean one of these?', 'bot');
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
      say('Hello! I am the Daamin assistant. Ask me about our services, projects, the gallery or how to reach us, or pick a topic.', 'bot');
      topics();
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
  agentBar.addEventListener('click', function () { say('I would like to talk to a person', 'me'); lastQuestion = lastUnanswered; connect(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; handle(v); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });

  /* Test hook, harmless in production. */
  window.__dbot = { rank: rank, classify: classify, total: docs.length };
})();
