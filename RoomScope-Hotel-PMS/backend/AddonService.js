// AddonService.gs — Booking Addons & Addon Templates management

function ดึงรายการบันทึกแอดออนทั้งหมด(token, bookingId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  var addons = readAllRows("tbl_BookingAddons");
  if (bookingId) {
    addons = addons.filter(function(a) { return a.BookingID === bookingId; });
  }
  return addons;
}

function ดึงเทมเพลตแอดออนทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_AddonTemplates");
}

function บันทึกเทมเพลตแอดออน(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var id = data.ID || ("ADT-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.ID;
  var row = {
    ID: id,
    Name: data.Name,
    Category: data.Category || 'other',
    Unit: data.Unit || 'รายการ',
    Price: parseFloat(data.Price) || 0,
    Active: data.Active !== false ? 'TRUE' : 'FALSE'
  };
  if (isUpdate) {
    updateRowById("tbl_AddonTemplates", "ID", id, row);
  } else {
    insertRow("tbl_AddonTemplates", row);
  }
  return { success: true, id: id };
}

// alias
function บันทึกแอดออนเทมเพลต(token, data) { return บันทึกเทมเพลตแอดออน(token, data); }

function ลบเทมเพลตแอดออน(token, id) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  deleteRowById("tbl_AddonTemplates", "ID", id);
  return { success: true };
}

// alias
function ลบแอดออนเทมเพลต(token, id) { return ลบเทมเพลตแอดออน(token, id); }

function เพิ่มแอดออนการจอง(token, bookingId, data) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk']);
  
  var id = "BKA-" + Utilities.getUuid().substring(0, 8);
  var qty = parseInt(data.Qty) || 1;
  var unitPrice = parseFloat(data.UnitPrice) || 0;
  var amount = qty * unitPrice;
  
  var row = {
    ID: id,
    BookingID: bookingId,
    AddonName: data.AddonName,
    Qty: qty,
    UnitPrice: unitPrice,
    Amount: amount,
    AddonDate: data.AddonDate || new Date().toISOString().slice(0, 10),
    StaffName: session.fullName || 'FrontDesk',
    Notes: data.Notes || ''
  };
  
  insertRow("tbl_BookingAddons", row);
  
  // Update booking total amount
  var bookings = readAllRows("tbl_Bookings");
  var booking = bookings.filter(function(b) { return b.BookingID === bookingId; })[0];
  if (booking) {
    var newTotal = (parseFloat(booking.TotalAmount) || 0) + amount;
    updateRowById("tbl_Bookings", "BookingID", bookingId, { TotalAmount: newTotal });
    บันทึกAuditLog(token, "ADD_BOOKING_ADDON", "tbl_Bookings", bookingId, booking, { TotalAmount: newTotal, addonAmount: amount });
  }
  
  return { success: true, id: id };
}

function ลบแอดออนการจอง(token, id, bookingId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk']);
  
  var addons = readAllRows("tbl_BookingAddons");
  var addon = addons.filter(function(a) { return a.ID === id; })[0];
  if (!addon) throw new Error("ไม่พบรายการแอดออนอ้างอิง");
  
  deleteRowById("tbl_BookingAddons", "ID", id);
  
  // Update booking total amount
  var bookings = readAllRows("tbl_Bookings");
  var booking = bookings.filter(function(b) { return b.BookingID === bookingId; })[0];
  if (booking) {
    var newTotal = (parseFloat(booking.TotalAmount) || 0) - (parseFloat(addon.Amount) || 0);
    if (newTotal < 0) newTotal = 0;
    updateRowById("tbl_Bookings", "BookingID", bookingId, { TotalAmount: newTotal });
    บันทึกAuditLog(token, "DELETE_BOOKING_ADDON", "tbl_Bookings", bookingId, booking, { TotalAmount: newTotal, subtractAmount: addon.Amount });
  }
  
  return { success: true };
}
