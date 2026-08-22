/* =========================================================
   CALMA HOTEL — Direct Booking Sync
   Every booking/enquiry submitted on /rc/ or /contact/ is sent to
   a single Google Sheet (via a Google Apps Script Web App) so the
   hotel has one permanent, always-growing record of every direct
   booking — complete with an auto-generated Reservation Card (RC)
   PDF and a Gold Card + 15% voucher PDF, both under the same code.
   PASTE YOUR DEPLOYED APPS SCRIPT WEB APP URL BELOW — see the
   setup guide provided alongside this website.
   ========================================================= */
var CALMA_BOOKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzhFIjIPY8RgEdzPo8BTAOVf_ng3KLWsyZwaJFGmXoDhV8uw9BfY3IqPRBb3K7QipwE/exec';
var WHATSAPP_NUMBER = '201273736667';
var CALMA_CURRENCY = 'EGP';

/* ---------------------------------------------------------
   Room catalogue — single source of truth for the Rooms page
   detail modal AND the /rc/ reservation page. Edit prices or
   photos here only; nothing else needs to change.
   --------------------------------------------------------- */
var CALMA_ROOMS = {
  'classic-twin': {
    name: 'Classic Twin Room',
    eyebrow: 'Classic · Room 01',
    desc: 'Two single beds beneath tall shuttered windows, framed art and a warm wood headboard wall. Our most requested room for friends travelling together, and for guests who simply like a little more space either side of the bed.',
    size: '22 m²',
    beds: 'Two single beds',
    guests: 2,
    price: 1250,
    originalPrice: 1790,
    save: 30,
    features: ['Two single beds', 'Private bathroom', 'Air conditioning', 'Smart TV', 'Free WiFi', 'City-facing window', 'Daily housekeeping'],
    images: [
      { src: '/assets/img/room-classic.jpg', alt: 'Classic Twin Room' },
      { src: '/assets/img/room-twin-view.jpg', alt: 'Twin room city view' },
      { src: '/assets/img/bathroom-modern.jpg', alt: 'Private bathroom' },
      { src: '/assets/img/guest-room-desk.jpg', alt: 'Room work desk' },
      { src: '/assets/img/view-window.jpg', alt: 'View from the window' }
    ]
  },
  'deluxe-double': {
    name: 'Deluxe Double Room',
    eyebrow: 'Deluxe · Room 02',
    desc: 'A generous double bed, a proper desk for slow mornings with a laptop, and deeper, softer furnishings throughout. Built for couples and for guests who want a little more room to settle in.',
    size: '26 m²',
    beds: 'One double bed',
    guests: 2,
    price: 1450,
    originalPrice: 2075,
    save: 30,
    features: ['One double bed', 'Dedicated work desk', 'Private bathroom', 'Blackout curtains', 'In-room refreshments', 'Air conditioning', 'Free WiFi'],
    images: [
      { src: '/assets/img/room-double.jpg', alt: 'Deluxe Double Room' },
      { src: '/assets/img/guest-room-detail.jpg', alt: 'Room detail' },
      { src: '/assets/img/bathroom-modern.jpg', alt: 'Private bathroom' },
      { src: '/assets/img/inroom-refreshments.jpg', alt: 'In-room refreshments' },
      { src: '/assets/img/view-window.jpg', alt: 'View from the window' }
    ]
  },
  'family': {
    name: 'Family Room',
    eyebrow: 'Family · Room 03',
    desc: 'Multiple beds set within one warm, wood-panelled room — comfortable enough for a family or a small group to share without feeling crowded. A quiet reading corner and full-length curtains keep the room restful even in daylight.',
    size: '34 m²',
    beds: 'Multiple beds',
    guests: 4,
    price: 1950,
    originalPrice: 2790,
    save: 30,
    features: ['Multiple beds', 'Extra storage & wardrobe', 'Private bathroom', 'Smart TV', 'Air conditioning', 'Free WiFi', 'Daily housekeeping'],
    images: [
      { src: '/assets/img/family-room.jpg', alt: 'Family Room' },
      { src: '/assets/img/room-classic.jpg', alt: 'Room seating area' },
      { src: '/assets/img/bathroom-modern.jpg', alt: 'Private bathroom' },
      { src: '/assets/img/corridor.jpg', alt: 'Hotel corridor' },
      { src: '/assets/img/guest-room-desk.jpg', alt: 'Room work desk' }
    ]
  },
  'modern-suite': {
    name: 'Modern Suite',
    eyebrow: 'Suite · Room 04',
    desc: "Our most contemporary stay — clean lines, brushed wood, a glass rain shower and low, warm lighting throughout. For guests who want CALMA's calm in a sharper, more minimal setting.",
    size: '30 m²',
    beds: 'King-size bed',
    guests: 2,
    price: 2450,
    originalPrice: 3500,
    save: 30,
    features: ['King-size bed', 'Glass rain shower', 'Ambient lighting', 'Smart TV', 'Premium linens', 'Air conditioning', 'Free WiFi'],
    images: [
      { src: '/assets/img/room-modern.jpg', alt: 'Modern Suite' },
      { src: '/assets/img/suite-view.jpg', alt: 'Suite view' },
      { src: '/assets/img/bathroom-modern.jpg', alt: 'Glass rain shower bathroom' },
      { src: '/assets/img/view-window.jpg', alt: 'View from the window' },
      { src: '/assets/img/guest-room-detail.jpg', alt: 'Room detail' }
    ]
  }
};

