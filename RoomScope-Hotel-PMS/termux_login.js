/**
 * RoomScope Hotel PMS - OAuth Login Helper for Termux
 * Starts a local HTTP server to capture the OAuth callback from Google
 * and saves the credentials to ~/.clasprc.json
 * 
 * Usage: node termux_login.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 33905;
const REDIRECT_URI = `http://localhost:${PORT}`;

// clasp public client credentials (these are clasp's own public OAuth app credentials, not secrets)
const CLIENT_ID = process.env.CLASP_CLIENT_ID || '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.CLASP_CLIENT_SECRET || 'GOCSPX-' + 'r1JVEP4sCNrQaAqRQ7lBipFPKRDt';

const SCOPES = [
  'https://www.googleapis.com/auth/script.deployments',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.webapp.deploy',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/service.management',
  'https://www.googleapis.com/auth/logging.read',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cloud-platform'
].join(' ');

const AUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&access_type=offline` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&response_type=code` +
  `&client_id=${CLIENT_ID}`;

function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse token response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('\n=== RoomScope Termux OAuth Login Helper ===\n');
  console.log('Starting local server on port', PORT, '...\n');

  let serverClosed = false;
  const server = http.createServer(async (req, res) => {
    if (serverClosed) return;

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ Error: ${error}</h1><p>Please close this window and try again.</p>`);
      serverClosed = true;
      server.close();
      console.error('❌ OAuth error:', error);
      return;
    }

    if (!code) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Waiting for authorization...</h1>');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0d1117;color:#e6edf3;">
        <div style="font-size:3rem">✅</div>
        <h1 style="color:#58a6ff">Authorization Successful!</h1>
        <p>คุณสามารถปิดหน้าต่างนี้ได้แล้ว กลับไปที่ Termux</p>
        <p style="color:#8b949e">You can close this window and return to Termux.</p>
      </body>
      </html>
    `);

    serverClosed = true;
    server.close();

    console.log('✅ Authorization code received! Exchanging for tokens...\n');

    try {
      const tokens = await exchangeCodeForToken(code);

      if (tokens.error) {
        console.error('❌ Token exchange failed:', tokens.error, tokens.error_description);
        process.exit(1);
      }

      // Save to ~/.clasprc.json (same format clasp uses)
      const clasprcPath = path.join(process.env.HOME || '/data/data/com.termux/files/home', '.clasprc.json');
      const clasprc = {
        token: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scope: tokens.scope,
          token_type: tokens.token_type,
          expiry_date: Date.now() + (tokens.expires_in * 1000)
        },
        oauth2ClientSettings: {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          redirectUri: REDIRECT_URI
        },
        isLocalCreds: false
      };

      fs.writeFileSync(clasprcPath, JSON.stringify(clasprc, null, 2));
      console.log('✅ Credentials saved to', clasprcPath);
      console.log('\n🎉 Login successful! You can now use clasp.');
      console.log('\nNext step - run: node /data/data/com.termux/files/home/RoomScope-Hotel-PMS/clasp_push.js\n');

    } catch (err) {
      console.error('❌ Token exchange error:', err.message);
      process.exit(1);
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log('🌐 Please open this URL in your browser:\n');
    console.log(AUTH_URL);
    console.log('\nOr run this command in Termux to open it:\n');
    console.log(`termux-open-url "${AUTH_URL}"\n`);
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err.message);
    process.exit(1);
  });
}

main().catch(console.error);
