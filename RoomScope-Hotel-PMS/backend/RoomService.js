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
