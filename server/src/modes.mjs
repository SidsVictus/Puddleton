// Mode timers in seconds (from play.js MODE). Trials always last TRIAL_SECONDS (engine).
export const MODE = {
  classic: { night: 45, day: 150 },
  crazy: { night: 60, day: 180 },
  gore: { night: 45, day: 150 },
  speed: { night: 20, day: 60 },
};
export const MODE_IDS = Object.keys(MODE);
