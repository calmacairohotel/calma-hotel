/* =========================================================
   CALMA HOTEL — pricing engine (shared)
   The SAME code runs on the website, in the admin panel and inside the
   Google Apps Script backend (pasted into Code.gs), so the price a guest
   sees is exactly the price saved with the booking.

   Content model (all edited from /admin/):
   room.price            base nightly price
   room.rates[date]      price for one exact night (calendar override)
   room.inventory        how many rooms of this type exist (blank = not tracked)
   room.minNights        minimum stay for this room
   room.blocked[]        closed date ranges {from,to}
   room.maxNights        maximum stay
   room.cta / room.ctd   {date:1} closed to arrival / closed to departure
   room.baseOcc          guests included in the price (default = maxGuests)
   room.extraAdult       fee per extra adult per night;  room.childFee per child per night
   C.settings.taxes[]    {name, pct, perNight, included}
   C.seasons[]           {name, from, to, days[0-6], mode 'pct'|'fixed', value, rooms[], active}
   C.ratePlans[]         {id, name, adjust %, breakfast, refundable, cancellation, minNights, rooms[], active}
   C.promos[]            {id, name, type 'basic'|'early'|'last'|'los'|'code', pct, days, minNights,
                          codeHash, bookFrom, bookTo, stayFrom, stayTo, rooms[], plans[], active}
   Dates are 'YYYY-MM-DD' strings; all maths is done in UTC.
   ========================================================= */
