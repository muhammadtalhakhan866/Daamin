/* Daamin: motion and interaction layer (progress bar, reveals, hero parallax, tilt, counters, page fades).
   Safe to load on any page: each effect looks for its own elements and does nothing when they are absent. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var root = document.documentElement;
  var $ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- scroll progress, back to top, header ---------- */
  var bar = document.createElement('div'); bar.className = 'fx-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  var top = document.createElement('button'); top.type = 'button'; top.className = 'fx-top'; top.setAttribute('aria-label', 'Back to top');
  top.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  document.body.appendChild(top);
  var header = document.querySelector('header'), lastY = window.scrollY, ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, max = root.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? Math.min(y / max, 1).toFixed(4) : 0);
    top.classList.toggle('show', y > 700);
    if (header) {
      var menuOpen = !!document.querySelector('.nav-links.open');
      header.classList.toggle('fx-solid', y > 30);
      if (!menuOpen && y > 260 && y > lastY + 8) header.classList.add('fx-hide');
      else if (y < lastY - 6 || y < 260 || menuOpen) header.classList.remove('fx-hide');
    }
    lastY = y;
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- headline words ---------- */
  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            var s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', i++); s.textContent = p; frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(el);
    el.classList.add('wsplit');
  }
  if (!reduce) $('.hero h1').forEach(splitWords);

  /* ---------- hero: cursor glow, parallax, tilt ---------- */
  var hero = document.querySelector('.hero');
  if (hero && fine && !reduce) {
    var glow = document.createElement('div'); glow.className = 'hero-glow'; glow.setAttribute('aria-hidden', 'true'); hero.insertBefore(glow, hero.firstChild);
    var visual = hero.querySelector('.hero-visual');
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      hero.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); hero.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      hero.style.setProperty('--px', (x - 0.5).toFixed(3)); hero.style.setProperty('--py', (y - 0.5).toFixed(3));
    });
    hero.addEventListener('pointerleave', function () { hero.style.setProperty('--px', 0); hero.style.setProperty('--py', 0); });
    if (visual) {
      visual.addEventListener('pointermove', function (e) {
        var r = visual.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        visual.style.transform = 'perspective(1000px) rotateX(' + ((0.5 - y) * 9).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 11).toFixed(2) + 'deg)';
        visual.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); visual.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
      visual.addEventListener('pointerleave', function () { visual.style.transform = ''; });
    }
  }

  /* ---------- reveal on scroll ---------- */
  var targets = [
    '.section-head > div', '.section-head > a', '.trust-item', '.service-card', '.project-card', '.video-card', '.gallery-item',
    '.founder', '.about-copy > *', '.value-list > *', '.process-grid > *', '.contact-info', '.contact-form', '.footer-grid > div',
    '.g-hero > .container > *', '.p-hero > *', '.p-toc', '.p-body > *'
  ].join(',');
  var items = $(targets).filter(function (el) { return !el.closest('dialog') && !el.closest('.reviews'); });
  if (!reduce && 'IntersectionObserver' in window) {
    var groups = [];
    items.forEach(function (el) { if (groups.indexOf(el.parentNode) < 0) groups.push(el.parentNode); });
    groups.forEach(function (p) {
      items.filter(function (el) { return el.parentNode === p; }).forEach(function (el, i) { el.style.setProperty('--d', (Math.min(i, 5) * 0.08).toFixed(2) + 's'); });
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; io.unobserve(el); el.classList.add('in');
        /* afterwards, drop the helper classes so nothing lingers (hover transforms, filters, etc.) */
        var clean = function (ev) { if (ev.propertyName !== 'translate') return; el.classList.remove('rv', 'in', 'rv-l', 'rv-r'); el.style.removeProperty('--d'); el.removeEventListener('transitionend', clean); };
        el.addEventListener('transitionend', clean);
        setTimeout(function () { clean({ propertyName: 'translate' }); }, 1800);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach(function (el, i) {
      el.classList.add('rv');
      if (el.matches('.about-copy > *, .contact-info, .founder')) el.classList.add(el.matches('.contact-form, .about-copy > *') ? 'rv-r' : 'rv-l');
      io.observe(el);
    });
  }

  /* ---------- count-up numbers ---------- */
  var counters = $('[data-count]');
  function countUp(el) {
    var to = parseFloat(el.getAttribute('data-count')), dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    if (reduce || isNaN(to)) { el.textContent = to.toFixed(dec); return; }
    var t0 = performance.now(), dur = 1400;
    (function step(now) {
      var k = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * e).toFixed(dec);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  if (counters.length && 'IntersectionObserver' in window) {
    counters.forEach(function (c) { c.textContent = '0'; });
    var co = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { co.unobserve(e.target); countUp(e.target); } }); }, { threshold: 0.4 });
    counters.forEach(function (c) { co.observe(c); });
  }

  /* ---------- tilt + glare on cards ---------- */
  if (fine && !reduce) {
    $('.service-card, .trust-item').forEach(function (el) {
      el.classList.add('tilt');
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transform = 'perspective(900px) rotateX(' + ((0.5 - y) * 9).toFixed(2) + 'deg) rotateY(' + ((x - 0.5) * 9).toFixed(2) + 'deg) translateY(-4px)';
        el.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- magnetic buttons + ripple ---------- */
  $('.btn').forEach(function (b) {
    if (b.classList.contains('map-show')) return;
    if (fine && !reduce) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - (r.left + r.width / 2)) * 0.16).toFixed(1) + 'px,' + ((e.clientY - (r.top + r.height / 2)) * 0.28 - 2).toFixed(1) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    }
    b.addEventListener('click', function (e) {
      if (reduce) return;
      var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
      s.className = 'fx-ripple';
      s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
      b.appendChild(s); setTimeout(function () { s.remove(); }, 700);
    });
  });

  /* ---------- fade between pages ---------- */
  if (!reduce) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var href = a.getAttribute('href');
      if (!href || a.target === '_blank' || /^(#|mailto:|tel:|https?:|\/\/)/i.test(href)) return;
      if (a.pathname === location.pathname) return;
      e.preventDefault();
      root.classList.add('fx-leaving');
      setTimeout(function () { location.href = a.href; }, 230);
    });
    addEventListener('pageshow', function () { root.classList.remove('fx-leaving'); });
  }
})();
