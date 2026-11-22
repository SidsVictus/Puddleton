// Phrase chat: a fixed catalog of safe lines, shared by the client and the server.
// Clients send { id, args }; the server checks them with checkPhrase and renders the text itself,
// so nothing typed by a player ever reaches anyone through phrase chat.
//
// An argument is either "player" (an id of someone in the room) or "role" (a key of ROLE_NAMES).
// To add a phrase: append it with a new unique id. Never reuse or renumber an id; old clients send them.

export const ROLE_NAMES = {
  villager: "Villager", angel: "Angel", detective: "Detective", vigilante: "Vigilante", mayor: "Mayor",
  mafia: "Mafia", godfather: "Godfather", framer: "Framer", jester: "Jester", serialkiller: "Serial Killer",
};

export const PHRASE_CATS = ["Greetings", "Accuse", "Defend", "Claim", "Vote", "Night", "Reactions", "Thanks/Bye"];

export const PHRASES = [
  // Greetings
  { id: "greet.1", cat: "Greetings", text: "Hi everyone!", args: [] },
  { id: "greet.2", cat: "Greetings", text: "Hello, {player}!", args: ["player"] },
  { id: "greet.3", cat: "Greetings", text: "Good luck, everyone!", args: [] },
  { id: "greet.4", cat: "Greetings", text: "Have fun!", args: [] },
  { id: "greet.5", cat: "Greetings", text: "Ready when you are.", args: [] },
  { id: "greet.6", cat: "Greetings", text: "Good morning, Puddleton!", args: [] },
  { id: "greet.7", cat: "Greetings", text: "Nice outfit, {player}!", args: ["player"] },
  { id: "greet.8", cat: "Greetings", text: "Welcome back, {player}!", args: ["player"] },

  // Accuse
  { id: "accuse.1", cat: "Accuse", text: "I think {player} is Mafia.", args: ["player"] },
  { id: "accuse.2", cat: "Accuse", text: "{player} is acting suspicious.", args: ["player"] },
  { id: "accuse.3", cat: "Accuse", text: "{player} is too quiet.", args: ["player"] },
  { id: "accuse.4", cat: "Accuse", text: "I don't trust {player}.", args: ["player"] },
  { id: "accuse.5", cat: "Accuse", text: "{player} keeps changing their story.", args: ["player"] },
  { id: "accuse.6", cat: "Accuse", text: "I think {player} is the {role}.", args: ["player", "role"] },
  { id: "accuse.7", cat: "Accuse", text: "{player} is lying about being the {role}.", args: ["player", "role"] },
  { id: "accuse.8", cat: "Accuse", text: "Watch {player} closely.", args: ["player"] },
  { id: "accuse.9", cat: "Accuse", text: "The clue points at {player}.", args: ["player"] },
  { id: "accuse.10", cat: "Accuse", text: "{player} and {player} are working together.", args: ["player", "player"] },

  // Defend
  { id: "defend.1", cat: "Defend", text: "I'm innocent!", args: [] },
  { id: "defend.2", cat: "Defend", text: "It wasn't me!", args: [] },
  { id: "defend.3", cat: "Defend", text: "I trust {player}.", args: ["player"] },
  { id: "defend.4", cat: "Defend", text: "{player} is innocent.", args: ["player"] },
  { id: "defend.5", cat: "Defend", text: "You're making a mistake.", args: [] },
  { id: "defend.6", cat: "Defend", text: "Leave {player} alone.", args: ["player"] },
  { id: "defend.7", cat: "Defend", text: "I'm on the town's side.", args: [] },
  { id: "defend.8", cat: "Defend", text: "Check me tonight if you doubt me.", args: [] },
  { id: "defend.9", cat: "Defend", text: "Please don't vote for me!", args: [] },

  // Claim
  { id: "claim.1", cat: "Claim", text: "I am the {role}.", args: ["role"] },
  { id: "claim.2", cat: "Claim", text: "I checked {player}. They are innocent.", args: ["player"] },
  { id: "claim.3", cat: "Claim", text: "I checked {player}. They are Mafia!", args: ["player"] },
  { id: "claim.4", cat: "Claim", text: "I protected {player} last night.", args: ["player"] },
  { id: "claim.5", cat: "Claim", text: "I'm just a Villager.", args: [] },
  { id: "claim.6", cat: "Claim", text: "I'd rather not say my role yet.", args: [] },
  { id: "claim.7", cat: "Claim", text: "Who is the Detective?", args: [] },
  { id: "claim.8", cat: "Claim", text: "Who is the {role}?", args: ["role"] },
  { id: "claim.9", cat: "Claim", text: "{player} claims to be the {role}.", args: ["player", "role"] },
  { id: "claim.10", cat: "Claim", text: "Real {role}, please speak up.", args: ["role"] },

  // Vote
  { id: "vote.1", cat: "Vote", text: "Let's vote for {player}.", args: ["player"] },
  { id: "vote.2", cat: "Vote", text: "I voted for {player}.", args: ["player"] },
  { id: "vote.3", cat: "Vote", text: "I'm abstaining today.", args: [] },
  { id: "vote.4", cat: "Vote", text: "Don't vote yet. Let's talk first.", args: [] },
  { id: "vote.5", cat: "Vote", text: "We need to vote someone out.", args: [] },
  { id: "vote.6", cat: "Vote", text: "Please vote, time is running out!", args: [] },
  { id: "vote.7", cat: "Vote", text: "Who are you voting for?", args: [] },
  { id: "vote.8", cat: "Vote", text: "Change your vote to {player}.", args: ["player"] },
  { id: "vote.9", cat: "Vote", text: "A tie means nobody goes. Pick one!", args: [] },

  // Night (for whispers and the ghost chat while the square is closed)
  { id: "night.1", cat: "Night", text: "Let's go after {player} tonight.", args: ["player"] },
  { id: "night.2", cat: "Night", text: "Stay safe tonight.", args: [] },
  { id: "night.3", cat: "Night", text: "Who should I check tonight?", args: [] },
  { id: "night.4", cat: "Night", text: "Protect {player} tonight.", args: ["player"] },
  { id: "night.5", cat: "Night", text: "I have a plan.", args: [] },
  { id: "night.6", cat: "Night", text: "Sleep tight, Puddleton.", args: [] },
  { id: "night.7", cat: "Night", text: "Something feels wrong tonight.", args: [] },
  { id: "night.8", cat: "Night", text: "I think the {role} is {player}.", args: ["role", "player"] },

  // Reactions
  { id: "react.1", cat: "Reactions", text: "Yes!", args: [] },
  { id: "react.2", cat: "Reactions", text: "No way!", args: [] },
  { id: "react.3", cat: "Reactions", text: "Hmm...", args: [] },
  { id: "react.4", cat: "Reactions", text: "I agree.", args: [] },
  { id: "react.5", cat: "Reactions", text: "I disagree.", args: [] },
  { id: "react.6", cat: "Reactions", text: "Good point, {player}.", args: ["player"] },
  { id: "react.7", cat: "Reactions", text: "That's suspicious!", args: [] },
  { id: "react.8", cat: "Reactions", text: "Oops!", args: [] },
  { id: "react.9", cat: "Reactions", text: "Ha ha!", args: [] },
  { id: "react.10", cat: "Reactions", text: "Wow!", args: [] },
  { id: "react.11", cat: "Reactions", text: "I knew it!", args: [] },
  { id: "react.12", cat: "Reactions", text: "Poor {player}.", args: ["player"] },
  { id: "react.13", cat: "Reactions", text: "Maybe.", args: [] },
  { id: "react.14", cat: "Reactions", text: "I'm not sure.", args: [] },

  // Thanks/Bye
  { id: "bye.1", cat: "Thanks/Bye", text: "Thanks!", args: [] },
  { id: "bye.2", cat: "Thanks/Bye", text: "Thanks, {player}!", args: ["player"] },
  { id: "bye.3", cat: "Thanks/Bye", text: "Good game!", args: [] },
  { id: "bye.4", cat: "Thanks/Bye", text: "Well played, {player}!", args: ["player"] },
  { id: "bye.5", cat: "Thanks/Bye", text: "One more round?", args: [] },
  { id: "bye.6", cat: "Thanks/Bye", text: "I have to go. Bye!", args: [] },
  { id: "bye.7", cat: "Thanks/Bye", text: "See you next time!", args: [] },
  { id: "bye.8", cat: "Thanks/Bye", text: "Sorry!", args: [] },
];

