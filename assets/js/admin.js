/* =========================================================
   CALMA HOTEL — Admin panel (Arabic)
   Rooms & prices, photos, gallery, journeys, settings, FAQ and bookings.
   Talks to the same Google Apps Script web app as the website.
   Local preview without the backend: /admin/?demo=1 (on localhost only)
   ========================================================= */
var CALMA_BOOKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAoC2XdxfzsTwxkHQHuEFzgi62aoHPKXb7yqxm8YVemgIRrK2QnzyNlC74FsshJhDL/exec';

(function () {
  'use strict';
  var TOKEN_KEY = 'calma_admin_token', SITE_CACHE = 'calma_content_v2';
  var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /demo=1/.test(location.search);
  var C = null, saved = '', tab = 'bookings', openItem = {}, LIB = [], BOOKINGS = null;
  var app = document.getElementById('app');

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function thumb(src) { if (/googleusercontent\.com\/d\//.test(src)) return src.replace(/=w\d+$/, '') + '=w400'; return src; }
  function toast(msg, err) { var t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(t._h); t._h = setTimeout(function () { t.className = 'toast'; }, 2600); }
  function dirty() { return C && JSON.stringify(C) !== saved; }
  function markDirty() { var d = $('#dirty'); if (d) d.classList.toggle('hidden', !dirty()); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item-' + Date.now().toString(36); }

  /* ---------------- API ---------------- */
  function api(payload) {
    if (DEMO) return demoApi(payload);
    payload.token = localStorage.getItem(TOKEN_KEY) || '';
    return fetch(CALMA_BOOKING_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.message === 'not-authorised') { localStorage.removeItem(TOKEN_KEY); login('انتهت الجلسة، سجّل الدخول مرة تانية.'); throw new Error('auth'); } return j; });
  }
  function demoApi(p) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (p.action === 'login') return res(p.password === 'calma2026' ? { status: 'ok', token: 'demo' } : { status: 'error', message: 'wrong-password' });
        if (p.action === 'saveContent') { localStorage.setItem('demo_content', JSON.stringify(p.content)); return res({ status: 'ok' }); }
        if (p.action === 'uploadImage') return res({ status: 'ok', url: p.data });
        if (p.action === 'listBookings') return res({ status: 'ok', rows: demoBookings() });
        if (p.action === 'updateBooking') return res({ status: 'ok' });
        if (p.action === 'changePassword') return res({ status: 'ok' });
        res({ status: 'error' });
      }, 250);
    });
  }
  function demoBookings() {
    var k = JSON.parse(localStorage.getItem('demo_bookings') || 'null'); if (k) return k;
    var names = ['Sara Mostafa', 'John Smith', 'Ahmed Ali', 'Lena Weber', 'Omar Hassan', 'Maria Rossi', 'Youssef Adel', 'Emma Brown', 'Karim Nabil', 'Aya Samir'];
    var rooms = [['deluxe-double', 'Deluxe Double Room', 1800], ['triple', 'Triple Room', 2400], ['single', 'Single Room', 1200], ['family', 'Family Room', 3000], ['classic-twin', 'Classic Twin Room', 1800]];
    var st = ['Confirmed', 'Confirmed', 'Completed', 'Completed', 'New', 'Cancelled', 'Checked-in'], plans = ['Flexible rate', 'Flexible rate', 'Non-refundable'], out = [], seed = 7;
    var rnd = function (n) { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
    var base = new Date(); base.setDate(base.getDate() - 150);
    for (var i = 0; i < 70; i++) {
      var r = rooms[rnd(5)], ci = new Date(base.getTime() + rnd(190) * 864e5), n = 1 + rnd(5), co = new Date(ci.getTime() + n * 864e5), bk = new Date(ci.getTime() - (2 + rnd(40)) * 864e5);
      var pl = plans[rnd(3)], promo = rnd(4) === 0 ? 'Early booker deal' : '', tot = r[2] * n * (pl === 'Non-refundable' ? .9 : 1), disc = promo ? Math.round(tot * .1) : 0;
      var s = ci > new Date() ? (rnd(3) ? 'Confirmed' : 'New') : st[rnd(7)];
      out.push({ _row: i + 2, 'Booking Code': 'CLM-' + ('0000' + (i + 1)).slice(-5), Timestamp: bk.getDate() + '/' + (bk.getMonth() + 1) + '/' + bk.getFullYear() + ' 12:00', 'Full Name': names[rnd(10)], Phone: '+20 100 000 ' + (1000 + i), Email: '', 'Room Type': r[1], 'Room ID': r[0], 'Check-in': ci.toISOString().slice(0, 10), 'Check-out': co.toISOString().slice(0, 10), Nights: String(n), Adults: '2', Children: '0', Total: 'EGP ' + (tot - disc), Status: s, Message: '', Arrival: '', 'Rate Plan': pl, Promotion: promo, Discount: disc ? String(disc) : '' });
    }
    return out.reverse();
  }
  function loadContent() {
    var local = fetch('/data/content.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
    if (DEMO) { var d = localStorage.getItem('demo_content'); return d ? Promise.resolve(JSON.parse(d)) : local; }
    return fetch(CALMA_BOOKING_ENDPOINT + '?action=content&t=' + Date.now()).then(function (r) { return r.json(); })
      .then(function (j) { return j && j.content && j.content.rooms ? j.content : local; }).catch(function () { return local; });
  }

  /* ---------------- login ---------------- */
  function login(msg) {
    app.innerHTML = '<div class="login"><form><div style="display:flex;gap:10px;align-items:center"><img src="/assets/img/logo-mark.svg" width="38" height="38" alt=""><h1>لوحة تحكم كالما</h1></div><p>' + esc(msg || 'من هنا تقدر تغيّر الأسعار والصور والغرف وتتابع الحجوزات.') + '</p>' +
      '<div class="f"><label for="pw">كلمة السر</label><input id="pw" type="password" autocomplete="current-password" required dir="ltr"></div><button class="btn pri" type="submit">دخول</button>' +
      (DEMO ? '<small style="color:var(--muted)">وضع تجربة: كلمة السر calma2026</small>' : '') + '</form></div>';
    $('#pw').focus();
    $('form', app).onsubmit = function (e) {
      e.preventDefault(); var b = $('button', app); b.disabled = true; b.textContent = 'جاري الدخول…';
      api({ action: 'login', password: $('#pw').value }).then(function (j) {
        if (j.status === 'ok' && j.token) { localStorage.setItem(TOKEN_KEY, j.token); start(); }
        else if (j.status === 'ok') { b.disabled = false; b.textContent = 'دخول'; $('p', app).innerHTML = '<b style="color:var(--bad)">' + 'السيرفر (Google Apps Script) لسه على النسخة القديمة، فالحجوزات مش هتظهر هنا والتعديلات مش هتتحفظ. الصق Code.gs الجديد واعمل Deploy ▸ Manage deployments ▸ Edit ▸ New version — الخطوات في SETUP-GUIDE.md.' + '</b>'; }
        else { b.disabled = false; b.textContent = 'دخول'; toast('كلمة السر غلط', true); }
      }).catch(function () { b.disabled = false; b.textContent = 'دخول'; toast('مفيش اتصال بالسيرفر', true); });
    };
  }

  /* ---------------- shell ---------------- */
  var TABS = [['bookings', 'الحجوزات'], ['reports', 'التقارير'], ['rooms', 'الغرف'], ['pricing', 'الأسعار والعروض'], ['gallery', 'معرض الصور'], ['journeys', 'الرحلات'], ['texts', 'المميزات والأسئلة'], ['settings', 'الإعدادات']];
  function start() {
    app.innerHTML = '<div class="empty">جاري التحميل…</div>';
    Promise.all([loadContent(), fetch('/data/images.json').then(function (r) { return r.json(); }).catch(function () { return []; })]).then(function (r) {
      C = r[0]; saved = JSON.stringify(C); LIB = r[1];
      C.rooms = C.rooms || []; C.gallery = C.gallery || []; C.journeys = C.journeys || []; C.faq = C.faq || []; C.amenities = C.amenities || []; C.reviews = C.reviews || []; C.policies = C.policies || []; C.settings.taxes = C.settings.taxes || [];
      app.innerHTML = '<div class="top"><div class="in"><h1><img src="/assets/img/logo-mark.svg" width="28" height="28" alt=""> لوحة تحكم <span>CALMA</span></h1>' +
        '<span id="dirty" class="dirty hidden">● في تعديلات لسه متنشرتش</span><button class="btn gold" id="save">حفظ ونشر على الموقع</button><a class="btn" href="/" target="_blank" rel="noopener">فتح الموقع</a><button class="btn" id="logout">خروج</button></div>' +
        '<nav class="tabs">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav></div><main id="view"></main>';
      $$('.tabs button').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-t'); draw(); }; });
      $('#save').onclick = save;
      $('#logout').onclick = function () { if (dirty() && !confirm('في تعديلات مش محفوظة. تخرج برضه؟')) return; localStorage.removeItem(TOKEN_KEY); login(); };
      window.addEventListener('beforeunload', function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
      document.addEventListener('input', markDirty); document.addEventListener('change', markDirty);
      draw();
    });
  }
  function save() {
    var b = $('#save'); b.disabled = true; b.textContent = 'جاري الحفظ…';
    api({ action: 'saveContent', content: C }).then(function (j) {
      b.disabled = false; b.textContent = 'حفظ ونشر على الموقع';
      if (j.status === 'ok' && !j.updatedAt) return toast('ماتحفظش — السيرفر لسه على النسخة القديمة (شوف SETUP-GUIDE)', true);
      if (j.status === 'ok') { saved = JSON.stringify(C); markDirty(); try { localStorage.setItem(SITE_CACHE, saved); } catch (e) { } toast('اتنشر على الموقع ✓'); }
      else toast('الحفظ فشل: ' + (j.message || ''), true);
    }).catch(function (e) { b.disabled = false; b.textContent = 'حفظ ونشر على الموقع'; if (e.message !== 'auth') toast('مفيش اتصال — جرّب تاني', true); });
  }
  function draw() {
    $$('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
    var v = $('#view');
    ({ bookings: vBookings, reports: vReports, pricing: vPricing, rooms: vRooms, gallery: vGallery, journeys: vJourneys, texts: vTexts, settings: vSettings })[tab](v);
    markDirty();
  }

  /* ---------------- generic field binding ---------------- */
  // data-bind="rooms.0.price"  → reads/writes C.rooms[0].price
  function getPath(p) { return p.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, C); }
  function setPath(p, val) { var ks = p.split('.'), o = C; for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val; }
  function bind(root) {
    $$('[data-bind]', root).forEach(function (el) {
      var p = el.getAttribute('data-bind'), kind = el.getAttribute('data-kind');
      var v = getPath(p);
      if (el.type === 'checkbox') el.checked = v !== false; else el.value = kind === 'list' ? (v || []).join('، ') : (v == null ? '' : v);
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', function () {
        var nv = el.type === 'checkbox' ? el.checked : el.value;
        if (kind === 'num') nv = nv === '' ? null : Number(nv);
        if (kind === 'list') nv = nv.split(/[،,\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
        setPath(p, nv); markDirty();
        var live = el.getAttribute('data-live'); if (live) { var t = $(live); if (t) t.textContent = el.value; }
      });
    });
  }
  function fld(label, path, o) {
    o = o || {};
    var inp = o.area ? '<textarea dir="auto" rows="' + (o.rows || 3) + '" data-bind="' + path + '"' + (o.kind ? ' data-kind="' + o.kind + '"' : '') + '></textarea>'
      : '<input type="' + (o.type || 'text') + '" data-bind="' + path + '"' + (o.kind ? ' data-kind="' + o.kind + '"' : '') + (o.ltr ? ' dir="ltr"' : ' dir="auto"') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.live ? ' data-live="' + o.live + '"' : '') + (o.min != null ? ' min="' + o.min + '"' : '') + '>';
    return '<div class="f' + (o.full ? ' full' : '') + '"><label>' + label + '</label>' + inp + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</div>';
  }

  /* ---------------- photo manager ---------------- */
  // list = array of image URLs (rooms) — rendered as sortable thumbnails
  function photosHTML(path, single) {
    var list = single ? [getPath(path)].filter(Boolean) : (getPath(path) || []);
    return '<div class="photos" data-photos="' + path + '"' + (single ? ' data-single="1"' : '') + '>' + list.map(function (s, i) {
      return '<div class="ph"><img src="' + esc(thumb(s)) + '" alt="" loading="lazy">' + (i === 0 && !single ? '<span class="cover">الغلاف</span>' : '') +
        '<div class="ctl">' + (single ? '' : '<button title="قدّم" data-mv="-1" data-i="' + i + '">→</button><button title="أخّر" data-mv="1" data-i="' + i + '">←</button>') + '<button class="del" title="امسح" data-del="' + i + '">✕</button></div></div>';
    }).join('') + (single && list.length ? '' : '<label class="add-ph">＋ ارفع صور من جهازك<input type="file" accept="image/*"' + (single ? '' : ' multiple') + ' hidden></label><button type="button" class="add-ph" data-lib>اختار من صور الموقع</button>') + '</div>';
  }
  function wirePhotos(root, rerender) {
    $$('[data-photos]', root).forEach(function (box) {
      var path = box.getAttribute('data-photos'), single = box.hasAttribute('data-single');
      var arr = function () { return single ? [getPath(path)].filter(Boolean) : getPath(path); };
      var put = function (a) { if (single) setPath(path, a[0] || ''); else setPath(path, a); markDirty(); rerender(); };
      $$('[data-mv]', box).forEach(function (b) { b.onclick = function () { var a = arr().slice(), i = +b.getAttribute('data-i'), j = i + +b.getAttribute('data-mv'); if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; put(a); }; });
      $$('[data-del]', box).forEach(function (b) { b.onclick = function () { if (!confirm('تمسح الصورة دي؟')) return; var a = arr().slice(); a.splice(+b.getAttribute('data-del'), 1); put(a); }; });
      var file = $('input[type=file]', box);
      if (file) file.onchange = function () { upload(Array.prototype.slice.call(file.files), function (urls) { put(single ? urls.slice(0, 1) : arr().concat(urls)); }); };
      var lb = $('[data-lib]', box);
      if (lb) lb.onclick = function () { library(single, function (urls) { put(single ? urls.slice(0, 1) : arr().concat(urls)); }); };
    });
  }
  function resize(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () {
          var M = 1600, k = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = rej; im.src = r.result;
      };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function upload(files, done) {
    if (!files.length) return;
    var urls = [], n = 0;
    toast('جاري رفع ' + files.length + ' صورة…');
    (function next() {
      if (n >= files.length) { toast('اترفعت ' + urls.length + ' صورة ✓ — متنساش تدوس "حفظ ونشر"'); return done(urls); }
      var f = files[n++];
      resize(f).then(function (data) { return api({ action: 'uploadImage', name: f.name, mime: 'image/jpeg', data: data }); })
        .then(function (j) { if (j.status === 'ok') urls.push(j.url); else toast('صورة فشلت: ' + f.name, true); toast('اترفع ' + n + ' من ' + files.length); next(); })
        .catch(function () { toast('صورة فشلت: ' + f.name, true); next(); });
    })();
  }
  function allImages() {
    var set = [];
    var add = function (s) { if (s && set.indexOf(s) < 0) set.push(s); };
    LIB.forEach(add); (C.rooms || []).forEach(function (r) { (r.images || []).forEach(add); }); (C.gallery || []).forEach(function (g) { add(g.src); });
    (C.journeys || []).forEach(function (j) { add(j.image); }); (C.settings.heroImages || []).forEach(add);
    return set;
  }
  function library(single, done) {
    var imgs = allImages(), sel = [];
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="box"><div class="row"><h2>صور الموقع</h2><span class="sp"></span><button class="btn" data-x>إلغاء</button><button class="btn pri" data-ok>إضافة المختار</button></div><p class="hint">' + (single ? 'اختار صورة واحدة.' : 'اختار صورة أو أكتر، وبعدين دوس "إضافة المختار".') + '</p><div class="lib">' +
      imgs.map(function (s, i) { return '<button data-i="' + i + '"><img src="' + esc(thumb(s)) + '" alt="" loading="lazy"></button>'; }).join('') + '</div></div>';
    document.body.appendChild(m);
    $$('.lib button', m).forEach(function (b) { b.onclick = function () { var s = imgs[+b.getAttribute('data-i')]; if (single) { sel = [s]; $$('.lib button', m).forEach(function (x) { x.classList.remove('sel'); }); } else { var k = sel.indexOf(s); if (k >= 0) sel.splice(k, 1); else sel.push(s); } b.classList.toggle('sel', sel.indexOf(s) >= 0); }; });
    $('[data-x]', m).onclick = function () { m.remove(); };
    $('[data-ok]', m).onclick = function () { m.remove(); if (sel.length) done(sel); };
  }

  /* ---------------- BOOKINGS ---------------- */
  var ST = { New: 'جديد', Confirmed: 'مؤكد', 'Checked-in': 'وصل', Completed: 'خلص', Cancelled: 'ملغي', 'No-show': 'محضرش' };
  var bFilter = 'all', bQuery = '';
  function vBookings(v) {
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>الحجوزات</h2><span class="sp"></span><button class="btn" id="reload">تحديث</button></div><p class="hint">كل حجز من الموقع بيوصل هنا وفي الشيت وعلى الإيميل. غيّر الحالة من القائمة، ودوس على رقم الضيف علشان تكلمه واتساب.</p><div id="blist"><div class="empty">جاري تحميل الحجوزات…</div></div>';
    $('#reload').onclick = function () { BOOKINGS = null; vBookings(v); };
    var go = function () {
      var rows = BOOKINGS || [], todayStr = new Date().toISOString().slice(0, 10);
      var cnt = function (s) { return rows.filter(function (r) { return r.Status === s; }).length; };
      var upcoming = rows.filter(function (r) { return r['Check-in'] >= todayStr && r.Status !== 'Cancelled'; }).length;
      var list = rows.filter(function (r) { return (bFilter === 'all' || r.Status === bFilter) && (!bQuery || JSON.stringify(r).toLowerCase().indexOf(bQuery.toLowerCase()) >= 0); });
      $('#blist').innerHTML = '<div class="stats"><div class="stat"><b>' + cnt('New') + '</b><span>محتاجين تأكيد</span></div><div class="stat"><b>' + cnt('Confirmed') + '</b><span>مؤكدين</span></div><div class="stat"><b>' + upcoming + '</b><span>وصول قادم</span></div><div class="stat"><b>' + rows.length + '</b><span>آخر 300 حجز</span></div></div>' +
        '<div class="row" style="margin-bottom:12px"><input class="inp" id="bq" placeholder="ابحث بالاسم أو الرقم أو الكود…" style="max-width:320px" value="' + esc(bQuery) + '"><select class="inp" id="bf" style="max-width:180px"><option value="all">كل الحالات</option>' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (bFilter === k ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></div>' +
        (list.length ? '<table><thead><tr><th>الكود</th><th>الضيف</th><th>الغرفة</th><th>التواريخ</th><th>الإجمالي</th><th>ملاحظات</th><th>الحالة</th></tr></thead><tbody>' + list.map(function (r) {
          var ph = String(r.Phone || '').replace(/[^\d]/g, '');
          return '<tr><td><b dir="ltr">' + esc(r['Booking Code']) + '</b><span class="muted">' + esc(r.Timestamp) + '</span></td>' +
            '<td><b>' + esc(r['Full Name']) + '</b><span class="muted"><a dir="ltr" href="https://wa.me/' + ph + '?text=' + encodeURIComponent('Hello ' + (r['Full Name'] || '') + ', this is CALMA Hotel about your booking ' + (r['Booking Code'] || '') + '.') + '" target="_blank" rel="noopener">' + esc(r.Phone) + '</a></span>' + (r.Email ? '<span class="muted" dir="ltr">' + esc(r.Email) + '</span>' : '') + '</td>' +
            '<td>' + esc(r['Room Type']) + '<span class="muted">' + esc(r.Adults || r.Guests || '') + (r.Adults ? ' بالغ' : ' ضيف') + (+r.Children ? ' + ' + esc(r.Children) + ' طفل' : '') + '</span></td>' +
            '<td dir="ltr" style="text-align:right">' + esc(r['Check-in']) + ' → ' + esc(r['Check-out']) + '<span class="muted">' + esc(r.Nights || '') + (r.Nights ? ' ليالي' : '') + '</span></td>' +
            '<td>' + esc(r.Total || '—') + (r['Rate Plan'] ? '<span class="muted">' + esc(r['Rate Plan']) + '</span>' : '') + (r.Promotion ? '<span class="muted">🏷 ' + esc(r.Promotion) + '</span>' : '') + '</td><td>' + esc(r.Message || '') + (r.Arrival ? '<span class="muted">الوصول: ' + esc(r.Arrival) + '</span>' : '') + '</td>' +
            '<td><select class="st ' + esc(r.Status) + '" data-row="' + r._row + '">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (r.Status === k ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty card">مفيش حجوزات هنا.</div>');
      $('#bq').oninput = function () { bQuery = this.value; var pos = this.selectionStart; go(); var q = $('#bq'); q.focus(); q.setSelectionRange(pos, pos); };
      $('#bf').onchange = function () { bFilter = this.value; go(); };
      $$('select[data-row]').forEach(function (s) {
        s.onchange = function () {
          var row = +s.getAttribute('data-row'), val = s.value; s.className = 'st ' + val;
          api({ action: 'updateBooking', row: row, status: val }).then(function (j) { if (j.status === 'ok') { BOOKINGS.forEach(function (r) { if (r._row === row) r.Status = val; }); toast('الحالة اتغيرت ✓'); } else toast('ماتغيرتش', true); });
        };
      });
    };
    if (BOOKINGS) return go();
    api({ action: 'listBookings' }).then(function (j) { if (!Array.isArray(j.rows)) { $('#blist').innerHTML = '<div class="empty card" style="color:var(--bad)">' + (j.status === 'error' ? 'السيرفر رجّع خطأ: ' + esc(j.message || '') : 'السيرفر (Google Apps Script) لسه على النسخة القديمة، فالحجوزات مش هتظهر هنا والتعديلات مش هتتحفظ. الصق Code.gs الجديد واعمل Deploy ▸ Manage deployments ▸ Edit ▸ New version — الخطوات في SETUP-GUIDE.md.') + '</div>'; return; } BOOKINGS = j.rows; go(); }).catch(function (e) { if (e.message !== 'auth') $('#blist').innerHTML = '<div class="empty card">مقدرناش نجيب الحجوزات — اتأكد من النت ودوس تحديث.</div>'; });
  }

  /* ---------------- ROOMS ---------------- */
  function vRooms(v) {
    var cur = C.settings.currency || 'EGP';
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>الغرف والأسعار</h2><span class="sp"></span><button class="btn pri" id="addRoom">＋ غرفة جديدة</button></div>' +
      '<p class="hint">غيّر السعر أو الصور أو الوصف، وبعدين دوس <b>حفظ ونشر على الموقع</b> فوق. أول صورة هي الغلاف. لو سبت السعر فاضي هيظهر "السعر عند الطلب".</p>' +
      C.rooms.map(function (r, i) {
        var o = openItem['r' + i], p = 'rooms.' + i;
        return '<div class="item"><div class="item-h" data-open="r' + i + '"><img src="' + esc(thumb((r.images || [])[0] || '')) + '" alt=""><div class="t"><b id="rt' + i + '">' + esc(r.name) + '</b><span>' + (r.price ? esc(cur) + ' ' + esc(r.price) + ' / الليلة' : 'السعر عند الطلب') + ' · حتى ' + esc(r.maxGuests) + ' أفراد · ' + (r.inventory != null && r.inventory !== '' ? r.inventory + ' غرف · ' : '') + (r.images || []).length + ' صور</span></div>' +
          (r.visible === false ? '<span class="tag off">مخفية</span>' : '<span class="tag">ظاهرة</span>') +
          '<button class="btn sm" data-up="' + i + '" title="لفوق">▲</button><button class="btn sm" data-down="' + i + '" title="لتحت">▼</button><span>' + (o ? '▾' : '◂') + '</span></div>' +
          (o ? '<div class="item-b"><div class="grid3">' + fld('اسم الغرفة (إنجليزي)', p + '.name', { live: '#rt' + i }) + fld('النوع (يظهر صغير فوق الاسم)', p + '.category', { ph: 'Double' }) + fld('السرير', p + '.beds', { ph: '1 double bed' }) + fld('الإطلالة (اختياري)', p + '.view', { ph: 'Street view — window or balcony' }) +
            fld('سعر الليلة (' + esc(cur) + ')', p + '.price', { type: 'number', kind: 'num', min: 0, hint: 'السعر العادي — المواسم والتقويم بيغيّروه' }) + fld('سعر Booking.com (اختياري)', p + '.otaPrice', { type: 'number', kind: 'num', min: 0, hint: 'يظهر مشطوب جنب سعرك' }) + fld('أقصى عدد أفراد', p + '.maxGuests', { type: 'number', kind: 'num', min: 1 }) +
            fld('المساحة (اختياري)', p + '.size', { ph: '25 m²' }) + fld('عدد الغرف من النوع ده', p + '.inventory', { type: 'number', kind: 'num', min: 0, hint: 'لما يتحجزوا كلهم في يوم، النوع ده يتقفل لوحده' }) + fld('أقل عدد ليالي', p + '.minNights', { type: 'number', kind: 'num', min: 1 }) + fld('أقصى عدد ليالي', p + '.maxNights', { type: 'number', kind: 'num', min: 1 }) + fld('عدد الأفراد الداخلين في السعر', p + '.baseOcc', { type: 'number', kind: 'num', min: 1, hint: 'فاضي = أقصى عدد أفراد' }) + fld('رسوم فرد بالغ زيادة / ليلة', p + '.extraAdult', { type: 'number', kind: 'num', min: 0 }) + fld('رسوم الطفل / ليلة', p + '.childFee', { type: 'number', kind: 'num', min: 0, hint: 'فاضي = الأطفال مجانًا' }) + '<div class="f"><label>الفطار</label><label class="switch"><input type="checkbox" data-bind="' + p + '.breakfast"> الفطار داخل في السعر</label></div>' + '<div class="f"><label>الظهور</label><label class="switch"><input type="checkbox" data-bind="' + p + '.visible"> الغرفة ظاهرة في الموقع</label></div></div>' +
            fld('وصف قصير (سطر واحد على الكارت)', p + '.short', { full: true }) + fld('الوصف الكامل', p + '.description', { area: true, full: true }) +
            fld('المميزات (افصل بينهم بفاصلة)', p + '.amenities', { kind: 'list', area: true, rows: 2, full: true }) +
            '<div class="f full"><label>صور الغرفة</label>' + photosHTML(p + '.images') + '</div>' +
            '<div class="f full ranges"><label>تواريخ مقفولة (الغرفة مش متاحة فيها)</label>' + (r.blocked || []).map(function (b, k) { return '<div class="row"><span>من</span><input type="date" class="inp" style="max-width:170px" data-bind="' + p + '.blocked.' + k + '.from"><span>لحد</span><input type="date" class="inp" style="max-width:170px" data-bind="' + p + '.blocked.' + k + '.to"><button class="btn sm danger" data-unblock="' + k + '" data-room="' + i + '">مسح</button></div>'; }).join('') +
            '<div><button class="btn sm" data-block="' + i + '">＋ اقفل فترة</button></div><small>الضيف مش هيقدر يختار الغرفة دي لو تواريخه داخلة في الفترة.</small></div>' +
            '<div class="row"><span class="sp"></span><button class="btn sm" data-dup="' + i + '">نسخة من الغرفة</button><button class="btn sm danger" data-delroom="' + i + '">مسح الغرفة</button></div></div>' : '') + '</div>';
      }).join('');
    bind(v); wirePhotos(v, function () { vRooms(v); });
    $('#addRoom').onclick = function () { C.rooms.push({ id: 'room-' + Date.now().toString(36), name: 'New Room', category: 'Room', short: '', description: '', beds: '', maxGuests: 2, size: '', price: null, otaPrice: null, amenities: ['Breakfast included', 'Air conditioning', 'Free Wi-Fi', 'Housekeeping', 'Laundry service', '24-hour reception', 'Private bathroom'], view: '', breakfast: true, images: [], visible: false, blocked: [] }); openItem['r' + (C.rooms.length - 1)] = 1; markDirty(); vRooms(v); };
    common(v, 'rooms', 'r', vRooms);
    $$('[data-block]', v).forEach(function (b) { b.onclick = function () { var r = C.rooms[+b.getAttribute('data-block')]; r.blocked = r.blocked || []; var t = new Date().toISOString().slice(0, 10); r.blocked.push({ from: t, to: t }); markDirty(); vRooms(v); }; });
    $$('[data-unblock]', v).forEach(function (b) { b.onclick = function () { C.rooms[+b.getAttribute('data-room')].blocked.splice(+b.getAttribute('data-unblock'), 1); markDirty(); vRooms(v); }; });
    $$('[data-dup]', v).forEach(function (b) { b.onclick = function () { var r = JSON.parse(JSON.stringify(C.rooms[+b.getAttribute('data-dup')])); r.id = slug(r.name) + '-' + Date.now().toString(36).slice(-3); r.name += ' (copy)'; r.visible = false; C.rooms.push(r); markDirty(); vRooms(v); }; });
    $$('[data-delroom]', v).forEach(function (b) { b.onclick = function () { if (!confirm('تمسح الغرفة دي خالص؟ (ممكن بدل كده تخفيها)')) return; C.rooms.splice(+b.getAttribute('data-delroom'), 1); openItem = {}; markDirty(); vRooms(v); }; });
  }
  // open/close + move up/down for list editors
  function common(v, key, pre, redraw) {
    $$('[data-open]', v).forEach(function (h) { h.onclick = function (e) { if (e.target.closest('button')) return; var k = h.getAttribute('data-open'); openItem[k] = !openItem[k]; redraw(v); }; });
    var mv = function (i, d) { var a = C[key], j = i + d; if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; var oi = openItem[pre + i]; openItem[pre + i] = openItem[pre + j]; openItem[pre + j] = oi; markDirty(); redraw(v); };
    $$('[data-up]', v).forEach(function (b) { b.onclick = function () { mv(+b.getAttribute('data-up'), -1); }; });
    $$('[data-down]', v).forEach(function (b) { b.onclick = function () { mv(+b.getAttribute('data-down'), 1); }; });
  }

  /* ---------------- PRICING: calendar · rate plans · seasons · promotions ---------------- */
  var CP = window.CalmaPricing;
  var DOW_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  function todayStr() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function fmt(n) { return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US'); }
  function sha256(text) {
    var b = new TextEncoder().encode(String(text).trim().toUpperCase());
    return crypto.subtle.digest('SHA-256', b).then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  var ACTIVE_ST = ['New', 'Confirmed', 'Checked-in', 'Completed'];
  function roomIdOf(b) { var id = b['Room ID']; if (id) return id; var r = C.rooms.filter(function (x) { return x.name === b['Room Type']; })[0]; return r ? r.id : ''; }
  function bookedMap(rows) {
    var m = {};
    (rows || []).forEach(function (b) {
      if (ACTIVE_ST.indexOf(b.Status) < 0 || !b['Check-in'] || !b['Check-out']) return;
      var id = roomIdOf(b); if (!id) return; m[id] = m[id] || {};
      for (var d = b['Check-in'], i = 0; d < b['Check-out'] && i < 120; d = CP.add(d, 1), i++) m[id][d] = (m[id][d] || 0) + 1;
    });
    return m;
  }
  // checkbox chips that write an array of ids (empty array = applies to all)
  function chips(path, items, allLabel) {
    var cur = getPath(path) || [];
    return '<div class="chips" data-chips="' + path + '">' + items.map(function (it) { return '<label class="chip-c"><input type="checkbox" value="' + esc(it[0]) + '"' + (cur.indexOf(it[0]) >= 0 || (typeof it[0] === 'number' && cur.indexOf(+it[0]) >= 0) ? ' checked' : '') + '>' + esc(it[1]) + '</label>'; }).join('') +
      '<small>' + (cur.length ? '' : allLabel) + '</small></div>';
  }
  function wireChips(root, redraw) {
    $$('[data-chips]', root).forEach(function (box) {
      $$('input', box).forEach(function (cb) {
        cb.onchange = function () {
          var vals = $$('input:checked', box).map(function (x) { return /^\d+$/.test(x.value) && box.hasAttribute('data-num') ? +x.value : x.value; });
          setPath(box.getAttribute('data-chips'), vals); markDirty(); redraw();
        };
      });
    });
  }
  function roomItems() { return C.rooms.map(function (r) { return [r.id, r.name]; }); }
  function dayItems() { return [6, 0, 1, 2, 3, 4, 5].map(function (d) { return [d, DOW_AR[d]]; }); }

  var PS = { tab: 'cal', room: 0, month: todayStr().slice(0, 7), a: null, b: null };
  function vPricing(v) {
    C.ratePlans = C.ratePlans || []; C.seasons = C.seasons || []; C.promos = C.promos || [];
    var T = [['cal', 'تقويم الأسعار'], ['plans', 'خطط الأسعار (Rate plans)'], ['seasons', 'المواسم والأيام الخاصة'], ['promos', 'العروض والكوبونات']];
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>الأسعار والعروض</h2></div><div class="subtabs">' + T.map(function (t) { return '<button data-pt="' + t[0] + '"' + (PS.tab === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div><div id="pv"></div>';
    $$('[data-pt]', v).forEach(function (b) { b.onclick = function () { PS.tab = b.getAttribute('data-pt'); openItem = {}; vPricing(v); }; });
    var pv = $('#pv', v), re = function () { vPricing(v); };
    ({ cal: pCalendar, plans: pPlans, seasons: pSeasons, promos: pPromos })[PS.tab](pv, re);
  }

  /* --- calendar --- */
  function pCalendar(pv, re) {
    if (!C.rooms.length) { pv.innerHTML = '<div class="empty card">ضيف غرفة الأول.</div>'; return; }
    if (PS.room >= C.rooms.length) PS.room = 0;
    var r = C.rooms[PS.room], cur = C.settings.currency || 'EGP', today = todayStr();
    var y = +PS.month.slice(0, 4), m = +PS.month.slice(5, 7), first = PS.month + '-01';
    var dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), off = (CP.dow(first) + 1) % 7; // week starts Saturday
    var booked = bookedMap(BOOKINGS), inv = r.inventory != null && r.inventory !== '' ? +r.inventory : null;
    var a = PS.a, b = PS.b || PS.a;
    var cells = '';
    for (var i = 0; i < off; i++) cells += '<div class="cd blank"></div>';
    for (var dd = 1; dd <= dim; dd++) {
      var d = PS.month + '-' + ('0' + dd).slice(-2), p = CP.nightly(C, r, d), isOv = r.rates && r.rates[d] != null && r.rates[d] !== '';
      var cls = 'cd' + (d < today ? ' past' : '') + (isOv ? ' ov' : (p != null && +r.price && p !== +r.price ? ' ss' : '')) + (CP.closed(r, d) ? ' cl' : '') + (r.cta && r.cta[d] ? ' cta' : '') + (r.ctd && r.ctd[d] ? ' ctd' : '') + (a && d >= a && d <= b ? ' sel' : '') + (d === today ? ' td' : '');
      var bk = booked[r.id] && booked[r.id][d] || 0;
      cells += '<button class="' + cls + '" data-d="' + d + '"><b>' + dd + '</b><span class="pr">' + (CP.closed(r, d) ? 'مقفول' : p == null ? '—' : fmt(p)) + '</span>' + (r.cta && r.cta[d] ? '<em class="rx">⛔ وصول</em>' : '') + (r.ctd && r.ctd[d] ? '<em class="rx">⛔ مغادرة</em>' : '') + (inv != null ? '<span class="bk' + (bk >= inv ? ' full' : '') + '">' + bk + '/' + inv + '</span>' : (bk ? '<span class="bk">' + bk + ' حجز</span>' : '')) + '</button>';
    }
    var mName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var nSel = a ? CP.nights(a, b) + 1 : 0;
    pv.innerHTML = '<p class="hint">اختار الغرفة والشهر. دوس على يوم، وبعدين على يوم تاني علشان تختار فترة — وبعدها حط سعر خاص للفترة أو اقفلها. الأسعار هنا قبل خصم خطة السعر والعروض.</p>' +
      '<div class="card"><div class="row" style="margin-bottom:14px"><select class="inp" id="calRoom" style="max-width:260px">' + C.rooms.map(function (x, i) { return '<option value="' + i + '"' + (i === PS.room ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
      '<span class="sp"></span><button class="btn sm" id="mPrev">→ الشهر اللي فات</button><b style="min-width:130px;text-align:center">' + mName + '</b><button class="btn sm" id="mNext">الشهر الجاي ←</button></div>' +
      '<div class="cal-h">' + [6, 0, 1, 2, 3, 4, 5].map(function (x) { return '<span>' + DOW_AR[x] + '</span>'; }).join('') + '</div><div class="cal">' + cells + '</div>' +
      '<div class="legend"><span><i class="lg-base"></i>السعر العادي (' + (r.price ? esc(cur) + ' ' + fmt(r.price) : 'مش متحدد') + ')</span><span><i class="lg-ss"></i>سعر موسم</span><span><i class="lg-ov"></i>سعر خاص لليوم</span><span><i class="lg-cl"></i>مقفول</span><span>⛔ ممنوع الوصول أو المغادرة في اليوم ده</span>' + (inv != null ? '<span>محجوز / عدد الغرف</span>' : '<span>حدد "عدد الغرف" في تاب الغرف علشان تشوف المتاح</span>') + '</div></div>' +
      (a ? '<div class="card selbar"><div class="row"><b>الفترة: <span dir="ltr">' + a + (b !== a ? ' → ' + b : '') + '</span> (' + nSel + ' يوم)</b><span class="sp"></span><button class="btn sm" id="selX">إلغاء الاختيار</button></div>' +
        '<div class="row" style="margin-top:12px"><input class="inp" id="selP" type="number" min="0" placeholder="السعر لليلة (' + esc(cur) + ')" style="max-width:200px"><button class="btn pri" id="setP">حط السعر ده</button><button class="btn" id="clrP">رجّع للسعر العادي</button><button class="btn danger" id="cls">اقفل الأيام دي</button><button class="btn" id="opn">افتح الأيام دي</button>' +
        '<label class="switch"><input type="checkbox" id="allR"> على كل الغرف</label></div>' +
        '<div class="row" style="margin-top:10px"><span style="color:var(--muted);font-size:.88rem">قيود زي Booking:</span><button class="btn sm" data-rx="cta:1">ممنوع الوصول</button><button class="btn sm" data-rx="cta:0">اسمح بالوصول</button><button class="btn sm" data-rx="ctd:1">ممنوع المغادرة</button><button class="btn sm" data-rx="ctd:0">اسمح بالمغادرة</button></div></div>' : '');
    $('#calRoom').onchange = function () { PS.room = +this.value; re(); };
    var shift = function (k) { var dt = new Date(Date.UTC(y, m - 1 + k, 1)); PS.month = dt.toISOString().slice(0, 7); re(); };
    $('#mPrev').onclick = function () { shift(-1); }; $('#mNext').onclick = function () { shift(1); };
    $$('.cd[data-d]', pv).forEach(function (c) {
      c.onclick = function () { var d = c.getAttribute('data-d'); if (!PS.a || PS.b) { PS.a = d; PS.b = null; } else if (d < PS.a) { PS.b = PS.a; PS.a = d; } else PS.b = d; re(); };
    });
    if (!a) return;
    var range = []; for (var d2 = a; d2 <= b; d2 = CP.add(d2, 1)) range.push(d2);
    var targets = function () { return $('#allR').checked ? C.rooms : [r]; };
    $('#selX').onclick = function () { PS.a = PS.b = null; re(); };
    $('#setP').onclick = function () { var val = +$('#selP').value; if (!(val > 0)) return toast('اكتب السعر', true); targets().forEach(function (x) { x.rates = x.rates || {}; range.forEach(function (d) { x.rates[d] = val; }); }); markDirty(); toast('اتحط السعر — متنساش "حفظ ونشر"'); re(); };
    $('#clrP').onclick = function () { targets().forEach(function (x) { if (x.rates) range.forEach(function (d) { delete x.rates[d]; }); }); markDirty(); re(); };
    $('#cls').onclick = function () { targets().forEach(function (x) { setClosed(x, range, true); }); markDirty(); re(); };
    $('#opn').onclick = function () { targets().forEach(function (x) { setClosed(x, range, false); }); markDirty(); re(); };
    $$('[data-rx]', pv).forEach(function (bt) { bt.onclick = function () { var k = bt.getAttribute('data-rx').split(':'); targets().forEach(function (x) { x[k[0]] = x[k[0]] || {}; range.forEach(function (d) { if (k[1] === '1') x[k[0]][d] = 1; else delete x[k[0]][d]; }); }); markDirty(); re(); }; });
  }
  function setClosed(r, dates, on) {
    var set = {};
    (r.blocked || []).forEach(function (x) { if (!x || !x.from || !x.to) return; for (var d = x.from, i = 0; d <= x.to && i < 800; d = CP.add(d, 1), i++) set[d] = 1; });
    dates.forEach(function (d) { if (on) set[d] = 1; else delete set[d]; });
    var ks = Object.keys(set).sort(), out = [];
    ks.forEach(function (d) { var last = out[out.length - 1]; if (last && CP.add(last.to, 1) === d) last.to = d; else out.push({ from: d, to: d }); });
    r.blocked = out;
  }

  /* --- rate plans --- */
  var PLAN_TPL = [
    ['خطة مرنة (Flexible)', { name: 'Flexible rate', adjust: 0, breakfast: true, refundable: true, cancellation: 'Free cancellation up to 48 hours before arrival.', minNights: null }],
    ['غير قابلة للاسترداد −10%', { name: 'Non-refundable', adjust: -10, breakfast: true, refundable: false, cancellation: 'Non-refundable — pay in full when we confirm your booking.', minNights: null }],
    ['إقامة أسبوعية −15%', { name: 'Weekly stay', adjust: -15, breakfast: true, refundable: true, cancellation: 'Free cancellation up to 7 days before arrival.', minNights: 7 }],
    ['من غير فطار', { name: 'Room only', adjust: -8, breakfast: false, refundable: true, cancellation: 'Free cancellation up to 48 hours before arrival.', minNights: null }]
  ];
  function pPlans(pv, re) {
    pv.innerHTML = '<p class="hint">زي Booking بالظبط: كل غرفة ممكن تتعرض بأكتر من سعر. الخطة الأولى هي الأساسية. "التعديل %" بيتحسب على سعر الليلة: ‎-10 يعني أرخص 10%، و 10 يعني أغلى 10%. الاسم والسياسة بيظهروا للضيف بالإنجليزي.</p>' +
      '<div class="row" style="margin-bottom:14px">' + PLAN_TPL.map(function (t, i) { return '<button class="btn sm" data-tpl="' + i + '">＋ ' + t[0] + '</button>'; }).join('') + '<button class="btn sm pri" data-tpl="-1">＋ خطة فاضية</button></div>' +
      (C.ratePlans.length ? '' : '<div class="empty card">مفيش خطط لسه — الموقع بيعرض سعر واحد لكل غرفة. ابدأ بـ "خطة مرنة".</div>') +
      C.ratePlans.map(function (p, i) {
        var o = openItem['p' + i], b = 'ratePlans.' + i, adj = +p.adjust || 0;
        return '<div class="item"><div class="item-h" data-open="p' + i + '"><div class="t"><b>' + esc(p.name || 'Plan') + (i === 0 ? ' <span class="tag">الأساسية</span>' : '') + '</b><span>' + (adj ? (adj < 0 ? 'أرخص ' + (-adj) + '%' : 'أغلى ' + adj + '%') : 'نفس سعر الليلة') + ' · ' + (p.breakfast === false ? 'من غير فطار' : 'بالفطار') + ' · ' + (p.refundable === false ? 'غير قابلة للاسترداد' : 'إلغاء مجاني') + (p.minNights ? ' · أقل حاجة ' + p.minNights + ' ليالي' : '') + ' · ' + ((p.rooms || []).length ? p.rooms.length + ' غرف' : 'كل الغرف') + '</span></div>' +
          (p.active === false ? '<span class="tag off">متوقفة</span>' : '<span class="tag">شغالة</span>') + '<button class="btn sm" data-up="' + i + '">▲</button><button class="btn sm" data-down="' + i + '">▼</button><span>' + (o ? '▾' : '◂') + '</span></div>' +
          (o ? '<div class="item-b"><div class="grid3">' + fld('اسم الخطة (للضيف بالإنجليزي)', b + '.name') + fld('التعديل على السعر %', b + '.adjust', { type: 'number', kind: 'num', ph: '-10' }) + fld('أقل عدد ليالي (اختياري)', b + '.minNights', { type: 'number', kind: 'num', min: 1 }) +
            '<div class="f"><label>الفطار</label><label class="switch"><input type="checkbox" data-bind="' + b + '.breakfast"> الفطار داخل في السعر</label></div><div class="f"><label>الاسترداد</label><label class="switch"><input type="checkbox" data-bind="' + b + '.refundable"> قابلة للإلغاء المجاني</label></div><div class="f"><label>الحالة</label><label class="switch"><input type="checkbox" data-bind="' + b + '.active"> الخطة شغالة</label></div></div>' +
            fld('سياسة الإلغاء (بتظهر للضيف بالإنجليزي)', b + '.cancellation', { full: true }) +
            '<div class="f full"><label>الغرف اللي عليها الخطة دي</label>' + chips(b + '.rooms', roomItems(), 'مفيش اختيار = كل الغرف') + '</div>' +
            '<div class="row"><span class="sp"></span><button class="btn sm danger" data-delp="' + i + '">مسح الخطة</button></div></div>' : '') + '</div>';
      }).join('');
    bind(pv); wireChips(pv, re); common(pv, 'ratePlans', 'p', function () { re(); });
    $$('[data-tpl]', pv).forEach(function (bt) { bt.onclick = function () { var k = +bt.getAttribute('data-tpl'); var t = k >= 0 ? JSON.parse(JSON.stringify(PLAN_TPL[k][1])) : { name: 'New plan', adjust: 0, breakfast: true, refundable: true, cancellation: '' }; t.id = slug(t.name) + '-' + Date.now().toString(36).slice(-4); if (!C.ratePlans.length) t.id = 'standard'; t.rooms = []; t.active = true; C.ratePlans.push(t); openItem['p' + (C.ratePlans.length - 1)] = 1; markDirty(); re(); }; });
    $$('[data-delp]', pv).forEach(function (bt) { bt.onclick = function () { if (!confirm('تمسح الخطة؟')) return; C.ratePlans.splice(+bt.getAttribute('data-delp'), 1); openItem = {}; markDirty(); re(); }; });
  }

  /* --- seasons --- */
  var SEASON_TPL = [
    ['ويك إند (خميس وجمعة) +15%', { name: 'Weekend', days: [4, 5], mode: 'pct', value: 15 }],
    ['موسم عالي +20%', { name: 'High season', from: '', to: '', mode: 'pct', value: 20 }],
    ['رأس السنة — سعر ثابت', { name: 'New Year', from: '2026-12-30', to: '2027-01-01', mode: 'fixed', value: null }],
    ['موسم هادي −10%', { name: 'Low season', from: '', to: '', mode: 'pct', value: -10 }]
  ];
  function pSeasons(pv, re) {
    pv.innerHTML = '<p class="hint">غيّر الأسعار أوتوماتيك في فترات معينة أو أيام معينة في الأسبوع. "نسبة" بتزود أو تقلل من سعر الغرفة العادي، و"سعر ثابت" بيحط سعر محدد لليلة. لو سبت التواريخ فاضية يبقى طول السنة. السعر الخاص اللي بتحطه من التقويم بيغلب على المواسم.</p>' +
      '<div class="row" style="margin-bottom:14px">' + SEASON_TPL.map(function (t, i) { return '<button class="btn sm" data-tpl="' + i + '">＋ ' + t[0] + '</button>'; }).join('') + '</div>' +
      (C.seasons.length ? '' : '<div class="empty card">مفيش مواسم — كل الليالي بسعر الغرفة العادي.</div>') +
      C.seasons.map(function (s, i) {
        var o = openItem['s' + i], b = 'seasons.' + i;
        var desc = (s.mode === 'fixed' ? 'سعر ثابت ' + fmt(s.value) : (+s.value >= 0 ? '+' : '') + (s.value || 0) + '%') + ' · ' + (s.from || s.to ? (s.from || '…') + ' → ' + (s.to || '…') : 'طول السنة') + ((s.days || []).length ? ' · ' + s.days.map(function (d) { return DOW_AR[d]; }).join('، ') : '');
        return '<div class="item"><div class="item-h" data-open="s' + i + '"><div class="t"><b>' + esc(s.name || 'Season') + '</b><span dir="auto">' + esc(desc) + '</span></div>' + (s.active === false ? '<span class="tag off">متوقف</span>' : '<span class="tag">شغال</span>') + '<span>' + (o ? '▾' : '◂') + '</span></div>' +
          (o ? '<div class="item-b"><div class="grid3">' + fld('الاسم', b + '.name') + fld('من تاريخ', b + '.from', { type: 'date' }) + fld('لحد تاريخ', b + '.to', { type: 'date' }) +
            '<div class="f"><label>النوع</label><select data-bind="' + b + '.mode" data-redraw><option value="pct">نسبة % من السعر العادي</option><option value="fixed">سعر ثابت لليلة</option></select></div>' +
            fld(s.mode === 'fixed' ? 'السعر لليلة' : 'النسبة % (سالب = خصم)', b + '.value', { type: 'number', kind: 'num' }) +
            '<div class="f"><label>الحالة</label><label class="switch"><input type="checkbox" data-bind="' + b + '.active"> شغال</label></div></div>' +
            '<div class="f full"><label>أيام الأسبوع</label><div data-num>' + chips(b + '.days', dayItems(), 'مفيش اختيار = كل الأيام') + '</div></div>' +
            '<div class="f full"><label>الغرف</label>' + chips(b + '.rooms', roomItems(), 'مفيش اختيار = كل الغرف') + '</div>' +
            '<div class="row"><span class="sp"></span><button class="btn sm danger" data-dels="' + i + '">مسح</button></div></div>' : '') + '</div>';
      }).join('');
    $$('[data-num] [data-chips]', pv).forEach(function (x) { x.setAttribute('data-num', ''); });
    bind(pv); wireChips(pv, re); common(pv, 'seasons', 's', function () { re(); });
    $$('[data-redraw]', pv).forEach(function (el) { el.addEventListener('change', function () { setTimeout(re, 0); }); });
    $$('[data-tpl]', pv).forEach(function (bt) { bt.onclick = function () { var t = JSON.parse(JSON.stringify(SEASON_TPL[+bt.getAttribute('data-tpl')][1])); t.id = 'season-' + Date.now().toString(36); t.days = t.days || []; t.rooms = []; t.active = true; C.seasons.push(t); openItem['s' + (C.seasons.length - 1)] = 1; markDirty(); re(); }; });
    $$('[data-dels]', pv).forEach(function (bt) { bt.onclick = function () { if (!confirm('تمسح الموسم؟')) return; C.seasons.splice(+bt.getAttribute('data-dels'), 1); openItem = {}; markDirty(); re(); }; });
  }

  /* --- promotions --- */
  var PROMO_T = { basic: 'عرض عادي (لفترة محدودة)', early: 'حجز مبكر (Early booker)', last: 'اللحظة الأخيرة (Last minute)', los: 'إقامة طويلة', code: 'كوبون / كود خصم' };
  var PROMO_TPL = [
    ['حجز مبكر 30 يوم −10%', { name: 'Early booker deal', type: 'early', pct: 10, days: 30 }],
    ['اللحظة الأخيرة −15%', { name: 'Last-minute deal', type: 'last', pct: 15, days: 3 }],
    ['إقامة 5 ليالي أو أكتر −12%', { name: 'Long stay deal', type: 'los', pct: 12, minNights: 5 }],
    ['عرض لفترة محدودة −20%', { name: 'Limited-time deal', type: 'basic', pct: 20 }],
    ['كوبون خصم', { name: 'Promo code', type: 'code', pct: 10 }]
  ];
  function promoDesc(p) {
    var s = 'خصم ' + (p.pct || 0) + '%';
    if (p.type === 'early') s += ' لو حجز قبل الوصول بـ ' + (p.days || 0) + ' يوم أو أكتر';
    if (p.type === 'last') s += ' لو حجز قبل الوصول بـ ' + (p.days || 0) + ' أيام أو أقل';
    if (p.type === 'code') s += ' بالكود ' + (p.codeHint ? '«' + p.codeHint + '»' : '(لسه متحطش كود)');
    if (p.minNights) s += ' · من ' + p.minNights + ' ليالي';
    if (p.bookFrom || p.bookTo) s += ' · الحجز من ' + (p.bookFrom || '…') + ' لـ ' + (p.bookTo || '…');
    if (p.stayFrom || p.stayTo) s += ' · الإقامة من ' + (p.stayFrom || '…') + ' لـ ' + (p.stayTo || '…');
    return s;
  }
  function pPromos(pv, re) {
    var plansL = (C.ratePlans || []).map(function (p) { return [p.id, p.name]; });
    pv.innerHTML = '<p class="hint">العروض بتتحسب أوتوماتيك وقت الحجز، وبيظهر للضيف السعر القديم مشطوب والخصم. لو أكتر من عرض ينفع، الضيف بياخد الأحسن (العروض مش بتتجمع). العروض اللي من غير كود بيظهر لها بادج على كروت الغرف.</p>' +
      '<div class="row" style="margin-bottom:14px">' + PROMO_TPL.map(function (t, i) { return '<button class="btn sm" data-tpl="' + i + '">＋ ' + t[0] + '</button>'; }).join('') + '</div>' +
      (C.promos.length ? '' : '<div class="empty card">مفيش عروض لسه.</div>') +
      C.promos.map(function (p, i) {
        var o = openItem['x' + i], b = 'promos.' + i;
        return '<div class="item"><div class="item-h" data-open="x' + i + '"><div class="t"><b>' + esc(p.name || 'Promotion') + ' <span class="tag">' + esc(PROMO_T[p.type] || '') + '</span></b><span>' + esc(promoDesc(p)) + '</span></div>' + (p.active === false ? '<span class="tag off">متوقف</span>' : '<span class="tag">شغال</span>') + '<span>' + (o ? '▾' : '◂') + '</span></div>' +
          (o ? '<div class="item-b"><div class="grid3">' + fld('اسم العرض (للضيف بالإنجليزي)', b + '.name') +
            '<div class="f"><label>نوع العرض</label><select data-bind="' + b + '.type" data-redraw>' + Object.keys(PROMO_T).map(function (k) { return '<option value="' + k + '">' + PROMO_T[k] + '</option>'; }).join('') + '</select></div>' +
            fld('نسبة الخصم %', b + '.pct', { type: 'number', kind: 'num', min: 1 }) +
            (p.type === 'early' ? fld('يحجز قبل الوصول بكام يوم على الأقل', b + '.days', { type: 'number', kind: 'num', min: 1 }) : '') +
            (p.type === 'last' ? fld('يحجز قبل الوصول بكام يوم بالكتير', b + '.days', { type: 'number', kind: 'num', min: 0 }) : '') +
            (p.type === 'code' ? '<div class="f"><label>الكود</label><input class="inp" id="code' + i + '" dir="ltr" placeholder="' + (p.codeHint ? 'الحالي: ' + esc(p.codeHint) + ' — اكتب كود جديد لتغييره' : 'مثلًا CALMA10') + '"><small>الكود بيتحفظ متشفّر، محدش يقدر يشوفه من الموقع.</small></div>' : '') +
            fld('أقل عدد ليالي (اختياري)', b + '.minNights', { type: 'number', kind: 'num', min: 1 }) +
            fld('الحجز متاح من (اختياري)', b + '.bookFrom', { type: 'date' }) + fld('الحجز متاح لحد (اختياري)', b + '.bookTo', { type: 'date' }) +
            fld('ليالي الإقامة من (اختياري)', b + '.stayFrom', { type: 'date' }) + fld('ليالي الإقامة لحد (اختياري)', b + '.stayTo', { type: 'date' }) +
            '<div class="f"><label>الحالة</label><label class="switch"><input type="checkbox" data-bind="' + b + '.active"> العرض شغال</label></div></div>' +
            '<div class="f full"><label>الغرف</label>' + chips(b + '.rooms', roomItems(), 'مفيش اختيار = كل الغرف') + '</div>' +
            (plansL.length ? '<div class="f full"><label>خطط الأسعار</label>' + chips(b + '.plans', plansL, 'مفيش اختيار = كل الخطط') + '</div>' : '') +
            '<div class="row"><span class="sp"></span><button class="btn sm danger" data-delx="' + i + '">مسح العرض</button></div></div>' : '') + '</div>';
      }).join('');
    bind(pv); wireChips(pv, re); common(pv, 'promos', 'x', function () { re(); });
    $$('[data-redraw]', pv).forEach(function (el) { el.addEventListener('change', function () { setTimeout(re, 0); }); });
    C.promos.forEach(function (p, i) {
      var inp = $('#code' + i, pv); if (!inp) return;
      inp.onchange = function () {
        var code = inp.value.trim().toUpperCase(); if (!code) return;
        if (!window.crypto || !crypto.subtle) return toast('افتح لوحة التحكم من https علشان تحفظ الكود', true);
        sha256(code).then(function (h) { p.codeHash = h; p.codeHint = code.slice(0, 2) + '•••' + code.slice(-1); markDirty(); toast('الكود اتحفظ: ' + code + ' — متنساش "حفظ ونشر"'); re(); });
      };
    });
    $$('[data-tpl]', pv).forEach(function (bt) { bt.onclick = function () { var t = JSON.parse(JSON.stringify(PROMO_TPL[+bt.getAttribute('data-tpl')][1])); t.id = 'promo-' + Date.now().toString(36); t.rooms = []; t.plans = []; t.active = true; C.promos.push(t); openItem['x' + (C.promos.length - 1)] = 1; markDirty(); re(); }; });
    $$('[data-delx]', pv).forEach(function (bt) { bt.onclick = function () { if (!confirm('تمسح العرض؟')) return; C.promos.splice(+bt.getAttribute('data-delx'), 1); openItem = {}; markDirty(); re(); }; });
  }

  /* ---------------- REPORTS ---------------- */
  var RS = { month: todayStr().slice(0, 7), pending: false }, ALLB = null;
  function num0(s) { var n = parseFloat(String(s || '').replace(/[^\d.]/g, '')); return isNaN(n) ? 0 : n; }
  function tsDate(s) { var m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; }
  function monthStats(month, rows, pending) {
    var y = +month.slice(0, 4), m = +month.slice(5, 7), dim = new Date(Date.UTC(y, m, 0)).getUTCDate(), from = month + '-01', to = CP.add(from, dim);
    var vis = C.rooms.filter(function (r) { return r.visible !== false; }), inv = 0, untracked = 0;
    vis.forEach(function (r) { var k = r.inventory != null && r.inventory !== '' ? +r.inventory : null; if (k == null) { untracked++; k = 1; } inv += k; });
    var ok = ['Confirmed', 'Checked-in', 'Completed'].concat(pending ? ['New'] : []);
    var S = { dim: dim, inv: inv, untracked: untracked, cap: inv * dim, rn: 0, rev: 0, daily: {}, byRoom: {}, byPlan: {}, byPromo: {}, arrivals: 0, cancelled: 0, los: 0, losN: 0, lead: 0, leadN: 0, disc: 0 };
    rows.forEach(function (b) {
      var cin = b['Check-in'], cout = b['Check-out']; if (!cin || !cout) return;
      var n = CP.nights(cin, cout) || 1, tot = num0(b.Total), id = roomIdOf(b) || b['Room Type'];
      if (cin >= from && cin < to) {
        S.arrivals++;
        if (b.Status === 'Cancelled' || b.Status === 'No-show') S.cancelled++;
        else if (ok.indexOf(b.Status) >= 0) {
          S.los += n; S.losN++;
          var t = tsDate(b.Timestamp); if (t) { S.lead += Math.max(0, CP.nights(t, cin)); S.leadN++; }
          var pl = b['Rate Plan'] || 'Standard'; S.byPlan[pl] = (S.byPlan[pl] || 0) + 1;
          if (b.Promotion) { S.byPromo[b.Promotion] = S.byPromo[b.Promotion] || { n: 0, d: 0 }; S.byPromo[b.Promotion].n++; S.byPromo[b.Promotion].d += num0(b.Discount); }
        }
      }
      if (ok.indexOf(b.Status) < 0) return;
      for (var d = cin, i = 0; d < cout && i < 120; d = CP.add(d, 1), i++) {
        if (d < from || d >= to) continue;
        S.rn++; S.rev += tot / n; S.daily[d] = (S.daily[d] || 0) + 1;
        var R = S.byRoom[id] = S.byRoom[id] || { rn: 0, rev: 0 }; R.rn++; R.rev += tot / n;
      }
    });
    return S;
  }
  function vReports(v) {
    if (!ALLB) {
      v.innerHTML = '<div class="empty">جاري تحميل الحجوزات…</div>';
      api({ action: 'listBookings', limit: 3000 }).then(function (j) { if (!Array.isArray(j.rows)) { v.innerHTML = '<div class="empty card" style="color:var(--bad)">' + 'السيرفر (Google Apps Script) لسه على النسخة القديمة، فالحجوزات مش هتظهر هنا والتعديلات مش هتتحفظ. الصق Code.gs الجديد واعمل Deploy ▸ Manage deployments ▸ Edit ▸ New version — الخطوات في SETUP-GUIDE.md.' + '</div>'; return; } ALLB = j.rows; vReports(v); }).catch(function (e) { if (e.message !== 'auth') v.innerHTML = '<div class="empty card">مقدرناش نجيب الحجوزات.</div>'; });
      return;
    }
    var cur = C.settings.currency || 'EGP', S = monthStats(RS.month, ALLB, RS.pending);
    var y = +RS.month.slice(0, 4), m = +RS.month.slice(5, 7);
    var mName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var occ = S.cap ? Math.round(S.rn / S.cap * 100) : 0, adr = S.rn ? S.rev / S.rn : 0, revpar = S.cap ? S.rev / S.cap : 0;
    var kpi = function (val, lab, sub) { return '<div class="stat"><b>' + val + '</b><span>' + lab + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
    // daily occupancy bars
    var bars = '';
    for (var dd = 1; dd <= S.dim; dd++) { var d = RS.month + '-' + ('0' + dd).slice(-2), c = S.daily[d] || 0, pc = S.inv ? Math.min(100, c / S.inv * 100) : 0; bars += '<div class="bar" title="' + d + ': ' + c + ' غرف (' + Math.round(pc) + '%)"><i style="height:' + Math.max(2, pc) + '%"></i><span>' + dd + '</span></div>'; }
    // 6-month revenue trend
    var trend = [], maxR = 1;
    for (var k = 5; k >= 0; k--) { var dt = new Date(Date.UTC(y, m - 1 - k, 1)), mk = dt.toISOString().slice(0, 7), st = monthStats(mk, ALLB, RS.pending); trend.push([dt.toLocaleDateString('ar-EG', { month: 'short', timeZone: 'UTC' }), st.rev, st.cap ? Math.round(st.rn / st.cap * 100) : 0]); maxR = Math.max(maxR, st.rev); }
    var roomRows = Object.keys(S.byRoom).map(function (id) { var r = C.rooms.filter(function (x) { return x.id === id; })[0]; return [r ? r.name : id, S.byRoom[id]]; }).sort(function (a, b) { return b[1].rev - a[1].rev || b[1].rn - a[1].rn; });
    var maxRoom = roomRows.reduce(function (mx, r) { return Math.max(mx, r[1].rn); }, 1);
    var hb = function (label, val, max, txt) { return '<div class="hb"><span class="l">' + esc(label) + '</span><span class="track"><i style="width:' + Math.max(2, val / max * 100) + '%"></i></span><span class="v">' + txt + '</span></div>'; };
    var plansK = Object.keys(S.byPlan), promosK = Object.keys(S.byPromo), maxPl = plansK.reduce(function (mx, k) { return Math.max(mx, S.byPlan[k]); }, 1);
    var today = todayStr(), arr = ALLB.filter(function (b) { return b['Check-in'] >= today && b['Check-in'] <= CP.add(today, 7) && ACTIVE_ST.indexOf(b.Status) >= 0; }).sort(function (a, b) { return a['Check-in'] < b['Check-in'] ? -1 : 1; });
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>التقارير</h2><span class="sp"></span><button class="btn sm" id="rPrev">→</button><b style="min-width:130px;text-align:center">' + mName + '</b><button class="btn sm" id="rNext">←</button><button class="btn sm" id="rReload">تحديث</button></div>' +
      '<p class="hint">الأرقام محسوبة من الحجوزات المؤكدة (مؤكد / وصل / خلص).<label class="switch" style="margin-right:12px"><input type="checkbox" id="rPend"' + (RS.pending ? ' checked' : '') + '> احسب كمان الحجوزات الجديدة اللي لسه متأكدتش</label>' +
      (S.untracked ? '<br><b style="color:var(--bad)">ملحوظة:</b> ' + S.untracked + ' نوع غرف من غير "عدد الغرف" — اتحسبوا غرفة واحدة لكل نوع. حدّد العدد من تاب الغرف علشان نسبة الإشغال تبقى مظبوطة.' : '') + '</p>' +
      '<div class="stats">' + kpi(occ + '%', 'نسبة الإشغال', S.rn + ' ليلة من ' + S.cap) + kpi(esc(cur) + ' ' + fmt(Math.round(S.rev)), 'الإيراد', 'ليالي الشهر ده') + kpi(esc(cur) + ' ' + fmt(Math.round(adr)), 'متوسط سعر الليلة (ADR)') + kpi(esc(cur) + ' ' + fmt(Math.round(revpar)), 'RevPAR', 'الإيراد لكل غرفة متاحة') + '</div>' +
      '<div class="stats">' + kpi(S.arrivals, 'حجوزات وصولها الشهر ده') + kpi((S.arrivals ? Math.round(S.cancelled / S.arrivals * 100) : 0) + '%', 'نسبة الإلغاء', S.cancelled + ' ملغي / محضرش') + kpi(S.losN ? (S.los / S.losN).toFixed(1) : '—', 'متوسط مدة الإقامة (ليالي)') + kpi(S.leadN ? Math.round(S.lead / S.leadN) : '—', 'بيحجزوا قبل الوصول بـ (يوم)') + '</div>' +
      '<div class="card"><h3>الإشغال يوم بيوم</h3><div class="bars">' + bars + '</div></div>' +
      '<div class="grid2" style="margin-top:16px"><div class="card"><h3>أكتر غرف بتتحجز</h3>' + (roomRows.length ? roomRows.map(function (r) { return hb(r[0], r[1].rn, maxRoom, r[1].rn + ' ليلة · ' + fmt(Math.round(r[1].rev))); }).join('') : '<p class="hint">مفيش ليالي محجوزة الشهر ده.</p>') + '</div>' +
      '<div class="card"><h3>آخر 6 شهور</h3>' + trend.map(function (t) { return hb(t[0], t[1], maxR, fmt(Math.round(t[1])) + ' · ' + t[2] + '%'); }).join('') + '</div>' +
      '<div class="card"><h3>خطط الأسعار</h3>' + (plansK.length ? plansK.map(function (k) { return hb(k, S.byPlan[k], maxPl, S.byPlan[k] + ' حجز'); }).join('') : '<p class="hint">مفيش بيانات.</p>') + '</div>' +
      '<div class="card"><h3>العروض المستخدمة</h3>' + (promosK.length ? promosK.map(function (k) { return '<div class="hb"><span class="l">' + esc(k) + '</span><span class="v">' + S.byPromo[k].n + ' حجز · خصم ' + fmt(Math.round(S.byPromo[k].d)) + '</span></div>'; }).join('') : '<p class="hint">محدش استخدم عروض الشهر ده.</p>') + '</div></div>' +
      '<div class="card" style="margin-top:16px"><h3>الوصول في الأسبوع الجاي</h3>' + (arr.length ? '<table style="margin-top:10px"><tbody>' + arr.map(function (b) { return '<tr><td dir="ltr" style="text-align:right">' + esc(b['Check-in']) + '</td><td><b>' + esc(b['Full Name']) + '</b></td><td>' + esc(b['Room Type']) + '</td><td>' + esc(b.Nights || '') + ' ليالي</td><td>' + esc(ST[b.Status] || b.Status) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="hint">مفيش وصول في الأيام الجاية.</p>') + '</div>';
    var shift = function (k) { RS.month = new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); vReports(v); };
    $('#rPrev').onclick = function () { shift(-1); }; $('#rNext').onclick = function () { shift(1); };
    $('#rReload').onclick = function () { ALLB = null; vReports(v); };
    $('#rPend').onchange = function () { RS.pending = this.checked; vReports(v); };
  }

  /* ---------------- GALLERY ---------------- */
  function vGallery(v) {
    var cats = ['Lobby', 'Rooms', 'Bathrooms', 'Views'].concat(C.gallery.map(function (g) { return g.cat; })).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>معرض الصور</h2><span class="sp"></span><label class="btn pri">＋ ارفع صور<input type="file" accept="image/*" multiple hidden id="gup"></label><button class="btn" id="glib">اختار من صور الموقع</button></div>' +
      '<p class="hint">دي الصور اللي في قسم "Gallery" في الصفحة الرئيسية. اختار لكل صورة القسم بتاعها (Lobby / Rooms / Bathrooms / Views) واكتب وصف قصير بالإنجليزي.</p>' +
      '<div class="photos" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' + C.gallery.map(function (g, i) {
        return '<div class="ph"><img src="' + esc(thumb(g.src)) + '" alt="" loading="lazy"><select data-bind="gallery.' + i + '.cat">' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select><input data-bind="gallery.' + i + '.alt" placeholder="وصف الصورة" dir="ltr">' +
          '<div class="ctl"><button data-gm="-1" data-i="' + i + '">→</button><button data-gm="1" data-i="' + i + '">←</button><button class="del" data-gd="' + i + '">✕</button></div></div>';
      }).join('') + '</div>';
    bind(v);
    var addAll = function (urls) { urls.forEach(function (u) { C.gallery.push({ src: u, cat: 'Rooms', alt: '' }); }); markDirty(); vGallery(v); };
    $('#gup').onchange = function () { upload(Array.prototype.slice.call(this.files), addAll); };
    $('#glib').onclick = function () { library(false, addAll); };
    $$('[data-gm]', v).forEach(function (b) { b.onclick = function () { var a = C.gallery, i = +b.getAttribute('data-i'), j = i + +b.getAttribute('data-gm'); if (j < 0 || j >= a.length) return; var t = a[i]; a[i] = a[j]; a[j] = t; markDirty(); vGallery(v); }; });
    $$('[data-gd]', v).forEach(function (b) { b.onclick = function () { if (!confirm('تشيل الصورة من المعرض؟')) return; C.gallery.splice(+b.getAttribute('data-gd'), 1); markDirty(); vGallery(v); }; });
  }

  /* ---------------- JOURNEYS ---------------- */
  function vJourneys(v) {
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>الرحلات والبرامج</h2><span class="sp"></span><button class="btn pri" id="addJ">＋ رحلة جديدة</button></div><p class="hint">أول 3 رحلات ظاهرة بيظهروا في الصفحة الرئيسية، والكل بيظهر في صفحة Journeys.</p>' +
      C.journeys.map(function (j, i) {
        var o = openItem['j' + i], p = 'journeys.' + i;
        return '<div class="item"><div class="item-h" data-open="j' + i + '"><img src="' + esc(thumb(j.image || '')) + '" alt=""><div class="t"><b>' + esc(j.title) + '</b><span>' + esc(j.type) + ' · ' + esc(j.duration) + '</span></div>' + (j.visible === false ? '<span class="tag off">مخفية</span>' : '<span class="tag">ظاهرة</span>') +
          '<button class="btn sm" data-up="' + i + '">▲</button><button class="btn sm" data-down="' + i + '">▼</button><span>' + (o ? '▾' : '◂') + '</span></div>' +
          (o ? '<div class="item-b"><div class="grid3">' + fld('العنوان', p + '.title') + fld('النوع', p + '.type', { ph: 'Full day' }) + fld('المدة', p + '.duration', { ph: 'Approx. 4 hours' }) + fld('السعر (اختياري)', p + '.price', { type: 'number', kind: 'num', min: 0 }) +
            '<div class="f"><label>الظهور</label><label class="switch"><input type="checkbox" data-bind="' + p + '.visible"> ظاهرة في الموقع</label></div></div>' + fld('الوصف', p + '.description', { area: true, full: true }) +
            '<div class="f full"><label>الصورة</label>' + photosHTML(p + '.image', true) + '</div><div class="row"><span class="sp"></span><button class="btn sm danger" data-delj="' + i + '">مسح الرحلة</button></div></div>' : '') + '</div>';
      }).join('');
    bind(v); wirePhotos(v, function () { vJourneys(v); }); common(v, 'journeys', 'j', vJourneys);
    $('#addJ').onclick = function () { C.journeys.push({ id: 'journey-' + Date.now().toString(36), title: 'New journey', type: 'Half day', duration: '', image: '', description: '', price: null, visible: false }); openItem['j' + (C.journeys.length - 1)] = 1; markDirty(); vJourneys(v); };
    $$('[data-delj]', v).forEach(function (b) { b.onclick = function () { if (!confirm('تمسح الرحلة؟')) return; C.journeys.splice(+b.getAttribute('data-delj'), 1); openItem = {}; markDirty(); vJourneys(v); }; });
  }

  /* ---------------- AMENITIES / FAQ / REVIEWS ---------------- */
  var ICONS = ['wifi', 'clock', 'car', 'coffee', 'cup', 'snow', 'drop', 'tv', 'parking', 'shirt', 'pin', 'map', 'shield', 'star', 'chat', 'bed'];
  function vTexts(v) {
    var listEd = function (key, title, hint, fields, blank) {
      return '<div class="card"><div class="row"><h3>' + title + '</h3><span class="sp"></span><button class="btn sm" data-add="' + key + '">＋ إضافة</button></div><p class="hint">' + hint + '</p>' +
        C[key].map(function (x, i) { return '<div class="ranges"><div class="row" style="align-items:flex-start">' + fields.map(function (f) { return f[2] === 'icon' ? '<select class="inp" style="max-width:120px" data-bind="' + key + '.' + i + '.' + f[0] + '">' + ICONS.map(function (ic) { return '<option>' + ic + '</option>'; }).join('') + '</select>' : (f[2] === 'area' ? '<textarea class="inp" rows="2" style="flex:2;min-width:220px" placeholder="' + f[1] + '" data-bind="' + key + '.' + i + '.' + f[0] + '" dir="ltr"></textarea>' : '<input class="inp" style="flex:1;min-width:160px" placeholder="' + f[1] + '" data-bind="' + key + '.' + i + '.' + f[0] + '" dir="ltr">'); }).join('') +
          '<button class="btn sm danger" data-rm="' + key + '" data-i="' + i + '">مسح</button></div></div>'; }).join('') + '</div>';
    };
    v.innerHTML = '<h2 style="margin-bottom:14px">المميزات والأسئلة والآراء</h2>' +
      listEd('amenities', 'المميزات (Included in every stay)', 'اختار أيقونة واكتب عنوان ووصف قصير بالإنجليزي.', [['icon', 'icon', 'icon'], ['title', 'Title'], ['text', 'Short text']]) +
      listEd('policies', 'قواعد الفندق (House rules)', 'زي Booking: الدخول والخروج، الأطفال، الحيوانات، التدخين، السرير الإضافي، طرق الدفع… بتظهر في صفحة التواصل وفي الحجز. بالإنجليزي.', [['title', 'Title'], ['text', 'Rule', 'area']]) +
      listEd('faq', 'الأسئلة الشائعة', 'السؤال والإجابة بالإنجليزي. أول سؤال بيظهر مفتوح.', [['q', 'Question'], ['a', 'Answer', 'area']]) +
      listEd('reviews', 'رأي الضيوف', 'أول رأي بيظهر في الصفحة الرئيسية. اكتب آراء حقيقية من ضيوفكم بس.', [['text', 'Review', 'area'], ['author', 'Guest name / country']]);
    bind(v);
    var blank = { policies: { title: '', text: '' }, amenities: { icon: 'star', title: '', text: '' }, faq: { q: '', a: '' }, reviews: { text: '', author: '' } };
    $$('[data-add]', v).forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-add'); C[k].push(JSON.parse(JSON.stringify(blank[k]))); markDirty(); vTexts(v); }; });
    $$('[data-rm]', v).forEach(function (b) { b.onclick = function () { C[b.getAttribute('data-rm')].splice(+b.getAttribute('data-i'), 1); markDirty(); vTexts(v); }; });
  }

  /* ---------------- SETTINGS ---------------- */
  function vSettings(v) {
    var s = 'settings.';
    v.innerHTML = '<h2 style="margin-bottom:14px">الإعدادات</h2>' +
      '<div class="card"><h3>بيانات الفندق</h3><p class="hint">بتظهر في الهيدر والفوتر وصفحة التواصل والخريطة.</p><div class="grid2">' + fld('اسم الفندق', s + 'hotelName') + fld('الشعار (Tagline)', s + 'tagline') + fld('جملة التعريف', s + 'intro', { area: true, full: true }) +
      fld('رقم التليفون', s + 'phone', { ltr: true }) + fld('رقم الواتساب (أرقام بس بكود الدولة)', s + 'whatsapp', { ltr: true, ph: '201273736667', hint: 'كل أزرار الواتساب في الموقع بتروح للرقم ده' }) + fld('الإيميل (اختياري)', s + 'email', { ltr: true }) + fld('العنوان', s + 'address') +
      fld('اسم الفندق على خرائط جوجل', s + 'mapQuery', { hint: 'اللي بيتكتب في البحث علشان الخريطة تجيب المكان الصح' }) + fld('العملة', s + 'currency', { ph: 'EGP' }) + fld('ميعاد الدخول', s + 'checkinTime', { ph: '2:00 PM' }) + fld('ميعاد الخروج', s + 'checkoutTime', { ph: '12:00 PM' }) + '</div></div>' +
      '<div class="card"><h3>العروض والإعلان</h3><div class="grid2">' + fld('نسبة الخصم للحجز المباشر %', s + 'directDiscount', { type: 'number', kind: 'num', min: 0, hint: 'بتظهر على كروت الغرف. سيبها فاضية لو مفيش خصم' }) + fld('جملة الخصم', s + 'directDiscountText') +
      fld('شريط إعلان فوق الموقع (اختياري)', s + 'announcement', { full: true, hint: 'مثلًا: Ramadan offer — 20% off stays of 3 nights or more. لو فاضي بيظهر جملة الخصم.' }) + fld('رابط الفندق على Booking.com', s + 'bookingComUrl', { ltr: true, full: true }) + '</div></div>' +
      '<div class="card"><div class="row"><h3>الضرايب والرسوم</h3><span class="sp"></span><button class="btn sm" id="addTax">＋ إضافة</button></div><p class="hint">زي Booking: ضريبة القيمة المضافة، خدمة، رسوم مدينة… لو «داخلة في السعر» بتظهر للضيف كمعلومة بس، ولو مش داخلة بتتضاف على الإجمالي.</p>' + C.settings.taxes.map(function (x, k) { var b = s + 'taxes.' + k; return '<div class="ranges"><div class="row"><input class="inp" style="flex:1;min-width:140px" placeholder="VAT" dir="ltr" data-bind="' + b + '.name"><input class="inp" type="number" style="max-width:110px" placeholder="%" data-kind="num" data-bind="' + b + '.pct"><input class="inp" type="number" style="max-width:150px" placeholder="مبلغ ثابت / ليلة" data-kind="num" data-bind="' + b + '.perNight"><label class="switch"><input type="checkbox" data-bind="' + b + '.included"> داخلة في السعر</label><button class="btn sm danger" data-rmtax="' + k + '">مسح</button></div></div>'; }).join('') + '</div>' +
      '<div class="card"><h3>صور الصفحة الرئيسية</h3><p class="hint">أول 3 صور بيظهروا جنب العنوان، والرابعة خلفية الجزء اللي تحت.</p>' + photosHTML(s + 'heroImages') + '</div>' +
      '<div class="card"><h3>السوشيال ميديا</h3><div class="grid3">' + fld('Instagram', s + 'instagram', { ltr: true }) + fld('Facebook', s + 'facebook', { ltr: true }) + fld('TikTok', s + 'tiktok', { ltr: true }) + '</div></div>' +
      '<div class="card"><h3>تغيير كلمة السر</h3><div class="row"><input type="password" class="inp" id="np" placeholder="كلمة السر الجديدة (6 حروف على الأقل)" style="max-width:320px" dir="ltr"><button class="btn" id="cp">تغيير</button></div></div>';
    bind(v); wirePhotos(v, function () { vSettings(v); });
    $('#addTax').onclick = function () { C.settings.taxes.push({ name: 'VAT', pct: 14, perNight: null, included: false }); markDirty(); vSettings(v); };
    $$('[data-rmtax]', v).forEach(function (b) { b.onclick = function () { C.settings.taxes.splice(+b.getAttribute('data-rmtax'), 1); markDirty(); vSettings(v); }; });
    $('#cp').onclick = function () { var p = $('#np').value; if (p.length < 6) return toast('كلمة السر قصيرة', true); api({ action: 'changePassword', newPassword: p }).then(function (j) { if (j.status === 'ok') { toast('اتغيرت ✓ — سجّل دخول بالجديدة'); localStorage.removeItem(TOKEN_KEY); setTimeout(function () { login(); }, 1200); } else toast('ماتغيرتش', true); }); };
  }

  if (localStorage.getItem(TOKEN_KEY) || (DEMO && localStorage.getItem(TOKEN_KEY))) start(); else login();
})();
