// Chat filter. Pure, no dependencies; shared by the room server and the unit tests.
//
// checkText(text, { level }) normalises the text and checks it at one of three levels, picked by the speaker's
// age band (levelFor):
//   strict   (child band): profanity and slurs, links and domain-like text, emails, phone numbers and long digit
//            runs, street addresses, spelled out number runs, social handles, app names and off-platform invites,
//            with every spacing trick undone.
//   standard (teen band, and adults who chose "strict"): profanity and slurs, links, emails, phone numbers,
//            addresses, handles, messaging app names and invites. No spelled number check, and words joined across
//            spaces ("pen is") only count when they make a slur.
//   minimal  (adult band by default): hate slurs, sexual content involving minors, and links (anti-phishing).
//   name     (player names, every band): slurs, sexual words, sexual content involving minors, and links.
//            Handles, numbers, ordinary words and other profanity are allowed.
// safeVersion(text) is what a standard level reader gets of a line that only passed the minimal level.
// signalsOf(text) finds grooming signals (questions about age, location, school, phone, photos, moving apps).
//
// Normalisation, in order: Unicode NFKC, lowercase, accents and invisible characters removed, a confusables
// skeleton (Cyrillic, Greek and other lookalike letters to Latin), then for word matching a leetspeak map,
// then spacing and punctuation inside words collapsed (single letters joined, adjacent short words joined)
// and repeated letters tolerated.
import { EXACT, ROOTS, PHRASES, PLATFORMS, PLATFORM_ROOTS, SHORT_PLATFORMS, INVITE_ABBR, SIGNALS, SLURS, SLUR_ROOTS, MINOR_SEXUAL,
  MINOR_SEXUAL_ROOTS, SEXUAL_WORDS, MINOR_WORDS, CONTACT_APPS, STREET_WORDS, NAME_SEXUAL, NAME_SEXUAL_ROOTS } from "./wordlists.mjs";

export const MAX_TEXT = 200;

