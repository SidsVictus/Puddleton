// Word lists for the chat filter. Easy to extend: add a lowercase entry to the right list.
// Matching happens after normalisation (lookalikes, leetspeak, spacing, repeats), so list plain spellings only.
//
// EXACT: a whole word (or adjacent words joined, as in "f u c k" or "fu ck"). Repeated letters are allowed
//   ("fuuuck"), but a doubled letter in the entry needs at least two ("ass" does not match "as").
//   A trailing "*" also allows the endings s, es, ed, er, ers, ing, in, z ("bastard*" matches "bastards").
// ROOTS: blocked anywhere inside a word ("fuck" in "fuckface"). Only roots that rarely hide inside innocent words.
// PHRASES: multi word patterns, matched on the normalised text with single spaces.
// PLATFORMS: off-platform apps and sites; blocked as words, and they make "add me on X" style invites.
// SHORT_PLATFORMS: names that are only blocked in invite context ("my sc", "your roblox").
// INVITE_ABBR: two letter codes that are also blocked after on, at, in, over, via ("on ig").

export const EXACT = [
  "ass*", "arse*", "asshole*", "arsehole*", "assface", "asswipe", "bastard*", "bollocks", "boob*", "boobies", "butthole*",
  "crap*", "crappy", "cum", "cums", "cumming", "cumshot", "cock*", "dick*", "dickhead", "douche*", "douchebag", "fag*", "fck", "fcking", "fk",
  "fuck*", "fucker*", "fucking", "cunt*", "bitch*", "bitches",
  "homo*", "horny", "hentai", "jizz", "kys", "milf", "nazi*", "negro*", "nigga*", "niga*", "nigger*", "nude*", "nudes", "penis*",
  "piss*", "pissed", "porn*", "prick*", "pussy", "pussies", "rape*", "raped", "rapist*", "retard*", "scrotum", "sex", "sexy",
  "sexting", "shit*", "shitty", "slut*", "slutty", "spic", "spics", "stfu", "tits", "titty", "titties", "twat*", "vagina*", "wank*",
  "wanker*", "whore*", "chink*", "kike*", "gook*", "tranny", "trannies", "dyke*", "coon*", "wetback*", "beaner*", "paki*",
  "orgasm*", "anal", "anus", "boner*", "erection", "dildo*", "blowjob*", "handjob*", "testicle*", "nutsack",
  "motherfucker*", "mofo", "biatch", "beyotch", "skank*", "hoes", "thot*", "incel*", "pedo*", "pedophile*", "molest*",
];

export const ROOTS = [
  "fuck", "fuk", "cunt", "nigg", "fagg", "bitch", "whore", "slut", "shit", "porn", "molest", "pedophil", "retard",
  "dildo", "jizz", "motherf", "cocksuck", "blowjob", "handjob", "rimjob", "titfuck", "jackoff", "jerkoff", "masturbat",
];

export const PHRASES = [
  "kill yourself", "kill your self", "kill urself", "kill ur self", "go die", "neck yourself", "hang yourself",
  "end yourself", "suck my", "blow me", "jerk off", "jack off", "f off", "eff off", "lick my", "sit on my",
  "get naked", "go to hell",
];

export const PLATFORMS = [
  "snapchat", "snap", "snapp", "discord", "discordapp", "insta", "instagram", "instgram", "whatsapp", "whatsap", "watsapp",
  "telegram", "kik", "tiktok", "facebook", "messenger", "skype", "wechat", "viber", "onlyfans", "omegle", "twitch",
  "reddit", "youtube", "twitter", "venmo", "cashapp", "paypal", "bereal", "imessage", "facetime", "hangouts",
  "gmail", "hotmail", "icloud", "protonmail", "aol",
];

// PLATFORM_ROOTS: long app names that are also blocked inside a word ("xXsnapchatXx").
export const PLATFORM_ROOTS = ["snapchat", "discord", "instagram", "whatsapp", "telegram", "tiktok", "facebook", "onlyfans", "omegle", "youtube", "twitter", "wechat", "cashapp", "paypal"];

export const SHORT_PLATFORMS = ["sc", "ig", "dc", "fb", "tg", "wa", "tt", "yt", "zoom", "signal", "roblox", "steam", "xbox", "psn", "snap", "insta", "discord"];
export const INVITE_ABBR = ["sc", "ig", "dc", "fb", "tg", "wa", "yt"];

