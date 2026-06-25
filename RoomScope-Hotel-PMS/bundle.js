/**
 * RoomScope Hotel PMS - Local Bundler
 * Compiles 15 backend files and 3 frontend files into just TWO files:
 * 1. dist/Code.gs (All backend logic)
 * 2. dist/index.html (All frontend UI, styling, and JS bundled)
 * This allows easy copy-pasting without using clasp or manual copying of 18 files.
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

function bundle() {
  console.log('=== RoomScope Local Bundling Tool ===\n');

  // 1. Bundle Backend Files
  console.log('Bundling 15 backend files into dist/Code.gs...');
  const backendDir = path.join(rootDir, 'backend');
  const backendFiles = fs.readdirSync(backendDir).filter(f => f.endsWith('.js'));
  
  // We want to make sure Utils.js is loaded or we just append them. Order does not matter in GAS,
  // but let's append them with header comments for clarity.
  let bundledBackend = `// RoomScope Hotel PMS - Bundled Backend Code\n`;
  bundledBackend += `// Generated on: ${new Date().toISOString()}\n\n`;

  backendFiles.forEach(file => {
    const filePath = path.join(backendDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    bundledBackend += `// ==========================================\n`;
    bundledBackend += `// FILE: ${file}\n`;
    bundledBackend += `// ==========================================\n\n`;
    bundledBackend += content;
    bundledBackend += '\n\n';
  });

  fs.writeFileSync(path.join(distDir, 'Code.gs'), bundledBackend);
  console.log('✅ Created dist/Code.gs');

  // 2. Bundle Frontend Files
  console.log('\nBundling frontend files (index.html + Style.html + JavaScript.html) into dist/index.html...');
  const indexHtmlPath = path.join(rootDir, 'frontend', 'index.html');
  const styleHtmlPath = path.join(rootDir, 'frontend', 'Style.html');
  const jsHtmlPath = path.join(rootDir, 'frontend', 'JavaScript.html');

  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  let styleHtml = fs.readFileSync(styleHtmlPath, 'utf8');
  let jsHtml = fs.readFileSync(jsHtmlPath, 'utf8');

  // Remove <style> wrapper tag from Style.html if it's there so we can wrap it neatly, or just embed it
  // Since Style.html has <style>...</style>, we can replace <?!= include('Style') ?> directly with the content of Style.html
  // and <?!= include('JavaScript') ?> with the content of JavaScript.html (which has <script>...</script>).
  
  // Replace the include template tags
  let bundledFrontend = indexHtml
    .replace("<?!= include('Style') ?>", styleHtml)
    .replace("<?!= include('JavaScript') ?>", jsHtml);

  fs.writeFileSync(path.join(distDir, 'index.html'), bundledFrontend);
  console.log('✅ Created dist/index.html');

  console.log('\n🎉 BUNDLING COMPLETED SUCCESSFULLY!');
  console.log('Now you only need to copy and paste TWO files into your Google Apps Script project:');
  console.log(`1. [Code.gs](file://${path.join(distDir, 'Code.gs')}) ➡️ Paste into Code.gs (Script file)`);
  console.log(`2. [index.html](file://${path.join(distDir, 'index.html')}) ➡️ Paste into index.html (HTML file)`);
}

bundle();
