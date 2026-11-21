// Start Expo with a fresh LAN QR code. No server credentials enter this process.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const QRCode = require('qrcode');

async function main() {
  const root = path.join(__dirname, '..');
  const address = Object.values(os.networkInterfaces()).flat()
    .find((item) => item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.'))?.address;
  if (!address) throw new Error('Connect this computer to Wi-Fi, then start again.');
  const link = `exp://${address}:8081`;
  const svg = await QRCode.toString(link, { type: 'svg', width: 320, margin: 4 });
  fs.mkdirSync(path.join(root, '.expo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.expo/expo-qr.svg'), svg);
  fs.writeFileSync(path.join(root, '.expo/qr.html'), `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Open MessageMinder</title><style>body{font-family:system-ui;background:#f2f6f4;color:#143a31;text-align:center;padding:24px}main{background:white;border-radius:24px;padding:24px;max-width:480px;margin:auto}svg{max-width:100%;height:auto}p{font-size:18px}a{color:#15604f}</style><main><h1>MessageMinder</h1><p>Open with Expo Go · SDK 58</p>${svg}<p><a href="${link}">${link}</a></p><p>Use the same Wi-Fi as this computer. Scan with your camera on iPhone or Expo Go on Android.</p><p>Keep this computer awake while using the app.</p></main></html>`);
  console.log(link);
  console.log('Phone QR page: http://127.0.0.1:8765/connect');
  const env = { ...process.env, EXPO_NO_DOTENV: '1', REACT_NATIVE_PACKAGER_HOSTNAME: address };
  delete env.CI;
  delete env.KEYGEN_TOKEN;
  delete env.KEYGEN_URL;
  const child = spawn(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'start', '--lan', '--port', '8081'], {
    cwd: root, env, stdio: 'inherit', windowsHide: true,
  });
  child.on('error', () => { console.error('Expo could not start. Run npm install and try again.'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
