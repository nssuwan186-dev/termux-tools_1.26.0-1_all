// RoomScope Hotel PMS - Bundled Backend Code
// Generated on: 2026-06-25T07:13:25.786Z

// ==========================================
// FILE: AddonService.js
// ==========================================

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


// ==========================================
// FILE: AuditService.js
// ==========================================

// AuditService.gs — Centralized audit logging for all critical operations

function บันทึกAuditLog(token, action, targetSheet, targetId, beforeData, afterData) {
  try {
    var session = token ? ตรวจสอบสิทธิ์(token, null) : { userId: 'SYSTEM' };
    var logId = "LOG-" + Utilities.getUuid().substring(0, 8);
    insertRow("tbl_AuditLogs", {
      LogID: logId,
      UserID: session.userId,
      Action: action,
      TargetSheet: targetSheet,
      TargetID: targetId,
      BeforeJSON: beforeData ? JSON.stringify(beforeData) : "",
      AfterJSON: afterData ? JSON.stringify(afterData) : "",
      CreatedAt: new Date().toISOString()
    });
  } catch (e) {
    Logger.log("AuditLog error: " + e.message);
  }
}

function ดึงAuditLogs(token, limit) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'Manager']);
  var logs = readAllRows("tbl_AuditLogs");
  logs.sort(function(a, b) { return new Date(b.CreatedAt) - new Date(a.CreatedAt); });
  return logs.slice(0, limit || 100).map(function(l) {
    return {
      logId: l.LogID,
      userId: l.UserID,
      action: l.Action,
      targetSheet: l.TargetSheet,
      targetId: l.TargetID,
      before: l.BeforeJSON ? JSON.parse(l.BeforeJSON) : null,
      after: l.AfterJSON ? JSON.parse(l.AfterJSON) : null,
      createdAt: l.CreatedAt
    };
  });
}


// ==========================================
// FILE: Auth.js
// ==========================================

// Auth.gs — Authentication & Authorization (RBAC)

/** เข้าสู่ระบบ */
function เข้าสู่ระบบ(username, password) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10 seconds lock
    
    var users = readAllRows("tbl_Users");
    var foundUser = null;
    
    for (var i = 0; i < users.length; i++) {
      if (users[i].Username === username) {
        foundUser = users[i];
        break;
      }
    }
    
    if (!foundUser) {
      throw new Error("ไม่พบชื่อผู้ใช้งานนี้ในระบบ");
    }
    
    if (foundUser.Status === 'inactive' || foundUser.Status === 'disabled') {
      throw new Error("บัญชีผู้ใช้นี้ถูกปิดใช้งานชั่วคราว");
    }
    
    if (foundUser.FailedAttemptCount >= 5) {
      throw new Error("บัญชีนี้ถูกล็อกเนื่องจากป้อนรหัสผิดเกิน 5 ครั้ง");
    }
    
    var hashed = hashPassword(password, foundUser.Salt);
    if (foundUser.PasswordHash !== hashed) {
      // Increment failed count
      var newFailed = (parseInt(foundUser.FailedAttemptCount) || 0) + 1;
      updateRowById("tbl_Users", "UserID", foundUser.UserID, { FailedAttemptCount: newFailed });
      throw new Error("รหัสผ่านไม่ถูกต้อง (ลองอีก " + (5 - newFailed) + " ครั้งก่อนบัญชีล็อก)");
    }
    
    // Login successful
    var token = Utilities.getUuid();
    var sessionData = {
      userId: foundUser.UserID,
      role: foundUser.Role,
      fullName: foundUser.FullName
    };
    
    // Save to CacheService with 6 hours TTL (21600 seconds)
    var cache = CacheService.getScriptCache();
    cache.put(token, JSON.stringify(sessionData), 21600);
    
    // Reset failed count & update login time
    updateRowById("tbl_Users", "UserID", foundUser.UserID, {
      FailedAttemptCount: 0,
      LastLoginAt: new Date().toISOString()
    });
    
    return {
      success: true,
      token: token,
      role: foundUser.Role,
      fullName: foundUser.FullName
    };
  } finally {
    lock.releaseLock();
  }
}

/** ตรวจสอบสิทธิ์ (เรียกใช้ในฟังก์ชันอื่นๆ) */
function ตรวจสอบสิทธิ์(token, requiredRoles) {
  if (!token) throw new Error("กุญแจตรวจสอบสิทธิ์ว่างเปล่า (Token is missing)");
  
  var cache = CacheService.getScriptCache();
  var cached = cache.get(token);
  if (!cached) {
    throw new Error("กุญแจหมดอายุการใช้งาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
  }
  
  var session = JSON.parse(cached);
  if (requiredRoles && requiredRoles.indexOf(session.role) === -1) {
    throw new Error("บัญชีของท่านไม่มีสิทธิ์การเข้าถึงข้อมูลนี้ (Permission Denied)");
  }
  
  return session;
}

/** ออกจากระบบ */
function ออกจากระบบ(token) {
  if (token) {
    var cache = CacheService.getScriptCache();
    cache.remove(token);
  }
  return { success: true };
}

function ดึงพนักงานทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var users = readAllRows("tbl_Users");
  return users.map(function(u) {
    return {
      userId: u.UserID,
      username: u.Username,
      role: u.Role,
      fullName: u.FullName,
      phone: u.Phone,
      email: u.Email,
      status: u.Status || 'active',
      lastLoginAt: u.LastLoginAt
    };
  });
}

