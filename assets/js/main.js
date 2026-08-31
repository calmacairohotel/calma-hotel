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
  // Solid nav on scroll — driven by IntersectionObserver on a tiny sentinel
  // element placed 60px from the top of the page. This avoids reading
  // window.scrollY (or any geometry property) inside a scroll handler,
  // which is what was causing the "forced reflow" flagged by PageSpeed.
  var nav = document.querySelector('.site-nav');
  var navSentinel = document.querySelector('.nav-sentinel');
  if (nav && navSentinel && 'IntersectionObserver' in window) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        nav.classList.toggle('solid', !entry.isIntersecting);
      });
    });
    navIO.observe(navSentinel);
  } else if (nav) {
    // Fallback for the rare browser without IntersectionObserver support.
    var applyNavState = function () {
      nav.classList.toggle('solid', window.scrollY > 60);
    };
    var navTicking = false;
    var toggleSolid = function () {
      if (navTicking) return;
      navTicking = true;
      window.requestAnimationFrame(function () { navTicking = false; applyNavState(); });
    };
    applyNavState();
    window.addEventListener('scroll', toggleSolid, { passive: true });
  }

  // Mobile drawer — a full-screen overlay, so it needs proper dialog
  // behaviour: focus moves in when it opens, Escape and the close button
  // both work, Tab is trapped inside while it's open, focus returns to the
  // toggle button when it closes, and the background stops scrolling.
  var openBtn = document.querySelector('.nav-toggle');
  var drawer = document.querySelector('.mobile-drawer');
  var closeBtn = document.querySelector('.close-drawer');
  var DRAWER_TRANSITION_MS = 500; // keep in sync with the CSS transition duration
  var drawerKeydownHandler = null;

  function getFocusable(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
  }

  function openDrawer() {
    if (!drawer || !openBtn) return;
    drawer.hidden = false;
    void drawer.offsetHeight; // force the browser to register the un-hidden state first
    window.requestAnimationFrame(function () { drawer.classList.add('open'); });
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');

    var focusables = getFocusable(drawer);
    (closeBtn || focusables[0] || drawer).focus();

    drawerKeydownHandler = function (e) {
      if (e.key === 'Escape') { closeDrawer(); return; }
      if (e.key !== 'Tab') return;
      var items = getFocusable(drawer);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', drawerKeydownHandler);
  }

  function closeDrawer() {
    if (!drawer || !openBtn) return;
    drawer.classList.remove('open');
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    if (drawerKeydownHandler) {
      document.removeEventListener('keydown', drawerKeydownHandler);
      drawerKeydownHandler = null;
    }
    window.setTimeout(function () { drawer.hidden = true; }, DRAWER_TRANSITION_MS);
    openBtn.focus();
  }

  if (openBtn && drawer) {
    openBtn.addEventListener('click', openDrawer);
  }
  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', closeDrawer);
  }
  if (drawer) {
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeDrawer);
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

  // Booking dates — stop guests picking a check-in date in the past, and
  // keep check-out locked to "after check-in" once check-in is chosen.
  var checkinInput = document.querySelector('#checkin');
  var checkoutInput = document.querySelector('#checkout');
  if (checkinInput && checkoutInput) {
    var todayISO = new Date().toISOString().slice(0, 10);
    checkinInput.setAttribute('min', todayISO);
    checkoutInput.setAttribute('min', todayISO);
    checkinInput.addEventListener('change', function () {
      if (!checkinInput.value) return;
      var nextDay = new Date(checkinInput.value + 'T00:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      var nextDayISO = nextDay.toISOString().slice(0, 10);
      checkoutInput.setAttribute('min', nextDayISO);
      if (checkoutInput.value && checkoutInput.value <= checkinInput.value) {
        checkoutInput.value = nextDayISO;
      }
    });
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