(function (root) {
  var DAY = 864e5;
  function P(s) { var a = String(s).split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function add(s, n) { return iso(P(s) + n * DAY); }
  function nights(a, b) { return a && b ? Math.round((P(b) - P(a)) / DAY) : 0; }
  function dow(s) { return new Date(P(s)).getUTCDay(); }
  function num(v) { return v == null || v === '' || isNaN(v) ? null : Number(v); }
  function applies(list, id) { return !list || !list.length || list.indexOf(id) >= 0; }
  function inRange(d, f, t) { return (!f || d >= f) && (!t || d <= t); }
  function each(cin, cout, fn) { for (var d = cin, i = 0; d < cout && i < 400; d = add(d, 1), i++) fn(d); }

  /** Base price of one night (before rate plan & promotions). null = price on request. */
  function nightly(C, r, d) {
    var ov = r.rates ? num(r.rates[d]) : null;
    if (ov != null && ov > 0) return ov;
    var p = num(r.price);
    if (p == null || p <= 0) return null;
    var base = p;
    (C.seasons || []).forEach(function (s) {
      if (s.active === false || !applies(s.rooms, r.id) || !inRange(d, s.from, s.to)) return;
      if (s.days && s.days.length && s.days.indexOf(dow(d)) < 0) return;
      var v = num(s.value); if (v == null) return;
      p = s.mode === 'fixed' ? v : p + base * v / 100;
    });
    return Math.max(0, Math.round(p));
  }
  /** Is this night closed for the room? */
  function closed(r, d) { return (r.blocked || []).some(function (x) { return x && x.from && x.to && d >= x.from && d <= x.to; }); }
  function closedFor(r, cin, cout) { var c = false; each(cin, cout, function (d) { if (closed(r, d)) c = true; }); return c; }

  var DEFAULT_PLAN = { id: 'standard', name: 'Standard rate', adjust: 0, breakfast: true, refundable: true, cancellation: '' };
  function plans(C, r) {
    var L = (C.ratePlans || []).filter(function (p) { return p.active !== false && applies(p.rooms, r.id); });
    return L.length ? L : [DEFAULT_PLAN];
  }

  function promoBasicOk(pr, r, plan, cin, cout, today, codeHash) {
    if (pr.active === false || !(num(pr.pct) > 0)) return false;
    if (!applies(pr.rooms, r.id) || !applies(pr.plans, plan.id)) return false;
    if (!inRange(today, pr.bookFrom, pr.bookTo)) return false;
    var n = nights(cin, cout), lead = nights(today, cin);
    if (num(pr.minNights) && n < num(pr.minNights)) return false;
    if (pr.type === 'early' && lead < (num(pr.days) || 0)) return false;
    if (pr.type === 'last' && lead > (num(pr.days) || 0)) return false;
    if (pr.type === 'code' && (!codeHash || !pr.codeHash || codeHash !== pr.codeHash)) return false;
    return true;
  }

  /**
   * Full price for a stay.
   * o = { today:'YYYY-MM-DD', codeHash:'…', adults, children }
   * → { plan, nights, priced, base, discount, extras, total, taxes, grand, promo, perNight[],
   *     minNights, minOk, maxNights, maxOk, closed, cta, ctd, ok }
   */
  function quote(C, r, planId, cin, cout, o) {
    o = o || {};
    var today = o.today || iso(Date.now()), n = nights(cin, cout);
    var pl = plans(C, r), plan = pl.filter(function (x) { return x.id === planId; })[0] || pl[0];
    var adj = 1 + (num(plan.adjust) || 0) / 100;
    var res = { plan: plan, nights: n, priced: n > 0, base: 0, discount: 0, total: 0, promo: null, perNight: [] };
    each(cin, cout, function (d) {
      var b = nightly(C, r, d);
      if (b == null) res.priced = false;
      res.perNight.push({ date: d, price: b == null ? null : Math.round(b * adj) });
    });
    var mn = Math.max(num(r.minNights) || 0, num(plan.minNights) || 0);
    var mx = num(r.maxNights) || num(plan.maxNights) || 0;
    res.minNights = mn; res.minOk = n >= Math.max(1, mn); res.maxNights = mx; res.maxOk = !mx || n <= mx;
    res.closed = closedFor(r, cin, cout); res.cta = !!(r.cta && r.cta[cin]); res.ctd = !!(r.ctd && r.ctd[cout]);
    res.ok = n > 0 && res.minOk && res.maxOk && !res.closed && !res.cta && !res.ctd;
    if (!res.priced) { res.base = res.total = res.grand = null; return res; }
    res.perNight.forEach(function (x) { res.base += x.price; });
    var best = null, bestOff = 0;
    (C.promos || []).forEach(function (pr) {
      if (!promoBasicOk(pr, r, plan, cin, cout, today, o.codeHash)) return;
      var off = 0;
      res.perNight.forEach(function (x) { if (inRange(x.date, pr.stayFrom, pr.stayTo)) off += x.price * num(pr.pct) / 100; });
      if (off > bestOff) { bestOff = off; best = pr; }
    });
    res.discount = Math.round(bestOff);
    // occupancy: extra adults / children beyond what the price includes
    var ad = num(o.adults) || 0, ch = num(o.children) || 0, inc = num(r.baseOcc) || num(r.maxGuests) || 2;
    res.extras = Math.round(n * (Math.max(0, ad - inc) * (num(r.extraAdult) || 0) + ch * (num(r.childFee) || 0)));
    res.total = res.base - res.discount + res.extras;
    // taxes & fees (only the ones not already included in the price)
    res.taxes = 0; res.taxLines = [];
    ((C.settings && C.settings.taxes) || []).forEach(function (t) {
      if (!t || t.included) return;
      var v = Math.round((num(t.pct) || 0) * res.total / 100 + (num(t.perNight) || 0) * n);
      if (v > 0) { res.taxes += v; res.taxLines.push({ name: t.name, amount: v }); }
    });
    res.grand = res.total + res.taxes;
    if (best) res.promo = { id: best.id, name: best.name, pct: num(best.pct), type: best.type };
    return res;
  }

  /** Rooms left for the stay. booked = {roomId:{date:count}}. null = not tracked. */
  function left(r, cin, cout, booked) {
    var inv = num(r.inventory); if (inv == null) return null;
    var m = 0;
    each(cin, cout, function (d) { var c = (booked && booked[r.id] && booked[r.id][d]) || 0; if (c > m) m = c; });
    return Math.max(0, inv - m);
  }

  /** Lowest one-night price to show on room cards ("From …"). */
  function fromPrice(C, r, today) {
    today = today || iso(Date.now());
    var cin = add(today, 1), cout = add(today, 2), best = null;
    plans(C, r).forEach(function (p) {
      if ((num(p.minNights) || 0) > 1) return;
      var q = quote(C, r, p.id, cin, cout, { today: today });
      if (q.priced && (!best || q.total < best.total)) best = q;
    });
    if (!best) return null;
    var std = quote(C, r, plans(C, r)[0].id, cin, cout, { today: today });
    return { price: best.total, was: std.priced && std.base > best.total ? std.base : null, promo: best.promo };
  }
  /** The best public deal for a room (for badges). */
  function bestDeal(C, r, today) {
    today = today || iso(Date.now());
    var b = null;
    (C.promos || []).forEach(function (pr) {
      if (pr.active === false || pr.type === 'code' || !(num(pr.pct) > 0) || !applies(pr.rooms, r.id)) return;
      if (!inRange(today, pr.bookFrom, pr.bookTo) || (pr.stayTo && pr.stayTo < today)) return;
      if (!b || num(pr.pct) > num(b.pct)) b = pr;
    });
    return b;
  }

  root.CalmaPricing = { nightly: nightly, quote: quote, plans: plans, left: left, closed: closed, closedFor: closedFor, fromPrice: fromPrice, bestDeal: bestDeal, add: add, nights: nights, dow: dow, iso: iso };
})(typeof window !== 'undefined' ? window : this);
