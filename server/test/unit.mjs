// Unit tests for the chat filter, the rate limiters and phrase chat. No dependencies.
// Run: node test/unit.mjs   (exits 1 on any failure)
import { checkText, checkName, signalsOf, skeleton, dupKey, levelFor, safeVersion } from "../src/filter.mjs";
import { ChatLimiter, Bucket, Gap, CHAT_RULES } from "../src/ratelimit.mjs";
import { PHRASES, PHRASE_CATS, ROLE_NAMES, checkPhrase, renderPhrase } from "../../phrases.mjs";
import { capacity, AwakeClock } from "../src/usage.mjs";

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok    ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function check(cond, msg) { if (!cond) throw new Error(msg); }
const blocked = (text, reason, level = "strict") => { const r = checkText(text, { names: ["Ava", "Bo"], level }); check(!r.ok && (!reason || r.reason === reason), `expected "${text}" blocked at ${level}${reason ? " as " + reason : ""}, got ${JSON.stringify(r)}`); };
const allowed = (text, level = "strict") => { const r = checkText(text, { names: ["Ava", "Bo"], level }); check(r.ok, `expected "${text}" allowed at ${level}, got ${JSON.stringify(r)}`); };

// ---------- filter ----------
test("plain game talk passes", () => {
  for (const t of ["I think Bo is mafia", "Vote for Ava!!!", "I am the detective, trust me", "assassin class pass", "he is hit", "my number one suspect is Bo",
    "I trust Bo. Me too.", "look at bo. he is sus", "I play on xbox", "in line with that", "spicy cumin", "I vote 3 and 4", "dickens", "Good game everyone",
    "@Ava you are sus", "kill the mafia tonight", "night 2 was wild", "what a twist", "hello there"]) allowed(t);
});

test("profanity, including bypass attempts", () => {
  for (const t of ["fuck", "FUCK you", "f u c k", "f.u.c.k", "f-u-c-k", "f_u_c_k", "fu ck you", "fuuuuuck", "fvck", "phuck", "sh1t", "5h1t", "$hit", "a$$",
    "b!tch", "ѕһit", "f​u​c​k", "ｆｕｃｋ", "𝐟𝐮𝐜𝐤", "fück", "motherfucker", "s h i t",
    "kill yourself", "k y s", "c*nt is bad but cunt is worse", "go die", "b1tch3s"]) blocked(t, "profanity");
  blocked("you n1gger", "slur");
});

test("links and domain-like text", () => {
  for (const t of ["google.com", "go to www.example.org", "http://x.y", "https://puddleton.surge.sh", "g o o g l e . c o m", "google dot com", "google (dot) com",
    "google[dot]net", "discord.gg/abcd", "w w w . x . c o m", "g00gle.c0m", "bo.me", "site . xyz"]) blocked(t, "link");
});

test("emails", () => {
  for (const t of ["bob@gmail.com", "bob @ gmail . com", "bob at gmail dot com", "bob (at) hotmail", "me at icloud"]) blocked(t, "email");
});

test("phone numbers, long digit runs and spelled numbers", () => {
  for (const t of ["555-123-4567", "call 555 123 4567", "+1 (555) 123-4567", "12345", "5 5 5 1 2", "my code is 12 34 56 7", "١٢٣٤٥٦٧"]) blocked(t, "phone");
  for (const t of ["five five five one two", "eight one two three", "one two three"]) blocked(t, "numbers");
  allowed("I have 2 votes and 1 clue");
});

test("social handles and off-platform invites", () => {
  for (const t of ["@coolkid99", "follow @bean_queen"]) blocked(t, "handle");
  for (const t of ["add me on roblox", "my ig is beanqueen", "snap me", "sn@pchat", "1nsta", "whats your discord", "join my discord", "hmu", "dm me on tg", "add me on insta",
    "telegram", "whatsapp me", "dis cord", "kik me"]) blocked(t, "invite");
});

test("length and empty", () => {
  check(checkText("").reason === "empty" && checkText("   ").reason === "empty" && checkText(null).reason === "empty", "empty");
  check(checkText("x".repeat(201)).reason === "length" && checkText("x".repeat(200)).ok, "length 200");
});

