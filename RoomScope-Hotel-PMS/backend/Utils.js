// Utils.gs — Spreadsheet helper functions

function getSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet not found: " + sheetName);
  return sheet;
}

function readAllRows(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  }).filter(function(row) { return row[headers[0]] !== ''; });
}

function insertRow(sheetName, rowData) {
  var sheet = getSheet(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return rowData[h] !== undefined ? rowData[h] : ''; });
  sheet.appendRow(row);
}

function updateRowById(sheetName, idColumn, idValue, updates) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf(idColumn);
  if (idIdx === -1) throw new Error("Column not found: " + idColumn);

  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === idValue) {
      Object.keys(updates).forEach(function(key) {
        var colIdx = headers.indexOf(key);
        if (colIdx !== -1) sheet.getRange(i + 1, colIdx + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function generateRunningNo(prefix, sheetName, idCol) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "1";
  var lastId = sheet.getRange(lastRow, 1).getValue().toString();
  var num = parseInt(lastId.replace(/\D/g, '')) || 0;
  return (num + 1).toString();
}

function hashPassword(password, salt) {
  var combined = password + salt;
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    combined,
    Utilities.Charset.UTF_8
  ).map(function(b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
}

function deleteRowById(sheetName, idColumn, idValue) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf(idColumn);
  if (idIdx === -1) throw new Error("Column not found: " + idColumn);

  for (var i = 1; i < data.length; i++) {
    if (data[i][idIdx] === idValue) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}
