// Usage: node web/engine/cli.mjs < {"setup": {...}, "actions": [...]}
import { createGame, applyAction, playerView, gmView, GameError } from "./engine.mjs";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

function out(obj, code) {
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exitCode = code;
}

function run(raw) {
  let input;
  try { input = JSON.parse(raw); } catch { return out({ ok: false, error: { code: "E_INPUT", message: "stdin is not valid JSON" } }, 2); }
  if (!input || typeof input !== "object" || !("setup" in input) || !Array.isArray(input.actions)) {
    return out({ ok: false, error: { code: "E_INPUT", message: "expected {setup, actions[]}" } }, 2);
  }
  let state;
  try { state = createGame(input.setup); } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return out({ ok: false, error: { code: e.code, message: e.message } }, 2);
  }
  const results = [];
  for (const action of input.actions) {
    const r = applyAction(state, action);
    state = r.state;
    results.push(r.result);
  }
  const views = Object.fromEntries([["gm", gmView(state)], ...state.setup.players.map((p) => [p, playerView(state, p)])]);
  out({ ok: true, results, views }, 0);
}

let text;
try { text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
catch { text = null; }
if (text === null) out({ ok: false, error: { code: "E_INPUT", message: "stdin is not valid UTF-8" } }, 2);
else run(text);
