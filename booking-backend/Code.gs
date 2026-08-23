/*************************************************************
 *  CALMA HOTEL — Direct Website Booking Backend  (FIXED)
 *  -----------------------------------------------------------
 *  What this script does, every single time a guest submits
 *  the booking form on calmacairohotel.com/contact/ :
 *
 *   1) Adds ONE new row to a single, permanent Google Sheet
 *      ("Bookings") — every booking ever made through the
 *      website lands in that same sheet, never a new one.
 *   2) Generates a unique booking code for that row (e.g. CLM-00001).
 *   3) Builds a "Gold Card" PDF for that guest — their name,
 *      the booking code, their stay details, and a 15% voucher
 *      for their next stay — and saves it to Google Drive.
 *   4) Puts a clickable link to that PDF in the sheet's
 *      "Gold Card" column, right next to the code, so opening
 *      it is one click.
 *   5) Emails hatemahmedsayedss2233@gmail.com a summary of the
 *      new booking with the Gold Card link included.
 *
 *  FIX NOTES (why the old version sometimes skipped the Gold Card):
 *  Google Docs' Apps Script API does NOT support putting a table
 *  inside a cell of another table ("nested tables"). The old code
 *  tried to build the 15%-off banner that way, which throws an
 *  error every time. The error was silently caught, so the booking
 *  still saved and the email still sent — just without a card.
 *  This version builds the banner using plain highlighted text
 *  instead of a nested table, and — if Gold Card generation ever
 *  fails again for any OTHER reason — it now writes the exact
 *  error message into the sheet so it's easy to diagnose instead
 *  of a generic "could not generate" note.
 *
 *  SETUP: see "دليل التركيب.md" / SETUP_GUIDE.md that came
 *  with this file — you only need to copy/paste this file once.
 *
 *  TO TEST WITHOUT THE WEBSITE:
 *  In the Apps Script editor, pick "testGoldCard" from the function
 *  dropdown at the top and click ▷ Run. Check View > Execution log —
 *  it prints the PDF link if it worked, or the exact error if not.
 *************************************************************/

// ---------------------- CONFIG ----------------------
var OWNER_EMAIL   = 'hatemahmedsayedss2233@gmail.com';
var SHEET_NAME    = 'Bookings';
var DRIVE_FOLDER  = 'CALMA Gold Cards';
var HOTEL_NAME    = 'CALMA Hotel';
var HOTEL_PHONE   = '+20 12 7373 6667';
var VOUCHER_PCT   = '15%';
// ------------------------------------------------------

var SHEET_HEADERS = [
  'Timestamp', 'Booking Code', 'Full Name', 'Phone', 'Email',
  'Check-in', 'Check-out', 'Room Type', 'Guests', 'Message',
  'Source', 'Status', 'Gold Card'
];

/** Entry point: called automatically whenever the website form is submitted. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = parseIncoming(e) || {};
    var sheet = getBookingSheet();

    var rowNumber = sheet.getLastRow() + 1;
    var code = 'CLM-' + Utilities.formatString('%05d', rowNumber - 1);
    var timestamp = new Date();

    sheet.appendRow([
      timestamp,
      code,
      data.name || '',
      data.phone || '',
      data.email || '',
      data.checkin || '',
      data.checkout || '',
      data.room || '',
      data.guests || '',
      data.message || '',
      data.source || 'Website',
      'New',
      '' // Gold Card link/status filled in just below
    ]);

    // Build the Gold Card PDF and drop a clickable link into the sheet.
    var result = buildGoldCard(code, data, timestamp);
    var goldCardCell = sheet.getRange(rowNumber, SHEET_HEADERS.indexOf('Gold Card') + 1);
    if (result.url) {
      goldCardCell.setFormula('=HYPERLINK("' + result.url + '","Open Gold Card")');
    } else {
      // Write the ACTUAL error so it's easy to diagnose, instead of a generic note.
      goldCardCell.setValue('Failed: ' + result.error);
    }

    notifyOwner(data, code, result.url, timestamp);

    return jsonOutput({ status: 'ok', code: code, goldCard: result.url || ('error: ' + result.error) });
  } catch (err) {
    return jsonOutput({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Visiting the deployed URL directly just confirms the service is alive. */
function doGet(e) {
  return ContentService.createTextOutput(
    'CALMA Hotel booking service is running. Bookings are received via POST from the website.'
  );
}

/**
 * Quick manual test — select "testGoldCard" from the function dropdown in
 * the Apps Script editor and click ▷ Run. Check the Execution log: it will
 * print the shareable PDF link if everything works, or the exact error if
 * something (e.g. a missing permission) still needs fixing.
 */
function testGoldCard() {
  var result = buildGoldCard('TEST-00000', {
    name: 'Test Guest',
    phone: '+20 100 000 0000',
    email: 'test@example.com',
    checkin: '2026-09-01',
    checkout: '2026-09-03',
    room: 'Deluxe Double Room',
    guests: 2
  }, new Date());

  if (result.url) {
    Logger.log('SUCCESS — Gold Card URL: ' + result.url);
  } else {
    Logger.log('FAILED — error was: ' + result.error);
  }
}

// ---------------------- helpers ----------------------

function parseIncoming(e) {
  // Website sends JSON as text/plain to avoid CORS preflight issues.
  if (e && e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { /* fall through */ }
  }
  // Fallback: classic form-encoded POST.
  return (e && e.parameter) ? e.parameter : {};
}

function getBookingSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_HEADERS);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getGoldCardFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);
}

function notifyOwner(data, code, cardUrl, timestamp) {
  data = data || {};
  var subject = 'New Direct Booking — ' + HOTEL_NAME + ' (' + code + ')';
  var lines = [
    'A new booking request just came in from the website.',
    '',
    'Booking Code: ' + code,
    'Name: ' + (data.name || '-'),
    'Phone: ' + (data.phone || '-'),
    'Email: ' + (data.email || '-'),
    'Check-in: ' + (data.checkin || '-'),
    'Check-out: ' + (data.checkout || '-'),
    'Room: ' + (data.room || '-'),
    'Guests: ' + (data.guests || '-'),
    'Message: ' + (data.message || '-'),
    'Received: ' + timestamp,
    '',
    cardUrl ? ('Gold Card (15% voucher) PDF: ' + cardUrl) : 'Gold Card could not be generated automatically — check the sheet for the error, or re-run testGoldCard().',
    '',
    'Full record: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ];
  MailApp.sendEmail(OWNER_EMAIL, subject, lines.join('\n'));
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
