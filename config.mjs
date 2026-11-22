// Client and server configuration shared by the browser and fable/server.

// A page served from this computer (localhost or 127.0.0.1) talks to the local dev server; every other host talks
// to the deployed server. The server itself has no `location`, so it never counts as local (it does not use these).
const LOCAL_PAGE = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// Where the game server answers HTTP and WebSocket calls.
// Local development: `npx wrangler dev` in fable/server listens on http://localhost:8787.
// Deployed: the workers.dev URL (later the owner's own domain).
// The WebSocket address is the same host with ws:// or wss://, see fable/server/PROTOCOL.md.
// When a URL here changes, also change connect-src in the Content-Security-Policy at the top of play.html.
export const LOCAL_API = "http://localhost:8787";
export const LIVE_API = "https://puddleton-server.sidsvictus.workers.dev";
export const API_BASE = LOCAL_PAGE ? LOCAL_API : LIVE_API;

// The client protocol version. The server refuses a hello with any other number and answers with a
// "version" message, so the client can show "New version available". Bump on every breaking change.
export const PROTOCOL = 1;

// Cloudflare Turnstile site key for the widget (public). The real widget only works on its hostnames
// (puddleton.surge.sh, beta.puddleton.surge.sh), so a page served from localhost gets Cloudflare's documented
// always-pass test key instead; the local server uses the matching test secret (server/.dev.vars.example).
export const TURNSTILE_SITE_KEY = LOCAL_PAGE ? "1x00000000000000000000AA" : "0x4AAAAAAGM0kBs1GCJXCu2U";
