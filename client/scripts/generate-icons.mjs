// Renders every brand image the app uses from the OFFICIAL school logo (client/brand/official-logo.png)
// with headless Chrome/Edge, so no image package is needed. Run manually when the logo changes:
//   node scripts/generate-icons.mjs            (or set CHROME_PATH to the browser executable)
//
// The logo artwork is never redrawn, recoloured, cropped or stretched: each output places the
// original image with `object-fit: contain` (aspect ratio kept) on a transparent or white square.
// client/brand/official-logo.png itself is not shipped (it is 5232x4702); only these outputs are.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = join(clientDir, 'brand', 'official-logo.png');

// logoWidth = share of the canvas width the logo may use (it is wider than tall, so width limits it).
const OUTPUTS = [
  // In-app logo (header, sidebar, landing, login): transparent, logo fills the canvas.
  { file: 'src/assets/school-logo.png', width: 640, height: 575, background: 'transparent', logoWidth: 1 },
  { file: 'public/favicon.png', width: 64, height: 64, background: 'transparent', logoWidth: 1 },
  { file: 'public/icons/icon-192.png', width: 192, height: 192, background: '#ffffff', logoWidth: 0.86 },
  { file: 'public/icons/icon-512.png', width: 512, height: 512, background: '#ffffff', logoWidth: 0.86 },
  // Maskable: the whole logo stays inside the central safe circle (80% of the size).
  { file: 'public/icons/icon-maskable-512.png', width: 512, height: 512, background: '#ffffff', logoWidth: 0.58 },
  // iOS rounds the corners itself and shows transparency as black, so a white square.
  { file: 'public/icons/apple-touch-icon.png', width: 180, height: 180, background: '#ffffff', logoWidth: 0.84 },
];

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = BROWSERS.find((path) => existsSync(path));
if (!browser) {
  console.error('Chrome/Edge not found. Set CHROME_PATH to the browser executable.');
  process.exit(1);
}
if (!existsSync(LOGO)) {
  console.error('Missing client/brand/official-logo.png');
  process.exit(1);
}

const logoUrl = `data:image/png;base64,${readFileSync(LOGO).toString('base64')}`;
const work = mkdtempSync(join(tmpdir(), 'led-icons-'));
try {
  for (const { file, width, height, background, logoWidth } of OUTPUTS) {
    const page = join(work, 'page.html');
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:${background}">
<div style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center">
<img src="${logoUrl}" alt="" style="width:${logoWidth * 100}%;height:100%;object-fit:contain;display:block">
</div></body></html>`);
    execFileSync(browser, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      '--force-device-scale-factor=1',
      `--user-data-dir=${join(work, 'profile')}`,
      `--window-size=${width},${height}`,
      `--screenshot=${join(clientDir, file)}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore' });
    console.log(`${file} (${width}x${height})`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
