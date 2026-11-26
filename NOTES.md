After each save point, push it to GitHub.

The AI key comes from getKey() in server/minddo-key.cjs.
The available model with "luna" in its name is gpt-5.6-luna (verified through OpenAI's models endpoint on November 21, 2026).

## How to run

- Expo Go SDK: **58**, confirmed by the student. Created using create-expo-app@latest with blank@sdk-58. Only change SDK when the phone's Expo Go changes.
- Before opening on the phone, sign in to the same Expo account in Expo Go and on this computer. Run node node_modules/expo/bin/cli login --browser for computer sign-in; no password should be shared in chat. Check with node node_modules/expo/bin/cli whoami, then scan again. Expo reads sign-in updates without restarting the server.
- Node.js LTS 24.22.3 and npm were installed for this Windows account without an admin password. Restart Codex if npm is not found. Tools: %LOCALAPPDATA%/Programs/MessageMinderTools/node-v24.22.3-win-x64.
- Easiest: double-click **Start MessageMinder.cmd**. Both services start in the background and the QR page opens. Keep this computer awake and the phone on the same Wi-Fi.
- Alternatively, use two terminals in this folder: npm run helper and npm start. On a fresh checkout, first run npm install and put MindDo settings in the ignored .env file.
- QR page: http://127.0.0.1:8765/connect. QR regenerates when Expo starts. Current phone URL: exp://192.168.86.31:8081 (November 21, 2026; address can change).
- Helper: port 8765. Expo: port 8081, LAN, live reload enabled. Background logs are in ignored .expo/. The one-click launcher keeps services running after its terminal closes; restarting the computer stops them.
- The native app finds the helper through Expo's LAN address. If needed, set EXPO_PUBLIC_HELPER_URL to the helper's LAN URL before launching Expo. This public setting must never contain a key. Expo's start script does not load .env.
- An Expo tunnel alone will not expose the helper. Use the same Wi-Fi for this version; if that cannot work, ask Codex to set up a protected HTTPS helper first. Do not forward ports or expose this helper publicly.
- If Windows asks about firewall access, allow the home/private network only.

## Web and Vercel

- On this computer, start the helper with `npm run helper`, then run `npx expo start --web` in a second terminal from this folder. Set `EXPO_NO_DOTENV=1` in the Expo terminal to keep the helper's local .env out of Expo's environment. Open the address Expo prints. The local browser uses the same AI endpoint as Vercel through Expo's local proxy.
- To publish, import the MessageMinder GitHub repository in Vercel and use its root folder. The repo sets Node.js 24, the build command, the dist output folder, the page fallback, and the AI function. Leave the build settings at their defaults.
- In the Vercel project, add `KEYGEN_URL` and `KEYGEN_TOKEN` under Settings → Environment Variables for Production. Add them to Preview as well if you want AI checks on preview deployments. Enter the values directly in Vercel. Use the exact names above and keep the token marked sensitive. Deploy or redeploy after saving them.
- The deployed browser calls `/api/analyze` on the same site. The Vercel function reads the environment variables and uses getKey() on the server. Expo Go still connects to the local helper.
- The web app fits within a 400-pixel frame that shrinks to fit smaller screens. Reports saved in the web version stay in that browser.

## What's done

- The Check screen accepts a JPG or PNG screenshot up to about 2.7 MB. Review the image before sending it to OpenAI to analyze visible text and layout. Crop or cover private details first. The app saves only the explanation in screenshot reports.

- BRIEF.md preserves the student's brief and guides scope and AI instructions.
- MVP 1–2: paste a message or link, review a preview with common secrets removed, explicitly tap Check with AI. Real AI starts with intent, explains warning signs, and offers safe next steps. Thinking… disables repeat submissions.
- The result starts with a quick overview in everyday words and keeps the next steps visible. Use **Show detailed warning signs** to read each clue and why it matters. Saved reports from before the overview was added can still be opened and expanded.
- MVP 3: **Get help** starts with a calm reminder, then shows direct, numbered steps for sent money, shared passwords or codes, and clicked links. It includes an FTC source link.
- Recovery check: all three choices showed numbered steps in the browser. The **I already clicked, shared, or paid** button on an AI result also opened **Get help**.
- MVP 4: save up to 30 local reports, including the full AI response. Tap a timestamp to open it. New rows use the time the check was sent and older rows use the time they were saved. Text reports can be checked again. The Reports screen links to official U.S. FTC and FBI forms for users to fill out themselves.
- Reports check: a fictional message and link stayed saved after a browser reload. The saved link excluded its private query value, and reopening it allowed another AI check.
- MVP 5: simple scam signs and FTC source link.
- MVP 6: every AI instruction from BRIEF.md accompanies each request, plus rules against harmful requests and false safety guarantees. Real checks passed for a bank scam, ordinary message, and malicious instruction. Future answers are not guaranteed correct.
- Validation: Expo Doctor 20/20; Android, iOS and web bundles built; privacy checks passed; invalid/oversized inputs and foreign browser origins rejected; desktop check → result → save → reload → report review verified. Physical phone use still needs the student's scan check.

## Privacy and boundaries

- Only server files use getKey(). The small AI caller is server/ask-openai.cjs. Key and token stay in the server process, whether local or on Vercel. .env and .env* are ignored.
- withOpenAIKey forgets keys rejected with 401/invalid_api_key. The next submission obtains a new key; no failed AI request is automatically retried.
- Show getKey() error.message to the user; error.fix is logged only on the server with known credentials removed. Other failures show a friendly Wi-Fi/helper message.
- Links with or without https:// are analyzed using the website name and any surrounding message. The preview removes link paths, query values and fragments. The AI does not visit the site or verify its safety.
- Redaction cannot catch every private detail. Review and remove names, addresses, passwords, codes and account details before sending or saving.
- Submitted previews go through the computer to OpenAI. The helper does not log or save messages. store:false is requested, but does not promise no provider retention. Reports store reviewed previews and explanations locally, not encrypted; do not save sensitive details.
- Use the LAN helper on trusted Wi-Fi. The deployed AI route is public and can use your account's AI allowance. Vercel Firewall rate limiting or deployment protection can limit use for a shared demo.
- expiresAt is expected to be an ISO date string; confirm with MindDo if its format changes.
- npm audit reports three moderate findings in Expo fingerprint/minimatch tooling. Its proposed automatic fix downgrades to SDK 52, so it was not applied. Recheck for a compatible fix before wider distribution.

## What's next

Scan the QR with Expo Go SDK 58 and check the phone experience. Record a short demo with fictional messages. Have a teacher review safety and competition evidence before submission. Dates and research claims in BRIEF.md are student-supplied and were not reverified during this build.

## Maybe Later

- The user can access a list of recent scams to stay informed.
- The user can receive notifications about new scam types.
- The user can filter messages by categories like email, social media, or texts.
- The user can view a glossary of terms related to internet safety.
- The user can practice identifying scams through interactive quizzes.
- The user can share information about scams with friends or family easily.
- The user can enable a safety feature to warn before sharing personal details.
- The user can set reminders for regular safety checks on their devices.
- The user can receive encouragement messages after reporting a scam.
- The user can access a help section for additional support or resources.
