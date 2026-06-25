// FinancialDocService.gs — Financial document generation (Invoice, Receipt, Tax Invoice)

var TEMPLATE_ID_MAP = {
  receipt: 'RECEIPT_TEMPLATE_DOC_ID',
  tax_invoice: 'TAX_INVOICE_TEMPLATE_DOC_ID',
  invoice: 'INVOICE_TEMPLATE_DOC_ID',
  quotation: 'QUOTATION_TEMPLATE_DOC_ID'
};

function ออกเอกสารการเงิน(token, docType, bookingId, overrides) {
  var session = ตรวจสอบสิทธิ์(token, ['Accounting', 'FrontDesk', 'SuperAdmin']);

  var validTypes = ['receipt', 'tax_invoice', 'invoice', 'quotation'];
  if (validTypes.indexOf(docType) === -1) throw new Error("ประเภทเอกสารไม่ถูกต้อง");

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    // Gather booking & guest data
    var bookings = readAllRows("tbl_Bookings");
    var booking = bookings.filter(function(b) { return b.BookingID === bookingId; })[0];
    if (!booking) throw new Error("ไม่พบข้อมูลการจองระบุ");

    var guests = readAllRows("tbl_Guests");
    var guest = guests.filter(function(g) { return g.GuestID === booking.GuestID; })[0] || {};

    // Generate document number with running number
    var docPrefix = { receipt: 'RCP', tax_invoice: 'TAX', invoice: 'INV', quotation: 'QUO' }[docType];
    var year = new Date().getFullYear();
    var docNo = docPrefix + '-' + year + '-' + generateRunningNo('', 'tbl_FinancialDocs', 'DocNo').padStart(6, '0');

    // Build document record
    var docId = "DOC-" + Utilities.getUuid().substring(0, 8);
    var subtotal = parseFloat(booking.TotalAmount) / 1.07;
    var vatAmount = parseFloat(booking.TotalAmount) - subtotal;

    var docRecord = {
      DocID: docId,
      DocType: docType,
      DocNo: docNo,
      BookingID: bookingId,
      CustomerType: booking.CustomerType || 'person',
      CustomerSnapshotJSON: JSON.stringify({ name: guest.FullName, phone: guest.Phone, idCard: guest.IDCardOrPassport }),
      ItemsJSON: JSON.stringify([{ name: 'ค่าห้องพัก', amount: booking.TotalAmount }]),
      Subtotal: subtotal.toFixed(2),
      VatAmount: vatAmount.toFixed(2),
      Total: parseFloat(booking.TotalAmount).toFixed(2),
      Status: 'issued',
      IssuedBy: session.userId,
      IssuedAt: new Date().toISOString()
    };

    insertRow("tbl_FinancialDocs", docRecord);
    บันทึกAuditLog(token, "ISSUE_DOCUMENT", "tbl_FinancialDocs", docId, null, docRecord);

    // Try to generate PDF from template
    var templateDocId = PropertiesService.getScriptProperties().getProperty('TEMPLATE_' + docType.toUpperCase());
    var pdfUrl = null;

    if (templateDocId) {
      try {
        var docCopy = DriveApp.getFileById(templateDocId).makeCopy();
        var doc = DocumentApp.openById(docCopy.getId());
        var body = doc.getBody();

        body.replaceText('{{เลขที่เอกสาร}}', docNo);
        body.replaceText('{{วันที่ออกเอกสาร}}', Utilities.formatDate(new Date(), 'GMT+7', 'dd/MM/yyyy'));
        body.replaceText('{{ชื่อลูกค้า}}', guest.FullName || '-');
        body.replaceText('{{เบอร์โทรศัพท์}}', guest.Phone || '-');
        body.replaceText('{{ราคาก่อน VAT}}', subtotal.toFixed(2));
        body.replaceText('{{VAT 7%}}', vatAmount.toFixed(2));
        body.replaceText('{{ยอดรวมทั้งสิ้น}}', parseFloat(booking.TotalAmount).toFixed(2));

        doc.saveAndClose();

        var outputFolderId = PropertiesService.getScriptProperties().getProperty('PDF_OUTPUT_FOLDER_ID');
        var pdfBlob = DriveApp.getFileById(docCopy.getId()).getAs('application/pdf');
        if (outputFolderId) {
          var pdfFile = DriveApp.getFolderById(outputFolderId).createFile(pdfBlob.setName(docNo + '.pdf'));
          pdfUrl = pdfFile.getUrl();
          updateRowById("tbl_FinancialDocs", "DocID", docId, { PDFUrl: pdfUrl });
        }
        DriveApp.getFileById(docCopy.getId()).setTrashed(true); // Delete temp copy
      } catch (pdfErr) {
        Logger.log("PDF generation error: " + pdfErr.message);
      }
    }

    return { success: true, docNo: docNo, docId: docId, pdfUrl: pdfUrl };
  } finally {
    lock.releaseLock();
  }
}