function calmaFormatMoney(n) {
  return Number(n || 0).toLocaleString('en-US') + ' ' + CALMA_CURRENCY;
}

function calmaCheckIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
}

document.addEventListener('DOMContentLoaded', function () {
  /* ---------------- nav solid-on-scroll ---------------- */
  var nav = document.querySelector('.site-nav');
  var navTicking = false;
  var applyNavState = function () {
    navTicking = false;
    if (!nav) return;
    var solid = window.scrollY > 60;
    if (solid !== nav.classList.contains('solid')) {
      nav.classList.toggle('solid', solid);
    }
  };
  var toggleSolid = function () {
    if (navTicking) return;
    navTicking = true;
    window.requestAnimationFrame(applyNavState);
  };
  applyNavState();
  window.addEventListener('scroll', toggleSolid, { passive: true });

  /* ---------------- mobile drawer ---------------- */
  var openBtn = document.querySelector('.nav-toggle');
  var drawer = document.querySelector('.mobile-drawer');
  var closeBtn = document.querySelector('.close-drawer');
  if (openBtn && drawer) {
    openBtn.addEventListener('click', function () { drawer.classList.add('open'); });
  }
  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', function () { drawer.classList.remove('open'); });
  }
  if (drawer) {
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { drawer.classList.remove('open'); });
    });
  }

  /* ---------------- reveal on scroll ---------------- */
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------------- pre-select room type on Contact form ---------------- */
  var roomSelect = document.querySelector('#booking-form #room, .contact-form #room');
  if (roomSelect) {
    var params = new URLSearchParams(window.location.search);
    var wantedRoom = params.get('room');
    if (wantedRoom) {
      Array.prototype.forEach.call(roomSelect.options, function (opt) {
        if (opt.value === wantedRoom || opt.textContent.trim() === wantedRoom) {
          roomSelect.value = opt.value;
        }
      });
    }
  }

  /* ---------------- Contact page enquiry form ----------------
     General enquiries only — kept separate from the dedicated
     /rc/ direct-booking flow, but uses the same backend sheet. */
  var form = document.querySelector('.contact-form');
  if (form && !form.closest('#rc-page')) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = (form.querySelector('#name') || {}).value || '';
      var phone = (form.querySelector('#phone') || {}).value || '';
      var email = (form.querySelector('#email') || {}).value || '';
      var checkin = (form.querySelector('#checkin') || {}).value || '';
      var checkout = (form.querySelector('#checkout') || {}).value || '';
      var room = (form.querySelector('#room') || {}).value || '';
      var guests = (form.querySelector('#guests') || {}).value || '';
      var message = (form.querySelector('#message') || {}).value || '';

      var note = form.querySelector('.form-note');
      var submitBtn = form.querySelector('button[type="submit"]');

      if (CALMA_BOOKING_ENDPOINT && CALMA_BOOKING_ENDPOINT.indexOf('PASTE_YOUR') === -1) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
        fetch(CALMA_BOOKING_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            name: name, phone: phone, email: email,
            checkin: checkin, checkout: checkout,
            room: room, guests: guests, message: message,
            source: 'Website Contact Form',
            page: window.location.href
          })
        }).catch(function () { /* silent — WhatsApp still goes through below */ })
          .finally(function () {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Booking Request'; }
          });
      }

      var lines = ['I am from website. Hello CALMA Hotel, I would like to book a room.'];
      if (name) lines.push('Name: ' + name);
      if (phone) lines.push('Phone: ' + phone);
      if (email) lines.push('Email: ' + email);
      if (checkin) lines.push('Check-in: ' + checkin);
      if (checkout) lines.push('Check-out: ' + checkout);
      if (room) lines.push('Room: ' + room);
      if (guests) lines.push('Guests: ' + guests);
      if (message) lines.push('Message: ' + message);

      var text = encodeURIComponent(lines.join('\n'));
      var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + text;

      if (note) {
        note.textContent = 'Thank you — your enquiry has been received. Opening WhatsApp so you can confirm with our team directly.';
        note.classList.add('show');
      }

      window.open(url, '_blank', 'noopener');
      form.reset();
    });
  }

  initRoomDetailModal();
  initReservationPage();
});