const CONFUSABLES = {
  // Cyrillic
  "а": "a", "б": "b", "в": "b", "с": "c", "д": "d", "е": "e", "ё": "e", "г": "r", "һ": "h",
  "і": "i", "ї": "i", "ј": "j", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "т": "t",
  "у": "y", "х": "x", "ѕ": "s", "ԁ": "d", "ԛ": "q", "ԝ": "w", "ү": "y", "и": "u", "п": "n",
  "ь": "b", "ґ": "r", "є": "e", "з": "3", "ч": "4",
  // Greek
  "α": "a", "β": "b", "γ": "y", "δ": "d", "ε": "e", "ζ": "z", "η": "n", "ι": "i", "κ": "k",
  "μ": "u", "ν": "v", "ο": "o", "π": "n", "ρ": "p", "σ": "o", "ς": "c", "τ": "t", "υ": "u",
  "χ": "x", "ω": "w", "ϲ": "c", "ϳ": "j",
  // Armenian and others
  "ս": "u", "օ": "o", "ց": "g", "ք": "p", "հ": "h", "ո": "n", "զ": "q",
  // Latin lookalikes and small capitals
  "ı": "i", "ɑ": "a", "ɡ": "g", "ɩ": "i", "ɪ": "i", "ʟ": "l", "ɴ": "n", "ʀ": "r", "ꜱ": "s",
  "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d", "ᴇ": "e", "ғ": "f", "ɢ": "g", "ʜ": "h", "ᴊ": "j",
  "ᴋ": "k", "ᴍ": "m", "ᴏ": "o", "ᴘ": "p", "ǫ": "q", "ᴛ": "t", "ᴜ": "u", "ᴠ": "v", "ᴡ": "w",
  "ʏ": "y", "ᴢ": "z", "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ł": "l", "ħ": "h",
  "þ": "p", "ð": "d", "ƀ": "b", "ƈ": "c", "ɗ": "d", "ƒ": "f", "ɠ": "g", "ƙ": "k", "ɱ": "m",
  "ɲ": "n", "ƥ": "p", "ɋ": "q", "ɽ": "r", "ʂ": "s", "ƭ": "t", "ʋ": "u", "ʍ": "w", "ƴ": "y",
  "ȥ": "z",
};
const LEET = { "0": "o", "1": "i", "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "¢": "c", "£": "e", "¥": "y" };
const NUMBER_WORDS = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]/g;
// Top level domains. STRONG ones are never ordinary words, so "word . com" with spaces still counts as a link;
// the rest ("me", "to", "in") only count when written tight ("bo.me") or with "dot".
const STRONG_TLDS = "com|net|org|edu|gov|io|gg|uk|ca|au|de|fr|nl|ru|cn|jp|br|tv|ly|dev|xyz|info|biz|online|club|tk|ml|ga|cf|gq|icu|mobi|onion|surge|ng|za|mx|kr|tw|hk|sg|nz|ie|dk|fi|cz|ro|gr|pt|tr|ua|vn|pk|bd|eu|ch|se|pl|ws|fm|cc|xxx|porn";
const TLDS = STRONG_TLDS + "|co|us|in|me|to|sh|am|be|it|es|no|top|shop|store|fun|win|vip|pro|page|blog|chat|social|lol|wtf|gay|sex|ai|ar|at|id|ph|th|my|app|site|link|live";
const DOT = String.raw`(?:[(\[{]\s*dot\s*[)\]}]|\s+dot\s+)`;
const URL_RES = [
  /\b(?:https?|ftp|hxxps?)\s*:\s*\/\//, /\bwww\s*(?:\.|dot)/, /\b(?:https?|www)\b/,
  new RegExp(String.raw`[a-z0-9][a-z0-9-]*\.(?:${TLDS})\b`),
  new RegExp(String.raw`[a-z0-9][a-z0-9-]*\s*\.\s*(?:${STRONG_TLDS})\b`),
  new RegExp(String.raw`[a-z0-9][a-z0-9-]*\s*${DOT}\s*(?:${TLDS})\b`),
  new RegExp(String.raw`\bdot\s*(?:${STRONG_TLDS})\b`),
  /\b[a-z0-9-]+\.[a-z]{2,6}\/\S*/,
];
const MAIL_HOSTS = "gmail|googlemail|hotmail|yahoo|outlook|icloud|aol|proton|protonmail|live|msn|mail|ymail";
const EMAIL_RES = [
  /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+\s*(?:\.|dot)\s*[a-z]{2,}/,
  new RegExp(String.raw`[a-z0-9._%+-]+\s*(?:[(\[{]\s*at\s*[)\]}]|\s+at\s+)\s*(?:(?:${MAIL_HOSTS})\b|[a-z0-9-]+\s*(?:\.|\s+dot\s+)\s*(?:com|net|org|edu|io|co|uk)\b)`),
];
const HANDLE_RE = /(?:^|[^a-z0-9])@([a-z0-9_.]{2,})/g;

