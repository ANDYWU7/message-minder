const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const analyze = require('../api/analyze.js');

const port = 8765;
const unavailable = 'I couldn’t check this message. Check your Wi-Fi and make sure the AI helper is running, then try again.';
let checking = false;

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function handle(request, response) {
  // Optional desktop preview. Only this computer's Expo web origin is allowed.
  const localPreview = ['http://localhost:8081', 'http://127.0.0.1:8081'].includes(request.headers.origin);
  if (localPreview) response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
  if (request.method === 'OPTIONS' && localPreview && request.url === '/analyze') {
    response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/connect') {
    try {
      const page = readFileSync(join(__dirname, '../.expo/qr.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(page);
    } catch { return send(response, 404, {}); }
  }
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true });
  const nativeCheck = request.method === 'POST' && request.url === '/analyze';
  const webPreview = request.url === '/api/analyze' && request.socket.remoteAddress === '127.0.0.1';
  if (!nativeCheck && !webPreview) return send(response, 404, {});
  if (nativeCheck && request.headers.origin && !localPreview) {
    return send(response, 415, {});
  }
  if (checking) return send(response, 429, { error: 'The helper is checking another message. Try again in a moment.' });
  checking = true;
  try {
    await analyze(request, response, unavailable);
  } catch {
    if (!response.headersSent) send(response, 502, { error: unavailable });
  } finally {
    checking = false;
  }
}

http.createServer({ requestTimeout: 15000 }, handle).listen(port, '0.0.0.0', () => {
  console.log('MessageMinder helper is ready on port ' + port + '.');
});
