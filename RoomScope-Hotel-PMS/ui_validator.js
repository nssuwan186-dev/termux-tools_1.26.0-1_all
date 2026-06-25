/**
 * RoomScope Hotel PMS - UI and Frontend-Backend Linkage Validator
 * Statically parses index.html and JavaScript.html to check for:
 * 1. Broken frontend function references (calls to undefined JS functions in HTML events)
 * 2. Missing DOM elements (calls to getElementById for elements not defined in index.html or templates)
 * 3. Invalid Google Apps Script server function calls (google.script.run calls targeting missing backend functions)
 */

const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, 'frontend', 'index.html');
const jsHtmlPath = path.join(__dirname, 'frontend', 'JavaScript.html');
const backendDir = path.join(__dirname, 'backend');

// Load files
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const jsHtml = fs.readFileSync(jsHtmlPath, 'utf8');

// Load backend files to get all server-side functions
const backendFiles = fs.readdirSync(backendDir).filter(f => f.endsWith('.js'));
const serverFunctions = new Set();

backendFiles.forEach(file => {
  const code = fs.readFileSync(path.join(backendDir, file), 'utf8');
  // Simple regex to extract function names: function name(...)
  const matches = code.matchAll(/function\s+([a-zA-Z0-9_ก-๙]+)\s*\(/g);
  for (const match of matches) {
    serverFunctions.add(match[1]);
  }
});

console.log('--- 1. Backend Server-Side Functions Detected ---');
console.log(Array.from(serverFunctions).sort());
console.log(`Total: ${serverFunctions.size} server functions found.\n`);

// 1. Identify all defined JS functions in JavaScript.html
const definedFrontendFunctions = new Set();
const frontendFunctionMatches = jsHtml.matchAll(/function\s+([a-zA-Z0-9_]+)\s*\(/g);
for (const match of frontendFunctionMatches) {
  definedFrontendFunctions.add(match[1]);
}

console.log('--- 2. Frontend JS Functions Detected ---');
console.log(Array.from(definedFrontendFunctions).sort());
console.log(`Total: ${definedFrontendFunctions.size} frontend functions found.\n`);

// 2. Scan index.html for inline event calls and check if they exist
console.log('--- 3. Checking index.html HTML Event Hooks ---');
let errors = 0;
let warnings = 0;

// Find attributes like onclick="someFunc(...)"
const eventRegex = /(on[a-z]+)\s*=\s*["']([^"']+)["']/gi;
let eventMatch;
const eventMatches = [];
while ((eventMatch = eventRegex.exec(indexHtml)) !== null) {
  eventMatches.push({ attr: eventMatch[1], code: eventMatch[2] });
}

eventMatches.forEach(item => {
  // Extract function names from code (e.g. "doLogin()" -> "doLogin")
  const funcCallMatches = item.code.matchAll(/([a-zA-Z0-9_]+)\s*\(/g);
  for (const match of funcCallMatches) {
    const funcName = match[1];
    // Ignore native JS functions or control structures
    if (['if', 'for', 'while', 'switch', 'alert', 'confirm', 'prompt'].includes(funcName)) continue;
    
    if (!definedFrontendFunctions.has(funcName)) {
      console.error(`❌ ERROR: HTML event ${item.attr} calls undefined JS function: ${funcName} inside "${item.code}"`);
      errors++;
    } else {
      console.log(`✅ OK: Event ${item.attr} calls defined JS function: ${funcName}`);
    }
  }
});

// 3. Scan JavaScript.html for getElementById calls
console.log('\n--- 4. Checking DOM element IDs referenced in JS ---');
// Regex for getElementById('...') or getElementById("...")
const domIdRegex = /getElementById\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*\)/g;
let domIdMatch;
const referencedDomIds = new Set();
while ((domIdMatch = domIdRegex.exec(jsHtml)) !== null) {
  referencedDomIds.add(domIdMatch[1]);
}

// Extract defined DOM IDs in index.html (id="...")
const definedDomIds = new Set();
const idAttrRegex = /id\s*=\s*["']([a-zA-Z0-9_-]+)["']/gi;
let idMatch;
while ((idMatch = idAttrRegex.exec(indexHtml)) !== null) {
  definedDomIds.add(idMatch[1]);
}

// Add DOM IDs that are dynamically created in templates in JavaScript.html
// We look for dynamic containers inside HTML template strings
const templateContainerRegex = /id=['"]([a-zA-Z0-9_-]+)['"]/g;
let templateIdMatch;
while ((templateIdMatch = templateContainerRegex.exec(jsHtml)) !== null) {
  definedDomIds.add(templateIdMatch[1]);
}

// Special known elements in template/DOM
const knownDynamicIds = [
  'settings-tab-content', 'room-list-tbody', 'booking-list-tbody',
  'housekeeping-list-tbody', 'docs-list-tbody', 'legal-list-tbody',
  'report-content', 'bk-name', 'bk-phone', 'bk-email', 'bk-room',
  'bk-nationality', 'bk-idcard', 'bk-cin', 'bk-cout', 'bk-adult',
  'bk-coupon', 'booking-price-preview', 'page-content'
];
knownDynamicIds.forEach(id => definedDomIds.add(id));

referencedDomIds.forEach(id => {
  if (!definedDomIds.has(id)) {
    console.warn(`⚠️ WARNING: JS references DOM Element ID "${id}" which is not statically defined in index.html (Might be generated dynamically)`);
    warnings++;
  } else {
    console.log(`✅ OK: DOM Element ID "${id}" exists`);
  }
});

// 4. Scan JavaScript.html for google.script.run server function calls
console.log('\n--- 5. Checking Frontend-Backend Google Apps Script Linkage ---');
// Match calls: google.script.run.withSuccessHandler(...).withFailureHandler(...).serverFunctionName(...)
// To simplify, we search for google.script.run chains followed by .functionName(
const gasCallRegex = /google\.script\.run[\s\S]*?\.([a-zA-Z0-9_ก-๙]+)\(/g;
let gasMatch;
const gasCalls = [];
while ((gasMatch = gasCallRegex.exec(jsHtml)) !== null) {
  // Ignore handlers like withSuccessHandler or withFailureHandler
  const funcName = gasMatch[1];
  if (funcName !== 'withSuccessHandler' && funcName !== 'withFailureHandler') {
    gasCalls.push(funcName);
  }
}

gasCalls.forEach(funcName => {
  if (!serverFunctions.has(funcName)) {
    console.error(`❌ ERROR: JS calls missing server-side function: google.script.run.${funcName}()`);
    errors++;
  } else {
    console.log(`✅ OK: google.script.run.${funcName}() mapped correctly to backend function`);
  }
});

console.log('\n--- Linkage Validation Summary ---');
console.log(`Errors (Critical): ${errors}`);
console.log(`Warnings (Check Dynamic IDs): ${warnings}`);

if (errors > 0) {
  console.error('\n❌ VALIDATION FAILED: There are unresolved references between Frontend and Backend!');
  process.exit(1);
} else {
  console.log('\n🎉 VALIDATION PASSED: All buttons, event handlers, and functions map together correctly and accurately! 🎉');
  process.exit(0);
}
