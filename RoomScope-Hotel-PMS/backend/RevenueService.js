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
