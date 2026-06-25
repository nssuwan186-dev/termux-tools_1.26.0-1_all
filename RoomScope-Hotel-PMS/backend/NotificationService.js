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
