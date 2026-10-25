/*************************************************************
 *  CALMA HOTEL — Website backend (bookings + admin panel)
 *  -----------------------------------------------------------
 *  One Google Apps Script web app does everything:
 *
 *   PUBLIC
 *   • GET  ?action=content   → the live website content (rooms, prices,
 *                              photos, journeys, settings) edited in /admin/
 *   • GET  ?action=avail&from=&to= → how many rooms of each type are
 *                              already booked per night (for "sold out")
 *   • POST {action:'book',…} → re-checks availability and re-calculates the
 *                              price (rate plan, season, promotion, taxes)
 *                              with the same engine as the website, then saves the booking as a new row in the
 *                              "Bookings" sheet, gives it a code (CLM-00001),
 *                              builds the Gold Card PDF and emails the owner.
 *
 *   ADMIN  (password protected — used by calmacairohotel.com/admin/)
 *   • login, saveContent, uploadImage, listBookings, updateBooking,
 *     changePassword
 *
 *  SETUP (once): see SETUP-GUIDE.md next to this file.
 *  After pasting a new version: Deploy ▸ Manage deployments ▸ Edit ▸
 *  Version: "New version" ▸ Deploy  (keeps the same URL).
 *************************************************************/

// ---------------------- CONFIG ----------------------
var OWNER_EMAIL   = 'hatemahmedsayedss2233@gmail.com';
var SHEET_NAME    = 'Bookings';
var DRIVE_FOLDER  = 'CALMA Gold Cards';
var IMAGES_FOLDER = 'CALMA Website Images';
var CONTENT_FILE  = 'calma-website-content.json';
var HOTEL_NAME    = 'CALMA Hotel';
var HOTEL_PHONE   = '+20 12 7373 6667';
var VOUCHER_PCT   = '15%';
// First admin password. Change it from the admin panel after the first login
// (the new one is stored privately in Script Properties and overrides this).
var DEFAULT_ADMIN_PASSWORD = 'calma2026';
// ------------------------------------------------------

var SHEET_HEADERS = [
  'Timestamp', 'Booking Code', 'Full Name', 'Phone', 'Email',
  'Check-in', 'Check-out', 'Room Type', 'Guests', 'Message',
  'Source', 'Status', 'Gold Card',
  'Nights', 'Adults', 'Children', 'Total', 'Arrival', 'Room ID',
  'Rate Plan', 'Promotion', 'Promo Code', 'Price Before Discount', 'Discount', 'Taxes'
];
var HOTEL_TZ = 'Africa/Cairo';
var BACKEND_VERSION = '2026-10-25';
var ACTIVE_STATUSES = ['New', 'Confirmed', 'Checked-in', 'Completed'];

/** GET: live website content (public) or a health check. */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'content') {
    return jsonOutput({ status: 'ok', content: readContent() });
  }
  if (action === 'avail') {
    var from = String(e.parameter.from || ''), to = String(e.parameter.to || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return jsonOutput({ status: 'error', message: 'bad-dates' });
    return jsonOutput({ status: 'ok', booked: bookedMap(from, to) });
  }
  if (action === 'version') return jsonOutput({ status: 'ok', version: BACKEND_VERSION });
  return ContentService.createTextOutput('CALMA Hotel website service is running (version ' + BACKEND_VERSION + ').');
}

/** POST: bookings from the website + every admin action. */
function doPost(e) {
  var data = parseIncoming(e) || {};
  var action = data.action || 'book';
  try {
    if (action === 'book') return jsonOutput(handleBooking(data));
    if (action === 'login') {
      if (String(data.password || '') !== getAdminPassword()) return jsonOutput({ status: 'error', message: 'wrong-password' });
      return jsonOutput({ status: 'ok', token: makeToken() });
    }
    if (!checkToken(data.token)) return jsonOutput({ status: 'error', message: 'not-authorised' });
    if (action === 'saveContent') return jsonOutput(saveContent(data.content));
    if (action === 'uploadImage') return jsonOutput(uploadImage(data));
    if (action === 'listBookings') return jsonOutput(listBookings(data.limit));
    if (action === 'updateBooking') return jsonOutput(updateBooking(data.row, data.status));
    if (action === 'changePassword') {
      if (!data.newPassword || String(data.newPassword).length < 6) return jsonOutput({ status: 'error', message: 'too-short' });
      PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', String(data.newPassword));
      return jsonOutput({ status: 'ok' });
    }
    return jsonOutput({ status: 'error', message: 'unknown-action' });
  } catch (err) {
    return jsonOutput({ status: 'error', message: String(err) });
  }
}

