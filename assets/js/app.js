/* =========================================================
   CALMA HOTEL — site app (v2)
   - Content (rooms, prices, photos, journeys, settings) comes from the
     admin panel via the Google Apps Script backend. A bundled copy in
     /data/content.json is used for the first paint and as a fallback.
   - One file, no build step: shell (nav/footer), home, rooms, journeys,
     contact and the 3-step booking flow.
   ========================================================= */
var CALMA_BOOKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAoC2XdxfzsTwxkHQHuEFzgi62aoHPKXb7yqxm8YVemgIRrK2QnzyNlC74FsshJhDL/exec';

(function () {
  'use strict';
  var C = null;                 // current content
  var PAGE = document.body.getAttribute('data-page') || 'home';
  var LS_KEY = 'calma_content_v2';

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { if (n == null || n === '' || isNaN(n)) return ''; return (C.settings.currency || 'EGP') + ' ' + Number(n).toLocaleString('en-US'); }
  function hasPrice(r) { return r && r.price != null && r.price !== '' && !isNaN(r.price) && Number(r.price) > 0; }
  function iso(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function parse(s) { return s ? new Date(s + 'T00:00:00') : null; }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function nightsBetween(a, b) { if (!a || !b) return 0; return Math.round((parse(b) - parse(a)) / 864e5); }
  function nice(s) { if (!s) return ''; return parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function wa(text) { return 'https://wa.me/' + (C.settings.whatsapp || '') + '?text=' + encodeURIComponent(text); }
  // responsive image: local photos have -sm variants; Google Drive photos take a size suffix
  function srcset(src) {
    return '';
  }
  function sized(src, w) { if (/googleusercontent\.com\/d\//.test(src)) return src.replace(/=w\d+$/, '') + '=w' + w; return src; }
  function img(src, alt, cls, sizes, eager) {
    return '<img src="' + esc(sized(src, 1400)) + '"' + srcset(src) + ' sizes="' + (sizes || '100vw') + '" alt="' + esc(alt || '') + '"' +
      (cls ? ' class="' + cls + '"' : '') + (eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"') + '>';
  }
  function visibleRooms() { return (C.rooms || []).filter(function (r) { return r.visible !== false; }); }
  function blockedFor(room, a, b) {
    if (!a || !b || !room.blocked) return false;
    var last = addDays(b, -1);
    return room.blocked.some(function (x) { return x && x.from && x.to && a <= x.to && last >= x.from; });
  }

  /* ---------------- icons ---------------- */
  var I = {
    sun: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M18 62 A32 32 0 0 1 82 62"/><circle cx="50" cy="64" r="20"/><line x1="50" y1="18" x2="50" y2="30"/><line x1="34" y1="22" x2="40" y2="33"/><line x1="66" y1="22" x2="60" y2="33"/><line x1="22" y1="34" x2="30" y2="42"/><line x1="78" y1="34" x2="70" y2="42"/><path d="M18 62 L18 78"/><path d="M82 62 L82 78"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 18V7"/><path d="M3 12h18v6"/><path d="M21 18v-4"/><path d="M7 12V9h6v3"/></svg>',
    size: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8v8"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 20l1.2-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2l3 6.6 7 .7-5.3 4.8 1.6 7L12 17.6 5.7 21.1l1.6-7L2 9.3l7-.7z"/></svg>',
    wifi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 8.8a16 16 0 0 1 20 0"/><path d="M5 12.6a11 11 0 0 1 14 0"/><path d="M8.5 16.4a6 6 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M5 12h14"/></svg>',
    coffee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v3M10 2v3M14 2v3"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="m8 2 4 4 4-4"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
    fb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 3h-2a4 4 0 0 0-4 4v3H6v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
    tt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 3v10.5a3.5 3.5 0 1 1-3-3.46"/><path d="M16 3c.3 2.4 2 4.2 4.5 4.5"/></svg>'
  };

  /* ---------------- content loading ---------------- */
  function boot() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { }
    var first = cached ? Promise.resolve(cached) : fetch('/data/content.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
    first.then(function (c) { C = c; render(); }).catch(function () { });
    // live content from the admin panel
    if (CALMA_BOOKING_ENDPOINT) {
      fetch(CALMA_BOOKING_ENDPOINT + '?action=content&t=' + Date.now()).then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.content || !res.content.rooms) return;
        var fresh = res.content, changed = !C || JSON.stringify(fresh) !== JSON.stringify(C);
        try { localStorage.setItem(LS_KEY, JSON.stringify(fresh)); } catch (e) { }
        if (changed) { C = fresh; render(true); }
      }).catch(function () { });
    }
  }

  var shellDone = false;
  function render(again) {
    shell(again);
    var fn = { home: home, rooms: roomsPage, journeys: journeysPage, contact: contactPage, book: bookPage }[PAGE];
    if (again && PAGE === 'book' && window.__bk && window.__bk.step > 1) fn = null; // don't wipe a half-filled booking
    if (fn) fn(again);
    reveal();
  }

  /* ---------------- shell: nav, drawer, footer, WhatsApp ---------------- */
  function shell() {
    var s = C.settings, navEl = $('#nav'), footEl = $('#footer');
    var links = [['/', 'Home', 'home'], ['/rooms/', 'Rooms', 'rooms'], ['/#gallery', 'Gallery', 'gallery'], ['/offers/', 'Journeys', 'journeys'], ['/contact/', 'Contact', 'contact']];
    var ann = s.announcement ? '<div class="announce">' + esc(s.announcement) + '</div>' : (s.directDiscountText ? '<div class="announce"><b>' + esc(s.directDiscountText) + '</b> — best price guaranteed on this website</div>' : '');
    $$('.announce, .drawer').forEach(function (x) { x.remove(); });
    if (navEl) navEl.outerHTML = ann +
      '<header class="nav" id="nav"><div class="wrap">' +
      '<a class="brand" href="/" aria-label="' + esc(s.hotelName) + ' home">' + I.sun + '<span><b>CALMA</b><small>SO CALM · MORE LOVE</small></span></a>' +
      '<ul class="nav-links">' + links.map(function (l) { return '<li><a href="' + l[0] + '"' + (PAGE === l[2] ? ' class="on"' : '') + '>' + l[1] + '</a></li>'; }).join('') + '</ul>' +
      '<div class="nav-actions"><a class="btn btn-ghost btn-sm hide-m" href="' + esc(wa('Hello CALMA Hotel, I have a question.')) + '" target="_blank" rel="noopener">' + I.wa + ' WhatsApp</a>' +
      '<a class="btn btn-primary btn-sm" href="/book/">Book now</a>' +
      '<button class="icon-btn menu-btn" aria-label="Open menu" aria-expanded="false">' + I.menu + '</button></div></div></header>' +
      '<div class="drawer" role="dialog" aria-modal="true" aria-label="Menu"><div class="top"><a class="brand" href="/">' + I.sun + '<span><b>CALMA</b></span></a><button class="icon-btn" data-close aria-label="Close menu">' + I.x + '</button></div>' +
      links.map(function (l) { return '<a class="dl" href="' + l[0] + '">' + l[1] + '</a>'; }).join('') +
      '<a class="btn btn-primary" href="/book/">Book your stay</a><a class="btn btn-wa" href="' + esc(wa('Hello CALMA Hotel, I have a question.')) + '" target="_blank" rel="noopener">' + I.wa + ' Chat on WhatsApp</a></div>';
    if (footEl) {
      var soc = [['instagram', 'ig', 'Instagram'], ['facebook', 'fb', 'Facebook'], ['tiktok', 'tt', 'TikTok']].filter(function (x) { return s[x[0]]; })
        .map(function (x) { return '<a href="' + esc(s[x[0]]) + '" target="_blank" rel="noopener" aria-label="' + x[2] + '">' + I[x[1]] + '</a>'; }).join('');
      footEl.outerHTML = '<footer class="footer" id="footer"><div class="wrap"><div class="cols">' +
        '<div><a class="brand" href="/">' + I.sun + '<span><b>CALMA</b><small>SO CALM · MORE LOVE</small></span></a><p style="margin-top:16px;max-width:300px">' + esc(s.intro || '') + '</p></div>' +
        '<div><h4>Explore</h4><ul><li><a href="/rooms/">Rooms &amp; prices</a></li><li><a href="/#gallery">Photo gallery</a></li><li><a href="/offers/">Journeys</a></li><li><a href="/book/">Book a room</a></li></ul></div>' +
        '<div><h4>Help</h4><ul><li><a href="/contact/">Contact &amp; location</a></li><li><a href="/#faq">FAQ</a></li><li><a href="' + esc(wa('Hello CALMA Hotel')) + '" target="_blank" rel="noopener">WhatsApp us</a></li></ul></div>' +
        '<div><h4>Reach us</h4><ul><li>' + esc(s.address) + '</li><li><a href="tel:' + esc((s.phone || '').replace(/\s/g, '')) + '">' + esc(s.phone) + '</a></li>' + (s.email ? '<li><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></li>' : '') + '</ul><div class="socials" style="margin-top:16px">' + soc + '</div></div>' +
        '</div><div class="bottom"><span>© ' + new Date().getFullYear() + ' ' + esc(s.hotelName) + '. All rights reserved.</span>' +
        '<span class="credit">Created by <a href="https://wa.me/201146390054" target="_blank" rel="noopener">Eng Abdelrahman Mohamed Nada</a></span></div></div></footer>';
    }
    if (!$('.fab-wa')) document.body.insertAdjacentHTML('beforeend', '<a class="fab-wa" href="' + esc(wa('Hello CALMA Hotel, I would like to ask about a room.')) + '" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">' + I.wa + '</a>');
    if (PAGE !== 'book' && !$('.mbar')) {
      document.body.classList.add('has-mbar');
      document.body.insertAdjacentHTML('beforeend', '<div class="mbar"><div class="price"><small>Book direct</small><b style="font-size:1.05rem">Best price</b></div><a class="btn btn-primary" href="/book/">Check availability</a></div>');
    }
    // nav behaviour
    var nav = $('.nav');
    var onScroll = function () { var n = $('.nav'); n && n.classList.toggle('scrolled', window.scrollY > 10); };
    if (!shellDone) { window.addEventListener('scroll', onScroll, { passive: true }); }
    onScroll();
    var drawer = $('.drawer'), mb = $('.menu-btn');
    if (mb && drawer) {
      mb.onclick = function () { drawer.classList.add('open'); document.body.classList.add('no-scroll'); mb.setAttribute('aria-expanded', 'true'); };
      var close = function () { drawer.classList.remove('open'); document.body.classList.remove('no-scroll'); mb.setAttribute('aria-expanded', 'false'); };
      $$('[data-close], a', drawer).forEach(function (a) { a.addEventListener('click', close); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    }
    shellDone = true;
  }

  /* ---------------- reveal on scroll ---------------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' }) : null;
  function reveal() { $$('.rv:not(.in)').forEach(function (el) { io ? io.observe(el) : el.classList.add('in'); }); }

  /* ---------------- carousel ---------------- */
  function carousel(images, alt, opts) {
    opts = opts || {};
    var id = 'c' + Math.random().toString(36).slice(2, 8);
    return '<div class="carousel" id="' + id + '" data-imgs="' + esc(JSON.stringify(images)) + '" data-alt="' + esc(alt) + '">' +
      (opts.badge ? '<span class="badge">' + esc(opts.badge) + '</span>' : '') +
      '<div class="track">' + images.map(function (s, i) { return img(s, alt + ' — photo ' + (i + 1), '', opts.sizes || '(max-width:620px) 92vw, 33vw'); }).join('') + '</div>' +
      (images.length > 1 ? '<button class="nav-arrow prev" aria-label="Previous photo">' + I.left + '</button><button class="nav-arrow next" aria-label="Next photo">' + I.right + '</button>' +
        '<div class="dots">' + images.map(function (_, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</div>' : '') +
      '<span class="count">' + images.length + ' photos</span></div>';
  }
  function wireCarousels(root) {
    $$('.carousel', root).forEach(function (c) {
      if (c._w) return; c._w = 1;
      var tr = $('.track', c), dots = $$('.dots i', c), imgs = JSON.parse(c.getAttribute('data-imgs')), alt = c.getAttribute('data-alt');
      var idx = function () { return Math.round(tr.scrollLeft / tr.clientWidth); };
      var go = function (i) { tr.scrollTo({ left: i * tr.clientWidth, behavior: 'smooth' }); };
      var p = $('.prev', c), n = $('.next', c);
      if (p) p.onclick = function (e) { e.preventDefault(); e.stopPropagation(); var i = idx(); go(i ? i - 1 : imgs.length - 1); };
      if (n) n.onclick = function (e) { e.preventDefault(); e.stopPropagation(); var i = idx(); go(i < imgs.length - 1 ? i + 1 : 0); };
      tr.addEventListener('scroll', function () { var i = idx(); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); }); var th = c.parentNode.querySelector('.thumbs'); if (th) $$('img', th).forEach(function (t, k) { t.classList.toggle('on', k === i); }); }, { passive: true });
      $$('img', tr).forEach(function (im, i) { im.addEventListener('click', function (e) { e.preventDefault(); lightbox(imgs.map(function (s) { return { src: s, alt: alt }; }), i); }); });
      c._go = go;
    });
  }

  /* ---------------- lightbox ---------------- */
  var LB = null;
  function lightbox(list, start) {
    if (!LB) {
      document.body.insertAdjacentHTML('beforeend', '<div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer"><button class="lb-btn lb-close" aria-label="Close">' + I.x + '</button><button class="lb-btn lb-prev" aria-label="Previous">' + I.left + '</button><img alt=""><button class="lb-btn lb-next" aria-label="Next">' + I.right + '</button><div class="lb-cap"></div></div>');
      LB = $('.lightbox');
      var sx = 0;
      LB.addEventListener('click', function (e) { if (e.target === LB) close(); });
      $('.lb-close', LB).onclick = close;
      $('.lb-prev', LB).onclick = function () { show(LB._i - 1); };
      $('.lb-next', LB).onclick = function () { show(LB._i + 1); };
      document.addEventListener('keydown', function (e) { if (!LB.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(LB._i - 1); if (e.key === 'ArrowRight') show(LB._i + 1); });
      LB.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      LB.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(LB._i + (dx < 0 ? 1 : -1)); });
    }
    function show(i) { var L = LB._list; i = (i + L.length) % L.length; LB._i = i; var im = $('img', LB); im.src = sized(L[i].src, 2000); im.alt = L[i].alt || ''; $('.lb-cap', LB).textContent = (L[i].alt ? L[i].alt + '  ·  ' : '') + (i + 1) + ' / ' + L.length; }
    function close() { LB.classList.remove('open'); document.body.classList.remove('no-scroll'); }
    LB._list = list; show(start || 0); LB.classList.add('open'); document.body.classList.add('no-scroll'); $('.lb-close', LB).focus();
  }

  /* ---------------- search bar (dates + guests) ---------------- */
  function searchbar(state) {
    state = state || {};
    var today = iso(new Date()), cin = state.cin || addDays(today, 1), cout = state.cout || addDays(cin, 2);
    return '<form class="searchbar" action="/book/" autocomplete="off">' +
      '<div class="sb-field sb-date"><label for="sb-in">Check-in</label><span class="val" data-show="in">' + nice(cin) + '</span><input type="date" id="sb-in" name="in" min="' + today + '" value="' + cin + '" required></div>' +
      '<div class="sb-field sb-date"><label for="sb-out">Check-out</label><span class="val" data-show="out">' + nice(cout) + '</span><input type="date" id="sb-out" name="out" min="' + addDays(cin, 1) + '" value="' + cout + '" required></div>' +
      '<div class="sb-field" data-guests><label>Guests</label><div class="val" tabindex="0" role="button" aria-haspopup="true"><span data-gl>' + (state.ad || 2) + ' adults' + (state.ch ? ', ' + state.ch + ' children' : '') + '</span></div>' +
      '<input type="hidden" name="ad" value="' + (state.ad || 2) + '"><input type="hidden" name="ch" value="' + (state.ch || 0) + '">' +
      '<div class="guest-pop"><div class="stepper"><div>Adults<small>Age 13+</small></div><div class="ctl"><button type="button" data-k="ad" data-d="-1" aria-label="Fewer adults">−</button><output data-o="ad">' + (state.ad || 2) + '</output><button type="button" data-k="ad" data-d="1" aria-label="More adults">+</button></div></div>' +
      '<div class="stepper"><div>Children<small>Age 0–12</small></div><div class="ctl"><button type="button" data-k="ch" data-d="-1" aria-label="Fewer children">−</button><output data-o="ch">' + (state.ch || 0) + '</output><button type="button" data-k="ch" data-d="1" aria-label="More children">+</button></div></div>' +
      '<button type="button" class="btn btn-primary btn-sm btn-block" data-done style="margin-top:10px">Done</button></div></div>' +
      '<button class="btn btn-primary" type="submit">Check availability ' + I.arrow + '</button></form>';
  }
  function wireSearch(root, onChange) {
    $$('.searchbar', root).forEach(function (f) {
      var a = $('[name=in]', f), b = $('[name=out]', f), g = $('[data-guests]', f), pop = $('.guest-pop', g);
      var show = function () { $('[data-show=in]', f).textContent = nice(a.value); $('[data-show=out]', f).textContent = nice(b.value); };
      a.addEventListener('change', function () { if (!a.value) return; var m = addDays(a.value, 1); b.min = m; if (!b.value || b.value <= a.value) b.value = addDays(a.value, 2); show(); onChange && onChange(); });
      b.addEventListener('change', function () { if (!b.value || b.value <= a.value) b.value = addDays(a.value, 1); show(); onChange && onChange(); });
      $$('.sb-field', f).forEach(function (fld) { var inp = $('input[type=date]', fld); if (inp) fld.addEventListener('click', function (e) { if (e.target === inp) return; try { inp.showPicker(); } catch (x) { inp.focus(); } }); });
      $('.val', g).addEventListener('click', function () { pop.classList.toggle('open'); });
      $('.val', g).addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pop.classList.toggle('open'); } });
      document.addEventListener('click', function (e) { if (!g.contains(e.target)) pop.classList.remove('open'); });
      $$('button[data-k]', pop).forEach(function (bt) {
        bt.addEventListener('click', function () {
          var k = bt.getAttribute('data-k'), inp = $('[name=' + k + ']', f), v = +inp.value + (+bt.getAttribute('data-d'));
          v = Math.max(k === 'ad' ? 1 : 0, Math.min(k === 'ad' ? 8 : 6, v)); inp.value = v; $('[data-o=' + k + ']', pop).textContent = v;
          var ad = $('[name=ad]', f).value, ch = $('[name=ch]', f).value;
          $('[data-gl]', f).textContent = ad + ' adult' + (ad > 1 ? 's' : '') + (+ch ? ', ' + ch + ' child' + (ch > 1 ? 'ren' : '') : '');
          onChange && onChange();
        });
      });
      $('[data-done]', pop).addEventListener('click', function () { pop.classList.remove('open'); });
    });
  }

  /* ---------------- shared bits ---------------- */
  function priceHTML(r, prefix) {
    if (!hasPrice(r)) return '<div class="price"><small>Price</small><span class="ask">On request</span></div>';
    return '<div class="price"><small>' + (prefix || 'From') + '</small><b>' + money(r.price) + '</b>' + (r.otaPrice ? '<s>' + money(r.otaPrice) + '</s>' : '') + '<small>per night</small></div>';
  }
  function roomCard(r) {
    return '<article class="room rv">' + carousel(r.images || [], r.name, { badge: C.settings.directDiscount ? 'Save ' + C.settings.directDiscount + '% booking direct' : '' }) +
      '<div class="body"><span class="cat">' + esc(r.category) + '</span><h3>' + esc(r.name) + '</h3>' +
      '<div class="facts"><span>' + I.user + 'Up to ' + esc(r.maxGuests) + ' guests</span><span>' + I.bed + esc(r.beds) + '</span>' + (r.size ? '<span>' + I.size + esc(r.size) + '</span>' : '') + '</div>' +
      '<p class="short">' + esc(r.short) + '</p>' +
      '<div class="foot">' + priceHTML(r) + '<a class="btn btn-primary btn-sm" href="/book/?room=' + encodeURIComponent(r.id) + '">Book</a></div></div></article>';
  }
  function perksHTML() {
    var d = C.settings.directDiscount;
    var P = [['tag', 'Lowest price here', d ? 'Save ' + d + '% vs Booking.com — no platform fees.' : 'No platform fees when you book direct.'], ['shield', 'No card needed', 'Send a request in under a minute; pay at the hotel.'], ['chat', 'Instant WhatsApp', 'Our team confirms your booking on WhatsApp.'], ['clock', '24-hour reception', 'Someone is always awake to welcome you.']];
    return '<div class="perks">' + P.map(function (p) { return '<div class="perk rv"><i>' + I[p[0]] + '</i><div><b>' + p[1] + '</b><span>' + p[2] + '</span></div></div>'; }).join('') + '</div>';
  }
  function galleryHTML() {
    var cats = ['All'].concat((C.gallery || []).map(function (g) { return g.cat; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }));
    return '<div class="tabs" role="tablist">' + cats.map(function (c, i) { return '<button class="tab' + (i ? '' : ' on') + '" role="tab" aria-selected="' + (!i) + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div><div class="masonry"></div>';
  }
  function wireGallery(root) {
    var box = $('.masonry', root); if (!box) return;
    var more = document.createElement('div'); more.className = 'more-wrap'; box.after(more);
    var draw = function (cat, all) {
      var list = (C.gallery || []).filter(function (g) { return cat === 'All' || g.cat === cat; });
      var LIM = window.innerWidth < 620 ? 8 : 12, shown = all ? list : list.slice(0, LIM);
      box.innerHTML = shown.map(function (g, i) { return '<button data-i="' + i + '" aria-label="Open photo: ' + esc(g.alt) + '">' + img(g.src, g.alt, '', '(max-width:620px) 46vw, 25vw') + '</button>'; }).join('');
      $$('button', box).forEach(function (b) { b.onclick = function () { lightbox(list, +b.getAttribute('data-i')); }; });
      more.innerHTML = list.length > shown.length ? '<button class="btn btn-ghost">Show all ' + list.length + ' photos</button>' : '';
      var mb = $('button', more); if (mb) mb.onclick = function () { draw(cat, true); };
    };
    $$('.tab', root).forEach(function (t) { t.onclick = function () { $$('.tab', root).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); }); t.classList.add('on'); t.setAttribute('aria-selected', 'true'); draw(t.getAttribute('data-cat')); }; });
    draw('All');
  }
  function locationHTML() {
    var s = C.settings;
    return '<div class="loc"><div class="card rv"><span class="eyebrow">Find us</span><h2 style="font-size:2.1rem">In the heart of Downtown Cairo.</h2>' +
      '<div class="contact-line">' + I.pin + '<span>' + esc(s.address) + '</span></div>' +
      '<div class="contact-line">' + I.phone + '<a href="tel:' + esc((s.phone || '').replace(/\s/g, '')) + '">' + esc(s.phone) + '</a></div>' +
      (s.email ? '<div class="contact-line">' + I.mail + '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></div>' : '') +
      (s.checkinTime || s.checkoutTime ? '<div class="contact-line">' + I.clock + '<span>' + (s.checkinTime ? 'Check-in from ' + esc(s.checkinTime) : '') + (s.checkinTime && s.checkoutTime ? ' · ' : '') + (s.checkoutTime ? 'Check-out until ' + esc(s.checkoutTime) : '') + '</span></div>' : '') +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:auto"><a class="btn btn-primary" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.mapQuery || s.address) + '" target="_blank" rel="noopener">Get directions</a>' +
      '<a class="btn btn-wa" href="' + esc(wa('Hello CALMA Hotel, I need directions to the hotel.')) + '" target="_blank" rel="noopener">' + I.wa + ' WhatsApp</a></div></div>' +
      '<iframe class="rv" title="Map to ' + esc(s.hotelName) + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=' + encodeURIComponent(s.mapQuery || s.address) + '&output=embed"></iframe></div>';
  }
  function faqHTML() {
    return '<div class="faq">' + (C.faq || []).map(function (f, i) { return '<details class="rv"' + (i ? '' : ' open') + '><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>'; }).join('') + '</div>';
  }

  /* ---------------- HOME ---------------- */
  function home() {
    var s = C.settings, H = s.heroImages || [], rooms = visibleRooms();
    var minPrice = rooms.filter(hasPrice).map(function (r) { return +r.price; }).sort(function (a, b) { return a - b; })[0];
    var main = $('#main');
    main.innerHTML =
      '<section class="hero"><div class="wrap hero-grid"><div class="rv">' +
      '<span class="eyebrow">Boutique hotel · Downtown Cairo</span>' +
      '<h1>' + esc(s.tagline || 'So Calm, More Love.').replace('More Love', '<em>More Love</em>') + '</h1>' +
      '<p class="lead">' + esc(s.intro) + '</p>' +
      '<div class="hero-trust"><span>' + I.check + 'Best price when you book direct</span><span>' + I.check + 'No card required</span><span>' + I.check + 'Instant WhatsApp confirmation</span></div></div>' +
      '<div class="collage rv" aria-hidden="false">' +
      '<figure class="c1">' + img(H[0] || '', 'CALMA Hotel lobby', '', '(max-width:1080px) 60vw, 30vw', true) + '</figure>' +
      '<figure class="c2">' + img(H[1] || H[0] || '', 'A CALMA guest room', '', '(max-width:1080px) 45vw, 22vw', true) + '</figure>' +
      '<figure class="c3">' + img(H[2] || H[0] || '', 'View from a CALMA room', '', '(max-width:1080px) 40vw, 20vw') + '</figure>' +
      '<div class="chip"><i>★</i><div><b>' + (minPrice ? 'From ' + money(minPrice) : rooms.length + ' room types') + '</b><span>' + (minPrice ? 'per night, booking direct' : 'for couples, friends & families') + '</span></div></div>' +
      '</div></div><div class="wrap hero-search rv">' + searchbar() + '</div></section>' +
      '<section class="section tight"><div class="wrap">' + perksHTML() + '</div></section>' +
      '<section class="section on-sand" id="rooms"><div class="wrap"><div class="head rv"><div><span class="eyebrow">Rooms &amp; prices</span><h2>Pick the room that fits your trip.</h2><p>Real photos of every room. Swipe through them, check the price, and book in three quick steps.</p></div><a class="btn btn-ghost" href="/rooms/">Compare all rooms ' + I.arrow + '</a></div>' +
      '<div class="rooms-grid">' + rooms.map(roomCard).join('') + '</div></div></section>' +
      '<section class="section" id="gallery"><div class="wrap"><div class="head center rv"><span class="eyebrow">Gallery</span><h2>Take a look around.</h2><p>Lobby, rooms, bathrooms and the views — tap any photo to open it full screen.</p></div>' + galleryHTML() + '</div></section>' +
      '<section class="section on-sand"><div class="wrap"><div class="head rv"><div><span class="eyebrow">Included in every stay</span><h2>Small comforts, done properly.</h2></div></div><div class="amen rv">' +
      (C.amenities || []).map(function (a) { return '<div>' + (I[a.icon] || I.check) + '<b>' + esc(a.title) + '</b><span>' + esc(a.text) + '</span></div>'; }).join('') + '</div></div></section>' +
      ((C.journeys || []).some(function (j) { return j.visible !== false; }) ? '<section class="section on-dark"><div class="wrap"><div class="head rv"><div><span class="eyebrow">Journeys</span><h2>Beyond the hotel doors.</h2><p>Day trips and city programs planned by our team, around your stay.</p></div><a class="btn btn-light" href="/offers/">All journeys ' + I.arrow + '</a></div><div class="journeys">' +
        (C.journeys || []).filter(function (j) { return j.visible !== false; }).slice(0, 3).map(function (j) { return '<a class="journey rv" href="/offers/#' + esc(j.id) + '">' + img(j.image, j.title, '', '(max-width:620px) 92vw, 33vw') + '<div class="jb"><small>' + esc(j.type) + ' · ' + esc(j.duration) + '</small><h3>' + esc(j.title) + '</h3><p>' + esc(j.description) + '</p></div></a>'; }).join('') + '</div></div></section>' : '') +
      ((C.reviews || []).length ? '<section class="section"><div class="wrap quote rv"><div class="stars">★★★★★</div><blockquote>“' + esc(C.reviews[0].text) + '”</blockquote><cite>— ' + esc(C.reviews[0].author) + '</cite></div></section>' : '') +
      '<section class="section on-sand" id="location"><div class="wrap">' + locationHTML() + '</div></section>' +
      '<section class="section" id="faq"><div class="wrap"><div class="head center rv"><span class="eyebrow">Good to know</span><h2>Questions, answered.</h2></div>' + faqHTML() + '</div></section>' +
      '<section class="section tight" style="padding-top:0"><div class="wrap"><div class="band rv">' + img(H[3] || H[0] || '', '', '', '100vw') + '<span class="eyebrow">Plan your stay</span><h2>Come, exhale a little.</h2><p>Choose your dates, pick a room, and we’ll take care of the rest.</p><div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-gold" href="/book/">Book your stay</a><a class="btn btn-light" href="' + esc(wa('Hello CALMA Hotel, I would like to plan a stay.')) + '" target="_blank" rel="noopener">' + I.wa + ' Ask on WhatsApp</a></div></div></div></section>';
    wireCarousels(main); wireGallery(main); wireSearch(main);
  }

  /* ---------------- ROOMS ---------------- */
  function roomsPage() {
    var main = $('#main'), rooms = visibleRooms();
    var cats = ['All rooms'].concat(rooms.map(function (r) { return r.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    main.innerHTML = '<section class="phead"><div class="wrap"><div class="crumbs"><a href="/">Home</a> / Rooms</div><h1>Rooms &amp; prices</h1><p>' + rooms.length + ' room types, all with a private bathroom, air conditioning and free Wi-Fi. ' + esc(C.settings.directDiscountText || '') + '.</p>' + searchbar() + '</div></section>' +
      '<section class="section" style="padding-top:20px"><div class="wrap"><div class="filters">' + cats.map(function (c, i) { return '<button class="tab' + (i ? '' : ' on') + '" data-f="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') +
      '<button class="tab" data-g="3">3+ guests</button></div><div id="rlist">' +
      rooms.map(function (r) {
        return '<article class="room-wide rv" id="' + esc(r.id) + '" data-cat="' + esc(r.category) + '" data-max="' + esc(r.maxGuests) + '"><div>' + carousel(r.images || [], r.name, { sizes: '(max-width:860px) 92vw, 55vw' }) +
          '<div class="thumbs">' + (r.images || []).map(function (s, i) { return '<img src="' + esc(sized(s, 300)) + '" alt="" data-i="' + i + '"' + (i ? '' : ' class="on"') + ' loading="lazy">'; }).join('') + '</div></div>' +
          '<div class="body"><span class="eyebrow">' + esc(r.category) + '</span><h2>' + esc(r.name) + '</h2>' +
          '<div class="meta-row"><span class="pill">' + I.user + ' Up to ' + esc(r.maxGuests) + ' guests</span><span class="pill">' + I.bed + ' ' + esc(r.beds) + '</span>' + (r.size ? '<span class="pill">' + esc(r.size) + '</span>' : '') + '</div>' +
          '<p class="desc">' + esc(r.description) + '</p><ul class="amen-list">' + (r.amenities || []).map(function (a) { return '<li>' + I.check + esc(a) + '</li>'; }).join('') + '</ul>' +
          '<div class="foot">' + priceHTML(r) + '<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="' + esc(wa('Hello CALMA Hotel, I have a question about the ' + r.name + '.')) + '" target="_blank" rel="noopener">Ask</a><a class="btn btn-primary" href="/book/?room=' + encodeURIComponent(r.id) + '">Book this room</a></div></div></div></article>';
      }).join('') + '</div></div></section>';
    wireCarousels(main); wireSearch(main);
    $$('.room-wide', main).forEach(function (rw) { var c = $('.carousel', rw); $$('.thumbs img', rw).forEach(function (t) { t.onclick = function () { c._go(+t.getAttribute('data-i')); }; }); });
    $$('.filters .tab', main).forEach(function (t) {
      t.onclick = function () {
        $$('.filters .tab', main).forEach(function (x) { x.classList.remove('on'); }); t.classList.add('on');
        var f = t.getAttribute('data-f'), g = +t.getAttribute('data-g') || 0;
        $$('.room-wide', main).forEach(function (r) { var ok = g ? +r.getAttribute('data-max') >= g : (f === 'All rooms' || r.getAttribute('data-cat') === f); r.style.display = ok ? '' : 'none'; });
      };
    });
    if (location.hash) { var el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); }
  }

  /* ---------------- JOURNEYS ---------------- */
  function journeysPage() {
    var list = (C.journeys || []).filter(function (j) { return j.visible !== false; });
    $('#main').innerHTML = '<section class="phead"><div class="wrap"><div class="crumbs"><a href="/">Home</a> / Journeys</div><h1>Cairo, at an unhurried pace.</h1><p>Programs we plan and arrange for our guests — sensibly paced, well guided, and built around your stay. Tell us your dates and we’ll tailor the details.</p></div></section>' +
      '<section class="section" style="padding-top:20px"><div class="wrap journey-list">' + list.map(function (j) {
        return '<article class="jrow rv" id="' + esc(j.id) + '">' + img(j.image, j.title, '', '(max-width:860px) 92vw, 420px') + '<div class="jb"><span class="eyebrow">' + esc(j.type) + '</span><h3>' + esc(j.title) + '</h3><div class="meta-row"><span class="pill">' + I.clock + ' ' + esc(j.duration) + '</span>' + (j.price ? '<span class="pill">' + money(j.price) + '</span>' : '') + '</div><p>' + esc(j.description) + '</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:auto"><a class="btn btn-wa" href="' + esc(wa('Hello CALMA Hotel, I would like to book the "' + j.title + '" program.')) + '" target="_blank" rel="noopener">' + I.wa + ' Book on WhatsApp</a><a class="btn btn-ghost" href="/book/">Add to a room booking</a></div></div></article>';
      }).join('') + '</div></section>';
  }

  /* ---------------- CONTACT ---------------- */
  function contactPage() {
    $('#main').innerHTML = '<section class="phead"><div class="wrap"><div class="crumbs"><a href="/">Home</a> / Contact</div><h1>We’re one message away.</h1><p>The fastest way to reach us is WhatsApp — our reception is open 24 hours. To book a room, use the booking page: it takes less than a minute.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px"><a class="btn btn-primary" href="/book/">Book a room</a><a class="btn btn-wa" href="' + esc(wa('Hello CALMA Hotel')) + '" target="_blank" rel="noopener">' + I.wa + ' WhatsApp</a><a class="btn btn-ghost" href="tel:' + esc((C.settings.phone || '').replace(/\s/g, '')) + '">' + I.phone + ' Call</a></div></div></section>' +
      '<section class="section" style="padding-top:30px"><div class="wrap">' + locationHTML() + '</div></section>' +
      '<section class="section on-sand"><div class="wrap"><div class="head center rv"><span class="eyebrow">Good to know</span><h2>Questions, answered.</h2></div>' + faqHTML() + '</div></section>';
  }

  /* ---------------- BOOKING (3 steps) ---------------- */
  function bookPage() {
    var q = new URLSearchParams(location.search), today = iso(new Date());
    var st = window.__bk || { step: 1, cin: q.get('in') || addDays(today, 1), cout: q.get('out') || '', ad: +(q.get('ad') || 2), ch: +(q.get('ch') || 0), room: q.get('room') || '', guest: {} };
    if (!st.cout || st.cout <= st.cin) st.cout = addDays(st.cin, 2);
    if (st.cin < today) { st.cin = addDays(today, 1); st.cout = addDays(st.cin, 2); }
    window.__bk = st;
    var main = $('#main');
    main.innerHTML = '<section class="phead" style="padding-bottom:10px"><div class="wrap"><div class="crumbs"><a href="/">Home</a> / Book</div><h1>Book your stay</h1><p>Three quick steps. No card needed — our team confirms on WhatsApp.</p></div></section>' +
      '<section class="section" style="padding-top:20px"><div class="wrap book-grid"><div><ol class="steps"><li data-s="1">1 · Dates &amp; guests</li><li data-s="2">2 · Choose a room</li><li data-s="3">3 · Your details</li></ol><div id="wiz"></div></div><aside class="summary" id="sum"></aside></div></section>';
    draw();

    function room() { return visibleRooms().filter(function (r) { return r.id === st.room; })[0]; }
    function nights() { return nightsBetween(st.cin, st.cout); }
    function guests() { return st.ad + st.ch; }
    function total(r) { return hasPrice(r) ? +r.price * nights() : null; }
    function steps() { $$('.steps li', main).forEach(function (li) { var s = +li.getAttribute('data-s'); li.className = s < st.step ? 'done' : s === st.step ? 'on' : ''; }); }
    function summary() {
      var r = room(), n = nights(), t = total(r);
      $('#sum').innerHTML = (r && r.images && r.images[0] ? img(r.images[0], r.name, '', '380px') : img((C.settings.heroImages || [])[0] || '', 'CALMA Hotel', '', '380px')) +
        '<div class="sb"><h3>' + (r ? esc(r.name) : 'Your stay') + '</h3>' +
        '<div class="srow"><span>Check-in</span><span>' + nice(st.cin) + '</span></div><div class="srow"><span>Check-out</span><span>' + nice(st.cout) + '</span></div>' +
        '<div class="srow"><span>Nights</span><span>' + n + '</span></div><div class="srow"><span>Guests</span><span>' + st.ad + ' adult' + (st.ad > 1 ? 's' : '') + (st.ch ? ', ' + st.ch + ' child' + (st.ch > 1 ? 'ren' : '') : '') + '</span></div>' +
        (r ? (t != null ? '<div class="srow"><span>' + money(r.price) + ' × ' + n + ' night' + (n > 1 ? 's' : '') + '</span><span>' + money(t) + '</span></div><div class="srow total"><span>Total</span><span>' + money(t) + '</span></div>' : '<div class="srow total"><span>Total</span><span>Confirmed on WhatsApp</span></div>') : '') +
        (C.settings.directDiscountText ? '<div class="save-note">' + I.tag + '<span>' + esc(C.settings.directDiscountText) + '. Pay at the hotel.</span></div>' : '') + '</div>';
    }
    function draw() {
      steps(); summary();
      var w = $('#wiz');
      if (st.step === 1) {
        w.innerHTML = '<div class="panel rv"><h2>When are you coming?</h2><p class="sub">Pick your dates and how many people are staying.</p>' + searchbar(st).replace('Check availability', 'See available rooms') + '<span class="nights-chip">' + I.cal + '<span data-n>' + nights() + ' night' + (nights() > 1 ? 's' : '') + '</span></span></div>';
        var f = $('.searchbar', w);
        var sync = function () { st.cin = $('[name=in]', f).value; st.cout = $('[name=out]', f).value; st.ad = +$('[name=ad]', f).value; st.ch = +$('[name=ch]', f).value; var n = nights(); $('[data-n]', w).textContent = n + ' night' + (n > 1 ? 's' : ''); summary(); };
        wireSearch(w, sync);
        f.addEventListener('submit', function (e) { e.preventDefault(); sync(); if (nights() < 1) return; st.step = 2; draw(); top(); });
      } else if (st.step === 2) {
        var rs = visibleRooms();
        w.innerHTML = '<div class="panel rv"><h2>Choose your room</h2><p class="sub">' + nice(st.cin) + ' → ' + nice(st.cout) + ' · ' + nights() + ' night' + (nights() > 1 ? 's' : '') + ' · ' + guests() + ' guest' + (guests() > 1 ? 's' : '') + '</p><div class="pick">' +
          rs.map(function (r) {
            var fit = +r.maxGuests >= guests(), blocked = blockedFor(r, st.cin, st.cout), na = blocked || !fit, t = total(r);
            return '<div class="pick-room' + (na ? ' na' : '') + (st.room === r.id && !na ? ' sel' : '') + '" role="radio" tabindex="' + (na ? -1 : 0) + '" aria-checked="' + (st.room === r.id) + '" data-id="' + esc(r.id) + '">' + img((r.images || [])[0] || '', r.name, '', '200px') +
              '<div><h3>' + esc(r.name) + '</h3><div class="facts"><span>Up to ' + esc(r.maxGuests) + ' guests</span><span>' + esc(r.beds) + '</span></div>' +
              (blocked ? '<div class="na-tag">Not available on these dates</div>' : !fit ? '<div class="na-tag">Too small for ' + guests() + ' guests</div>' : '<div style="color:var(--ink-60);font-size:.9rem;margin-top:4px">' + esc(r.short) + '</div>') + '</div>' +
              '<div class="right">' + (t != null ? '<div><small style="color:var(--ink-40)">' + nights() + ' night' + (nights() > 1 ? 's' : '') + '</small><div class="tot">' + money(t) + '</div><small style="color:var(--ink-40)">' + money(r.price) + ' / night</small></div>' : '<div><div class="tot" style="font-size:1.05rem">Price on request</div></div>') + '<div class="radio"></div></div></div>';
          }).join('') + '</div><div class="wiz-nav"><button class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary" data-next' + (st.room && rs.some(function (r) { return r.id === st.room && +r.maxGuests >= guests() && !blockedFor(r, st.cin, st.cout); }) ? '' : ' disabled') + '>Continue ' + I.arrow + '</button></div></div>';
        $$('.pick-room:not(.na)', w).forEach(function (p) {
          var pickIt = function () { st.room = p.getAttribute('data-id'); $$('.pick-room', w).forEach(function (x) { x.classList.toggle('sel', x === p); x.setAttribute('aria-checked', x === p); }); $('[data-next]', w).disabled = false; summary(); };
          p.addEventListener('click', pickIt); p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickIt(); } });
        });
        $('[data-back]', w).onclick = function () { st.step = 1; draw(); top(); };
        $('[data-next]', w).onclick = function () { st.step = 3; draw(); top(); };
      } else if (st.step === 3) {
        var g = st.guest;
        w.innerHTML = '<form class="panel rv" novalidate><h2>Your details</h2><p class="sub">We’ll send your confirmation on WhatsApp.</p><div class="fgrid">' +
          fld('name', 'Full name', 'text', g.name, 'name', true, 'Please enter your name') + fld('phone', 'WhatsApp / phone number', 'tel', g.phone, 'tel', true, 'Please enter a phone number we can reach') +
          fld('email', 'Email (optional)', 'email', g.email, 'email', false, 'Please check the email address') +
          '<div class="field"><label for="f-arr">Estimated arrival time</label><select id="f-arr" name="arrival"><option value="">I don’t know yet</option>' + ['Morning (8–12)', 'Afternoon (12–17)', 'Evening (17–22)', 'Late night (after 22)'].map(function (o) { return '<option' + (g.arrival === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>' +
          '<div class="field full"><label for="f-msg">Special requests (optional)</label><textarea id="f-msg" name="message" rows="3" placeholder="Airport pickup, early check-in, extra bed…">' + esc(g.message || '') + '</textarea></div></div>' +
          '<div class="wiz-nav"><button type="button" class="btn btn-ghost" data-back>Back</button><button type="submit" class="btn btn-primary">Confirm booking request ' + I.arrow + '</button></div>' +
          '<p style="color:var(--ink-40);font-size:.85rem;margin-top:14px">No payment now. Your booking is confirmed once our team replies on WhatsApp.</p></form>';
        var form = $('form', w);
        $('[data-back]', w).onclick = function () { save(); st.step = 2; draw(); top(); };
        form.addEventListener('submit', function (e) {
          e.preventDefault(); save();
          var ok = true;
          [['name', function (v) { return v.trim().length > 1; }], ['phone', function (v) { return v.replace(/\D/g, '').length >= 8; }], ['email', function (v) { return !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }]].forEach(function (c) {
            var el = $('[name=' + c[0] + ']', form), good = c[1](el.value); el.closest('.field').classList.toggle('bad', !good); if (!good && ok) { el.focus(); ok = false; }
          });
          if (ok) submit($('button[type=submit]', form));
        });
        function save() { $$('input,select,textarea', form).forEach(function (el) { st.guest[el.name] = el.value; }); }
      } else if (st.step === 4) {
        var r = room(), t = total(r), msg = waText();
        w.innerHTML = '<div class="panel done-card rv"><div class="ok">' + I.check + '</div><h2>Request received!</h2><p class="sub" style="margin:8px auto 0;max-width:440px">Thank you, ' + esc((st.guest.name || '').split(' ')[0]) + '. Please send it to us on WhatsApp so our team can confirm right away.</p>' +
          '<div class="code">' + esc(st.code) + '</div><div style="color:var(--ink-40);font-size:.85rem">Your booking code</div>' +
          '<div class="btns"><a class="btn btn-wa" href="' + esc(wa(msg)) + '" target="_blank" rel="noopener">' + I.wa + ' Send on WhatsApp</a><a class="btn btn-ghost" href="/">Back to home</a></div></div>';
        $$('.steps li', main).forEach(function (li) { li.className = 'done'; });
      }
      reveal();
    }
    function fld(n, label, type, val, ac, req, err) {
      return '<div class="field"><label for="f-' + n + '">' + label + '</label><input id="f-' + n + '" name="' + n + '" type="' + type + '" autocomplete="' + ac + '"' + (req ? ' required' : '') + ' value="' + esc(val || '') + '"' + (type === 'tel' ? ' inputmode="tel" placeholder="+20 …"' : '') + '><span class="err">' + err + '</span></div>';
    }
    function waText() {
      var r = room(), t = total(r), g = st.guest;
      return ['Hello CALMA Hotel, I booked on your website.', 'Booking code: ' + st.code, 'Room: ' + (r ? r.name : '-'), 'Check-in: ' + st.cin, 'Check-out: ' + st.cout + ' (' + nights() + ' nights)',
        'Guests: ' + st.ad + ' adults' + (st.ch ? ', ' + st.ch + ' children' : ''), t != null ? 'Total: ' + money(t) : '', 'Name: ' + (g.name || ''), 'Phone: ' + (g.phone || ''), g.email ? 'Email: ' + g.email : '', g.arrival ? 'Arrival: ' + g.arrival : '', g.message ? 'Notes: ' + g.message : ''].filter(Boolean).join('\n');
    }
    function submit(btn) {
      var r = room(), t = total(r), g = st.guest;
      btn.disabled = true; btn.textContent = 'Sending…';
      var payload = { action: 'book', name: g.name, phone: g.phone, email: g.email, checkin: st.cin, checkout: st.cout, nights: nights(), room: r ? r.name : '', roomId: st.room, adults: st.ad, children: st.ch, guests: guests(), total: t, currency: C.settings.currency, arrival: g.arrival, message: g.message, source: 'Website booking', page: location.href };
      var fallback = 'WEB-' + Date.now().toString(36).toUpperCase().slice(-6);
      var done = function (code) { st.code = code || fallback; st.step = 4; draw(); top(); };
      if (!CALMA_BOOKING_ENDPOINT) return done();
      var timer = setTimeout(function () { done(); }, 12000);
      fetch(CALMA_BOOKING_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
        .then(function (res) { return res.json(); })
        .then(function (j) { clearTimeout(timer); if (st.step !== 4) done(j && j.code); })
        .catch(function () {
          // The request was sent, but the reply could not be read (or the network failed).
          // Never re-send (that would duplicate the booking) — the WhatsApp message carries every detail anyway.
          clearTimeout(timer); if (st.step !== 4) done();
        });
    }
    function top() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
