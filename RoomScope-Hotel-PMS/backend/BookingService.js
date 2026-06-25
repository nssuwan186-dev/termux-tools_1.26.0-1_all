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
