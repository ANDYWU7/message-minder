const { askOpenAI } = require('../server/ask-openai.cjs');
const { getKey } = require('../server/minddo-key.cjs');

const maxRequestBytes = 32000;
const webUnavailable = 'I couldn’t check this message. Try again in a moment.';

function send(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

module.exports = async function analyze(request, response, unavailable = webUnavailable) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return send(response, 405, { error: 'Send a message to check it.' });
  }

  const { origin, host } = request.headers;
  if (origin && origin !== 'https://' + host && origin !== 'http://' + host) {
    return send(response, 403, { error: 'Open MessageMinder to check a message.' });
  }

  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return send(response, 415, { error: 'The message could not be read. Try again.' });
  }

  const tooLarge = { error: 'Please shorten the message and try again.' };
  if (Number(request.headers['content-length']) > maxRequestBytes) {
    return send(response, 413, tooLarge);
  }

  let body;
  try {
    // Vercel parses JSON on demand. The local helper receives a Node request stream.
    if ('body' in request) {
      body = request.body;
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxRequestBytes) {
          request.resume();
          return send(response, 413, tooLarge);
        }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch {
    return send(response, 400, { error: 'The message could not be read. Try again.' });
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return send(response, 400, { error: 'Enter a message to check.' });
  if (message.length > 8000) return send(response, 413, tooLarge);

  try {
    await getKey();
  } catch (error) {
    return send(response, 503, { error: error.message });
  }

  try {
    return send(response, 200, await askOpenAI(message));
  } catch {
    return send(response, 502, { error: unavailable });
  }
};
