'use strict';

// Server use only. Never import this module into a page or mobile app.
if (typeof window !== 'undefined' || typeof process === 'undefined' || !process.versions?.node) {
  throw new Error('The AI key helper can only run on the server.');
}

let cached;
let pending;
const secrets = new Set();

function safeText(value, fallback) {
  let text = typeof value === 'string' && value.trim() ? value : fallback;
  for (const secret of secrets) text = text.split(secret).join('[redacted]');
  return text.replace(/\b(?:sk-|lkt_)[A-Za-z0-9_-]+/g, '[redacted]');
}

function fail(message, fix) {
  // Only the message is returned to the caller. The fix stays in server logs.
  console.error(safeText(fix, 'Check the server configuration and try again manually.'));
  return new Error(safeText(message, 'The AI service could not connect. Please try again later.'));
}

async function lookup() {
  const token = process.env.KEYGEN_TOKEN;
  if (token) secrets.add(token);
  if (!process.env.KEYGEN_URL || !token) {
    throw fail('The AI service is not set up yet.', 'Set KEYGEN_URL and KEYGEN_TOKEN in the server environment.');
  }

  let response;
  let body;
  try {
    const url = new URL('/api/lookup-key', process.env.KEYGEN_URL);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid service URL');
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    body = await response.json();
  } catch {
    throw fail('The AI key service could not be reached.', 'Check KEYGEN_URL, the internet connection, and the MindDo service.');
  }

  if (typeof body?.apiKey === 'string' && body.apiKey) secrets.add(body.apiKey);
  if (!response.ok || body?.error) {
    throw fail(body?.error?.message, body?.error?.fix);
  }

  const expiresAt = typeof body?.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
  if (typeof body?.apiKey !== 'string' || !body.apiKey || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw fail('The AI key service returned an unusable key.', 'MindDo must return a nonempty apiKey and a future expiresAt as an ISO date string.');
  }
  cached = { apiKey: body.apiKey, expiresAt };
  return cached.apiKey;
}

async function getKey() {
  if (cached && cached.expiresAt > Date.now()) return cached.apiKey;
  // Concurrent requests share one lookup. Failures are never retried automatically.
  if (!pending) pending = lookup().finally(() => { pending = undefined; });
  return pending;
}

function invalidateKey() {
  cached = undefined;
}

// Run OpenAI calls through this function so rejected keys are forgotten.
// The next user request gets a new key; the failed request is not retried.
async function withOpenAIKey(request) {
  const key = await getKey();
  try {
    const result = await request(key);
    if (result?.status === 401 || result?.error?.code === 'invalid_api_key') {
      invalidateKey();
      throw fail('The AI service could not sign in. Please try again.', 'OpenAI rejected the key. The next request will ask MindDo for a new one.');
    }
    return result;
  } catch (error) {
    if (error?.status === 401 || error?.code === 'invalid_api_key' || error?.error?.code === 'invalid_api_key') {
      invalidateKey();
    }
    // Never pass SDK errors through: they can contain headers or credentials.
    throw fail('The AI request failed. Please try again later.', 'Check the OpenAI service and server configuration. No automatic retry was made.');
  }
}

module.exports = { getKey, invalidateKey, withOpenAIKey };