function บันทึกพนักงาน(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  var id = data.userId || ("USR-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.userId;
  var users = readAllRows("tbl_Users");
  var existing = users.filter(function(u) { return u.UserID === id; })[0];

  var row = {
    UserID: id,
    Username: data.username,
    Role: data.role,
    FullName: data.fullName,
    Phone: data.phone || '',
    Email: data.email || '',
    Status: data.status || 'active'
  };

  if (data.password) {
    var salt = Utilities.getUuid();
    var hash = hashPassword(data.password, salt);
    row.PasswordHash = hash;
    row.Salt = salt;
  } else if (existing) {
    row.PasswordHash = existing.PasswordHash;
    row.Salt = existing.Salt;
  }

  if (isUpdate) {
    updateRowById("tbl_Users", "UserID", id, row);
  } else {
    row.FailedAttemptCount = 0;
    row.CreatedAt = new Date().toISOString();
    insertRow("tbl_Users", row);
  }
  return { success: true, userId: id };
}

function ลบพนักงาน(token, userId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  deleteRowById("tbl_Users", "UserID", userId);
  return { success: true };
}


// ==========================================
// FILE: BookingService.js
// ==========================================

// BookingService.gs — Booking management logic with LockService concurrency protection

/** ตรวจสอบความพร้อมใช้งานของห้องพักตามช่วงวันที่ */
function ตรวจสอบห้องว่างช่วงวันที่(roomId, checkInStr, checkOutStr, excludeBookingId) {
  var checkIn = new Date(checkInStr);
  var checkOut = new Date(checkOutStr);
  
  var bookings = readAllRows("tbl_Bookings");
  var bookingRooms = readAllRows("tbl_BookingRooms");
  
  // Filter active/confirmed bookings
  var activeBookings = bookings.filter(function(b) {
    if (b.BookingID === excludeBookingId) return false;
    return b.Status === 'confirmed' || b.Status === 'checked_in' || b.Status === 'pending';
  });
  
  var activeBookingIds = activeBookings.map(function(b) { return b.BookingID; });
  
  // Find which active bookings use this room
  var relevantRooms = bookingRooms.filter(function(br) {
    return br.RoomID === roomId && activeBookingIds.indexOf(br.BookingID) !== -1;
  });
  
  // Check date overlap for each relevant room booking
  for (var i = 0; i < relevantRooms.length; i++) {
    var bRoom = relevantRooms[i];
    var booking = activeBookings.filter(function(b) { return b.BookingID === bRoom.BookingID; })[0];
    
    var bIn = new Date(booking.CheckInDate);
    var bOut = new Date(booking.CheckOutDate);
    
    // Overlap condition: (StartA < EndB) and (EndA > StartB)
    if (checkIn < bOut && checkOut > bIn) {
      return false; // Collision detected!
    }
  }
  return true; // No collision, room is available!
}

/** สั่งสร้างข้อมูลการจองใหม่ */
function สร้างการจอง(token, data) {
  var session = ตรวจสอบสิทธิ์(token, ['FrontDesk', 'PropertyManager', 'SuperAdmin', 'Manager']);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    // 1. Find room
    var rooms = readAllRows("tbl_Rooms");
    var room = null;
    if (data.roomId) {
      room = rooms.filter(function(r) { return r.RoomID === data.roomId; })[0];
    } else if (data.roomNo) {
      room = rooms.filter(function(r) { return r.RoomNo === data.roomNo; })[0];
    }
    if (!room) throw new Error("ไม่พบห้องพักระบุ");
    
    // 2. Verify availability
    var isRoomFree = ตรวจสอบห้องว่างช่วงวันที่(room.RoomID, data.checkInDate || data.checkIn, data.checkOutDate || data.checkOut, data.bookingId);
    if (!isRoomFree) {
      throw new Error("ห้องพักนี้ได้รับการจองทับซ้อนในช่วงเวลาดังกล่าวแล้ว");
    }

    // 3. Pricing computation
    var checkIn = data.checkInDate || data.checkIn;
    var checkOut = data.checkOutDate || data.checkOut;
    var priceDetail = คำนวณราคาสุดท้าย(token, room.RoomTypeID, checkIn, checkOut, data.couponCode);

    // 4. Find or Create Guest
    var guestId = data.guestId;
    if (!guestId) {
      var guests = readAllRows("tbl_Guests");
      var existing = guests.filter(function(g) { return g.Phone === data.guestPhone && data.guestPhone; })[0];
      guestId = existing ? existing.GuestID : "GST-" + Utilities.getUuid().substring(0, 8);
      if (!existing) {
        insertRow("tbl_Guests", {
          GuestID: guestId,
          FullName: data.guestName || data.fullName,
          Phone: data.guestPhone || data.phone || '',
          Email: data.email || '',
          IDCardOrPassport: data.idCard || '',
          Nationality: data.nationality || 'Thai',
          CreatedAt: new Date().toISOString()
        });
      }
    }

    // 5. Record booking
    var bookingId = "BKG-" + Utilities.getUuid().substring(0, 8);
    var bookingNo = generateRunningNo("BKG-", "tbl_Bookings", "BookingNo");
    var now = new Date().toISOString();
    
    var newBooking = {
      BookingID: bookingId,
      BookingNo: bookingNo,
      GuestID: guestId,
      RoomID: room.RoomID,
      BookingSource: data.source || "Walk-in",
      RentalType: data.rentalType || "daily",
      Status: "confirmed",
      CheckInDate: checkIn,
      CheckOutDate: checkOut,
      TotalAmount: priceDetail.totalAmount,
      DepositAmount: parseFloat(data.deposit || data.depositAmount || 0),
      PaidAmount: parseFloat(data.deposit || data.depositAmount || 0),
      PaymentStatus: (parseFloat(data.deposit || data.depositAmount || 0) >= priceDetail.totalAmount) ? "paid" : "partial",
      BasePrice: priceDetail.baseRatePerNight,
      Nights: priceDetail.totalNights,
      Adults: parseInt(data.adults) || 1,
      Children: parseInt(data.children) || 0,
      Channel: data.channel || data.source || "Walk-in",
      CustomerType: data.customerType || "person",
      Notes: data.notes || '',
      CreatedBy: session.userId,
      CreatedAt: now,
      UpdatedAt: now
    };

    insertRow("tbl_Bookings", newBooking);
    
    // Record booking room map
    insertRow("tbl_BookingRooms", {
      ID: "BRM-" + Utilities.getUuid().substring(0, 8),
      BookingID: bookingId,
      RoomID: room.RoomID,
      PriceSnapshot: priceDetail.totalRoomCharge
    });
    
    // Log audit trail
    บันทึกAuditLog(token, "CREATE_BOOKING", "tbl_Bookings", bookingId, null, newBooking);
    
    return { success: true, bookingNo: bookingNo, bookingId: bookingId };
  } finally {
    lock.releaseLock();
  }
}

