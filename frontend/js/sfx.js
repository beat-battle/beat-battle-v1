/**
 * Little UI bleeps. Audio files sit in ../sfx/ next to this file.
 */
const dir = new URL("../sfx/", import.meta.url);

/** @type {Map<string, HTMLAudioElement>} */
const audioCache = new Map();

function audioFor(filename) {
  let a = audioCache.get(filename);
  if (!a) {
    a = new Audio(new URL(filename, dir).href);
    a.preload = "auto";
    audioCache.set(filename, a);
  }
  return a;
}

function playFile(filename, volume = 0.88) {
  try {
    const a = audioFor(filename);
    a.volume = volume;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Louder stingers — kit roll, matchmaking, votes, that vibe. */
export function playSfxMajor() {
  playFile("UIMajor.mp3");
}

/** Softer taps — menus, back, nothing dramatic. */
export function playSfxMinor() {
  playFile("UIMinor.mp3");
}

export function playSfxOn() {
  playFile("UIOn.mp3");
}

export function playSfxOff() {
  playFile("UIOff.mp3");
}

/** Round actually starts — you know this sting. */
export function playSfxBeatBattle() {
  playFile("BeatBattle.mp3", 0.92);
}

/** Upload window — panic gently. */
export function playSfxUploadAlarm() {
  playFile("Alarm.mp3", 0.88);
}

/** Empty lobby — same clip as upload; felt right. */
export function playSfxSoloMatchAlarm() {
  playFile("Alarm.mp3", 0.88);
}

export function playSfxPlayerJoin() {
  playFile("PlayerJoin.mp3", 0.88);
}

export function playSfxPlayerLeave() {
  playFile("PlayerLeave.mp3", 0.88);
}