test("names: one rule for every band; handles, numbers, family words and plain profanity pass", () => {
  for (const n of ["Muffin", "Bean123", "daddy", "mommy", "Daddy_Bean", "MommyBear", "@biscuit99", "biscuit99", "Player12345", "5551234567",
    "xXsnapchatXx", "Shit123", "bob@gmail.com", "Dickson", "Hancock", "Cumberbatch", "Analyst", "pen", "Sussex"]) check(checkName(n).ok, `name ${n} should pass: ${JSON.stringify(checkName(n))}`);
  for (const [n, r] of [["SexyBabe", "sexual"], ["FuckFace", "sexual"], ["fuuuuck", "sexual"], ["p0rnstar", "sexual"], ["D1ldo", "sexual"], ["big_tits", "sexual"],
    ["pen_is", "sexual"], ["f u c k", "sexual"], ["\uff46\uff55\uff43\uff4b", "sexual"], ["n1gger", "slur"], ["f_a_g", "slur"], ["k1ke", "slur"], ["pedo", "minor"],
    ["evil.com", "link"], ["www.freerobux.example", "link"]]) {
    const c = checkName(n);
    check(!c.ok && c.reason === r, `name ${n} should fail as ${r}: ${JSON.stringify(c)}`);
  }
});

test("grooming signals are found but do not block on their own", () => {
  const cases = { "how old are you": "age", "asl?": "age", "where do u live": "location", "what school do you go to": "school", "whats your number": "phone",
    "send me a pic": "photo", "what do you look like": "photo", "add me on snap": "offplatform", "lets talk on another app": "offplatform" };
  for (const [t, cat] of Object.entries(cases)) check(signalsOf(t).includes(cat), `"${t}" should signal ${cat}, got ${signalsOf(t)}`);
  check(checkText("how old are you").ok && checkText("what school do you go to").ok, "questions alone are not blocked");
  check(signalsOf("Bo is mafia").length === 0, "no signal in game talk");
});

test("normalisation pieces", () => {
  check(skeleton("Ｆёü") === "feu", `skeleton ${skeleton("Ｆёü")}`);
  check(dupKey("Hello!!!") === dupKey("helllo") && dupKey("hi") !== dupKey("bye"), "dupKey");
});

// ---------- per band levels ----------
test("levels follow the age band; adults may choose strict", () => {
  check(levelFor("child") === "strict" && levelFor("child", "strict") === "strict", "child");
  check(levelFor("teen") === "standard" && levelFor("teen", "strict") === "standard", "teen");
  check(levelFor("adult") === "minimal" && levelFor("adult", "strict") === "standard" && levelFor("adult", "nonsense") === "minimal", "adult");
});

test("strict (child band) is unchanged: spacing tricks, number words and app names still block", () => {
  for (const [t, r] of [["pen is mightier", "profanity"], ["oh snap", "invite"], ["five five five one two", "numbers"], ["fu ck you", "profanity"], ["12 elm street", "address"]]) blocked(t, r, "strict");
});

test("standard (teen band): the false positives pass, personal info and swearing still block", () => {
  for (const t of ["pen is mightier", "oh snap", "five five five one two", "one two three go", "I saw it on youtube", "as s", "the insta pic was cute"]) allowed(t, "standard");
  for (const [t, r] of [["fuck this", "profanity"], ["f u c k", "profanity"], ["sh1t", "profanity"], ["kill yourself", "profanity"], ["nig ger", "slur"],
    ["555 123 4567", "phone"], ["bob@gmail.com", "email"], ["12 elm street", "address"], ["google.com", "link"], ["@coolkid99", "handle"],
    ["add me on snap", "invite"], ["discord", "invite"], ["dis cord", "invite"], ["xXsnapchatXx", "invite"], ["my ig is beanqueen", "invite"]]) blocked(t, r, "standard");
  allowed("@Ava you are sus", "standard");
});