/** สั่งเช็คอินลูกค้าเข้าห้องจริง */
function เช็คอินการจอง(token, bookingId) {
  var session = ตรวจสอบสิทธิ์(token, ['FrontDesk', 'PropertyManager', 'SuperAdmin']);
  
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var bookings = readAllRows("tbl_Bookings");
    var booking = bookings.filter(function(b) { return b.BookingID === bookingId; })[0];
    if (!booking) throw new Error("ไม่พบข้อมูลการจองระบุ");
    
    if (booking.Status !== 'confirmed') {
      throw new Error("การจองต้องอยู่ในสถานะ Confirmed เท่านั้นจึงจะทำการเช็คอินได้");
    }
    
    // Find room mappings
    var bookingRooms = readAllRows("tbl_BookingRooms");
    var maps = bookingRooms.filter(function(br) { return br.BookingID === bookingId; });
    if (maps.length === 0) throw new Error("ไม่พบรายการห้องพักอ้างอิงสำหรับการจองนี้");
    
    // Update booking status
    updateRowById("tbl_Bookings", "BookingID", bookingId, {
      Status: "checked_in",
      ActualCheckInAt: new Date().toISOString()
    });
    
    // Update room statuses to occupied
    maps.forEach(function(m) {
      updateRowById("tbl_Rooms", "RoomID", m.RoomID, { Status: "occupied" });
    });
    
    บันทึกAuditLog(token, "CHECK_IN_GUEST", "tbl_Bookings", bookingId, booking, { Status: "checked_in" });
    
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/** สั่งเช็คเอาท์ลูกค้าออกและสร้างงานแม่บ้าน */
function เช็คเอาท์การจอง(token, bookingId) {
  var session = ตรวจสอบสิทธิ์(token, ['FrontDesk', 'PropertyManager', 'SuperAdmin']);
  
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var bookings = readAllRows("tbl_Bookings");
    var booking = bookings.filter(function(b) { return b.BookingID === bookingId; })[0];
    if (!booking) throw new Error("ไม่พบข้อมูลการจองระบุ");
    
    if (booking.Status !== 'checked_in') {
      throw new Error("ต้องเช็คอินลูกค้าก่อนจึงจะทำการเช็คเอาท์ได้");
    }
    
    // Find room mappings
    var bookingRooms = readAllRows("tbl_BookingRooms");
    var maps = bookingRooms.filter(function(br) { return br.BookingID === bookingId; });
    if (maps.length === 0) throw new Error("ไม่พบรายการห้องพักอ้างอิงสำหรับการจองนี้");
    
    // Update booking status
    updateRowById("tbl_Bookings", "BookingID", bookingId, {
      Status: "checked_out",
      ActualCheckOutAt: new Date().toISOString()
    });
    
    // Update rooms to dirty & Create cleaning tasks
    maps.forEach(function(m) {
      updateRowById("tbl_Rooms", "RoomID", m.RoomID, { Status: "dirty" });
      
      // Auto-create cleaning task
      var taskId = "TSK-" + Utilities.getUuid().substring(0, 8);
      insertRow("tbl_HousekeepingTasks", {
        TaskID: taskId,
        RoomID: m.RoomID,
        TaskType: "checkout_clean",
        Status: "pending"
      });
    });
    
    บันทึกAuditLog(token, "CHECK_OUT_GUEST", "tbl_Bookings", bookingId, booking, { Status: "checked_out" });
    
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/** Alias สำหรับ frontend เรียกใช้ */
function เช็คอิน(token, bookingId) { return เช็คอินการจอง(token, bookingId); }
function เช็คเอาท์(token, bookingId) { return เช็คเอาท์การจอง(token, bookingId); }

/** ดึงการจองทั้งหมด (พร้อมข้อมูลห้องและผู้เข้าพัก) */
function ดึงการจองทั้งหมด(token) {
  var session = ตรวจสอบสิทธิ์(token, ['FrontDesk', 'PropertyManager', 'SuperAdmin', 'Manager']);
  var bookings = readAllRows("tbl_Bookings");
  var guests = readAllRows("tbl_Guests");
  var rooms = readAllRows("tbl_Rooms");

  var guestMap = {};
  guests.forEach(function(g) { guestMap[g.GuestID] = g; });
  var roomMap = {};
  rooms.forEach(function(r) { roomMap[r.RoomID] = r; });

  return bookings
    .sort(function(a, b) { return new Date(b.CreatedAt||0) - new Date(a.CreatedAt||0); })
    .slice(0, 200)
    .map(function(b) {
      var guest = guestMap[b.GuestID] || {};
      var room = roomMap[b.RoomID] || {};
      var cin = b.CheckInDate ? b.CheckInDate.toString().slice(0,10) : '';
      var cout = b.CheckOutDate ? b.CheckOutDate.toString().slice(0,10) : '';
      var nights = (cin && cout) ? Math.max(1, Math.round((new Date(cout)-new Date(cin))/86400000)) : (parseInt(b.Nights)||1);
      return {
        bookingId: b.BookingID,
        guestName: guest.FullName || b.GuestName || '-',
        roomNo: room.RoomNo || b.RoomID || '-',
        checkInDate: cin,
        checkOutDate: cout,
        nights: nights,
        totalAmount: parseFloat(b.TotalAmount) || 0,
        paidAmount: parseFloat(b.PaidAmount||b.DepositAmount) || 0,
        status: b.Status || 'pending',
        channel: b.Channel || b.BookingSource || 'Walk-in',
        createdAt: b.CreatedAt || ''
      };
    });
}

/** ยกเลิกการจอง */
function ยกเลิกการจอง(token, bookingId, reason) {
  ตรวจสอบสิทธิ์(token, ['FrontDesk', 'PropertyManager', 'SuperAdmin', 'Manager']);
  var bookings = readAllRows("tbl_Bookings");
  var booking = bookings.filter(function(b) { return b.BookingID === bookingId; })[0];
  if (!booking) throw new Error("ไม่พบการจอง " + bookingId);
  if (booking.Status === 'checked_in') throw new Error("ไม่สามารถยกเลิกได้ ลูกค้าเช็คอินแล้ว");
  updateRowById("tbl_Bookings", "BookingID", bookingId, { Status: "cancelled", Notes: reason || "" });
  บันทึกAuditLog(token, "CANCEL_BOOKING", "tbl_Bookings", bookingId, booking, { Status: "cancelled", reason: reason });
  return { success: true };
}

// Function สร้างการจอง merged above.


// ==========================================
// FILE: FinancialDocService.js
// ==========================================

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


// ==========================================
// FILE: HousekeepingService.js
// ==========================================

// HousekeepingService.gs — Housekeeping task management

function ดึงงานทำความสะอาดทั้งหมด(token) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Housekeeping', 'FrontDesk']);
  var tasks = readAllRows("tbl_HousekeepingTasks");
  var rooms = readAllRows("tbl_Rooms");
  var roomMap = {};
  rooms.forEach(function(r) { roomMap[r.RoomID] = r; });

  return tasks.map(function(t) {
    var room = roomMap[t.RoomID] || {};
    return {
      taskId: t.TaskID,
      roomNo: room.RoomNo,
      status: t.Status,
      taskType: t.TaskType,
      assignedTo: t.AssignedTo,
      startedAt: t.StartedAt,
      completedAt: t.CompletedAt
    };
  });
}

function สร้างงานทำความสะอาด(token, roomId, taskType, notes) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk']);
  var validTypes = ['checkout_clean', 'stayover_clean', 'deep_clean', 'inspection'];
  if (validTypes.indexOf(taskType) === -1) throw new Error("ประเภทงานไม่ถูกต้อง");

  var taskId = "TASK-" + Utilities.getUuid().substring(0, 8);
  insertRow("tbl_HousekeepingTasks", {
    TaskID: taskId,
    RoomID: roomId,
    TaskType: taskType,
    Status: 'pending',
    Notes: notes || '',
    CreatedBy: session.userId,
    CreatedAt: new Date().toISOString()
  });
  บันทึกAuditLog(token, "CREATE_TASK", "tbl_HousekeepingTasks", taskId, null, { roomId, taskType });
  return { success: true, taskId: taskId };
}

function เริ่มงานทำความสะอาด(token, taskId) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Housekeeping', 'FrontDesk']);
  updateRowById("tbl_HousekeepingTasks", "TaskID", taskId, {
    Status: 'in_progress', AssignedTo: session.userId, StartedAt: new Date().toISOString()
  });
  return { success: true };
}

function เสร็จงานทำความสะอาด(token, taskId) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Housekeeping', 'FrontDesk']);
  var tasks = readAllRows("tbl_HousekeepingTasks");
  var task = tasks.filter(function(t) { return t.TaskID === taskId; })[0];
  if (!task) throw new Error("ไม่พบงานทำความสะอาดที่ระบุ");

  updateRowById("tbl_HousekeepingTasks", "TaskID", taskId, {
    Status: 'done', CompletedAt: new Date().toISOString()
  });
  // Auto update room to dirty → clean_inspected after inspection
  updateRowById("tbl_Rooms", "RoomID", task.RoomID, { Status: 'clean_inspected' });
  บันทึกAuditLog(token, "COMPLETE_TASK", "tbl_HousekeepingTasks", taskId, task, { Status: 'done' });
  return { success: true };
}

function ตรวจรับงานทำความสะอาด(token, taskId) {
  ตรวจสอบสิทธิ์(token, ['Housekeeper', 'Manager', 'SuperAdmin', 'PropertyManager']);
  var tasks = readAllRows("tbl_HousekeepingTasks");
  var task = tasks.filter(function(t) { return t.TaskID === taskId; })[0];
  if (!task) throw new Error("ไม่พบ Task: " + taskId);
  if (task.Status !== 'done') throw new Error("ต้องทำงานให้เสร็จก่อนจึงจะตรวจรับได้");
  updateRowById("tbl_HousekeepingTasks", "TaskID", taskId, {
    Status: "inspected",
    InspectedAt: new Date().toISOString()
  });
  updateRowById("tbl_Rooms", "RoomID", task.RoomID, { Status: "clean_inspected" });
  บันทึกAuditLog(token, "INSPECT_TASK", "tbl_HousekeepingTasks", taskId, task, { Status: "inspected" });
  return { success: true };
}


// ==========================================
// FILE: LegalService.js
// ==========================================

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


// ==========================================
// FILE: Main.js
// ==========================================