const strongEntry = (w) => w.replace(/\*$/, "").split("").map((c) => (/[a-z]/.test(c) ? c + "+" : c.replace(/[^a-z0-9]/g, "\\$&"))).join("");
const SUFFIX = "(?:s|es|ed|er|ers|ing|in|z)?";
const exactRe = (list) => new RegExp("^(?:" + list.map((w) => strongEntry(w) + (w.endsWith("*") ? SUFFIX : "")).join("|") + ")$");
const rootRe = (list) => new RegExp("(?:" + list.map(strongEntry).join("|") + ")");
const EXACT_RE = exactRe(EXACT);
const ROOT_RE = rootRe(ROOTS);
const SLUR_RE = exactRe(SLURS), SLUR_ROOT_RE = rootRe(SLUR_ROOTS);
const MINOR_RE = exactRe(MINOR_SEXUAL), MINOR_ROOT_RE = rootRe(MINOR_SEXUAL_ROOTS);
const NAME_SEX_RE = exactRe(NAME_SEXUAL), NAME_SEX_ROOT_RE = rootRe(NAME_SEXUAL_ROOTS);
const SEXUAL_SET = new Set(SEXUAL_WORDS), MINOR_SET = new Set(MINOR_WORDS);
const CHILD_AGE_RE = /\b(?:1[0-7]|[1-9])\s*(?:yo|y o|yrs? old|years? old|year olds?)\b|\blittle (?:girl|boy|girls|boys)\b/;
const PLATFORM_RE = new RegExp("^(?:" + PLATFORMS.map(strongEntry).join("|") + ")(?:s)?$");
const CONTACT_RE = new RegExp("^(?:" + CONTACT_APPS.map(strongEntry).join("|") + ")(?:s)?$");
const CONTACT_ROOT_RE = new RegExp("(?:" + CONTACT_APPS.filter((w) => w.length >= 6).map(strongEntry).join("|") + ")");
const ADDRESS_RE = new RegExp(String.raw`\b\d{1,5}\s+(?:[a-z]+\s+){1,3}(?:${STREET_WORDS.join("|")})\b|\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b`);
const EMAIL_STRIP = /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)+/g;
const PLATFORM_ROOT_RE = new RegExp("(?:" + PLATFORM_ROOTS.map(strongEntry).join("|") + ")");
const PHRASE_RES = PHRASES.map((p) => new RegExp("\\b" + p.split(" ").map(strongEntry).join("\\s*") + "\\b"));
const INVITE_RES = [
  /\b(?:add|follow|dm|message|msg|text|call|ping|friend|find|sub|subscribe|hmu|hit)\s+(?:me|us|up)\s+(?:on|at|in|over)\b/,
  new RegExp(String.raw`\b(?:my|ur|your|yo|whats? (?:is )?(?:ur|your))\s+(?:${SHORT_PLATFORMS.join("|")}|phone|cell|user|username|handle|gamertag|email|mail|addy)\b`),
  new RegExp(String.raw`\b(?:on|at|in|over|via)\s+(?:${INVITE_ABBR.join("|")})\b`),
  /\bhmu\b/, /\bhit me up\b/, /\b(?:join|come to) my (?:server|discord|group|channel)\b/,
];

// Decimal digits from any script become ASCII.
function asciiDigits(s) {
  return s.replace(/\p{Nd}/gu, (c) => {
    if (c >= "0" && c <= "9") return c;
    const cp = c.codePointAt(0);
    let z = cp;
    while (cp - z < 9 && /\p{Nd}/u.test(String.fromCodePoint(z - 1))) z--;
    return String(cp - z);
  });
}

// NFKC, lowercase, accents and invisible characters gone, lookalike letters mapped. Digits and punctuation stay.
export function skeleton(raw) {
  let s = String(raw).normalize("NFKC").toLowerCase().replace(INVISIBLE, "");
  s = s.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  s = [...s].map((c) => CONFUSABLES[c] ?? c).join("");
  return asciiDigits(s).replace(/\s+/g, " ").trim();
}

// Word forms for matching: leetspeak mapped, then letters only. Three variants: 1 and | as i, as l, and v as u.
function leetVariants(skel) {
  const base = skel.replace(/ph/g, "f");
  const map = (s, extra) => [...s].map((c) => extra[c] ?? LEET[c] ?? c).join("");
  return [map(base, {}), map(base, { "1": "l", "|": "l" }), map(base, {}).replace(/v/g, "u")];
}

// Tokens of a leet form, plus the joins that undo spacing tricks: runs of single letters ("f u c k"),
// and two or three adjacent words when one of them is short ("fu ck", "a ss").
function candidates(form) {
  const words = form.split(/[^a-z]+/).filter(Boolean);
  const out = new Set(words);
  let run = "";
  for (const w of [...words, ""]) {
    if (w.length === 1) { run += w; continue; }
    if (run.length > 1) out.add(run);
    run = "";
  }
  const joins = new Set(), pairs = new Set();
  for (let i = 0; i < words.length; i++) {
    for (let n = 2; n <= 3 && i + n <= words.length; n++) {
      const part = words.slice(i, i + n);
      if (part.some((w) => w.length <= 2)) joins.add(part.join(""));
      if (n === 2) pairs.add(part.join(""));
    }
  }
  // joins: for word lists (one short word needed, to keep "pen is" style accidents rare);
  // pairs: any two neighbours, only for app names ("dis cord", "face book").
  return { words, out: [...out], joins: [...joins], pairs: [...pairs] };
}

