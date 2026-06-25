/**
 * RoomScope Hotel PMS - Direct Push to Google Apps Script
 * Uses the Apps Script REST API to push code directly
 * Run AFTER running termux_login.js and getting credentials
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME || '/data/data/com.termux/files/home';
const clasprcPath = path.join(HOME, '.clasprc.json');
const rootDir = __dirname;

function apiRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

function refreshToken(credentials) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: credentials.oauth2ClientSettings.clientId,
      client_secret: credentials.oauth2ClientSettings.clientSecret,
      refresh_token: credentials.token.refresh_token,
      grant_type: 'refresh_token'
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function readBackendCode() {
  const backendDir = path.join(rootDir, 'backend');
  const files = fs.readdirSync(backendDir).filter(f => f.endsWith('.js'));
  let code = '';
  files.forEach(f => {
    code += `// === ${f} ===\n`;
    code += fs.readFileSync(path.join(backendDir, f), 'utf8');
    code += '\n\n';
  });
  return code;
}

function buildIndexHtml() {
  let index = fs.readFileSync(path.join(rootDir, 'frontend', 'index.html'), 'utf8');
  const style = fs.readFileSync(path.join(rootDir, 'frontend', 'Style.html'), 'utf8');
  const js = fs.readFileSync(path.join(rootDir, 'frontend', 'JavaScript.html'), 'utf8');
  return index.replace("<?!= include('Style') ?>", style).replace("<?!= include('JavaScript') ?>", js);
}

async function main() {
  console.log('\n=== RoomScope Direct Push to Google Apps Script ===\n');

  // 1. Load credentials
  if (!fs.existsSync(clasprcPath)) {
    console.error('❌ No credentials found at', clasprcPath);
    console.error('Please run first: node termux_login.js');
    process.exit(1);
  }

  let creds = JSON.parse(fs.readFileSync(clasprcPath, 'utf8'));

  // 2. Refresh token if expired
  if (Date.now() >= (creds.token.expiry_date - 60000)) {
    console.log('Refreshing access token...');
    const refreshed = await refreshToken(creds);
    if (refreshed.error) {
      console.error('❌ Token refresh failed:', refreshed.error);
      process.exit(1);
    }
    creds.token.access_token = refreshed.access_token;
    creds.token.expiry_date = Date.now() + (refreshed.expires_in * 1000);
    fs.writeFileSync(clasprcPath, JSON.stringify(creds, null, 2));
    console.log('✅ Token refreshed');
  }

  const token = creds.token.access_token;

  // 3. Check if .clasp.json exists (has script ID)
  const claspJsonPath = path.join(rootDir, '.clasp.json');
  let scriptId = null;

  if (fs.existsSync(claspJsonPath)) {
    const claspJson = JSON.parse(fs.readFileSync(claspJsonPath, 'utf8'));
    scriptId = claspJson.scriptId;
    console.log('✅ Found existing Script ID:', scriptId);
  }

  // 4. If no script ID, create new project
  if (!scriptId) {
    console.log('Creating new Google Apps Script project...');
    const createRes = await apiRequest({
      hostname: 'script.googleapis.com',
      path: '/v1/projects',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, { title: 'RoomScope PMS' });

    if (createRes.status !== 200) {
      console.error('❌ Failed to create project:', JSON.stringify(createRes.body, null, 2));
      process.exit(1);
    }

    scriptId = createRes.body.scriptId;
    console.log('✅ Created new project, Script ID:', scriptId);

    // Save scriptId to .clasp.json
    fs.writeFileSync(claspJsonPath, JSON.stringify({ scriptId, rootDir: '.' }, null, 2));
    console.log('✅ Saved Script ID to .clasp.json');
  }

  // 5. Build file contents
  console.log('\nBuilding files to push...');
  const backendCode = readBackendCode();
  const indexHtml = buildIndexHtml();
  const appsscript = JSON.parse(fs.readFileSync(path.join(rootDir, 'appsscript.json'), 'utf8'));

  const files = [
    {
      name: 'appsscript',
      type: 'JSON',
      source: JSON.stringify(appsscript, null, 2)
    },
    {
      name: 'Code',
      type: 'SERVER_JS',
      source: backendCode
    },
    {
      name: 'index',
      type: 'HTML',
      source: indexHtml
    }
  ];

  // 6. Push to Apps Script API
  console.log(`Pushing ${files.length} files to Script ID: ${scriptId}...`);
  const pushRes = await apiRequest({
    hostname: 'script.googleapis.com',
    path: `/v1/projects/${scriptId}/content`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }, { files });

  if (pushRes.status === 200) {
    console.log('\n🎉 PUSH SUCCESSFUL! All files are now in Google Apps Script!');
    console.log('\nScript URL:');
    console.log(`👉 https://script.google.com/home/projects/${scriptId}/edit`);
    console.log('\nNext steps in Google Apps Script editor:');
    console.log('1. เลือกฟังก์ชัน ตั้งค่าระบบครั้งแรก แล้วกด Run');
    console.log('2. ไปที่ Deploy → New deployment → Web app');
    console.log('3. ตั้ง "Execute as: Me" และ "Who has access: Anyone"');
    console.log('4. กด Deploy และคัดลอก URL มาใช้งาน');
  } else {
    console.error('❌ Push failed (HTTP', pushRes.status + '):');
    console.error(JSON.stringify(pushRes.body, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
