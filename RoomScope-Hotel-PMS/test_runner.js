/**
 * RoomScope Hotel PMS - Local Test Runner
 * This script runs the Google Apps Script codebase in a mocked Node.js environment
 * to verify its correct execution and logic.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

// --- 1. MOCK DATA STORE ---
const mockSheets = {};
const scriptProperties = {
  'LINE_CHANNEL_TOKEN': 'mock-channel-token-123',
  'LINE_ADMIN_USER_ID': 'U1234567890abcdef1234567890abcdef',
  'TEMPLATE_RECEIPT': 'doc-receipt-template',
  'PDF_OUTPUT_FOLDER_ID': 'folder-pdf-output',
  'BACKUP_FOLDER_ID': 'folder-backup'
};
const scriptCache = {};

// --- 2. GOOGLE APPS SCRIPT API MOCKS ---

// Logger Mock
global.Logger = {
  log: function(...args) {
    console.log('[GAS Logger]', ...args);
  }
};

// Utilities Mock
global.Utilities = {
  getUuid: function() {
    return crypto.randomUUID();
  },
  computeDigest: function(algorithm, text, charset) {
    if (algorithm !== 'SHA_256') throw new Error('Unsupported digest: ' + algorithm);
    const hash = crypto.createHash('sha256').update(text).digest();
    // Return signed 8-bit array as per GAS computeDigest
    return Array.from(new Int8Array(hash.buffer));
  },
  DigestAlgorithm: {
    SHA_256: 'SHA_256'
  },
  Charset: {
    UTF_8: 'UTF_8'
  },
  formatDate: function(date, tz, format) {
    // Basic date formatting mock
    const offsetDate = new Date(date.getTime() + (7 * 60 * 60 * 1000)); // Simulating GMT+7
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = offsetDate.getUTCFullYear();
    const mm = pad(offsetDate.getUTCMonth() + 1);
    const dd = pad(offsetDate.getUTCDate());
    if (format === 'yyyy-MM-dd') return `${yyyy}-${mm}-${dd}`;
    if (format === 'dd/MM/yyyy') return `${dd}/${mm}/${yyyy}`;
    return offsetDate.toISOString();
  }
};

// CacheService Mock
global.CacheService = {
  getScriptCache: function() {
    return {
      get: function(key) {
        const item = scriptCache[key];
        if (item && item.expiry > Date.now()) {
          return item.value;
        }
        delete scriptCache[key];
        return null;
      },
      put: function(key, value, ttlSeconds) {
        scriptCache[key] = {
          value: value,
          expiry: Date.now() + (ttlSeconds * 1000)
        };
      },
      remove: function(key) {
        delete scriptCache[key];
      }
    };
  }
};

// PropertiesService Mock
global.PropertiesService = {
  getScriptProperties: function() {
    return {
      getProperty: function(key) {
        return scriptProperties[key];
      },
      setProperty: function(key, value) {
        scriptProperties[key] = value;
      }
    };
  }
};

// LockService Mock
global.LockService = {
  getScriptLock: function() {
    return {
      waitLock: function(ms) {
        // Mock wait lock successfully immediately
      },
      releaseLock: function() {
        // Mock release lock
      }
    };
  }
};

// SpreadsheetApp Mock
global.SpreadsheetApp = {
  getActiveSpreadsheet: function() {
    return {
      getId: function() {
        return 'mock-spreadsheet-id-xyz';
      },
      getSheetByName: function(name) {
        if (!mockSheets[name]) return null;
        return createMockSheet(name);
      },
      insertSheet: function(name) {
        mockSheets[name] = [[]]; // Start with empty row (no headers yet)
        return createMockSheet(name);
      }
    };
  }
};

function createMockSheet(name) {
  return {
    getName: function() { return name; },
    getLastColumn: function() {
      const data = mockSheets[name];
      return data[0] ? data[0].length : 0;
    },
    getLastRow: function() {
      return mockSheets[name].length;
    },
    getRange: function(row, col, numRows, numCols) {
      // GAS range is 1-indexed
      return {
        getValues: function() {
          const rows = [];
          const startRow = row - 1;
          const endRow = numRows ? startRow + numRows : startRow + 1;
          for (let r = startRow; r < endRow; r++) {
            const fileRow = mockSheets[name][r] || [];
            const cols = [];
            const startCol = col - 1;
            const endCol = numCols ? startCol + numCols : startCol + 1;
            for (let c = startCol; c < endCol; c++) {
              cols.push(fileRow[c] !== undefined ? fileRow[c] : '');
            }
            rows.push(cols);
          }
          return rows;
        },
        setValues: function(values) {
          const startRow = row - 1;
          values.forEach((vals, rIdx) => {
            const targetRow = startRow + rIdx;
            if (!mockSheets[name][targetRow]) mockSheets[name][targetRow] = [];
            const startCol = col - 1;
            vals.forEach((val, cIdx) => {
              mockSheets[name][targetRow][startCol + cIdx] = val;
            });
          });
        },
        setValue: function(val) {
          const r = row - 1;
          const c = col - 1;
          if (!mockSheets[name][r]) mockSheets[name][r] = [];
          mockSheets[name][r][c] = val;
        },
        getValue: function() {
          const r = row - 1;
          const c = col - 1;
          if (!mockSheets[name][r] || mockSheets[name][r][c] === undefined) return '';
          return mockSheets[name][r][c];
        },
        setBackground: function() { return this; },
        setFontColor: function() { return this; },
        setFontWeight: function() { return this; }
      };
    },
    getDataRange: function() {
      const data = mockSheets[name];
      const maxCols = data.reduce((max, row) => Math.max(max, row.length), 0);
      return this.getRange(1, 1, data.length, maxCols);
    },
    appendRow: function(rowData) {
      mockSheets[name].push(rowData);
    },
    deleteRow: function(rowPosition) {
      // 1-indexed
      mockSheets[name].splice(rowPosition - 1, 1);
    },
    setFrozenRows: function() { return this; }
  };
}

// UrlFetchApp Mock
global.UrlFetchApp = {
  fetch: function(url, options) {
    Logger.log('HTTP Fetch to ' + url + ' with options ' + JSON.stringify(options));
    return {
      getResponseCode: function() { return 200; },
      getContentText: function() { return '{"success": true, "msg": "Line message sent successfully via mock"}'; }
    };
  }
};

// DriveApp Mock
global.DriveApp = {
  getFileById: function(id) {
    return {
      getId: function() { return id + '-copy'; },
      makeCopy: function(name, folder) {
        Logger.log('DriveApp makeCopy: ' + id + ' -> ' + (name || 'copy'));
        return this;
      },
      getAs: function(mimeType) {
        Logger.log('DriveApp getAs: ' + mimeType);
        return {
          setName: function(name) {
            Logger.log('DriveApp blob set name: ' + name);
            return this;
          }
        };
      },
      setTrashed: function(val) {
        Logger.log('DriveApp setTrashed: ' + val);
      }
    };
  },
  getFolderById: function(id) {
    return {
      createFile: function(blob) {
        Logger.log('DriveApp folder create file from blob');
        return {
          getUrl: function() { return 'https://drive.google.com/mock-pdf-url-abc'; }
        };
      }
    };
  }
};

// DocumentApp Mock
global.DocumentApp = {
  openById: function(id) {
    return {
      getBody: function() {
        return {
          replaceText: function(searchPattern, replacement) {
            Logger.log('DocumentApp replaceText: ' + searchPattern + ' -> ' + replacement);
          }
        };
      },
      saveAndClose: function() {
        Logger.log('DocumentApp saveAndClose');
      }
    };
  }
};

// ScriptApp Mock
global.ScriptApp = {
  getProjectTriggers: function() {
    return [];
  },
  deleteTrigger: function(trigger) {
    Logger.log('ScriptApp deleteTrigger');
  },
  newTrigger: function(functionName) {
    return {
      timeBased: function() {
        return {
          atHour: function() {
            return {
              everyDays: function() {
                return {
                  create: function() {
                    Logger.log('ScriptApp created trigger for: ' + functionName);
                  }
                };
              }
            };
          },
          everyMinutes: function() {
            return {
              create: function() {
                Logger.log('ScriptApp created trigger for: ' + functionName);
              }
            };
          }
        };
      }
    };
  }
};

// HtmlService Mock
global.HtmlService = {
  createTemplateFromFile: function(file) {
    return {
      evaluate: function() {
        return {
          setTitle: function() { return this; },
          setXFrameOptionsMode: function() { return this; }
        };
      }
    };
  },
  createHtmlOutputFromFile: function(file) {
    return {
      getContent: function() { return 'Mock output for: ' + file; }
    };
  },
  XFrameOptionsMode: {
    ALLOWALL: 'ALLOWALL'
  }
};

// Mock function mapping for other scripts
global.STATE = {
  token: null
};

// --- 3. LOAD ALL BACKEND FILES ---
const backendDir = path.join(__dirname, 'backend');
const files = fs.readdirSync(backendDir).filter(f => f.endsWith('.js'));

// Load files in the global context
files.forEach(file => {
  const filePath = path.join(backendDir, file);
  const code = fs.readFileSync(filePath, 'utf8');
  try {
    vm.runInThisContext(code, { filename: file });
    console.log(`Loaded and compiled backend script: ${file}`);
  } catch (err) {
    console.error(`Error loading backend script ${file}:`, err);
    process.exit(1);
  }
});

console.log('\n--- Environment and files loaded. Running Integration Tests ---\n');

// Helper Assert Function
function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    throw new Error('Test Failure: ' + message);
  } else {
    console.log('✅ PASS:', message);
  }
}

function runTests() {
  try {
    // 1. Initial Setup
    console.log('Running Test 1: System setup and Admin creation');
    const setupResult = ตั้งค่าระบบครั้งแรก();
    assert(setupResult.success === true, 'ตั้งค่าระบบครั้งแรก successfully');
    
    // Check if table users was created
    assert(mockSheets['tbl_Users'] !== undefined, 'tbl_Users exists');
    assert(mockSheets['tbl_Users'].length > 1, 'tbl_Users contains user rows');
    
    // 2. Authentication Test
    console.log('\nRunning Test 2: Login and Session validation');
    const loginResult = เข้าสู่ระบบ('admin', 'admin123');
    assert(loginResult.success === true, 'Login succeeds');
    assert(loginResult.role === 'SuperAdmin', 'Role is SuperAdmin');
    assert(loginResult.token !== undefined, 'Token is generated');
    
    const adminToken = loginResult.token;
    
    // Test login failure
    try {
      เข้าสู่ระบบ('admin', 'wrong_pass');
      assert(false, 'Should have thrown error on wrong password');
    } catch (e) {
      assert(e.message.includes('รหัสผ่านไม่ถูกต้อง'), 'Correct error for invalid password');
    }

    // 3. Hotel info configuration
    console.log('\nRunning Test 3: Hotel Profile configuration');
    const hotelData = {
      PropertyID: 'PROP-01',
      Name: 'RoomScope Cozy Hotel',
      Address: '123 Sukhumvit, Bangkok',
      TaxID: '1234567890123'
    };
    const savePropResult = บันทึกข้อมูลโรงแรม(adminToken, hotelData);
    assert(savePropResult.success === true, 'Save hotel configuration');
    
    const retrievedProp = ดึงข้อมูลโรงแรม(adminToken);
    assert(retrievedProp.Name === 'RoomScope Cozy Hotel', 'Retrieved hotel name matches');

    // 4. Hotel Infrastructure CRUD
    console.log('\nRunning Test 4: Setup buildings, floors, room types, and rooms');
    
    // Create building
    const bldResult = บันทึกอาคาร(adminToken, { Name: 'Main Building', TotalFloors: 2 });
    assert(bldResult.success === true, 'Created building');
    const bldId = bldResult.BuildingID;
    
    // Create floor
    const flrResult = บันทึกชั้น(adminToken, { BuildingID: bldId, FloorNumber: 1 });
    assert(flrResult.success === true, 'Created floor');
    const flrId = flrResult.FloorID;

    // Create room type
    const rtpResult = บันทึกประเภทห้อง(adminToken, {
      Name: 'Deluxe Suite',
      BasePriceDaily: 2000,
      BasePriceMonthly: 45000,
      MaxAdult: 2,
      MaxChild: 1
    });
    assert(rtpResult.success === true, 'Created room type');
    const rtpId = rtpResult.RoomTypeID;

    // Create room
    const rmResult = บันทึกห้อง(adminToken, {
      RoomNo: '101',
      FloorID: flrId,
      RoomTypeID: rtpId,
      Status: 'available',
      Note: 'Pool view'
    });
    assert(rmResult.success === true, 'Created room 101');
    const rmId = rmResult.RoomID;

    // Get all rooms list
    const roomList = ดึงข้อมูลห้องพักทั้งหมด(adminToken);
    assert(roomList.length === 1, 'Room list has 1 room');
    assert(roomList[0].roomNo === '101', 'Room 101 retrieved');
    assert(roomList[0].status === 'available', 'Room status is available');
    assert(roomList[0].priceDaily === 2000, 'Room price daily matches');

    // 5. Booking and Concurrency Check
    console.log('\nRunning Test 5: Booking operations & overlaps');
    
    // Calculate price
    const checkIn = '2026-07-01';
    const checkOut = '2026-07-04'; // 3 nights
    const priceCalc = คำนวณราคาสุดท้าย(adminToken, rtpId, checkIn, checkOut);
    assert(priceCalc.totalNights === 3, 'Calculated 3 nights');
    assert(priceCalc.totalRoomCharge === 6000, 'Total base room charge is 6000');

    // Create a coupon
    // tbl_Coupons header: CouponID, Code, DiscountType, Value, ValidFrom, ValidTo, UsageLimit, UsedCount, MinNights
    insertRow('tbl_Coupons', {
      CouponID: 'CPN-SUMMER',
      Code: 'SUMMER26',
      DiscountType: 'fixed',
      Value: 500,
      ValidFrom: '2026-06-01',
      ValidTo: '2026-08-31',
      UsageLimit: 10,
      UsedCount: 0,
      MinNights: 1
    });
    
    const priceWithCoupon = คำนวณราคาสุดท้าย(adminToken, rtpId, checkIn, checkOut, 'SUMMER26');
    assert(priceWithCoupon.couponApplied === true, 'Coupon is applied');
    assert(priceWithCoupon.couponDiscount === 500, 'Coupon discount is 500');
    assert(priceWithCoupon.totalAmount === 5500, 'Final amount with coupon discount is 5500');

    // Create a booking
    const bookingData = {
      roomId: rmId,
      checkIn: checkIn,
      checkOut: checkOut,
      guestName: 'Somchai Jaidee',
      guestPhone: '0812345678',
      email: 'somchai@example.com',
      source: 'Walk-in',
      rentalType: 'daily',
      couponCode: 'SUMMER26'
    };
    
    const bkgResult = สร้างการจอง(adminToken, bookingData);
    assert(bkgResult.success === true, 'Booking created successfully');
    const bkgId = bkgResult.bookingId;

    // Verify room overlap detection
    const isFreeOverlap = ตรวจสอบห้องว่างช่วงวันที่(rmId, '2026-07-02', '2026-07-03');
    assert(isFreeOverlap === false, 'Room detected NOT free during booked dates (inside)');
    
    const isFreeAfter = ตรวจสอบห้องว่างช่วงวันที่(rmId, '2026-07-04', '2026-07-06');
    assert(isFreeAfter === true, 'Room detected free after checkout');

    // 6. Housekeeping Operations
    console.log('\nRunning Test 6: Housekeeping task creation and progress');
    const hkTasks = ดึงงานทำความสะอาดทั้งหมด(adminToken);
    // Note: Creating a booking does not auto-create a task in GAS unless triggers or flows are called.
    // Let's create a manual checkout cleaning task
    const hkResult = สร้างงานทำความสะอาด(adminToken, rmId, 'checkout_clean', 'Please make it clean');
    assert(hkResult.success === true, 'Housekeeping task created');
    const hkTaskId = hkResult.taskId;

    // Start task
    const startHk = เริ่มงานทำความสะอาด(adminToken, hkTaskId);
    assert(startHk.success === true, 'Housekeeping task started');

    // Complete task
    const completeHk = เสร็จงานทำความสะอาด(adminToken, hkTaskId);
    assert(completeHk.success === true, 'Housekeeping task completed');
    
    // Verify room status was updated to clean_inspected after done
    const roomsAfterClean = ดึงข้อมูลห้องพักทั้งหมด(adminToken);
    assert(roomsAfterClean[0].status === 'clean_inspected', 'Room status updated to clean_inspected');

    // 7. Finance Operations
    console.log('\nRunning Test 7: Financial Doc creation');
    const docResult = ออกเอกสารการเงิน(adminToken, 'receipt', bkgId);
    assert(docResult.success === true, 'Created financial receipt doc');
    assert(docResult.docNo.startsWith('RCP-'), 'Receipt number formatted correctly');

    // 8. Dashboard Data & Triggers
    console.log('\nRunning Test 8: Dashboard retrieval and background Triggers');
    const dashboard = ดึงข้อมูลDashboard(adminToken);
    assert(dashboard.totalRooms === 1, 'Dashboard shows 1 room');
    assert(dashboard.roomStats.clean_inspected === 1, 'Dashboard shows 1 clean inspected room');
    
    // Try overdue check trigger
    runOverdueCleaningCheck();
    
    // Try daily notifier trigger
    runDailyCheckInOutNotify();

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! Code runs and executes correctly under simulated environment. 🎉');
  } catch (e) {
    console.error('\n💥 TEST SYSTEM FATAL ERROR:\n', e.stack);
    process.exit(1);
  }
}

runTests();