// ---------------------- bookings ----------------------

function handleBooking(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getBookingSheet();
    var checked = checkAndPrice(data);
    if (checked.error) return { status: 'error', message: checked.error };
    var rowNumber = sheet.getLastRow() + 1;
    var code = 'CLM-' + Utilities.formatString('%05d', rowNumber - 1);
    var timestamp = new Date();
    var row = {
      'Timestamp': timestamp, 'Booking Code': code, 'Full Name': data.name || '', 'Phone': data.phone || '', 'Email': data.email || '',
      'Check-in': data.checkin || '', 'Check-out': data.checkout || '', 'Room Type': data.room || '', 'Guests': data.guests || '',
      'Message': data.message || '', 'Source': data.source || 'Website', 'Status': 'New', 'Gold Card': '',
      'Nights': data.nights || '', 'Adults': data.adults || '', 'Children': data.children || '',
      'Total': data.total ? (data.currency || '') + ' ' + data.total : '', 'Arrival': data.arrival || '', 'Room ID': data.roomId || '',
      'Rate Plan': data.planName || '', 'Promotion': data.promo || '', 'Promo Code': data.promo && data.promoCode ? String(data.promoCode).toUpperCase() : '',
      'Price Before Discount': data.base || '', 'Discount': data.discount || '', 'Taxes': data.taxes || ''
    };
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.appendRow(headers.map(function (h) { return row.hasOwnProperty(h) ? row[h] : ''; }));

    var result = buildGoldCard(code, data, timestamp);
    var goldCardCell = sheet.getRange(rowNumber, headers.indexOf('Gold Card') + 1);
    if (result.url) goldCardCell.setFormula('=HYPERLINK("' + result.url + '","Open Gold Card")');
    else goldCardCell.setValue('Failed: ' + result.error);

    try { notifyOwner(data, code, result.url, timestamp); } catch (mailErr) { Logger.log(mailErr); }
    return { status: 'ok', code: code, goldCard: result.url || null };
  } finally {
    lock.releaseLock();
  }
}

function listBookings(limit) {
  var sheet = getBookingSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { status: 'ok', headers: SHEET_HEADERS, rows: [] };
  limit = Math.min(5000, Math.max(1, Number(limit) || 300));
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var first = Math.max(2, last - limit + 1);
  var range = sheet.getRange(first, 1, last - first + 1, headers.length);
  var values = range.getDisplayValues(), raw = range.getValues();
  var ci = headers.indexOf('Check-in'), co = headers.indexOf('Check-out');
  var rows = values.map(function (v, i) {
    var o = { _row: first + i };
    headers.forEach(function (h, k) { o[h] = v[k]; });
    if (ci >= 0) o['Check-in'] = normDate(raw[i][ci]);
    if (co >= 0) o['Check-out'] = normDate(raw[i][co]);
    return o;
  }).reverse();
  return { status: 'ok', headers: headers, rows: rows };
}

function updateBooking(row, status) {
  var allowed = ['New', 'Confirmed', 'Checked-in', 'Completed', 'Cancelled', 'No-show'];
  if (allowed.indexOf(status) < 0) return { status: 'error', message: 'bad-status' };
  var sheet = getBookingSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  row = Number(row);
  if (!row || row < 2 || row > sheet.getLastRow()) return { status: 'error', message: 'bad-row' };
  sheet.getRange(row, headers.indexOf('Status') + 1).setValue(status);
  return { status: 'ok' };
}