// Main.gs — Entry point for Google Apps Script Web App

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('RoomScope PMS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ==========================================
// FILE: NotificationService.js
// ==========================================

// NotificationService.gs — LINE Messaging API via UrlFetchApp

function ส่งLineFlexMessage(to, flexJson) {
  var token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN');
  if (!token) { Logger.log("LINE_CHANNEL_TOKEN not configured"); return; }

  var payload = { to: to, messages: [{ type: "flex", altText: "แจ้งเตือนจาก RoomScope", contents: flexJson }] };
  var resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  Logger.log("LINE Response: " + resp.getResponseCode() + " " + resp.getContentText());
}

function แจ้งเตือนเช็คอินเช็คเอาท์ประจำวัน() {
  var today = new Date();
  var todayStr = today.toISOString().slice(0, 10);
  var bookings = readAllRows("tbl_Bookings");

  var checkIns = bookings.filter(function(b) {
    return b.CheckInDate && b.CheckInDate.toString().slice(0, 10) === todayStr && b.Status === 'confirmed';
  });
  var checkOuts = bookings.filter(function(b) {
    return b.CheckOutDate && b.CheckOutDate.toString().slice(0, 10) === todayStr && b.Status === 'checked_in';
  });

  var lineUserId = PropertiesService.getScriptProperties().getProperty('LINE_ADMIN_USER_ID');
  if (!lineUserId) return;

  var bubble = {
    type: "bubble",
    body: {
      type: "box", layout: "vertical", contents: [
        { type: "text", text: "📋 สรุปประจำวัน " + todayStr, weight: "bold", size: "md" },
        { type: "text", text: "✅ เช็คอินวันนี้: " + checkIns.length + " รายการ" },
        { type: "text", text: "🚪 เช็คเอาท์วันนี้: " + checkOuts.length + " รายการ" }
      ]
    }
  };
  ส่งLineFlexMessage(lineUserId, bubble);
}

function ตรวจห้องค้างทำความสะอาด() {
  var tasks = readAllRows("tbl_HousekeepingTasks");
  var rooms = readAllRows("tbl_Rooms");
  var roomMap = {};
  rooms.forEach(function(r) { roomMap[r.RoomID] = r; });

  var now = new Date();
  var overdue = tasks.filter(function(t) {
    if (t.Status !== 'pending' && t.Status !== 'in_progress') return false;
    if (!t.StartedAt) {
      // Task hasn't started — check if booking checkout was > 2hrs ago (approx via task creation)
      return false;
    }
    var start = new Date(t.StartedAt);
    var diffHours = (now - start) / (1000 * 60 * 60);
    return diffHours >= 2;
  });

  if (overdue.length === 0) return;

  var lineUserId = PropertiesService.getScriptProperties().getProperty('LINE_ADMIN_USER_ID');
  if (!lineUserId) return;

  var bubble = {
    type: "bubble",
    styles: { body: { backgroundColor: "#fff3cd" } },
    body: {
      type: "box", layout: "vertical", contents: [
        { type: "text", text: "⚠️ ห้องรอทำความสะอาดเกิน 2 ชม.", weight: "bold", color: "#856404" },
        { type: "text", text: overdue.length + " ห้อง รอดำเนินการ", color: "#856404" }
      ]
    }
  };
  ส่งLineFlexMessage(lineUserId, bubble);
}


// ==========================================
// FILE: ReportService.js
// ==========================================

// ReportService.gs — Dashboard data and report generation

function ดึงข้อมูลDashboard(token) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);

  var cache = CacheService.getScriptCache();
  var cacheKey = 'dashboard_' + session.role;
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var rooms = readAllRows("tbl_Rooms");
  var bookings = readAllRows("tbl_Bookings");
  var tasks = readAllRows("tbl_HousekeepingTasks");

  var today = new Date();
  var todayStr = today.toISOString().slice(0, 10);

  var roomStats = { available: 0, occupied: 0, dirty: 0, clean_inspected: 0, out_of_order: 0 };
  rooms.forEach(function(r) {
    var s = r.Status || 'available';
    if (roomStats[s] !== undefined) roomStats[s]++;
  });

  var todayCheckIns = bookings.filter(function(b) {
    return b.CheckInDate && b.CheckInDate.toString().slice(0, 10) === todayStr && b.Status === 'confirmed';
  });
  var todayCheckOuts = bookings.filter(function(b) {
    return b.CheckOutDate && b.CheckOutDate.toString().slice(0, 10) === todayStr && b.Status === 'checked_in';
  });

  var pendingTasks = tasks.filter(function(t) { return t.Status === 'pending' || t.Status === 'in_progress'; });

  var totalRooms = rooms.length;
  var occupancyRate = totalRooms > 0 ? ((roomStats.occupied / totalRooms) * 100).toFixed(1) : 0;

  var todayRevenue = bookings
    .filter(function(b) { return b.CheckInDate && b.CheckInDate.toString().slice(0,10) === todayStr && b.Status !== 'cancelled'; })
    .reduce(function(acc, b) { return acc + (parseFloat(b.TotalAmount)||0); }, 0);

  var result = {
    roomStats: roomStats,
    totalRooms: totalRooms,
    occupancyRate: occupancyRate,
    todayCheckIns: todayCheckIns.length,
    todayCheckOuts: todayCheckOuts.length,
    todayRevenue: todayRevenue,
    pendingCleaningTasks: pendingTasks.length,
    generatedAt: new Date().toISOString()
  };

  cache.put(cacheKey, JSON.stringify(result), 300); // Cache 5 minutes
  return result;
}

function ดึงรายงานการจองช่วงเวลา(token, fromDate, toDate) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting', 'Owner']);

  var bookings = readAllRows("tbl_Bookings");
  var from = new Date(fromDate);
  var to = new Date(toDate);

  var filtered = bookings.filter(function(b) {
    var checkIn = new Date(b.CheckInDate);
    return checkIn >= from && checkIn <= to;
  });

  var totalRevenue = filtered.reduce(function(acc, b) { return acc + (parseFloat(b.TotalAmount) || 0); }, 0);
  var byStatus = {};
  filtered.forEach(function(b) {
    byStatus[b.Status] = (byStatus[b.Status] || 0) + 1;
  });

  return {
    totalBookings: filtered.length,
    totalRevenue: totalRevenue,
    byStatus: byStatus,
    bookings: filtered
  };
}

/** ดึงรายงานสรุปสำหรับหน้า Reports */
function ดึงรายงานสรุป(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'Manager', 'PropertyManager', 'Accounting', 'Owner']);

  var bookings = readAllRows("tbl_Bookings");
  var rooms = readAllRows("tbl_Rooms");
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var monthStart = new Date(y, m, 1).toISOString().slice(0,10);
  var monthEnd = new Date(y, m+1, 0).toISOString().slice(0,10);

  var monthBookings = bookings.filter(function(b) {
    var cin = b.CheckInDate ? b.CheckInDate.toString().slice(0,10) : '';
    return cin >= monthStart && cin <= monthEnd && b.Status !== 'cancelled';
  });

  var monthRevenue = monthBookings.reduce(function(acc, b) { return acc + (parseFloat(b.TotalAmount)||0); }, 0);
  var totalRooms = rooms.length || 1;
  var occupied = rooms.filter(function(r) { return r.Status === 'occupied'; }).length;
  var avgOccupancy = ((occupied / totalRooms) * 100).toFixed(1);

  var totalNights = monthBookings.reduce(function(acc, b) { return acc + (parseInt(b.Nights)||1); }, 0);
  var avgDailyRate = monthBookings.length > 0 ? (monthRevenue / (totalNights||1)) : 0;
  var revPAR = (occupied / totalRooms) * avgDailyRate;

  // Add todayRevenue to dashboard too
  var todayStr = now.toISOString().slice(0,10);
  var todayRevenue = bookings
    .filter(function(b) { return b.CheckInDate && b.CheckInDate.toString().slice(0,10) === todayStr && b.Status !== 'cancelled'; })
    .reduce(function(acc, b) { return acc + (parseFloat(b.TotalAmount)||0); }, 0);

  return {
    monthRevenue: monthRevenue,
    monthBookings: monthBookings.length,
    avgOccupancy: parseFloat(avgOccupancy),
    avgDailyRate: Math.round(avgDailyRate),
    revPAR: Math.round(revPAR),
    todayRevenue: todayRevenue
  };
}