// Spelled out or written digit runs: "555 123 4567", "five five five", "5five5".
function digitTrouble(skel) {
  const words = skel.replace(/#/g, " ").replace(/[a-z]+/g, (w) => (Object.hasOwn(NUMBER_WORDS, w) ? ` ${NUMBER_WORDS[w]}# ` : ` ${w} `));
  let total = 0, worst = 0, spelled = 0;
  for (const m of words.matchAll(/\d+#?(?:[\s.\-()\/+_,*#]*\d+#?)*/g)) {
    const digits = m[0].replace(/[^\d]/g, "").length, named = (m[0].match(/#/g) || []).length;
    total += digits; worst = Math.max(worst, digits); spelled = Math.max(spelled, named);
  }
  if (spelled >= 3) return "numbers";
  if (worst >= 5 || total >= 7) return "phone";
  return null;
}

export const LEVELS = ["strict", "standard", "minimal", "name"];
// The level a speaker is checked at: child strict, teen standard, adult minimal unless they chose "strict".
export function levelFor(band, pref) {
  if (band === "child") return "strict";
  if (band === "teen") return "standard";
  return pref === "strict" ? "standard" : "minimal";
}

// The main check. Returns { ok: true } or { ok: false, reason } with reason one of:
// "empty", "length", "profanity", "slur", "minor", "sexual", "link", "email", "phone", "address", "numbers", "handle", "invite".
// opts.level: "strict" (default), "standard", "minimal" or "name". opts.max: the longest allowed text in characters.
// opts.names: player names that may be @mentioned.
export function checkText(raw, opts = {}) {
  const max = opts.max ?? MAX_TEXT, names = new Set((opts.names || []).map((n) => String(n).toLowerCase()));
  const level = LEVELS.includes(opts.level) ? opts.level : "strict";
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if ([...trimmed].length > max) return { ok: false, reason: "length" };
  const skel = skeleton(trimmed);
  // Spaced out letters ("g o o g l e . c o m") are joined for the link and email checks.
  const join = (x) => x.replace(/(?<=(?:^|[^a-z0-9])[a-z0-9]) (?=[a-z0-9.@](?:[^a-z0-9]|$))/g, "");
  const joined = join(skel), forms = leetVariants(skel);
  const blocked = (reason) => ({ ok: false, reason });

  // Every level: hate slurs and sexual content involving minors.
  for (const form of forms) {
    // Any neighbours joined ("nig ger") count here: these lists are short and never innocent when joined.
    const { words, out, joins, pairs } = candidates(form), near = [...joins, ...pairs];
    if (out.some((w) => SLUR_RE.test(w) || SLUR_ROOT_RE.test(w)) || near.some((w) => SLUR_RE.test(w))) return blocked("slur");
    if (out.some((w) => MINOR_RE.test(w) || MINOR_ROOT_RE.test(w)) || near.some((w) => MINOR_RE.test(w))) return blocked("minor");
    if (words.some((w) => SEXUAL_SET.has(w)) && (words.some((w) => MINOR_SET.has(w)) || CHILD_AGE_RE.test(skel))) return blocked("minor");
  }
  if (level === "name") {
    for (const form of forms) {
      const { out, joins } = candidates(form);
      if (out.some((w) => NAME_SEX_RE.test(w) || NAME_SEX_ROOT_RE.test(w)) || joins.some((w) => NAME_SEX_RE.test(w))) return blocked("sexual");
    }
  }
  if (level === "minimal" || level === "name") {
    // Links only (an email address is not a link, so it is taken out first).
    const plain = skel.replace(EMAIL_STRIP, " ");
    for (const x of [plain, join(plain), leetVariants(plain)[0]]) if (URL_RES.some((r) => r.test(x))) return blocked("link");
    return { ok: true };
  }

  const strict = level === "strict";
  for (const x of [skel, joined]) if (EMAIL_RES.some((r) => r.test(x))) return blocked("email");
  for (const x of [skel, joined, forms[0]]) if (URL_RES.some((r) => r.test(x))) return blocked("link");
  for (const m of skel.matchAll(HANDLE_RE)) if (!names.has(m[1].replace(/[._]+$/, ""))) return blocked("handle");
  if (ADDRESS_RE.test(skel)) return blocked("address");
  const digits = digitTrouble(skel);
  if (digits === "phone" || (digits === "numbers" && strict)) return blocked(digits);
  for (const form of forms) {
    const { words, out, joins, pairs } = candidates(form);
    const spaced = words.join(" ");
    // Roots only inside real words and spaced out letters, never across joined words ("is hit"). Joined
    // neighbours ("fu ck") count at the strict level only (slurs were checked above for every level).
    if (out.some((w) => EXACT_RE.test(w) || ROOT_RE.test(w)) || (strict && joins.some((w) => EXACT_RE.test(w)))) return blocked("profanity");
    if (PHRASE_RES.some((r) => r.test(spaced))) return blocked("profanity");
    const apps = strict ? PLATFORM_RE : CONTACT_RE, appRoots = strict ? PLATFORM_ROOT_RE : CONTACT_ROOT_RE;
    if ([...out, ...(strict ? joins : []), ...pairs].some((w) => apps.test(w)) || out.some((w) => appRoots.test(w))) return blocked("invite");
    if (INVITE_RES.some((r) => r.test(spaced))) return blocked("invite");
  }
  return { ok: true };
}

// Player names, the same rule for every band: no slurs, nothing sexual, no links. The room checks both the name
// as typed (so lookalike letters and spacing are undone) and the id made from it (letters, digits and _ only).
// CamelCase and digits split words too ("SexyBabe" is checked as "Sexy Babe").
// opts.child: the child band also may not put contact details in a name: an email address, or a phone-like run of
// 8 or more digits (separators allowed). Handles and short numbers ("Player12345") stay fine.
export function checkName(name, opts = {}) {
  let r = checkText(name, { max: 64, level: "name" });
  if (!r.ok || typeof name !== "string") return r;
  const split = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/(\d)([A-Za-z])/g, "$1 $2");
  if (split !== name) r = checkText(split, { max: 64, level: "name" });
  if (!r.ok || !opts.child) return r;
  const skel = skeleton(name), joined = skel.replace(/(?<=(?:^|[^a-z0-9])[a-z0-9]) (?=[a-z0-9.@](?:[^a-z0-9]|$))/g, "");
  if ([skel, joined].some((x) => EMAIL_RES.some((re) => re.test(x)))) return { ok: false, reason: "email" };
  let run = 0;
  for (const m of skel.matchAll(/\d(?:[\s.\-()\/+_,*]*\d)*/g)) run = Math.max(run, m[0].replace(/\D/g, "").length);
  return run >= 8 ? { ok: false, reason: "phone" } : r;
}

// What a reader at the standard level gets of a line that passed only the minimal level: the line itself if it
// passes standard, else the line with each failing word turned into asterisks, else null (do not show it at all,
// for example a phone number split across words).
export function safeVersion(raw, opts = {}) {
  const o = { ...opts, level: "standard", max: 1000 };
  if (checkText(raw, o).ok) return raw;
  const masked = raw.split(/(\s+)/).map((part) => (!part || /^\s+$/.test(part) || checkText(part, o).ok ? part : "*".repeat(Math.min(8, [...part].length)))).join("");
  return checkText(masked, o).ok ? masked : null;
}

// Grooming signals in a message, as a list of categories (empty when none). Never blocks by itself.
export function signalsOf(raw) {
  if (typeof raw !== "string") return [];
  const skel = skeleton(raw);
  const text = leetVariants(skel)[0].replace(/[^a-z0-9?]+/g, " ").replace(/\s*\?/g, " ?").replace(/\s+/g, " ");
  const plain = skel.replace(/[^a-z0-9?]+/g, " ").replace(/\s*\?/g, " ?").replace(/\s+/g, " ");
  const found = [];
  for (const [cat, list] of Object.entries(SIGNALS)) if (list.some((r) => r.test(text) || r.test(plain))) found.push(cat);
  if (!found.includes("offplatform")) {
    const { out, joins, pairs } = candidates(leetVariants(skel)[0]);
    if ([...out, ...joins, ...pairs].some((w) => PLATFORM_RE.test(w)) || out.some((w) => PLATFORM_ROOT_RE.test(w))) found.push("offplatform");
  }
  return found;
}

// A short key for duplicate detection: the normalised letters and digits only.
export const dupKey = (raw) => skeleton(String(raw)).replace(/[^\p{L}\p{N}]+/gu, "").replace(/(.)\1+/gu, "$1").slice(0, 120);
