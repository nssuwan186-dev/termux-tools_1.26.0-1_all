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