/** Sheets turns '2026-11-12' into a date — always read it back as YYYY-MM-DD. */
function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, HOTEL_TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2) : s;
}
function cairoToday() { return Utilities.formatDate(new Date(), HOTEL_TZ, 'yyyy-MM-dd'); }
function hashCode(code) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(code).trim().toUpperCase(), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** {roomId: {date: count}} of active bookings overlapping [from, to). */
function bookedMap(from, to) {
  var sheet = getBookingSheet(), last = sheet.getLastRow(), map = {};
  if (last < 2) return map;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var H = function (n) { return headers.indexOf(n); };
  var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var content = readContent() || { rooms: [] };
  values.forEach(function (v) {
    if (ACTIVE_STATUSES.indexOf(String(v[H('Status')])) < 0) return;
    var cin = normDate(v[H('Check-in')]), cout = normDate(v[H('Check-out')]);
    if (!cin || !cout || cout <= from || cin >= to) return;
    var id = H('Room ID') >= 0 ? String(v[H('Room ID')] || '') : '';
    if (!id) { var r = (content.rooms || []).filter(function (x) { return x.name === v[H('Room Type')]; })[0]; id = r ? r.id : ''; }
    if (!id) return;
    map[id] = map[id] || {};
    for (var d = cin, i = 0; d < cout && i < 120; d = CalmaPricing.add(d, 1), i++) {
      if (d >= from && d < to) map[id][d] = (map[id][d] || 0) + 1;
    }
  });
  return map;
}

/**
 * Server-side check of a website booking: room still available, stay rules
 * respected, and the price re-calculated (never trust the browser's total).
 * Fills data.total / base / discount / taxes / promo / planName in place.
 */
function checkAndPrice(data) {
  var content = readContent();
  if (!content || !data.roomId || !data.checkin || !data.checkout) return {};
  var room = (content.rooms || []).filter(function (r) { return r.id === data.roomId; })[0];
  if (!room) return {};
  var q = CalmaPricing.quote(content, room, data.planId, data.checkin, data.checkout, {
    today: cairoToday(), adults: data.adults, children: data.children,
    codeHash: data.promoCode ? hashCode(data.promoCode) : ''
  });
  if (q.closed) return { error: 'not-available' };
  if (!q.minOk || !q.maxOk || q.cta || q.ctd) return { error: 'restricted' };
  var left = CalmaPricing.left(room, data.checkin, data.checkout, bookedMap(data.checkin, data.checkout));
  if (left === 0) return { error: 'sold-out' };
  data.planName = q.plan.name;
  data.promo = q.promo ? q.promo.name + ' (-' + q.promo.pct + '%)' : '';
  if (q.priced) { data.total = q.grand; data.base = q.base; data.discount = q.discount; data.taxes = q.taxes; }
  else { data.total = ''; data.base = ''; data.discount = ''; data.taxes = ''; }
  data.currency = (content.settings && content.settings.currency) || data.currency;
  return {};
}

// ---------------------- website content ----------------------

function contentFolder() {
  var it = DriveApp.getFoldersByName(IMAGES_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(IMAGES_FOLDER);
}

function readContent() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('content');
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  var files = DriveApp.getFilesByName(CONTENT_FILE);
  if (!files.hasNext()) return null;
  var text = files.next().getBlob().getDataAsString('UTF-8');
  if (text.length < 95000) cache.put('content', text, 300);
  return JSON.parse(text);
}

function saveContent(content) {
  if (!content || !content.rooms || !content.settings) return { status: 'error', message: 'bad-content' };
  content.updatedAt = new Date().toISOString();
  var text = JSON.stringify(content);
  var files = DriveApp.getFilesByName(CONTENT_FILE);
  if (files.hasNext()) files.next().setContent(text);
  else contentFolder().createFile(CONTENT_FILE, text, 'application/json');
  CacheService.getScriptCache().remove('content');
  return { status: 'ok', updatedAt: content.updatedAt };
}

function uploadImage(data) {
  if (!data.data) return { status: 'error', message: 'no-data' };
  var bytes = Utilities.base64Decode(String(data.data).replace(/^data:[^,]+,/, ''));
  var name = (data.name || 'photo') .replace(/[^\w.\-]+/g, '-').slice(0, 60);
  var blob = Utilities.newBlob(bytes, data.mime || 'image/jpeg', Date.now() + '-' + name);
  var file = contentFolder().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { status: 'ok', id: file.getId(), url: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w1600' };
}

// ---------------------- admin auth ----------------------

function getAdminPassword() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') || DEFAULT_ADMIN_PASSWORD;
}
function tokenSecret() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s + '|' + getAdminPassword(); // changing the password logs everyone out
}
function sign(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, tokenSecret()));
}
function makeToken() {
  var exp = String(Date.now() + 7 * 24 * 3600 * 1000); // valid for 7 days
  return exp + '.' + sign(exp);
}
function checkToken(token) {
  if (!token) return false;
  var parts = String(token).split('.');
  if (parts.length !== 2 || Number(parts[0]) < Date.now()) return false;
  return sign(parts[0]) === parts[1];
}