// ==========================================
// FILE: RevenueService.js
// ==========================================

// RevenueService.gs — Pricing, seasons, coupons, and calculations

/** คำนวณราคาห้องพักและส่วนลดทั้งหมด */
function คำนวณราคาสุดท้าย(token, roomTypeId, checkInStr, checkOutStr, couponCode) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting']);
  
  var checkIn = new Date(checkInStr);
  var checkOut = new Date(checkOutStr);
  
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    throw new Error("รูปแบบวันที่เข้าพักไม่ถูกต้อง");
  }
  
  var diffTime = checkOut.getTime() - checkIn.getTime();
  var totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (totalNights <= 0) {
    throw new Error("วันที่เช็คเอาท์ต้องอยู่หลังวันที่เช็คอินอย่างน้อย 1 คืน");
  }
  
  var roomTypes = readAllRows("tbl_RoomTypes");
  var selectedType = null;
  for (var i = 0; i < roomTypes.length; i++) {
    if (roomTypes[i].RoomTypeID === roomTypeId) {
      selectedType = roomTypes[i];
      break;
    }
  }
  if (!selectedType) throw new Error("ไม่พบประเภทห้องพักระบุ");
  
  // 1. Calculate base rate
  var baseRatePerNight = selectedType.BasePriceDaily;
  var pricingLog = [];
  var totalRoomCharge = 0;
  
  var seasons = readAllRows("tbl_Seasons");
  var seasonRates = readAllRows("tbl_SeasonRates");
  
  // Sort seasons by priority (highest priority first)
  seasons.sort(function(a, b) { return b.Priority - a.Priority; });
  
  // Calculate price night by night to account for season transitions
  for (var day = 0; day < totalNights; day++) {
    var currentDate = new Date(checkIn.getTime() + (day * 24 * 60 * 60 * 1000));
    var rateForThisNight = baseRatePerNight;
    var appliedSeasonName = "ราคาปกติ (Base)";
    
    // Check if this date falls within any season
    for (var s = 0; s < seasons.length; s++) {
      var season = seasons[s];
      var start = new Date(season.StartDate);
      var end = new Date(season.EndDate);
      
      if (currentDate >= start && currentDate <= end) {
        // Find matching rate in seasonRates
        var matchingRate = null;
        for (var sr = 0; sr < seasonRates.length; sr++) {
          if (seasonRates[sr].SeasonID === season.SeasonID && seasonRates[sr].RoomTypeID === roomTypeId) {
            matchingRate = seasonRates[sr];
            break;
          }
        }
        if (matchingRate && matchingRate.PriceDaily > 0) {
          rateForThisNight = matchingRate.PriceDaily;
          appliedSeasonName = season.Name;
          break; // Found highest priority season rate
        }
      }
    }
    totalRoomCharge += rateForThisNight;
    pricingLog.push({
      date: currentDate.toISOString().slice(0, 10),
      rate: rateForThisNight,
      season: appliedSeasonName
    });
  }
  
  // 2. Apply Coupon
  var couponDiscount = 0;
  var couponApplied = false;
  if (couponCode) {
    var coupons = readAllRows("tbl_Coupons");
    var foundCoupon = null;
    for (var c = 0; c < coupons.length; c++) {
      if (coupons[c].Code === couponCode.trim()) {
        foundCoupon = coupons[c];
        break;
      }
    }
    
    if (foundCoupon) {
      var now = new Date();
      var start = new Date(foundCoupon.ValidFrom);
      var end = new Date(foundCoupon.ValidTo);
      
      if (now >= start && now <= end && (foundCoupon.UsedCount || 0) < foundCoupon.UsageLimit && totalNights >= foundCoupon.MinNights) {
        if (foundCoupon.DiscountType === "percentage") {
          couponDiscount = totalRoomCharge * (foundCoupon.Value / 100);
        } else if (foundCoupon.DiscountType === "fixed") {
          couponDiscount = foundCoupon.Value;
        }
        couponApplied = true;
      }
    }
  }
  
  var afterDiscount = totalRoomCharge - couponDiscount;
  if (afterDiscount < 0) afterDiscount = 0;
  
  // 3. Tax computation (VAT 7% - Assume price includes VAT, so we extract it)
  // VAT 7% = amount - (amount / 1.07)
  var subtotal = afterDiscount / 1.07;
  var vatAmount = afterDiscount - subtotal;
  
  return {
    totalNights: totalNights,
    baseRatePerNight: baseRatePerNight,
    roomChargeBreakdown: pricingLog,
    totalRoomCharge: totalRoomCharge,
    couponCode: couponCode,
    couponApplied: couponApplied,
    couponDiscount: couponDiscount,
    subtotal: subtotal,
    vatAmount: vatAmount,
    totalAmount: afterDiscount
  };
}

function คำนวณราคาสมบูรณ์จากเลขห้อง(token, roomNo, checkInDate, checkOutDate, couponCode) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting']);
  var rooms = readAllRows("tbl_Rooms");
  var room = rooms.filter(function(r) { return r.RoomNo === roomNo; })[0];
  if (!room) throw new Error("ไม่พบห้องเลขที่ " + roomNo);
  return คำนวณราคาสุดท้าย(token, room.RoomTypeID, checkInDate, checkOutDate, couponCode);
}

function ดึงซีซั่นทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_Seasons");
}

function บันทึกซีซั่น(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  var id = data.SeasonID || ("SEA-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.SeasonID;
  var row = {
    SeasonID: id,
    Name: data.Name,
    StartDate: data.StartDate,
    EndDate: data.EndDate,
    Priority: parseInt(data.Priority) || 0
  };
  if (isUpdate) {
    updateRowById("tbl_Seasons", "SeasonID", id, row);
  } else {
    insertRow("tbl_Seasons", row);
  }
  return { success: true, SeasonID: id };
}

function ลบซีซั่น(token, seasonId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  deleteRowById("tbl_Seasons", "SeasonID", seasonId);
  return { success: true };
}

function ดึงคูปองทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_Coupons");
}

function บันทึกคูปอง(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  var id = data.CouponID || ("CUP-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.CouponID;
  var row = {
    CouponID: id,
    Code: data.Code,
    DiscountType: data.DiscountType,
    Value: parseFloat(data.Value) || 0,
    ValidFrom: data.ValidFrom,
    ValidTo: data.ValidTo,
    UsageLimit: parseInt(data.UsageLimit) || 0,
    UsedCount: parseInt(data.UsedCount) || 0,
    MinNights: parseInt(data.MinNights) || 0
  };
  if (isUpdate) {
    updateRowById("tbl_Coupons", "CouponID", id, row);
  } else {
    insertRow("tbl_Coupons", row);
  }
  return { success: true, CouponID: id };
}

function ลบคูปอง(token, couponId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  deleteRowById("tbl_Coupons", "CouponID", couponId);
  return { success: true };
}

function ดึงค่าบริการเพิ่มทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_Surcharges");
}

function บันทึกค่าบริการเพิ่ม(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  var id = data.SurchargeID || ("SUR-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.SurchargeID;
  var row = {
    SurchargeID: id,
    Name: data.Name,
    Type: data.Type,
    Amount: parseFloat(data.Amount) || 0,
    SurchargeDate: data.SurchargeDate || '',
    Description: data.Description || '',
    Active: data.Active !== false ? 'TRUE' : 'FALSE'
  };
  if (isUpdate) {
    updateRowById("tbl_Surcharges", "SurchargeID", id, row);
  } else {
    insertRow("tbl_Surcharges", row);
  }
  return { success: true, SurchargeID: id };
}

function ลบค่าบริการเพิ่ม(token, surchargeId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  deleteRowById("tbl_Surcharges", "SurchargeID", surchargeId);
  return { success: true };
}

function ดึงราคาซีซั่นทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_SeasonRates");
}

