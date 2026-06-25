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
