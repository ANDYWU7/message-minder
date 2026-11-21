const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { askOpenAI } = require('./ask-openai.cjs');
const { getKey } = require('./minddo-key.cjs');

const port = 8765;
const unavailable = 'I couldn’t check this message. Check your Wi-Fi and make sure the AI helper is running, then try again.';
let checking = false;
const maxPreviewLength = 8000;
const maxRequestBytes = 32000;

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
  if (request.method !== 'POST' || request.url !== '/analyze') return send(response, 404, {});
  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if ((request.headers.origin && !localPreview) || contentType !== 'application/json') {
    return send(response, 415, {});
  }
  if (checking) return send(response, 429, { error: 'The helper is checking another message. Try again in a moment.' });
  checking = true;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxRequestBytes) {
        send(response, 413, { error: 'Please shorten the message and try again.' });
        request.resume();
        return;
      }
      chunks.push(chunk);
    }
    let message;
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.message;
      if (typeof value === 'string') message = value.trim();
    } catch {
      return send(response, 400, { error: 'The message could not be read. Try again.' });
    }
    if (!message || message.length > maxPreviewLength) {
      return send(response, 400, { error: 'Enter a message or try a shorter one.' });
    }
    try {
      await getKey();
    } catch (error) {
      return send(response, 503, { error: error.message });
    }
    send(response, 200, await askOpenAI(message));
  } catch {
    if (!response.headersSent) send(response, 502, { error: unavailable });
  } finally {
    checking = false;
  }
}

http.createServer({ requestTimeout: 15000 }, handle).listen(port, '0.0.0.0', () => {
  console.log('MessageMinder helper is ready on port ' + port + '.');
});
