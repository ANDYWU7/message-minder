After each save point, push it to GitHub.

The AI key comes from getKey() in server/minddo-key.cjs.

- Put the MindDo token in the ignored .env file on this computer only.
- Use Node.js 20.6 or newer and load the environment when starting the server, for example: node --env-file=.env server/index.cjs (once that server entry point exists).
- Only server code may import this helper. Never include it in a browser or app bundle, return its key to a client, or log the key or token.
- Run OpenAI requests through withOpenAIKey(callback). It supplies the key only to the server callback and forgets keys rejected with HTTP 401 or invalid_api_key. The next request obtains a new key; failed requests are not retried automatically. Disable retries in any OpenAI SDK used by that callback.
- Catch helper errors in the server route and show only error.message to the user. MindDo error.fix is logged only on the server, with known credentials removed.
- expiresAt is expected to be an ISO date string. Confirm this format with MindDo if its response differs.
