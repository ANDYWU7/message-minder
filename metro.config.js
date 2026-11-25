const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const enhanceMiddleware = config.server.enhanceMiddleware;

// Give Expo's local web preview the same API URL as the deployed site.
// The separate helper process holds the credentials.
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const next = enhanceMiddleware?.(middleware, metroServer) ?? middleware;
  return (request, response, done) => {
    if (request.url !== '/api/analyze') return next(request, response, done);

    const proxy = http.request('http://127.0.0.1:8765/api/analyze', {
      method: request.method,
      headers: request.headers,
    }, (result) => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    response.on('close', () => proxy.destroy());
    proxy.on('error', () => {
      if (response.headersSent) return response.destroy();
      response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Start the local AI helper and try again.' }));
    });
    request.pipe(proxy);
  };
};

module.exports = config;
