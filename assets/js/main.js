/* =========================================================
   CALMA HOTEL — Direct Booking Sync
   Every booking/enquiry submitted on /contact/ is sent to a
   single Google Sheet (via a Google Apps Script Web App) so
   the hotel has one permanent, always-growing record of every
   direct-website booking, complete with an auto-generated
   Gold Card + 15% voucher PDF per booking.
   PASTE YOUR DEPLOYED APPS SCRIPT WEB APP URL BELOW — see
   the setup guide provided alongside this website.
   ========================================================= */
var CALMA_BOOKING_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyAoC2XdxfzsTwxkHQHuEFzgi62aoHPKXb7yqxm8YVemgIRrK2QnzyNlC74FsshJhDL/exec';

document.addEventListener('DOMContentLoaded', function () {
  // Solid nav on scroll (batched with rAF to avoid forced reflow on every scroll tick)
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

  // Mobile drawer
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

  // Reveal on scroll
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

  // Pre-select the room type when arriving from a "Book This Room" link,
  // e.g. /contact/?room=Deluxe%20Double%20Room
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

  // Contact / Booking form
  // 1) Saves the enquiry to CALMA Hotel's live Google Sheet (one shared sheet,
  //    every submission becomes a new row with its own booking code + Gold Card).
  // 2) Also opens WhatsApp with the same details, so the front desk gets an
  //    instant heads-up in addition to the permanent record.
  var WHATSAPP_NUMBER = '201273736667';
  var form = document.querySelector('.contact-form');
  if (form) {
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

      // ---- 1) Send to the Google Sheet (Apps Script Web App) ----
      if (CALMA_BOOKING_ENDPOINT && CALMA_BOOKING_ENDPOINT.indexOf('PASTE_YOUR') === -1) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
        fetch(CALMA_BOOKING_ENDPOINT, {
          method: 'POST',
          mode: 'no-cors', // Apps Script web apps don't return readable CORS headers;
                            // we fire-and-forget and treat network success as success.
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

      // ---- 2) Open WhatsApp with the same details ----
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
        note.textContent = 'Thank you — your booking request has been received. Opening WhatsApp so you can confirm with our team directly.';
        note.classList.add('show');
      }

      window.open(url, '_blank', 'noopener');
      form.reset();
    });
  }
});
