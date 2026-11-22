// Short tips for the loading screen: how the game works, how to play well, and how to stay safe.
// kind: "rule" | "play" | "safety"
export const TIPS = [
  { kind: "rule", text: "The Godfather looks innocent to the Detective." },
  { kind: "rule", text: "A tie means nobody is sent away." },
  { kind: "rule", text: "The Mayor's vote counts twice." },
  { kind: "rule", text: "The Angel can shield themselves, too." },
  { kind: "rule", text: "The Framer makes someone look like Mafia to the Detective for one night." },
  { kind: "rule", text: "The Jester wins alone if the town votes them out." },
  { kind: "rule", text: "The Serial Killer wins by being the last one standing." },
  { kind: "rule", text: "The Vigilante may take one shot each night. Aim carefully." },
  { kind: "rule", text: "Mafia members know each other. Nobody else knows who they are." },
  { kind: "rule", text: "The Mafia wins once they are at least as many as everyone else." },
  { kind: "rule", text: "The Town wins when every member of the Mafia is gone." },
  { kind: "rule", text: "You can change your vote until the day ends." },
  { kind: "rule", text: "Once you are out, you can only chat with the other ghosts." },
  { kind: "rule", text: "Whispers are private: only the two of you and the Grandmaster can read them." },
  { kind: "rule", text: "The Grandmaster sees every role and every whisper." },
  { kind: "rule", text: "The Detective learns mafia or innocent, never the exact role." },
  { kind: "rule", text: "Crazy mode puts all ten roles in play." },
  { kind: "rule", text: "Speed mode has short timers. Think fast, vote faster." },
  { kind: "rule", text: "At night, tap a player to use your power." },
  { kind: "rule", text: "A quiet night might mean an Angel was busy." },
  { kind: "play", text: "Ask questions. A story with too many details is worth a second look." },
  { kind: "play", text: "Watch who votes with whom. Patterns tell stories." },
  { kind: "play", text: "Someone acting suspicious on purpose might be the Jester." },
  { kind: "play", text: "Being sent away is part of the fun. Stay and watch how it ends." },
  { kind: "play", text: "Try a new look in the Wardrobe. Your bean, your style." },
  { kind: "play", text: "Trust no muffin." },
  { kind: "play", text: "Good games need good sports. Win kindly, lose with a smile." },
  { kind: "safety", text: "Never share your address, school or phone number." },
  { kind: "safety", text: "Mute or report anyone who makes you uncomfortable." },
  { kind: "safety", text: "Keep your real name to yourself. A fun nickname works best." },
  { kind: "safety", text: "Never share your email or account password, not even with a friend." },
  { kind: "safety", text: "If someone asks you to chat on another app, say no and tell someone you trust." },
  { kind: "safety", text: "Players you meet online are still strangers, however friendly they seem." },
  { kind: "safety", text: "Only add friends you know and trust." },
  { kind: "safety", text: "Reports are private. We never tell a player who reported them." },
  { kind: "safety", text: "Nobody from After Dark will ever ask for your password." },
  { kind: "safety", text: "Spot a rude name? Report it and we will take a look." },
  { kind: "safety", text: "Feeling upset? Take a break. The island will still be here." },
  { kind: "safety", text: "Be kind in chat. Everyone is here to have fun." },
  { kind: "safety", text: "Remember to rest your eyes, stretch and drink some water." },
];

export const TIP_LABEL = { rule: "How it works", play: "Play smart", safety: "Stay safe" };

// A random tip, never the same one twice in a row.
export function pickTip(prev, list = TIPS) {
  if (list.length < 2) return list[0];
  let t;
  do t = list[Math.floor(Math.random() * list.length)]; while (t === prev);
  return t;
}
