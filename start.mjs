// The first thing on screen: the After Dark sting starts as soon as this tiny module and the screen helpers have
// loaded, while the browser is still fetching three.js and the rest of the game. play.js waits for it.
import { play } from "./screens/boot.mjs";

export const sting = play().catch(() => ({ skipped: true }));