function บันทึกราคาซีซั่น(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  var id = data.SeasonRateID || ("SRT-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.SeasonRateID;
  var row = {
    SeasonRateID: id,
    SeasonID: data.SeasonID,
    RoomTypeID: data.RoomTypeID,
    PriceDaily: parseFloat(data.PriceDaily) || 0,
    PriceMonthly: parseFloat(data.PriceMonthly) || 0
  };
  if (isUpdate) {
    updateRowById("tbl_SeasonRates", "SeasonRateID", id, row);
  } else {
    insertRow("tbl_SeasonRates", row);
  }
  return { success: true, SeasonRateID: id };
}

function ลบราคาซีซั่น(token, id) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  deleteRowById("tbl_SeasonRates", "SeasonRateID", id);
  return { success: true };
}

function ดึงเรทแพลนทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_RatePlans");
}

function บันทึกเรทแพลน(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  var id = data.RatePlanID || ("RPL-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.RatePlanID;
  var row = {
    RatePlanID: id,
    Name: data.Name,
    CancellationPolicyID: data.CancellationPolicyID || '',
    Inclusions: data.Inclusions || ''
  };
  if (isUpdate) {
    updateRowById("tbl_RatePlans", "RatePlanID", id, row);
  } else {
    insertRow("tbl_RatePlans", row);
  }
  return { success: true, RatePlanID: id };
}

function ลบเรทแพลน(token, id) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  deleteRowById("tbl_RatePlans", "RatePlanID", id);
  return { success: true };
}

function ดึงนโยบายยกเลิกทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_CancellationPolicies");
}

function บันทึกนโยบายยกเลิก(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  var id = data.PolicyID || ("POL-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.PolicyID;
  var row = {
    PolicyID: id,
    Name: data.Name,
    RulesJSON: data.RulesJSON || '{}'
  };
  if (isUpdate) {
    updateRowById("tbl_CancellationPolicies", "PolicyID", id, row);
  } else {
    insertRow("tbl_CancellationPolicies", row);
  }
  return { success: true, PolicyID: id };
}

function ลบนโยบายยกเลิก(token, id) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Accounting']);
  deleteRowById("tbl_CancellationPolicies", "PolicyID", id);
  return { success: true };
}


// ==========================================
// FILE: RoomService.js
// ==========================================

// RoomService.gs — Room and Room Type management

/** ดึงข้อมูลห้องพักทั้งหมด */
function ดึงข้อมูลห้องพักทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'HousekeepingStaff', 'Accounting', 'Owner']);
  
  var rooms = readAllRows("tbl_Rooms");
  var roomTypes = readAllRows("tbl_RoomTypes");
  var floors = readAllRows("tbl_Floors");
  var buildings = readAllRows("tbl_Buildings");
  
  // Mapping helpers
  var typeMap = {};
  roomTypes.forEach(function(t) { typeMap[t.RoomTypeID] = t; });
  
  var floorMap = {};
  floors.forEach(function(f) { floorMap[f.FloorID] = f; });
  
  var buildingMap = {};
  buildings.forEach(function(b) { buildingMap[b.BuildingID] = b; });
  
  // Join tables
  var list = rooms.map(function(r) {
    var type = typeMap[r.RoomTypeID] || {};
    var floor = floorMap[r.FloorID] || {};
    var building = buildingMap[floor.BuildingID] || {};
    
    return {
      roomId: r.RoomID,
      roomNo: r.RoomNo,
      status: r.Status,
      note: r.Note,
      lastCleanedAt: r.LastCleanedAt,
      floorNumber: floor.FloorNumber,
      buildingName: building.Name,
      roomTypeName: type.Name,
      priceDaily: type.BasePriceDaily,
      priceMonthly: type.BasePriceMonthly,
      maxAdult: type.MaxAdult,
      maxChild: type.MaxChild
    };
  });
  
  return list;
}

/** ดึงข้อมูลห้องพักตามอาคาร */
function ดึงห้องตามอาคาร(token, buildingId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'HousekeepingStaff', 'Accounting', 'Owner']);
  var rooms = readAllRows("tbl_Rooms");
  var floors = readAllRows("tbl_Floors");
  var floorIds = floors
    .filter(function(f) { return f.BuildingID === buildingId; })
    .map(function(f) { return f.FloorID; });
  var filtered = rooms.filter(function(r) { return floorIds.indexOf(r.FloorID) !== -1; });
  return filtered;
}

/** อัปเดตสถานะห้องพัก */
function อัปเดตสถานะห้อง(token, roomId, status) {
  var session = ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'HousekeepingStaff']);
  
  // Validate status transition
  var validStatuses = ['available', 'occupied', 'dirty', 'clean_inspected', 'out_of_order'];
  if (validStatuses.indexOf(status) === -1) {
    throw new Error("สถานะห้องพักไม่ถูกต้อง");
  }
  
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    
    var beforeRoom = null;
    var allRooms = readAllRows("tbl_Rooms");
    for (var i = 0; i < allRooms.length; i++) {
      if (allRooms[i].RoomID === roomId) {
        beforeRoom = allRooms[i];
        break;
      }
    }
    
    if (!beforeRoom) throw new Error("ไม่พบห้องพัก ID: " + roomId);
    
    var updateFields = { Status: status };
    if (status === 'clean_inspected') {
      updateFields.LastCleanedAt = new Date().toISOString();
    }
    
    updateRowById("tbl_Rooms", "RoomID", roomId, updateFields);
    
    // Log audit trail
    var afterRoom = Object.assign({}, beforeRoom, updateFields);
    บันทึกAuditLog(token, "UPDATE_ROOM_STATUS", "tbl_Rooms", roomId, beforeRoom, afterRoom);
    
    return { success: true, roomId: roomId, newStatus: status };
  } finally {
    lock.releaseLock();
  }
}

/** ตั้งค่าประเภทห้องพักพื้นฐาน */
function ดึงข้อมูลประเภทห้องทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_RoomTypes");
}

// Buildings CRUD
function ดึงอาคารทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_Buildings");
}

function บันทึกอาคาร(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var id = data.BuildingID || ("BLD-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.BuildingID;
  var row = {
    BuildingID: id,
    BuildingName: data.BuildingName || data.Name,
    Name: data.Name || data.BuildingName,
    TotalFloors: parseInt(data.TotalFloors) || 1,
    Description: data.Description || ''
  };
  if (isUpdate) {
    updateRowById("tbl_Buildings", "BuildingID", id, row);
  } else {
    insertRow("tbl_Buildings", row);
  }
  return { success: true, BuildingID: id };
}

// Floors CRUD
function ดึงชั้นทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  return readAllRows("tbl_Floors");
}

