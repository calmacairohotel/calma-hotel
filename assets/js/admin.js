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
        if (p.action === 'listBookings') return res({ status: 'ok', rows: JSON.parse(localStorage.getItem('demo_bookings') || 'null') || [
          { _row: 3, 'Booking Code': 'CLM-00002', 'Timestamp': '25/10/2026 10:12', 'Full Name': 'Sara Mostafa', 'Phone': '+20 100 123 4567', 'Email': 'sara@example.com', 'Room Type': 'Family Room', 'Check-in': '2026-11-02', 'Check-out': '2026-11-05', 'Nights': '3', 'Adults': '2', 'Children': '2', 'Total': '', 'Status': 'New', 'Message': 'Airport pickup please', 'Arrival': 'Evening (17–22)' },
          { _row: 2, 'Booking Code': 'CLM-00001', 'Timestamp': '24/10/2026 18:40', 'Full Name': 'John Smith', 'Phone': '+44 7700 900123', 'Email': '', 'Room Type': 'Deluxe Double Room', 'Check-in': '2026-10-28', 'Check-out': '2026-10-30', 'Nights': '2', 'Adults': '2', 'Children': '0', 'Total': '', 'Status': 'Confirmed', 'Message': '', 'Arrival': '' }] });
        if (p.action === 'updateBooking') return res({ status: 'ok' });
        if (p.action === 'changePassword') return res({ status: 'ok' });
        res({ status: 'error' });
      }, 250);
    });
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
        if (j.status === 'ok') { localStorage.setItem(TOKEN_KEY, j.token); start(); }
        else { b.disabled = false; b.textContent = 'دخول'; toast('كلمة السر غلط', true); }
      }).catch(function () { b.disabled = false; b.textContent = 'دخول'; toast('مفيش اتصال بالسيرفر', true); });
    };
  }

  /* ---------------- shell ---------------- */
  var TABS = [['bookings', 'الحجوزات'], ['rooms', 'الغرف والأسعار'], ['gallery', 'معرض الصور'], ['journeys', 'الرحلات'], ['texts', 'المميزات والأسئلة'], ['settings', 'الإعدادات']];
  function start() {
    app.innerHTML = '<div class="empty">جاري التحميل…</div>';
    Promise.all([loadContent(), fetch('/data/images.json').then(function (r) { return r.json(); }).catch(function () { return []; })]).then(function (r) {
      C = r[0]; saved = JSON.stringify(C); LIB = r[1];
      C.rooms = C.rooms || []; C.gallery = C.gallery || []; C.journeys = C.journeys || []; C.faq = C.faq || []; C.amenities = C.amenities || []; C.reviews = C.reviews || [];
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
      if (j.status === 'ok') { saved = JSON.stringify(C); markDirty(); try { localStorage.setItem(SITE_CACHE, saved); } catch (e) { } toast('اتنشر على الموقع ✓'); }
      else toast('الحفظ فشل: ' + (j.message || ''), true);
    }).catch(function (e) { b.disabled = false; b.textContent = 'حفظ ونشر على الموقع'; if (e.message !== 'auth') toast('مفيش اتصال — جرّب تاني', true); });
  }
  function draw() {
    $$('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === tab); });
    var v = $('#view');
    ({ bookings: vBookings, rooms: vRooms, gallery: vGallery, journeys: vJourneys, texts: vTexts, settings: vSettings })[tab](v);
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
            '<td>' + esc(r.Total || '—') + '</td><td>' + esc(r.Message || '') + (r.Arrival ? '<span class="muted">الوصول: ' + esc(r.Arrival) + '</span>' : '') + '</td>' +
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
    api({ action: 'listBookings' }).then(function (j) { BOOKINGS = j.rows || []; go(); }).catch(function (e) { if (e.message !== 'auth') $('#blist').innerHTML = '<div class="empty card">مقدرناش نجيب الحجوزات — اتأكد من النت ودوس تحديث.</div>'; });
  }

  /* ---------------- ROOMS ---------------- */
  function vRooms(v) {
    var cur = C.settings.currency || 'EGP';
    v.innerHTML = '<div class="row" style="margin-bottom:6px"><h2>الغرف والأسعار</h2><span class="sp"></span><button class="btn pri" id="addRoom">＋ غرفة جديدة</button></div>' +
      '<p class="hint">غيّر السعر أو الصور أو الوصف، وبعدين دوس <b>حفظ ونشر على الموقع</b> فوق. أول صورة هي الغلاف. لو سبت السعر فاضي هيظهر "السعر عند الطلب".</p>' +
      C.rooms.map(function (r, i) {
        var o = openItem['r' + i], p = 'rooms.' + i;
        return '<div class="item"><div class="item-h" data-open="r' + i + '"><img src="' + esc(thumb((r.images || [])[0] || '')) + '" alt=""><div class="t"><b id="rt' + i + '">' + esc(r.name) + '</b><span>' + (r.price ? esc(cur) + ' ' + esc(r.price) + ' / الليلة' : 'السعر عند الطلب') + ' · حتى ' + esc(r.maxGuests) + ' أفراد · ' + (r.images || []).length + ' صور</span></div>' +
          (r.visible === false ? '<span class="tag off">مخفية</span>' : '<span class="tag">ظاهرة</span>') +
          '<button class="btn sm" data-up="' + i + '" title="لفوق">▲</button><button class="btn sm" data-down="' + i + '" title="لتحت">▼</button><span>' + (o ? '▾' : '◂') + '</span></div>' +
          (o ? '<div class="item-b"><div class="grid3">' + fld('اسم الغرفة (إنجليزي)', p + '.name', { live: '#rt' + i }) + fld('النوع (يظهر صغير فوق الاسم)', p + '.category', { ph: 'Double' }) + fld('السرير', p + '.beds', { ph: '1 double bed' }) +
            fld('سعر الليلة (' + esc(cur) + ')', p + '.price', { type: 'number', kind: 'num', min: 0, hint: 'ده السعر اللي هيتحسب في الحجز' }) + fld('سعر Booking.com (اختياري)', p + '.otaPrice', { type: 'number', kind: 'num', min: 0, hint: 'يظهر مشطوب جنب سعرك' }) + fld('أقصى عدد أفراد', p + '.maxGuests', { type: 'number', kind: 'num', min: 1 }) +
            fld('المساحة (اختياري)', p + '.size', { ph: '25 m²' }) + '<div class="f"><label>الظهور</label><label class="switch"><input type="checkbox" data-bind="' + p + '.visible"> الغرفة ظاهرة في الموقع</label></div></div>' +
            fld('وصف قصير (سطر واحد على الكارت)', p + '.short', { full: true }) + fld('الوصف الكامل', p + '.description', { area: true, full: true }) +
            fld('المميزات (افصل بينهم بفاصلة)', p + '.amenities', { kind: 'list', area: true, rows: 2, full: true }) +
            '<div class="f full"><label>صور الغرفة</label>' + photosHTML(p + '.images') + '</div>' +
            '<div class="f full ranges"><label>تواريخ مقفولة (الغرفة مش متاحة فيها)</label>' + (r.blocked || []).map(function (b, k) { return '<div class="row"><span>من</span><input type="date" class="inp" style="max-width:170px" data-bind="' + p + '.blocked.' + k + '.from"><span>لحد</span><input type="date" class="inp" style="max-width:170px" data-bind="' + p + '.blocked.' + k + '.to"><button class="btn sm danger" data-unblock="' + k + '" data-room="' + i + '">مسح</button></div>'; }).join('') +
            '<div><button class="btn sm" data-block="' + i + '">＋ اقفل فترة</button></div><small>الضيف مش هيقدر يختار الغرفة دي لو تواريخه داخلة في الفترة.</small></div>' +
            '<div class="row"><span class="sp"></span><button class="btn sm" data-dup="' + i + '">نسخة من الغرفة</button><button class="btn sm danger" data-delroom="' + i + '">مسح الغرفة</button></div></div>' : '') + '</div>';
      }).join('');
    bind(v); wirePhotos(v, function () { vRooms(v); });
    $('#addRoom').onclick = function () { C.rooms.push({ id: 'room-' + Date.now().toString(36), name: 'New Room', category: 'Room', short: '', description: '', beds: '', maxGuests: 2, size: '', price: null, otaPrice: null, amenities: ['Private bathroom', 'Air conditioning', 'Free Wi-Fi'], images: [], visible: false, blocked: [] }); openItem['r' + (C.rooms.length - 1)] = 1; markDirty(); vRooms(v); };
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
  var ICONS = ['wifi', 'clock', 'car', 'coffee', 'snow', 'tv', 'pin', 'map', 'shield', 'star', 'chat', 'bed'];
  function vTexts(v) {
    var listEd = function (key, title, hint, fields, blank) {
      return '<div class="card"><div class="row"><h3>' + title + '</h3><span class="sp"></span><button class="btn sm" data-add="' + key + '">＋ إضافة</button></div><p class="hint">' + hint + '</p>' +
        C[key].map(function (x, i) { return '<div class="ranges"><div class="row" style="align-items:flex-start">' + fields.map(function (f) { return f[2] === 'icon' ? '<select class="inp" style="max-width:120px" data-bind="' + key + '.' + i + '.' + f[0] + '">' + ICONS.map(function (ic) { return '<option>' + ic + '</option>'; }).join('') + '</select>' : (f[2] === 'area' ? '<textarea class="inp" rows="2" style="flex:2;min-width:220px" placeholder="' + f[1] + '" data-bind="' + key + '.' + i + '.' + f[0] + '" dir="ltr"></textarea>' : '<input class="inp" style="flex:1;min-width:160px" placeholder="' + f[1] + '" data-bind="' + key + '.' + i + '.' + f[0] + '" dir="ltr">'); }).join('') +
          '<button class="btn sm danger" data-rm="' + key + '" data-i="' + i + '">مسح</button></div></div>'; }).join('') + '</div>';
    };
    v.innerHTML = '<h2 style="margin-bottom:14px">المميزات والأسئلة والآراء</h2>' +
      listEd('amenities', 'المميزات (Included in every stay)', 'اختار أيقونة واكتب عنوان ووصف قصير بالإنجليزي.', [['icon', 'icon', 'icon'], ['title', 'Title'], ['text', 'Short text']]) +
      listEd('faq', 'الأسئلة الشائعة', 'السؤال والإجابة بالإنجليزي. أول سؤال بيظهر مفتوح.', [['q', 'Question'], ['a', 'Answer', 'area']]) +
      listEd('reviews', 'رأي الضيوف', 'أول رأي بيظهر في الصفحة الرئيسية. اكتب آراء حقيقية من ضيوفكم بس.', [['text', 'Review', 'area'], ['author', 'Guest name / country']]);
    bind(v);
    var blank = { amenities: { icon: 'star', title: '', text: '' }, faq: { q: '', a: '' }, reviews: { text: '', author: '' } };
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
      '<div class="card"><h3>صور الصفحة الرئيسية</h3><p class="hint">أول 3 صور بيظهروا جنب العنوان، والرابعة خلفية الجزء اللي تحت.</p>' + photosHTML(s + 'heroImages') + '</div>' +
      '<div class="card"><h3>السوشيال ميديا</h3><div class="grid3">' + fld('Instagram', s + 'instagram', { ltr: true }) + fld('Facebook', s + 'facebook', { ltr: true }) + fld('TikTok', s + 'tiktok', { ltr: true }) + '</div></div>' +
      '<div class="card"><h3>تغيير كلمة السر</h3><div class="row"><input type="password" class="inp" id="np" placeholder="كلمة السر الجديدة (6 حروف على الأقل)" style="max-width:320px" dir="ltr"><button class="btn" id="cp">تغيير</button></div></div>';
    bind(v); wirePhotos(v, function () { vSettings(v); });
    $('#cp').onclick = function () { var p = $('#np').value; if (p.length < 6) return toast('كلمة السر قصيرة', true); api({ action: 'changePassword', newPassword: p }).then(function (j) { if (j.status === 'ok') { toast('اتغيرت ✓ — سجّل دخول بالجديدة'); localStorage.removeItem(TOKEN_KEY); setTimeout(function () { login(); }, 1200); } else toast('ماتغيرتش', true); }); };
  }

  if (localStorage.getItem(TOKEN_KEY) || (DEMO && localStorage.getItem(TOKEN_KEY))) start(); else login();
})();
