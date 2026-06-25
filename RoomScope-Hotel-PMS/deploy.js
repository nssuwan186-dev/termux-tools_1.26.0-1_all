/**
 * RoomScope Hotel PMS - Automated Deployment Tool (using clasp)
 * This script automates deploying the project to Google Apps Script.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const claspPath = 'node /data/data/com.termux/files/usr/bin/clasp';
const pmsDir = __dirname;

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans);
  }));
}

async function run() {
  console.log('=== RoomScope Automated Deployment Tool ===\n');

  // 1. Check clasp login status
  console.log('Checking clasp login credentials...');
  let loggedIn = false;
  try {
    const listOutput = execSync(`${claspPath} list`, { encoding: 'utf8', stdio: 'pipe' });
    if (!listOutput.includes('No credentials found')) {
      loggedIn = true;
    }
  } catch (err) {
    if (err.stdout && err.stdout.includes('No credentials found')) {
      loggedIn = false;
    } else if (err.stderr && err.stderr.includes('No credentials found')) {
      loggedIn = false;
    } else {
      console.log('clasp is not logged in yet.');
    }
  }

  if (!loggedIn) {
    console.log('⚠️  You are not logged in to clasp.');
    console.log('Please login using the link that will open in your browser.');
    console.log('Run this command to login:');
    console.log('👉 \x1b[36mnode /data/data/com.termux/files/usr/bin/clasp login\x1b[0m\n');
    
    const ans = await askQuestion('Have you logged in successfully? (y/n): ');
    if (ans.toLowerCase() !== 'y') {
      console.log('Deployment cancelled. Please login first and re-run this script.');
      process.exit(1);
    }
  }

  // 2. Ask if user wants to create a new script or use an existing one
  console.log('\nHow would you like to deploy?');
  console.log('1. Bind to a new/existing Google Sheet (Recommended - uses getActiveSpreadsheet)');
  console.log('2. Connect to an existing Google Apps Script Project ID');
  const deployType = await askQuestion('Select option (1-2): ');

  if (deployType === '1') {
    console.log('\n--- Deploy to a Google Sheet ---');
    console.log('Please open/create your Google Sheet in your browser and get its ID from the URL.');
    console.log('Example URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit');
    const sheetId = await askQuestion('Paste your Google Spreadsheet ID: ');

    if (!sheetId.trim()) {
      console.error('❌ Error: Spreadsheet ID cannot be empty.');
      process.exit(1);
    }

    console.log('Creating sheet-bound Apps Script project via clasp...');
    try {
      // Create .clasp.json config
      const claspConfig = {
        scriptId: '',
        parentId: [sheetId.trim()],
        rootDir: pmsDir
      };
      fs.writeFileSync(path.join(pmsDir, '.clasp.json'), JSON.stringify(claspConfig, null, 2));
      
      console.log('Running clasp create...');
      // Clasp create creates a script bound to the spreadsheet
      const createOut = execSync(`${claspPath} create --title "RoomScope PMS" --type sheets --parentId ${sheetId.trim()}`, { cwd: pmsDir, encoding: 'utf8' });
      console.log(createOut);
    } catch (e) {
      console.error('❌ Error creating project:', e.message);
      process.exit(1);
    }
  } else if (deployType === '2') {
    const scriptId = await askQuestion('Paste your Google Apps Script Script ID: ');
    if (!scriptId.trim()) {
      console.error('❌ Error: Script ID cannot be empty.');
      process.exit(1);
    }

    // Write .clasp.json
    const claspConfig = {
      scriptId: scriptId.trim(),
      rootDir: pmsDir
    };
    fs.writeFileSync(path.join(pmsDir, '.clasp.json'), JSON.stringify(claspConfig, null, 2));
    console.log('✅ Connected to Script ID in .clasp.json');
  } else {
    console.log('Invalid option selected.');
    process.exit(1);
  }

  // 3. Clasp Push
  console.log('\nPushing local code to Google Apps Script...');
  try {
    // Before push, create a clean file list and configure clasp settings if needed
    // clasp ignores test scripts by default if configured in .claspignore
    const claspignoreContent = `
**/**
!backend/*.js
!frontend/*.html
!appsscript.json
`;
    fs.writeFileSync(path.join(pmsDir, '.claspignore'), claspignoreContent.trim());
    
    console.log('Running clasp push...');
    const pushOut = execSync(`${claspPath} push`, { cwd: pmsDir, encoding: 'utf8' });
    console.log(pushOut);
    
    console.log('\n🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!');
    console.log('Open Google Apps Script to verify and deploy as a web app:');
    console.log('👉 \x1b[36mnode /data/data/com.termux/files/usr/bin/clasp open\x1b[0m\n');
  } catch (e) {
    console.error('❌ Push failed:', e.message);
    process.exit(1);
  }
}

run();
