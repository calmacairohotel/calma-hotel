document.addEventListener('DOMContentLoaded', function () {
     // Force the two hero buttons to match widths exactly, and pin the
  // "Scroll" cue to the real midpoint between them — measured directly
  // from the DOM, not assumed via CSS percentages (which can drift).
  var syncHeroCta = function () {
    var hero = document.querySelector('.hero');
    var cta = document.querySelector('.hero-cta');
    var cue = document.querySelector('.scroll-cue');
    if (!hero || !cta) return;
    var btns = cta.querySelectorAll('.btn');
    if (btns.length < 2) return;

    btns.forEach(function (b) { b.style.width = ''; });

    if (window.innerWidth >= 380) {
      var maxW = 0;
      btns.forEach(function (b) { maxW = Math.max(maxW, b.offsetWidth); });
      btns.forEach(function (b) { b.style.width = maxW + 'px'; });
    }

    if (cue) {
      var heroRect = hero.getBoundingClientRect();
      var firstRect = btns[0].getBoundingClientRect();
      var lastRect = btns[btns.length - 1].getBoundingClientRect();
      var gapMid = (firstRect.right + lastRect.left) / 2;
      cue.style.left = (gapMid - heroRect.left) + 'px';
    }
  };
  syncHeroCta();
  window.addEventListener('resize', syncHeroCta);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncHeroCta);
  }
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

  // Contact form — sends the enquiry straight to CALMA Hotel on WhatsApp
  var WHATSAPP_NUMBER = '201273736667';
  var form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = (form.querySelector('#name') || {}).value || '';
      var phone = (form.querySelector('#phone') || {}).value || '';
      var checkin = (form.querySelector('#checkin') || {}).value || '';
      var checkout = (form.querySelector('#checkout') || {}).value || '';
      var room = (form.querySelector('#room') || {}).value || '';
      var guests = (form.querySelector('#guests') || {}).value || '';
      var message = (form.querySelector('#message') || {}).value || '';

      var lines = ['I am from website. Hello CALMA Hotel, I would like to enquire about a stay.'];
      if (name) lines.push('Name: ' + name);
      if (phone) lines.push('Phone: ' + phone);
      if (checkin) lines.push('Check-in: ' + checkin);
      if (checkout) lines.push('Check-out: ' + checkout);
      if (room) lines.push('Room: ' + room);
      if (guests) lines.push('Guests: ' + guests);
      if (message) lines.push('Message: ' + message);

      var text = encodeURIComponent(lines.join('\n'));
      var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + text;

      var note = form.querySelector('.form-note');
      if (note) {
        note.textContent = 'Opening WhatsApp with your enquiry — send the message to confirm.';
        note.classList.add('show');
      }

      window.open(url, '_blank', 'noopener');
      form.reset();
    });
  }
});
