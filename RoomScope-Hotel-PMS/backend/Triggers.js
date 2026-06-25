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