/** Quick manual test of the booking + Gold Card flow (Run ▷ in the editor). */
function testGoldCard() {
  var result = buildGoldCard('TEST-00000', {
    name: 'Test Guest', phone: '+20 100 000 0000', email: 'test@example.com',
    checkin: '2026-09-01', checkout: '2026-09-03', room: 'Deluxe Double Room', guests: 2
  }, new Date());
  Logger.log(result.url ? ('SUCCESS — Gold Card URL: ' + result.url) : ('FAILED — error was: ' + result.error));
}

// ---------------------- helpers ----------------------

function parseIncoming(e) {
  // The website sends JSON as text/plain to avoid CORS preflight issues.
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { /* fall through */ }
  }
  return (e && e.parameter) ? e.parameter : {};
}

function getBookingSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
  } else {
    // add any new columns (Nights, Total, …) to an existing sheet without touching old rows
    var have = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    SHEET_HEADERS.forEach(function (h) {
      if (have.indexOf(h) < 0) { sheet.getRange(1, have.length + 1).setValue(h); have.push(h); }
    });
  }
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function getGoldCardFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);
}

function notifyOwner(data, code, cardUrl, timestamp) {
  data = data || {};
  var subject = 'New website booking — ' + HOTEL_NAME + ' (' + code + ')';
  var lines = [
    'A new booking request just came in from the website.', '',
    'Booking Code: ' + code,
    'Name: ' + (data.name || '-'),
    'Phone: ' + (data.phone || '-'),
    'Email: ' + (data.email || '-'),
    'Room: ' + (data.room || '-'),
    'Rate plan: ' + (data.planName || '-'),
    'Offer: ' + (data.promo ? data.promo + (data.promoCode ? ' · code ' + String(data.promoCode).toUpperCase() : '') : '-'),
    'Check-in: ' + (data.checkin || '-'),
    'Check-out: ' + (data.checkout || '-') + (data.nights ? ' (' + data.nights + ' nights)' : ''),
    'Guests: ' + (data.adults || data.guests || '-') + ' adults' + (data.children ? ', ' + data.children + ' children' : ''),
    'Total: ' + (data.total ? (data.currency || '') + ' ' + data.total : 'price on request'),
    'Arrival: ' + (data.arrival || '-'),
    'Notes: ' + (data.message || '-'),
    'Received: ' + timestamp, '',
    cardUrl ? ('Gold Card (15% voucher) PDF: ' + cardUrl) : 'Gold Card could not be generated automatically — check the sheet for the error.', '',
    'Manage bookings: https://calmacairohotel.com/admin/',
    'Full record: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ];
  MailApp.sendEmail(OWNER_EMAIL, subject, lines.join('\n'));
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Builds a "Gold Card" PDF for one booking: guest name, booking code,
 * stay details and a 15% voucher. Returns { url, error }: url is a
 * shareable Drive link on success, or null with `error` set to the
 * exact failure message on failure.
 */
function buildGoldCard(code, data, timestamp) {
  var doc, docFile;
  try {
    doc = DocumentApp.create(HOTEL_NAME + ' Gold Card — ' + code);
    var body = doc.getBody();
    body.setMarginTop(0).setMarginBottom(0).setMarginLeft(0).setMarginRight(0);
    body.setPageWidth(560).setPageHeight(340);

    var GOLD = '#B58A45';
    var GOLD_LIGHT = '#D8A85E';
    var ESPRESSO = '#241B12';
    var IVORY = '#F6F1E7';

    // Outer single-cell "card" table gives us a full-bleed dark background + gold border.
    var table = body.appendTable([['']]);
    table.setBorderWidth(2);
    table.setBorderColor(GOLD);
    var cell = table.getCell(0, 0);
    cell.setBackgroundColor(ESPRESSO);
    cell.setPaddingTop(26).setPaddingBottom(26).setPaddingLeft(34).setPaddingRight(34);

    // Docs adds one empty paragraph to a new cell automatically. Calling
    // setText('') on it throws "Cannot insert an empty text element", so
    // instead we reuse that very paragraph for our first line of text
    // below, and only appendParagraph() for every line after it.
    var firstLineUsed = false;

    function line(text, opts) {
      opts = opts || {};
      var p;
      if (!firstLineUsed) {
        p = cell.getChild(0).asParagraph();
        p.setText(text);
        firstLineUsed = true;
      } else {
        p = cell.appendParagraph(text);
      }
      p.setAlignment(opts.align || DocumentApp.HorizontalAlignment.LEFT);
      p.editAsText()
        .setForegroundColor(opts.color || IVORY)
        .setBold(!!opts.bold)
        .setFontSize(opts.size || 11)
        .setFontFamily('Georgia');
      p.setSpacingAfter(opts.spacingAfter != null ? opts.spacingAfter : 4);
      return p;
    }

    line('CALMA HOTEL', { color: GOLD_LIGHT, bold: true, size: 22, align: DocumentApp.HorizontalAlignment.CENTER, spacingAfter: 0 });
    line('G O L D   C A R D', { color: GOLD, bold: true, size: 11, align: DocumentApp.HorizontalAlignment.CENTER, spacingAfter: 16 });

    line('Guest', { color: GOLD, size: 9, spacingAfter: 0 });
    line(data.name || '-', { color: IVORY, bold: true, size: 15, spacingAfter: 6 });

    var contactLine = (data.email || '-') + '   |   ' + (data.phone || '-');
    line(contactLine, { color: IVORY, size: 10, spacingAfter: 10 });

    line('Booking Code', { color: GOLD, size: 9, spacingAfter: 0 });
    line(code, { color: IVORY, bold: true, size: 15, spacingAfter: 10 });

    var stayDetails = 'Room: ' + (data.room || '-') +
      '   |   Check-in: ' + (data.checkin || '-') +
      '   |   Check-out: ' + (data.checkout || '-') +
      '   |   Guests: ' + (data.guests || '-');
    line(stayDetails, { color: IVORY, size: 10.5, spacingAfter: 18 });

    // Voucher banner — plain highlighted text lines. IMPORTANT: Google Docs'
    // Apps Script API does NOT support nesting a table inside another
    // table's cell, so we simulate the "banner" look with a gold text
    // background instead of appendTable() here.
    var vp1 = cell.appendParagraph('   ' + VOUCHER_PCT + ' OFF YOUR NEXT STAY   ');
    vp1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    vp1.setSpacingBefore(4).setSpacingAfter(2);
    vp1.editAsText()
      .setForegroundColor(ESPRESSO)
      .setBackgroundColor(GOLD)
      .setBold(true)
      .setFontSize(14)
      .setFontFamily('Georgia');

    var vp2 = cell.appendParagraph('   Present this card and booking code at check-in. One use per stay.   ');
    vp2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    vp2.setSpacingBefore(0).setSpacingAfter(14);
    vp2.editAsText()
      .setForegroundColor(ESPRESSO)
      .setBackgroundColor(GOLD)
      .setFontSize(9)
      .setFontFamily('Georgia');

    var footer = cell.appendParagraph(HOTEL_NAME + '   ·   ' + HOTEL_PHONE + '   ·   Issued ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone() || 'GMT+2', 'dd MMM yyyy'));
    footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    footer.setSpacingBefore(16);
    footer.editAsText().setForegroundColor(GOLD).setFontSize(8).setFontFamily('Georgia');

    doc.saveAndClose();

    docFile = DriveApp.getFileById(doc.getId());
    var pdfBlob = docFile.getAs('application/pdf').setName(HOTEL_NAME + ' Gold Card - ' + code + '.pdf');

    var folder = getGoldCardFolder();
    var pdfFile = folder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Clean up the intermediate Google Doc — we only need to keep the PDF.
    docFile.setTrashed(true);

    return { url: pdfFile.getUrl(), error: null };
  } catch (err) {
    if (docFile) { try { docFile.setTrashed(true); } catch (e2) {} }
    Logger.log('Gold Card generation failed: ' + err);
    return { url: null, error: String(err) };
  }
}

// ======== PRICING ENGINE — identical copy of /assets/js/pricing.js (keep in sync) ========
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
