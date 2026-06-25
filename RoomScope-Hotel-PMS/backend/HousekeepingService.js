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
