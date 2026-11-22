// Small helpers shared by the Worker and the Durable Objects: origins, CORS, JSON, hashing, ids, time.

export const SERVER_VERSION = "puddleton-server/1.0.0";
export const APPEAL = "sidsvictus@gmail.com";
export const CODE_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
export const GID_RE = /^g_[a-z2-7]{20}$/;
export const BANDS = ["child", "teen", "adult"];

// Browsers that may talk to the game API. Admin endpoints also accept the admin page.
const GAME_ORIGINS = ["https://beta.puddleton.surge.sh", "https://puddleton.surge.sh", "https://puddleton.online", "https://www.puddleton.online"];
const ADMIN_ORIGINS = ["https://admin.puddleton.surge.sh"];
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function originAllowed(origin, env, admin = false) {
  if (!origin) return false;
  if (LOCAL_RE.test(origin)) return true;
  const extra = String(env.EXTRA_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return GAME_ORIGINS.includes(origin) || extra.includes(origin) || (admin && ADMIN_ORIGINS.includes(origin));
}

export function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(body, status = 200, origin = null, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(origin ? cors(origin) : {}), ...extra },
  });
}

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))); }
export async function hmac(key, text) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text)));
}
// Constant time comparison for equal length hex strings.
export function sameHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function randomHex(bytes = 16) { return hex(crypto.getRandomValues(new Uint8Array(bytes))); }
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
export function randomB32(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map((b) => B32[b & 31]).join(""); }
export function makeCode() { return [...crypto.getRandomValues(new Uint32Array(6))].map((x) => CODE_ALPHA[x % CODE_ALPHA.length]).join(""); }

export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export function nextUtcMidnight(ms) { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }

// The device hash for bans: the raw device token is never stored. HASH_SALT is a secret; until it is set a fixed
// fallback keeps things working (set the secret before real players arrive: changing it later stops old bans matching).
const salt = (env) => env.HASH_SALT || "puddleton-unsalted";
export const deviceHash = (env, dev) => (typeof dev === "string" && dev.length >= 8 && dev.length <= 128 ? hmac(salt(env), "dev:" + dev).then((h) => h.slice(0, 32)) : Promise.resolve(""));

export const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