// Grooming signals: flagged silently for moderators, never shown to the sender. Matched on normalised text.
export const SIGNALS = {
  age: [/\bhow old\b/, /\bwhat age\b/, /\b(ur|your|yo) age\b/, /\basl\b/, /\bage\s*\?/, /\bare (u|you) (a )?(kid|minor|adult|teen|over|under) ?\d*/, /\b(u|you) (over|under) (18|eighteen|13|thirteen)\b/, /\bhow young\b/],
  location: [/\bwhere (do|d) (u|you) live\b/, /\bwhere (r|are|u) (u|you)? ?(from|located|at)\b/, /\b(what|which|wat) (city|state|country|town|area|neighborhood)\b/, /\b(ur|your) (address|location|city|town|zip|postcode|house)\b/, /\blive near\b/, /\bmeet (up|irl|in person)\b/, /\birl\b/],
  school: [/\b(what|which|wat) (school|grade|class|year)\b/, /\b(ur|your) (school|teacher|grade)\b/, /\bgo to school\b/, /\bwhat grade\b/],
  phone: [/\b(ur|your) (number|phone|cell|digits|mobile)\b/, /\bphone number\b/, /\btext me\b/, /\bgive me (ur|your) (number|phone)\b/],
  photo: [/\b(send|show|post|share|got)( me)? (a |an |ur |your |some )?(pic|pics|picture|pictures|photo|photos|selfie|selfies|face|feet|body|nude|nudes|video)\b/, /\bwhat do (u|you) look like\b/, /\b(pic|picture|photo) of (u|you|urself|yourself)\b/, /\b(cam|webcam|facetime|video call|vc)\b/],
  offplatform: [/\b(add|follow|dm|message|msg|text|friend|find|ping) (me|us)\b/, /\bhmu\b/, /\bhit me up\b/, /\b(talk|chat|play|meet) (on|in|at|over) (another|other|a different|my|the) (app|game|server|site)\b/, /\bjoin my (server|group|chat)\b/, /\bprivate (chat|server|room)\b/, /\bkeep (it|this) (a )?secret\b/, /\bdont tell (ur|your|anyone)\b/],
};

// ---------- per band levels (see filter.mjs) ----------
// SLURS: hate slurs. Blocked at every level, adults included, also when spaced out or split ("nig ger").
export const SLURS = [
  "nigger*", "nigga*", "niga*", "negro*", "fag*", "faggot*", "kike*", "chink*", "gook*", "spic", "spics", "wetback*", "beaner*",
  "paki*", "coon*", "tranny", "trannies", "dyke*", "retard*",
];
export const SLUR_ROOTS = ["nigg", "fagg"];

// Sexual content involving minors: blocked at every level. Words and roots, plus a sexual word and a minor word
// in the same message.
export const MINOR_SEXUAL = ["pedo*", "paedo*", "pedophile*", "paedophile*", "pedophilia", "loli", "lolis", "lolicon", "shota", "shotacon", "jailbait", "childporn", "kiddieporn", "kiddyporn"];
export const MINOR_SEXUAL_ROOTS = ["pedophil", "paedophil", "childporn", "kiddieporn", "kiddyporn", "lolicon", "jailbait"];
export const SEXUAL_WORDS = [
  "sex", "sexy", "sexual", "sexually", "nude", "nudes", "naked", "porn", "porno", "horny", "rape", "raped", "raping", "molest", "molested",
  "molesting", "blowjob", "handjob", "orgasm", "masturbate", "masturbating", "cum", "boobs", "tits", "titties", "erection", "boner",
  "aroused", "fondle", "fondling", "grope", "groping",
];
export const MINOR_WORDS = [
  "kid", "kids", "kiddo", "child", "children", "minor", "minors", "underage", "preteen", "preteens", "toddler", "schoolgirl", "schoolgirls",
  "schoolboy", "schoolboys", "teen", "teens", "teenager", "teenagers", "loli",
];

// CONTACT_APPS: messaging apps whose bare name is blocked at the standard level (the strict level blocks all of
// PLATFORMS). Everyday words like "snap" or "insta" are only blocked there in invite context ("add me on snap").
export const CONTACT_APPS = [
  "snapchat", "discord", "discordapp", "instagram", "instgram", "whatsapp", "whatsap", "watsapp", "telegram", "kik", "wechat", "viber",
  "skype", "onlyfans", "omegle", "imessage", "facetime", "hangouts", "gmail", "hotmail", "icloud", "protonmail",
];

// Street words for address detection ("12 elm street"), at the strict and standard levels.
export const STREET_WORDS = ["street", "st", "avenue", "ave", "road", "rd", "lane", "ln", "drive", "dr", "boulevard", "blvd", "court", "ct", "way", "place", "pl", "crescent", "close", "terrace"];

// NAME_SEXUAL: sexual words for player names, the same for every band (names also never pass SLURS or
// MINOR_SEXUAL). Other profanity is allowed in names. Family words like "daddy" and "mommy" must never be added.
export const NAME_SEXUAL = [
  "sex", "sexy", "sexual", "sexting", "porn*", "porno", "pornstar*", "nude*", "nudes", "naked", "horny", "hentai", "milf*", "dildo*", "orgasm*",
  "cum", "cums", "cumming", "cumshot", "jizz", "sperm", "semen", "penis*", "vagina*", "clit*", "cock*", "dick*", "dickhead", "pussy", "pussies",
  "tits", "titty", "titties", "boob*", "boobies", "anal", "anus", "boner*", "erection", "blowjob*", "handjob*", "rimjob*", "fuck*", "fucker*",
  "fucking", "fck", "fcking", "fk", "fuk", "motherfucker*", "cunt*", "twat*", "whore*", "slut*", "slutty", "skank*", "thot*", "hoes", "wank*",
  "wanker*", "testicle*", "nutsack", "rape*", "raped", "rapist*", "molest*", "masturbate", "stripper*", "hooker*", "bdsm", "fetish*", "kinky",
  "nsfw", "onlyfans", "pornhub", "orgy", "orgies", "threesome", "gangbang", "deepthroat", "creampie", "bukkake",
];
export const NAME_SEXUAL_ROOTS = ["fuck", "porn", "dildo", "jizz", "masturbat", "blowjob", "handjob", "rimjob", "cocksuck", "pussy", "cunt", "whore", "slut", "hentai", "nsfw", "sexy", "boobs", "boobies", "titties"];
