// LegalService.gs — Legal guest registration and reports (ร.ร. 3, ร.ร. 4, ตม. 30)

function ดึงผู้เข้าพักตามกฎหมาย(token, filter) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  var guests = readAllRows("tbl_LegalGuests");
  
  if (filter) {
    if (filter.from) {
      guests = guests.filter(function(g) { return g.CheckIn >= filter.from; });
    }
    if (filter.to) {
      guests = guests.filter(function(g) { return g.CheckIn <= filter.to; });
    }
    if (filter.isForeign === true || filter.isForeign === 'true') {
      guests = guests.filter(function(g) { return g.IsForeign === true || g.IsForeign === 'TRUE' || g.IsForeign === 1; });
    }
    if (filter.tm30 === 'pending') {
      guests = guests.filter(function(g) {
        var isF = g.IsForeign === true || g.IsForeign === 'TRUE' || g.IsForeign === 1;
        var isSub = g.TM30Submitted === true || g.TM30Submitted === 'TRUE' || g.TM30Submitted === 1;
        return isF && !isSub;
      });
    }
  }
  
  guests.sort(function(a, b) { return new Date(b.CheckIn||0) - new Date(a.CheckIn||0); });
  return guests;
}

function บันทึกผู้เข้าพักตามกฎหมาย(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk']);
  var id = data.ID || ("LGT-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.ID;
  
  var isForeign = data.nationality !== 'ไทย' && data.nationality !== 'Thai' && data.nationality !== 'th';
  
  var row = {
    ID: id,
    BookingID: data.bookingId || '',
    GuestNameTH: data.guestNameTh || '',
    GuestNameEN: data.guestNameEn || '',
    Nationality: data.nationality || 'ไทย',
    IDCardNo: data.idCardNo || '',
    PassportNo: data.passportNo || '',
    BirthDate: data.birthDate || '',
    Gender: data.gender || 'M',
    Address: data.address || '',
    CheckIn: data.checkIn || '',
    CheckOut: data.checkOut || '',
    RoomNumber: data.roomNumber || '',
    IsForeign: isForeign ? 'TRUE' : 'FALSE'
  };
  
  if (isUpdate) {
    updateRowById("tbl_LegalGuests", "ID", id, row);
    บันทึกAuditLog(token, "UPDATE_LEGAL_GUEST", "tbl_LegalGuests", id, null, row);
  } else {
    row.RR3Printed = 'FALSE';
    row.RR4Submitted = 'FALSE';
    row.TM30Submitted = 'FALSE';
    row.TM30SubmittedAt = '';
    insertRow("tbl_LegalGuests", row);
    บันทึกAuditLog(token, "CREATE_LEGAL_GUEST", "tbl_LegalGuests", id, null, row);
  }
  return { success: true, id: id, isForeign: isForeign };
}

function อัปเดตสถานะผู้เข้าพักตามกฎหมาย(token, id, updates) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting']);
  
  var fields = {};
  if (updates.rr3Printed !== undefined) fields.RR3Printed = updates.rr3Printed ? 'TRUE' : 'FALSE';
  if (updates.rr4Submitted !== undefined) fields.RR4Submitted = updates.rr4Submitted ? 'TRUE' : 'FALSE';
  if (updates.tm30Submitted !== undefined) {
    fields.TM30Submitted = updates.tm30Submitted ? 'TRUE' : 'FALSE';
    if (updates.tm30Submitted) {
      fields.TM30SubmittedAt = new Date().toISOString();
    } else {
      fields.TM30SubmittedAt = '';
    }
  }
  
  updateRowById("tbl_LegalGuests", "ID", id, fields);
  บันทึกAuditLog(token, "UPDATE_LEGAL_GUEST_STATUS", "tbl_LegalGuests", id, null, fields);
  return { success: true };
}

function ลบผู้เข้าพักตามกฎหมาย(token, id) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  deleteRowById("tbl_LegalGuests", "ID", id);
  บันทึกAuditLog(token, "DELETE_LEGAL_GUEST", "tbl_LegalGuests", id, null, null);
  return { success: true };
}