test("minimal (adult band): ordinary swearing, numbers and handles pass; slurs, minors and links block", () => {
  for (const t of ["fuck this game", "what the shit", "pen is mightier", "oh snap", "555 123 4567", "my email is bob@gmail.com", "@coolguy add me on snap",
    "five five five one two", "you absolute bastard", "fuck these kids are loud", "12 elm street"]) allowed(t, "minimal");
  for (const [t, r] of [["you n1gger", "slur"], ["f a g g o t", "slur"], ["nig ger", "slur"], ["k1ke", "slur"], ["pedo", "minor"], ["l0li pics", "minor"],
    ["sexy 12 year old", "minor"], ["send nudes kid", "minor"], ["any horny teens", "minor"], ["google.com", "link"], ["www.free-robux.example", "link"],
    ["g o o g l e . c o m", "link"]]) blocked(t, r, "minimal");
});

test("child names: no emails or 8+ digit runs; handles and short numbers stay fine; other bands unaffected", () => {
  const child = { child: true };
  for (const n of ["daddy", "@biscuit99", "Player12345", "Bean1234567", "Muffin_07"]) check(checkName(n, child).ok, `child name ${n} should pass: ${JSON.stringify(checkName(n, child))}`);
  for (const [n, r] of [["kid@gmail.com", "email"], ["kid at gmail", "email"], ["mum@home.co.uk", "email"], ["07700900123", "phone"], ["555-123-4567", "phone"],
    ["call 0770 090 0123", "phone"], ["Bean12345678", "phone"], ["SexyBabe", "sexual"], ["evil.com", "link"]]) {
    const c = checkName(n, child);
    check(!c.ok && c.reason === r, `child name ${n} should fail as ${r}: ${JSON.stringify(c)}`);
  }
  for (const n of ["kid@gmail.com", "07700900123", "Bean12345678"]) check(checkName(n).ok, `adult or teen name ${n} passes`);
});

test("safeVersion: what a teen or a strict adult reads of an adult's line", () => {
  const names = ["Ava", "Bo"];
  check(safeVersion("Bo is the mafia", { names }) === "Bo is the mafia", "clean lines are unchanged");
  check(safeVersion("this is fucking great", { names }) === "this is ******* great", safeVersion("this is fucking great", { names }));
  check(safeVersion("shit, @coolguy saw it", { names }) === "***** ******** saw it", safeVersion("shit, @coolguy saw it", { names }));
  check(safeVersion("call 555 123 4567", { names }) === null, "a phone number split over words is hidden");
  check(safeVersion("kill yourself", { names }) === null, "a bad phrase made of clean words is hidden");
});

// ---------- rate limits ----------
test("chat: at least 1 second between messages", () => {
  const l = new ChatLimiter();
  check(l.check("a", 0, "x").ok, "first");
  check(l.check("a", 500, "y").code === "E_RATE", "too soon");
  check(l.check("a", 1600, "z").ok, "after a second");
  check(l.check("b", 1700, "x").ok, "per player");
});

test("chat: 5 attempts in 6 seconds slows to 1 per 3 seconds for 60 seconds", () => {
  const l = new ChatLimiter();
  let r;
  for (let i = 0; i < 4; i++) { r = l.check("a", i * 1100, "m" + i); check(r.ok && !r.slowedNow, `msg ${i} ok`); }
  r = l.check("a", 4400, "m4");
  check(!r.ok && r.code === "E_SLOWED" && r.slowedNow && r.until === 4400 + CHAT_RULES.slowFor, `slowed now ${JSON.stringify(r)}`);
  check(l.check("a", 6000, "m5").code === "E_SLOWED", "2 s later still too soon");
  check(l.check("a", 7500, "m6").ok, "3 s after the last accepted message");
  check(l.check("a", 9500, "m7").code === "E_SLOWED", "slow gap applies");
  check(l.check("a", 10600, "m8").ok, "3 s gap ok");
  const after = 4400 + CHAT_RULES.slowFor + 10;
  check(l.check("a", after, "m9").ok && l.check("a", after + 1100, "m10").ok, "back to 1 s after the slowdown");
});

test("chat: duplicates are suppressed", () => {
  const l = new ChatLimiter();
  check(l.check("a", 0, "same").ok, "first");
  check(l.check("a", 2000, "same").code === "E_DUP", "dup");
  check(l.check("a", 4000, "other").ok, "other");
  check(l.check("a", 40000, "same").ok, "after the window");
});

