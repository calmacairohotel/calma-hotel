/*************************************************************
 *  CALMA HOTEL — Website backend (bookings + admin panel)
 *  -----------------------------------------------------------
 *  One Google Apps Script web app does everything:
 *
 *   PUBLIC
 *   • GET  ?action=content   → the live website content (rooms, prices,
 *                              photos, journeys, settings) edited in /admin/
 *   • POST {action:'book',…} → saves the booking as a new row in the
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
  'Nights', 'Adults', 'Children', 'Total', 'Arrival', 'Room ID'
];

/** GET: live website content (public) or a health check. */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'content') {
    return jsonOutput({ status: 'ok', content: readContent() });
  }
  return ContentService.createTextOutput('CALMA Hotel website service is running.');
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
    if (action === 'listBookings') return jsonOutput(listBookings());
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
    var rowNumber = sheet.getLastRow() + 1;
    var code = 'CLM-' + Utilities.formatString('%05d', rowNumber - 1);
    var timestamp = new Date();
    var row = {
      'Timestamp': timestamp, 'Booking Code': code, 'Full Name': data.name || '', 'Phone': data.phone || '', 'Email': data.email || '',
      'Check-in': data.checkin || '', 'Check-out': data.checkout || '', 'Room Type': data.room || '', 'Guests': data.guests || '',
      'Message': data.message || '', 'Source': data.source || 'Website', 'Status': 'New', 'Gold Card': '',
      'Nights': data.nights || '', 'Adults': data.adults || '', 'Children': data.children || '',
      'Total': data.total ? (data.currency || '') + ' ' + data.total : '', 'Arrival': data.arrival || '', 'Room ID': data.roomId || ''
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

function listBookings() {
  var sheet = getBookingSheet();
  var last = sheet.getLastRow();
  if (last < 2) return { status: 'ok', headers: SHEET_HEADERS, rows: [] };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var first = Math.max(2, last - 299);
  var values = sheet.getRange(first, 1, last - first + 1, headers.length).getDisplayValues();
  var rows = values.map(function (v, i) {
    var o = { _row: first + i };
    headers.forEach(function (h, k) { o[h] = v[k]; });
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