function บันทึกชั้น(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var id = data.FloorID || ("FLR-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.FloorID;
  var row = {
    FloorID: id,
    BuildingID: data.BuildingID,
    FloorNumber: parseInt(data.FloorNumber) || 1
  };
  if (isUpdate) {
    updateRowById("tbl_Floors", "FloorID", id, row);
  } else {
    insertRow("tbl_Floors", row);
  }
  return { success: true, FloorID: id };
}

function ลบชั้น(token, floorId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  deleteRowById("tbl_Floors", "FloorID", floorId);
  return { success: true };
}

// Room Types CRUD
function บันทึกประเภทห้อง(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var id = data.RoomTypeID || ("RTP-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.RoomTypeID;
  var row = {
    RoomTypeID: id,
    RoomTypeName: data.RoomTypeName || data.Name,
    Name: data.Name || data.RoomTypeName,
    Description: data.Description || '',
    BasePriceDaily: parseFloat(data.BasePriceDaily || data.BasePrice) || 0,
    BasePriceMonthly: parseFloat(data.BasePriceMonthly || 0) || 0,
    BasePrice: parseFloat(data.BasePrice || data.BasePriceDaily) || 0,
    MaxAdult: parseInt(data.MaxAdult) || 2,
    MaxChild: parseInt(data.MaxChild) || 0,
    Amenities: data.Amenities || '',
    BedType: data.BedType || '',
    SizeSqm: parseInt(data.SizeSqm) || 0
  };
  if (isUpdate) {
    updateRowById("tbl_RoomTypes", "RoomTypeID", id, row);
  } else {
    insertRow("tbl_RoomTypes", row);
  }
  return { success: true, RoomTypeID: id };
}

function ลบประเภทห้อง(token, roomTypeId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  deleteRowById("tbl_RoomTypes", "RoomTypeID", roomTypeId);
  return { success: true };
}

// Rooms CRUD
function บันทึกห้อง(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var id = data.RoomID || ("ROM-" + Utilities.getUuid().substring(0, 8));
  var isUpdate = !!data.RoomID;
  var row = {
    RoomID: id,
    FloorID: data.FloorID,
    RoomTypeID: data.RoomTypeID,
    RoomNo: data.RoomNo,
    Status: data.Status || 'available',
    LastCleanedAt: data.LastCleanedAt || '',
    Note: data.Note || data.Notes || '',
    Notes: data.Notes || data.Note || ''
  };
  if (isUpdate) {
    updateRowById("tbl_Rooms", "RoomID", id, row);
  } else {
    insertRow("tbl_Rooms", row);
  }
  return { success: true, RoomID: id };
}

function ลบห้อง(token, roomId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  deleteRowById("tbl_Rooms", "RoomID", roomId);
  return { success: true };
}

function ลบอาคาร(token, buildingId) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin']);
  deleteRowById("tbl_Buildings", "BuildingID", buildingId);
  return { success: true };
}


// ==========================================
// FILE: SetupService.js
// ==========================================

// SetupService.gs — One-time spreadsheet & admin setup

var SHEET_SCHEMAS = [
  {
    name: "tbl_Users",
    cols: ["UserID","Username","PasswordHash","Salt","Role","FullName","Phone","Email","LineUserID","Status","CreatedAt","LastLoginAt","FailedAttemptCount"]
  },
  {
    name: "tbl_Properties",
    cols: ["PropertyID","Name","Address","TaxID"]
  },
  {
    name: "tbl_Buildings",
    cols: ["BuildingID","BuildingName","Name","TotalFloors","Description"]
  },
  {
    name: "tbl_Floors",
    cols: ["FloorID","BuildingID","FloorNumber"]
  },
  {
    name: "tbl_RoomTypes",
    cols: ["RoomTypeID","RoomTypeName","Name","Description","BasePriceDaily","BasePriceMonthly","BasePrice","MaxAdult","MaxChild","Amenities","BedType","SizeSqm"]
  },
  {
    name: "tbl_Rooms",
    cols: ["RoomID","FloorID","RoomTypeID","RoomNo","Status","LastCleanedAt","Note","Notes"]
  },
  {
    name: "tbl_Guests",
    cols: ["GuestID","FullName","Phone","Email","IDCardOrPassport","Nationality","DateOfBirth","Address","LineUserID","Notes","CreatedAt"]
  },
  {
    name: "tbl_Companies",
    cols: ["CompanyID","Name","TaxID","Address","ContactPerson","Phone"]
  },
  {
    name: "tbl_Bookings",
    cols: ["BookingID","BookingNo","GuestID","BookingSource","RentalType","Status","CheckInDate","CheckOutDate","ActualCheckInAt","ActualCheckOutAt","RatePlanID","CouponID","TotalAmount","DepositAmount","PaidAmount","PaymentStatus","BasePrice","Nights","Adults","Children","RateType","Channel","CustomerType","TaxID","Notes","CreatedBy","CreatedAt","UpdatedAt"]
  },
  {
    name: "tbl_BookingRooms",
    cols: ["ID","BookingID","RoomID","PriceSnapshot"]
  },
  {
    name: "tbl_BookingAddons",
    cols: ["ID","BookingID","AddonName","Qty","UnitPrice","Amount","AddonDate","StaffName","Notes"]
  },
  {
    name: "tbl_AddonTemplates",
    cols: ["ID","Name","Category","Unit","Price","Active"]
  },
  {
    name: "tbl_BookingHistory",
    cols: ["ID","BookingID","ChangedBy","ChangeType","OldValue","NewValue","ChangedAt"]
  },
  {
    name: "tbl_Seasons",
    cols: ["SeasonID","Name","StartDate","EndDate","Priority"]
  },
  {
    name: "tbl_SeasonRates",
    cols: ["SeasonRateID","SeasonID","RoomTypeID","PriceDaily","PriceMonthly"]
  },
  {
    name: "tbl_RatePlans",
    cols: ["RatePlanID","Name","CancellationPolicyID","Inclusions"]
  },
  {
    name: "tbl_CancellationPolicies",
    cols: ["PolicyID","Name","RulesJSON"]
  },
  {
    name: "tbl_Coupons",
    cols: ["CouponID","Code","DiscountType","Value","ValidFrom","ValidTo","UsageLimit","UsedCount","MinNights"]
  },
  {
    name: "tbl_Surcharges",
    cols: ["SurchargeID","Name","Type","Amount","SurchargeDate","Description","Active"]
  },
  {
    name: "tbl_HousekeepingTasks",
    cols: ["TaskID","RoomID","AssignedTo","TaskType","Status","Notes","CreatedBy","CreatedAt","StartedAt","CompletedAt"]
  },
  {
    name: "tbl_MaintenanceRequests",
    cols: ["RequestID","RoomID","ReportedBy","Description","PhotoURL","Priority","Status","ResolvedAt"]
  },
  {
    name: "tbl_FinancialDocs",
    cols: ["DocID","DocType","DocNo","BookingID","CustomerType","CustomerSnapshotJSON","ItemsJSON","Subtotal","VatAmount","Total","Status","VoidedReason","PDFUrl","IssuedBy","IssuedAt"]
  },
  {
    name: "tbl_AuditLogs",
    cols: ["LogID","UserID","Action","TargetSheet","TargetID","BeforeJSON","AfterJSON","CreatedAt"]
  },
  {
    name: "tbl_LegalGuests",
    cols: ["ID","BookingID","GuestNameTH","GuestNameEN","Nationality","IDCardNo","PassportNo","BirthDate","Gender","Address","CheckIn","CheckOut","RoomNumber","IsForeign","RR3Printed","RR4Submitted","TM30Submitted","TM30SubmittedAt"]
  },
  {
    name: "CONFIG",
    cols: ["Key","Value"]
  }
];

function ตั้งค่าระบบครั้งแรก() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  SHEET_SCHEMAS.forEach(function(schema) {
    var sheet = ss.getSheetByName(schema.name);
    if (!sheet) {
      sheet = ss.insertSheet(schema.name);
    }
    var existing = sheet.getLastColumn();
    if (existing === 0) {
      sheet.getRange(1, 1, 1, schema.cols.length).setValues([schema.cols]);
      sheet.getRange(1, 1, 1, schema.cols.length).setBackground('#1c2128').setFontColor('#8b949e').setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });

  // Create default SuperAdmin
  var users = readAllRows("tbl_Users");
  if (!users.find(function(u) { return u.Role === 'SuperAdmin'; })) {
    var salt = Utilities.getUuid();
    var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      "admin123" + salt,
      Utilities.Charset.UTF_8
    ).map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');

    insertRow("tbl_Users", {
      UserID: "USR-ADMIN",
      Username: "admin",
      PasswordHash: hash,
      Salt: salt,
      Role: "SuperAdmin",
      FullName: "ผู้ดูแลระบบ",
      Status: "active",
      CreatedAt: new Date().toISOString()
    });
  }

  Logger.log("✅ ตั้งค่าระบบเสร็จสิ้น — username: admin / password: admin123");
  return { success: true, message: "ตั้งค่าระบบสำเร็จแล้ว กรุณาเปลี่ยนรหัสผ่าน admin ทันที" };
}