function ยกเลิกเอกสารการเงิน(token, docId, reason) {
  var session = ตรวจสอบสิทธิ์(token, ['Accounting', 'SuperAdmin']);

  if (!reason || reason.trim() === '') throw new Error("ต้องระบุเหตุผลในการยกเลิกเอกสาร");

  var docs = readAllRows("tbl_FinancialDocs");
  var doc = docs.filter(function(d) { return d.DocID === docId; })[0];
  if (!doc) throw new Error("ไม่พบเอกสารการเงินระบุ");
  if (doc.Status === 'voided') throw new Error("เอกสารนี้ถูกยกเลิกไปแล้ว");

  updateRowById("tbl_FinancialDocs", "DocID", docId, {
    Status: 'voided',
    VoidedReason: reason
  });

  บันทึกAuditLog(token, "VOID_DOCUMENT", "tbl_FinancialDocs", docId, doc, { Status: 'voided', VoidedReason: reason });

  return { success: true };
}

function ดึงเอกสารการเงินทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting', 'FrontDesk']);
  var docs = readAllRows("tbl_FinancialDocs");
  docs.sort(function(a, b) { return new Date(b.IssuedAt||0) - new Date(a.IssuedAt||0); });
  return docs;
}

function ดึงเอกสารการเงินตามไอดี(token, docId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting', 'FrontDesk']);
  var docs = readAllRows("tbl_FinancialDocs");
  var doc = docs.filter(function(d) { return d.DocID === docId; })[0];
  if (!doc) throw new Error("ไม่พบเอกสาร ID: " + docId);
  return doc;
}

function สร้างเอกสารการเงินโดยตรง(token, data) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting', 'FrontDesk']);
  var docId = "DOC-" + Utilities.getUuid().substring(0, 8);
  var docPrefix = { receipt: 'RCP', tax_invoice: 'TAX', invoice: 'INV', quotation: 'QUO' }[data.docType] || 'DOC';
  var year = new Date().getFullYear();
  var docNo = docPrefix + '-' + year + '-' + generateRunningNo('', 'tbl_FinancialDocs', 'DocNo').padStart(6, '0');

  var docRecord = {
    DocID: docId,
    DocType: data.docType,
    DocNo: docNo,
    BookingID: data.bookingId || '',
    CustomerType: data.customerType || 'person',
    CustomerSnapshotJSON: typeof data.customerSnapshot === 'string' ? data.customerSnapshot : JSON.stringify(data.customerSnapshot || {}),
    ItemsJSON: typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []),
    Subtotal: parseFloat(data.subtotal || 0).toFixed(2),
    VatAmount: parseFloat(data.vatAmount || 0).toFixed(2),
    Total: parseFloat(data.total || 0).toFixed(2),
    Status: 'issued',
    IssuedBy: session.userId,
    IssuedAt: new Date().toISOString()
  };

  insertRow("tbl_FinancialDocs", docRecord);
  บันทึกAuditLog(token, "ISSUE_DOCUMENT_DIRECT", "tbl_FinancialDocs", docId, null, docRecord);
  return { success: true, docId: docId, docNo: docNo };
}
