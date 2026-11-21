const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const logs = path.join(root, '.expo');

async function ready(port, route) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch { return false; }
}

async function start(port, route, args, name) {
  if (await ready(port, route)) return;
  const out = fs.openSync(path.join(logs, name + '.log'), 'a');
  const err = fs.openSync(path.join(logs, name + '-error.log'), 'a');
  const env = { ...process.env };
  delete env.CI;
  const child = spawn(process.execPath, args, { cwd: root, detached: true, windowsHide: true, env, stdio: ['ignore', out, err] });
  child.unref();
  fs.closeSync(out);
  fs.closeSync(err);
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await ready(port, route)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} could not start. Ask Codex to check the logs in .expo.`);
}

(async () => {
  fs.mkdirSync(logs, { recursive: true });
  await start(8765, '/health', ['--env-file=.env', 'server/index.cjs'], 'helper');
  await start(8081, '/status', ['scripts/start-expo.cjs'], 'expo');
  console.log('MessageMinder is running. Keep this computer awake and use the same Wi-Fi on your phone.');
  console.log('Phone QR page: http://127.0.0.1:8765/connect');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
