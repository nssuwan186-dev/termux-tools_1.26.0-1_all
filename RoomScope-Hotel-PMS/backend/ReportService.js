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
