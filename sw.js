// Offline-first cache for the app shell: every file the game needs is on this site (no CDNs), so it is all
// precached at install. Calls to the game server and to Cloudflare Turnstile are other origins and never cached.
const CACHE = "puddleton-fable-v16";
const SCREENS = ["agegate", "base", "battery", "confirm", "credits", "loading", "overlays", "phrasewheel", "prefs", "profile", "report", "roomlist", "sanction", "settings", "tips"];
const SHELL = [
  "./", "index.html", "play.html", "play.js", "start.mjs", "quality.mjs", "net.mjs", "config.mjs", "phrases.mjs", "style.css", "world.mjs", "stage.mjs",
  "audio.mjs", "cosmetics.mjs", "engine/engine.mjs", "lock.svg", "manifest.webmanifest",
  "vendor/three.module.js", "vendor/gsap.min.js", "vendor/ScrollTrigger.min.js", "vendor/lenis.min.js",
  "fonts/fonts.css", "fonts/jersey-20-latin.woff2", "fonts/jersey-20-latin-ext.woff2", "fonts/dm-sans-latin.woff2", "fonts/dm-sans-latin-ext.woff2",
  "brand/favicon-32.png", "brand/favicon-48.png", "brand/apple-touch-icon.png", "brand/icon-192.png", "brand/icon-512.png", "brand/icon-maskable-512.png",
  "brand/logo-359.png", "brand/logo-359.webp", "brand/logo-718.png", "brand/logo-718.webp", "brand/logo-1436.webp",
  "screens/screens.css", ...SCREENS.map((s) => `screens/${s}.mjs`),
  ...["block", "bubble", "chevron", "copy", "ferry", "flag", "gear", "link", "mute", "nosignal", "people", "person", "refresh", "wrench"].flatMap((i) => [`screens/icons/${i}.svg`, `screens/icons/low/${i}.svg`]),
  ...["back", "book", "check", "clock", "close", "crown", "door", "hanger", "help", "hourglass", "moon", "plate-gold", "plate-rose", "plate-teal", "plate", "share", "skull", "slot-focus", "slot", "sun", "tile-gold", "tile"].flatMap((i) => [`ui/${i}.svg`, `ui/low/${i}.svg`]), "ui/low/lock.svg",
  ...["book", "clock", "crown", "lock", "skull"].map((i) => `ui/low/sm/${i}.svg`), ...["chevron", "refresh"].map((i) => `screens/icons/low/sm/${i}.svg`),
  ...["boutique", "dock", "finale", "market", "rooftops", "square", "study", "woods"].flatMap((s) => [`scenes/${s}.svg`, `scenes/low/${s}.svg`]),
  "legal/legal.css", "legal/privacy.html", "legal/terms.html", "legal/safety.html", "legal/credits.html",
];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;   // the API, Turnstile: straight to the network
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: url.pathname.endsWith("play.html") })));
});