/* ===========================================================
   ROOM DETAIL MODAL — /rooms/
   Click any room thumbnail (or "View Details & Photos") to see
   the full gallery, price and amenities, then confirm through
   to the dedicated /rc/ reservation page.
   =========================================================== */
function initRoomDetailModal() {
  var modal = document.getElementById('room-modal');
  if (!modal) return;

  var mainImg = document.getElementById('rm-main-img');
  var thumbsWrap = document.getElementById('rm-thumbs');
  var countCurrent = document.getElementById('rm-count-current');
  var countTotal = document.getElementById('rm-count-total');
  var eyebrowEl = document.getElementById('rm-eyebrow');
  var titleEl = document.getElementById('rm-title');
  var descEl = document.getElementById('rm-desc');
  var sizeEl = document.getElementById('rm-size');
  var bedsEl = document.getElementById('rm-beds');
  var guestsEl = document.getElementById('rm-guests');
  var featuresEl = document.getElementById('rm-features');
  var originalPriceEl = document.getElementById('rm-price-original');
  var saveTagEl = document.getElementById('rm-save-tag');
  var currentPriceEl = document.getElementById('rm-price-current');
  var confirmBtn = document.getElementById('rm-confirm-btn');

  var currentRoom = null;
  var currentIndex = 0;
  var lastFocused = null;

  function renderImage() {
    if (!currentRoom) return;
    var img = currentRoom.images[currentIndex];
    mainImg.src = img.src;
    mainImg.alt = img.alt;
    countCurrent.textContent = currentIndex + 1;
    thumbsWrap.querySelectorAll('.rm-thumb').forEach(function (t, i) {
      t.classList.toggle('active', i === currentIndex);
    });
  }

  function openRoom(roomId) {
    var room = CALMA_ROOMS[roomId];
    if (!room) return;
    currentRoom = room;
    currentIndex = 0;

    eyebrowEl.textContent = room.eyebrow;
    titleEl.textContent = room.name;
    descEl.textContent = room.desc;
    sizeEl.textContent = room.size;
    bedsEl.textContent = room.beds;
    guestsEl.textContent = 'Up to ' + room.guests + ' guests';

    featuresEl.innerHTML = room.features.map(function (f) {
      return '<li>' + calmaCheckIcon() + f + '</li>';
    }).join('');

    originalPriceEl.textContent = calmaFormatMoney(room.originalPrice);
    saveTagEl.textContent = 'Save ' + room.save + '%';
    currentPriceEl.innerHTML = calmaFormatMoney(room.price) + '<small> / night, direct booking</small>';

    countTotal.textContent = room.images.length;
    thumbsWrap.innerHTML = room.images.map(function (img, i) {
      return '<button type="button" class="rm-thumb" data-index="' + i + '" aria-label="Photo ' + (i + 1) + '"><img src="' + img.src + '" alt=""></button>';
    }).join('');
    thumbsWrap.querySelectorAll('.rm-thumb').forEach(function (t) {
      t.addEventListener('click', function () {
        currentIndex = parseInt(t.getAttribute('data-index'), 10);
        renderImage();
      });
    });

    confirmBtn.setAttribute('href', '/rc/?room=' + encodeURIComponent(roomId));

    renderImage();

    lastFocused = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.querySelectorAll('[data-room-trigger]').forEach(function (el) {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('click', function () {
      openRoom(el.getAttribute('data-room-trigger'));
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRoom(el.getAttribute('data-room-trigger'));
      }
    });
  });

  modal.querySelectorAll('[data-close]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });

  modal.querySelector('.rm-prev').addEventListener('click', function () {
    if (!currentRoom) return;
    currentIndex = (currentIndex - 1 + currentRoom.images.length) % currentRoom.images.length;
    renderImage();
  });
  modal.querySelector('.rm-next').addEventListener('click', function () {
    if (!currentRoom) return;
    currentIndex = (currentIndex + 1) % currentRoom.images.length;
    renderImage();
  });

  document.addEventListener('keydown', function (e) {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') modal.querySelector('.rm-prev').click();
    if (e.key === 'ArrowRight') modal.querySelector('.rm-next').click();
  });
}

/* ===========================================================
   RESERVATION PAGE — /rc/
   Loads the chosen room, lets the guest pick dates, computes
   nights/total live, generates the RC code, submits the same
   data to the shared backend sheet (same as Contact), and then
   reveals an on-screen Reservation Card the guest can print or
   save as PDF, or continue on WhatsApp.
   =========================================================== */
function initReservationPage() {
  var root = document.getElementById('rc-page');
  if (!root) return;

  var params = new URLSearchParams(window.location.search);

  var roomSelect = document.getElementById('rc-room-select');
  var summaryImg = document.getElementById('rc-summary-img');
  var summaryName = document.getElementById('rc-summary-name');
  var summaryMeta = document.getElementById('rc-summary-meta');
  var summaryFeatures = document.getElementById('rc-summary-features');
  var priceOriginal = document.getElementById('rc-price-original');
  var priceCurrent = document.getElementById('rc-price-current');
  var saveTag = document.getElementById('rc-save-tag');
  var nightsOut = document.getElementById('rc-nights-out');
  var subtotalOut = document.getElementById('rc-subtotal-out');
  var totalOut = document.getElementById('rc-total-out');
  var checkinInput = document.getElementById('rc-checkin');
  var checkoutInput = document.getElementById('rc-checkout');
  var guestsInput = document.getElementById('rc-guests');

  var form = document.getElementById('rc-form');
  var formSection = document.getElementById('rc-form-section');
  var confirmSection = document.getElementById('rc-confirmation');

  function getRoom() {
    return CALMA_ROOMS[roomSelect.value] || CALMA_ROOMS[Object.keys(CALMA_ROOMS)[0]];
  }

  function todayISO(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return d.toISOString().slice(0, 10);
  }

  function nightsBetween(a, b) {
    var d1 = new Date(a), d2 = new Date(b);
    var diff = Math.round((d2 - d1) / 86400000);
    return diff > 0 ? diff : 1;
  }

  function renderSummary() {
    var room = getRoom();
    if (!room) return;

    summaryImg.src = room.images[0].src;
    summaryImg.alt = room.images[0].alt;
    summaryName.textContent = room.name;
    summaryMeta.textContent = room.beds + ' · ' + room.size + ' · Up to ' + room.guests + ' guests';
    summaryFeatures.innerHTML = room.features.slice(0, 5).map(function (f) {
      return '<li>' + calmaCheckIcon() + f + '</li>';
    }).join('');

    priceOriginal.textContent = calmaFormatMoney(room.originalPrice);
    saveTag.textContent = 'Save ' + room.save + '%';
    priceCurrent.innerHTML = calmaFormatMoney(room.price) + '<small> / night</small>';

    var nights = nightsBetween(checkinInput.value || todayISO(1), checkoutInput.value || todayISO(2));
    var subtotal = nights * room.price;

    nightsOut.textContent = nights + (nights === 1 ? ' night' : ' nights');
    subtotalOut.textContent = calmaFormatMoney(room.price) + ' × ' + nights;
    totalOut.textContent = calmaFormatMoney(subtotal);

    if (guestsInput) guestsInput.max = room.guests + 4;
  }

  // Populate the room <select> from the catalogue, in a fixed order.
  var order = ['classic-twin', 'deluxe-double', 'family', 'modern-suite'];
  roomSelect.innerHTML = order.map(function (id) {
    return '<option value="' + id + '">' + CALMA_ROOMS[id].name + '</option>';
  }).join('');

  var wantedRoom = params.get('room');
  if (wantedRoom && CALMA_ROOMS[wantedRoom]) {
    roomSelect.value = wantedRoom;
  }

  if (!checkinInput.value) checkinInput.value = todayISO(1);
  if (!checkoutInput.value) checkoutInput.value = todayISO(2);
  checkinInput.min = todayISO(0);
  checkoutInput.min = todayISO(1);

  roomSelect.addEventListener('change', renderSummary);
  checkinInput.addEventListener('change', function () {
    if (checkoutInput.value <= checkinInput.value) {
      var d = new Date(checkinInput.value);
      d.setDate(d.getDate() + 1);
      checkoutInput.value = d.toISOString().slice(0, 10);
    }
    checkoutInput.min = checkinInput.value;
    renderSummary();
  });
  checkoutInput.addEventListener('change', renderSummary);

  renderSummary();

  function generateRCCode() {
    var d = new Date();
    var datePart = String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'RC-' + datePart + '-' + rand;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var room = getRoom();
    var nights = nightsBetween(checkinInput.value, checkoutInput.value);
    var total = nights * room.price;
    var code = generateRCCode();
    var timestamp = new Date();

    var name = (document.getElementById('rc-name') || {}).value || '';
    var phone = (document.getElementById('rc-phone') || {}).value || '';
    var email = (document.getElementById('rc-email') || {}).value || '';
    var country = (document.getElementById('rc-country') || {}).value || '';
    var guests = guestsInput.value || room.guests;
    var message = (document.getElementById('rc-message') || {}).value || '';

    var submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Confirming…'; }

    var payload = {
      rcCode: code,
      name: name, phone: phone, email: email, country: country,
      checkin: checkinInput.value, checkout: checkoutInput.value, nights: nights,
      room: room.name, roomPrice: room.price, total: total, guests: guests,
      message: message,
      source: 'Website RC (Direct Reservation)',
      page: window.location.href
    };

    if (CALMA_BOOKING_ENDPOINT && CALMA_BOOKING_ENDPOINT.indexOf('PASTE_YOUR') === -1) {
      fetch(CALMA_BOOKING_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).catch(function () { /* silent — the RC still shows on screen below */ });
    }

    revealConfirmation({
      code: code, room: room, nights: nights, total: total,
      name: name, phone: phone, email: email,
      checkin: checkinInput.value, checkout: checkoutInput.value,
      guests: guests, timestamp: timestamp
    });
  });

  function revealConfirmation(d) {
    document.getElementById('rcc-code').textContent = d.code;
    document.getElementById('rcc-name').textContent = d.name;
    document.getElementById('rcc-room').textContent = d.room.name;
    document.getElementById('rcc-checkin').textContent = d.checkin;
    document.getElementById('rcc-checkout').textContent = d.checkout;
    document.getElementById('rcc-nights').textContent = d.nights;
    document.getElementById('rcc-guests').textContent = d.guests;
    document.getElementById('rcc-total').textContent = calmaFormatMoney(d.total);
    document.getElementById('rcc-perNight').textContent = calmaFormatMoney(d.room.price) + ' × ' + d.nights + ' ' + (d.nights === 1 ? 'night' : 'nights');
    document.getElementById('rcc-issued').textContent = d.timestamp.toLocaleString();

    var waLines = [
      'I am from website. Hello CALMA Hotel, I would like to confirm my reservation.',
      'Reservation Code: ' + d.code,
      'Name: ' + d.name,
      'Phone: ' + d.phone,
      'Room: ' + d.room.name,
      'Check-in: ' + d.checkin,
      'Check-out: ' + d.checkout,
      'Nights: ' + d.nights,
      'Guests: ' + d.guests,
      'Total: ' + calmaFormatMoney(d.total)
    ];
    var waBtn = document.getElementById('rcc-whatsapp');
    waBtn.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(waLines.join('\n'));

    formSection.classList.add('rc-hidden');
    confirmSection.classList.remove('rc-hidden');
    confirmSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var printBtn = document.getElementById('rcc-print');
  if (printBtn) {
    printBtn.addEventListener('click', function () { window.print(); });
  }
}