function ดึงข้อมูลโรงแรม(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'FrontDesk', 'Accounting', 'Owner']);
  var rows = readAllRows("tbl_Properties");
  return rows[0] || { PropertyID: 'PROP-01', Name: '', Address: '', TaxID: '' };
}

function บันทึกข้อมูลโรงแรม(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var rows = readAllRows("tbl_Properties");
  var row = {
    PropertyID: data.PropertyID || 'PROP-01',
    Name: data.Name || '',
    Address: data.Address || '',
    TaxID: data.TaxID || ''
  };
  if (rows.length > 0) {
    updateRowById("tbl_Properties", "PropertyID", row.PropertyID, row);
  } else {
    insertRow("tbl_Properties", row);
  }
  return { success: true };
}

function ดึงค่าคอนฟิกทั้งหมด(token) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager', 'Owner']);
  var rows = readAllRows("CONFIG");
  var config = {};
  rows.forEach(function(r) {
    if (r.Key) config[r.Key] = r.Value;
  });
  return config;
}

function บันทึกค่าคอนฟิก(token, data) {
  ตรวจสอบสิทธิ์(token, ['SuperAdmin', 'PropertyManager']);
  var keys = Object.keys(data);
  keys.forEach(function(key) {
    var rows = readAllRows("CONFIG");
    var found = rows.filter(function(r) { return r.Key === key; })[0];
    if (found) {
      updateRowById("CONFIG", "Key", key, { Value: data[key] });
    } else {
      insertRow("CONFIG", { Key: key, Value: data[key] });
    }
  });
  return { success: true };
}



// ==========================================
// FILE: Triggers.js
// ==========================================

// Triggers.gs — Automated scheduled job setup

/** ติดตั้ง Triggers ทั้งหมดสำหรับระบบอัตโนมัติ */
function ติดตั้งTriggerทั้งหมด() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('runDailyCheckInOutNotify').timeBased().atHour(7).everyDays(1).create();
  ScriptApp.newTrigger('runOverdueCleaningCheck').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('สำรองข้อมูลรายวัน').timeBased().atHour(2).everyDays(1).create();

  Logger.log('✅ ติดตั้ง Triggers เรียบร้อยแล้ว');
}

/**
 * Trigger wrapper — เช็คอิน/เช็คเอาท์ประจำวัน
 * ชื่อฟังก์ชันนี้ต้องตรงกับ ScriptApp.newTrigger() ข้างบน
 */
function runDailyCheckInOutNotify() {
  var today = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  var bookings = readAllRows("tbl_Bookings");

  var checkIns = bookings.filter(function(b) {
    return b.CheckInDate && b.CheckInDate.toString().slice(0, 10) === today && b.Status === 'confirmed';
  });
  var checkOuts = bookings.filter(function(b) {
    return b.CheckOutDate && b.CheckOutDate.toString().slice(0, 10) === today && b.Status === 'checked_in';
  });

  if (checkIns.length === 0 && checkOuts.length === 0) return;

  var lineAdminId = PropertiesService.getScriptProperties().getProperty('LINE_ADMIN_USER_ID');
  if (!lineAdminId) {
    Logger.log("LINE_ADMIN_USER_ID not set — skipping notification");
    return;
  }

  var bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "📋 RoomScope รายงานประจำวัน", weight: "bold", size: "md" },
        { type: "text", text: "วันที่: " + today },
        { type: "separator", margin: "sm" },
        { type: "text", text: "🟢 เช็คอินวันนี้: " + checkIns.length + " รายการ" },
        { type: "text", text: "🔴 เช็คเอาท์วันนี้: " + checkOuts.length + " รายการ" }
      ]
    }
  };

  try {
    ส่งLineFlexMessage(lineAdminId, bubble);
  } catch (e) {
    Logger.log("LINE notify error: " + e.message);
  }

  Logger.log("✅ แจ้งเตือนประจำวันส่งแล้ว");
}

/**
 * Trigger wrapper — ตรวจห้องค้างทำความสะอาด
 * ชื่อฟังก์ชันนี้ต้องตรงกับ ScriptApp.newTrigger() ข้างบน
 */
function runOverdueCleaningCheck() {
  var tasks = readAllRows("tbl_HousekeepingTasks");
  var stale = tasks.filter(function(t) {
    if (t.Status !== 'in_progress') return false;
    if (!t.StartedAt) return false;
    var started = new Date(t.StartedAt);
    var diffMin = (new Date() - started) / 60000;
    return diffMin > 90;
  });

  if (stale.length === 0) return;

  var lineAdminId = PropertiesService.getScriptProperties().getProperty('LINE_ADMIN_USER_ID');
  if (!lineAdminId) return;

  var items = stale.map(function(t) {
    return { type: "text", text: "• Task " + t.TaskID + " (ห้อง " + t.RoomID + ")" };
  });
  items.unshift({ type: "text", text: "⚠️ ห้องรอทำความสะอาดเกิน 90 นาที", weight: "bold", color: "#c0392b" });

  var bubble = {
    type: "bubble",
    styles: { body: { backgroundColor: "#fff3cd" } },
    body: { type: "box", layout: "vertical", contents: items }
  };

  try {
    ส่งLineFlexMessage(lineAdminId, bubble);
  } catch (e) {
    Logger.log("LINE cleaning alert error: " + e.message);
  }
}

/** สำรองข้อมูลรายวันไปยัง Google Drive */
function สำรองข้อมูลรายวัน() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var backupFolderId = PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID');
  if (!backupFolderId) {
    Logger.log("BACKUP_FOLDER_ID not set — skipping backup");
    return;
  }

  var ts = Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd');
  var backupName = "RoomScope_Backup_" + ts;
  var file = DriveApp.getFileById(ss.getId());
  var folder = DriveApp.getFolderById(backupFolderId);
  file.makeCopy(backupName, folder);
  Logger.log("✅ สำรองข้อมูลเสร็จสิ้น: " + backupName);
}


// ==========================================
// FILE: Utils.js
// ==========================================

// Utils.gs — Spreadsheet helper functions

function getSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  return sheet;
}

function readAllRows(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  }).filter(function(row) { return row[headers[0]] !== ''; });
}

function insertRow(sheetName, rowData) {
  var sheet = getSheet(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return rowData[h] !== undefined ? rowData[h] : ''; });
  sheet.appendRow(row);
}

function updateRowById(sheetName, idColumn, idValue, updates) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf(idColumn);
  if (idIdx === -1) throw new Error("Column not found: " + idColumn);

  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === idValue) {
      Object.keys(updates).forEach(function(key) {
        var colIdx = headers.indexOf(key);
        if (colIdx !== -1) sheet.getRange(i + 1, colIdx + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function generateRunningNo(prefix, sheetName, idCol) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "1";
  var lastId = sheet.getRange(lastRow, 1).getValue().toString();
  var num = parseInt(lastId.replace(/\D/g, '')) || 0;
  return (num + 1).toString();
}

function hashPassword(password, salt) {
  var combined = password + salt;
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    combined,
    Utilities.Charset.UTF_8
  ).map(function(b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
}

function deleteRowById(sheetName, idColumn, idValue) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf(idColumn);
  if (idIdx === -1) throw new Error("Column not found: " + idColumn);

  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === idValue) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}


