// The first thing on screen: the start screen (the logo, the loading bar and tips) shows as
// soon as this tiny module and the screen helpers have loaded, while the browser still fetches three.js and the rest
// of the game. play.js hands it the rest of the start up work with begin(tasks) and waits for `started`.
import { showLoading } from "./screens/loading.mjs";

let hand;
const handed = new Promise((r) => (hand = r));
// tasks: [{ label, weight = 1, run: () => Promise }]; they run together and the label shows the next unfinished one.
export const begin = (tasks) => hand(tasks);

export const started = showLoading(async (report) => {
  report(0, "Loading the island");
  const tasks = await handed, left = new Set(tasks);
  const total = 1 + tasks.reduce((a, t) => a + (t.weight ?? 1), 0);   // the game files themselves count as one share
  let done = 1;
  const next = () => [...left].find((t) => t.label)?.label;
  report(done / total, next());
  await Promise.all(tasks.map(async (t) => { await t.run(); left.delete(t); done += t.weight ?? 1; report(done / total, next()); }));
}, { label: "Loading the island" });

// The rest of the game starts once the loading screen has been drawn: starting it takes over half a second on phones,
// and the screen (and Android's app opening screen before it) waited for that. Browsers that cannot tell when the first
// picture was drawn wait one frame; a page opened in the background starts after a second and a half.
let go = () => { go = () => {}; import("./play.js"); };
if (PerformanceObserver.supportedEntryTypes?.includes("paint")) new PerformanceObserver((l) => l.getEntriesByName("first-contentful-paint").length && go()).observe({ type: "paint", buffered: true });
else requestAnimationFrame(() => setTimeout(() => go()));
setTimeout(() => go(), 1500);
