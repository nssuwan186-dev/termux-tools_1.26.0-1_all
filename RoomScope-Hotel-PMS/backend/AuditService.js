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