export const PHRASE_BY_ID = Object.freeze(Object.fromEntries(PHRASES.map((p) => [p.id, p])));

// Fills a phrase's placeholders in order. Assumes the args were already checked.
export function renderPhrase(phrase, args) {
  let i = 0;
  return phrase.text.replace(/\{(player|role)\}/g, (_, kind) => {
    const a = args[i++];
    return kind === "role" ? ROLE_NAMES[a] : a;
  });
}

// Validates a phrase message from the network. ctx.players: the ids that may be named.
// Returns { ok: true, id, args, text } or { ok: false, error }.
export function checkPhrase(msg, ctx) {
  if (!msg || typeof msg !== "object") return { ok: false, error: "phrase must be an object" };
  const p = typeof msg.id === "string" && Object.hasOwn(PHRASE_BY_ID, msg.id) ? PHRASE_BY_ID[msg.id] : null;
  if (!p) return { ok: false, error: "unknown phrase" };
  const args = msg.args == null ? [] : msg.args;
  if (!Array.isArray(args) || args.length !== p.args.length) return { ok: false, error: "wrong number of arguments" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string") return { ok: false, error: "arguments must be strings" };
    if (p.args[i] === "player" && !(ctx?.players || []).includes(a)) return { ok: false, error: "unknown player" };
    if (p.args[i] === "role" && !Object.hasOwn(ROLE_NAMES, a)) return { ok: false, error: "unknown role" };
  }
  return { ok: true, id: p.id, args: [...args], text: renderPhrase(p, args) };
}