test("chat: slowdown survives a restore", () => {
  const l = new ChatLimiter();
  l.restore("a", 50000);
  check(l.check("a", 1000, "x").ok && l.check("a", 2500, "y").code === "E_SLOWED", "restored slowdown");
});

test("bucket and gap", () => {
  const b = new Bucket(3, 1);
  check(b.take("a", 0) && b.take("a", 0) && b.take("a", 0) && !b.take("a", 0), "burst of 3");
  check(b.take("a", 1000) && !b.take("a", 1000), "refills one per second");
  const g = new Gap();
  check(g.ok("k", 0, 250) && !g.ok("k", 100, 250) && g.ok("k", 300, 250), "gap");
});

// ---------- phrases ----------
test("phrase catalog shape", () => {
  const ids = new Set();
  for (const p of PHRASES) {
    check(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
    check(PHRASE_CATS.includes(p.cat), `${p.id} category`);
    const holes = (p.text.match(/\{(player|role)\}/g) || []).map((h) => h.slice(1, -1));
    check(JSON.stringify(holes) === JSON.stringify(p.args), `${p.id} args match placeholders`);
    check(!/[\u2013\u2014]/.test(p.text), `${p.id} has a dash`);
    check(checkText(renderPhrase(p, p.args.map((a) => (a === "player" ? "Ava" : "detective"))), { names: ["Ava"] }).ok, `${p.id} passes the filter`);
  }
  for (const c of PHRASE_CATS) check(PHRASES.some((p) => p.cat === c), `category ${c} has phrases`);
});

test("phrase validation and rendering", () => {
  const ctx = { players: ["Ava", "Bo"] };
  const r = checkPhrase({ id: "accuse.1", args: ["Bo"] }, ctx);
  check(r.ok && r.text === "I think Bo is Mafia.", JSON.stringify(r));
  check(checkPhrase({ id: "claim.1", args: ["serialkiller"] }, ctx).text === "I am the Serial Killer.", "role names");
  check(checkPhrase({ id: "accuse.10", args: ["Ava", "Bo"] }, ctx).text === "Ava and Bo are working together.", "two players");
  check(checkPhrase({ id: "greet.1" }, ctx).ok, "no args may be omitted");
  for (const bad of [null, "accuse.1", { id: "nope" }, { id: "accuse.1" }, { id: "accuse.1", args: ["Zed"] }, { id: "accuse.1", args: ["Bo", "Ava"] },
    { id: "claim.1", args: ["king"] }, { id: "accuse.1", args: [5] }, { id: "__proto__" }, { id: "toString" }, { id: "accuse.6", args: ["Bo", "Bo"] }]) {
    check(!checkPhrase(bad, ctx).ok, `rejects ${JSON.stringify(bad)}`);
  }
  check(Object.keys(ROLE_NAMES).length === 10, "ten roles");
});

// ---------- capacity ----------
test("capacity picks the tightest limit and flags 85%", () => {
  const env = { WS_RATIO: "20", CAP_SCALE: "1" };
  const c = capacity({ workerReq: 1000, incoming: 200000, connects: 5000, alarms: 1000, rpc: 1000, doRowsW: 2000, awakeMs: 3600000 }, env, Date.UTC(2026, 10, 22, 12));
  check(c.limitName === "Durable Objects requests" && c.usedToday === 17000 && !c.full, JSON.stringify(c));
  check(c.resetAt === "2026-11-23T00:00:00.000Z", "reset at the next UTC midnight");
  const full = capacity({ awakeMs: 3600000 * 25 }, env, 0);
  check(full.limitName === "Durable Objects duration (GB-s)" && full.full, JSON.stringify(full));
  check(capacity({ incoming: 100 }, { WS_RATIO: "1", CAP_SCALE: "0.001" }, 0).full, "scaled down limits");
  const clock = new AwakeClock(2);
  clock.touch(0); clock.touch(3000); clock.touch(60000);
  check(clock.take() === 20000 + 3000 + 10000, "awake estimate");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
