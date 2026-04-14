/**
 * Client-side light kit: same indices as ``backend/kit_rng.pick_index`` + manifest paths.
 */

const MANIFEST_STORAGE_KEY = "bb_kit_manifest_v4";
const TARGET_RATE = 44100;

export const KIT_SOUND_KEYS = [
  "snare",
  "clap",
  "hihat",
  "open_hat",
  "808",
  "perc",
  "fx",
  "vox",
  "synth1",
  "synth2",
  "synth3",
  "kick",
];

export const SYNTH_KEYS = ["synth1", "synth2", "synth3"];

export const DRUM_KEYS = KIT_SOUND_KEYS.filter((k) => !k.startsWith("synth"));

/** Dataset / API kit stems are MP3; ZIP and single-file downloads use this extension. */
export const KIT_SOUND_FILE_EXT = "mp3";

function float32Bits(x) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, Number(x), true);
  return new DataView(buf).getUint32(0, true) >>> 0;
}

/**
 * @param {number} seed
 * @param {number} slotIndex
 * @param {number} spice
 * @param {number} n
 * @returns {number}
 */
export function pickIndex(seed, slotIndex, spice, n) {
  if (n <= 0) throw new Error("n must be positive");
  const spiceBits = float32Bits(spice);
  const s0 =
    (Number(seed) ^ (slotIndex * 1_000_003) ^ spiceBits ^ ((slotIndex << 16) >>> 0)) >>> 0;
  let t = (s0 + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t = (t ^ (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0))) >>> 0;
  const out = (t ^ (t >>> 14)) >>> 0;
  const r = out / 4294967296;
  let idx = Math.floor(r * n);
  if (idx >= n) idx = n - 1;
  return idx;
}

/**
 * @param {string} apiBase
 * @returns {Promise<{ version?: number; sampleRate?: number; keys: Record<string, string[]> }>}
 */
export async function fetchKitManifest(apiBase) {
  try {
    const raw = sessionStorage.getItem(MANIFEST_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/kit-manifest`);
  if (!res.ok) throw new Error(`kit-manifest: ${res.status}`);
  const data = await res.json();
  try {
    sessionStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
  return data;
}

function mediaUrl(apiBase, relPath) {
  const base = apiBase.replace(/\/$/, "");
  const enc = relPath
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `${base}/media/dataset/${enc}`;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

/**
 * @param {string} apiBase
 * @param {string} relPath
 * @returns {Promise<string>} base64 MP3 (dataset file bytes)
 */
async function fetchMediaMp3Base64(apiBase, relPath) {
  const res = await fetch(mediaUrl(apiBase, relPath));
  if (!res.ok) throw new Error(`fetch ${relPath}: ${res.status}`);
  const arr = await res.arrayBuffer();
  return arrayBufferToBase64(arr);
}

/**
 * @param {AudioBuffer} audioBuffer
 * @returns {Promise<AudioBuffer>}
 */
export async function resampleTo44100(audioBuffer) {
  if (audioBuffer.sampleRate === TARGET_RATE) return audioBuffer;
  const ch = audioBuffer.numberOfChannels;
  const frames = Math.max(1, Math.ceil(audioBuffer.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(ch, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

/**
 * @param {AudioContext} audioContext
 * @param {string} apiBase
 * @param {string} relPath
 * @returns {Promise<AudioBuffer>}
 */
export async function fetchDecodeResample(audioContext, apiBase, relPath) {
  const res = await fetch(mediaUrl(apiBase, relPath));
  if (!res.ok) throw new Error(`fetch ${relPath}: ${res.status}`);
  const arr = await res.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arr.slice(0));
  return resampleTo44100(decoded);
}

function writeStr(view, offset, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

/**
 * Encode an AudioBuffer as base64 PCM16 WAV (legacy helper; kit payloads use MP3).
 * @param {AudioBuffer} buffer
 * @returns {string} base64 WAV
 */
export function audioBufferToWavBase64(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let s = buffer.getChannelData(c)[i];
      s = Math.max(-1, Math.min(1, s));
      const v = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
      view.setInt16(o, v, true);
      o += 2;
    }
  }
  const bytes = new Uint8Array(arrayBuffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

/**
 * @param {object} p
 * @param {number} p.seed
 * @param {number} p.spice
 * @param {string} p.apiBase
 * @param {AudioContext} p.audioContext
 * @param {object} p.manifest
 * @returns {Promise<{ buffers: Record<string, AudioBuffer>; base64: Record<string, string> }>}
 */
export async function loadSynthBuffersAndMp3Base64Parallel({
  seed,
  spice,
  apiBase,
  audioContext,
  manifest,
}) {
  const keysObj = manifest.keys;
  const buffers = /** @type {Record<string, AudioBuffer>} */ ({});
  const base64 = /** @type {Record<string, string>} */ ({});
  await Promise.all(
    SYNTH_KEYS.map(async (key) => {
      const slot = KIT_SOUND_KEYS.indexOf(key);
      const paths = keysObj[key];
      if (!paths?.length) throw new Error(`No samples for ${key}`);
      const idx = pickIndex(seed, slot, spice, paths.length);
      const relPath = paths[idx];
      const res = await fetch(mediaUrl(apiBase, relPath));
      if (!res.ok) throw new Error(`fetch ${relPath}: ${res.status}`);
      const arr = await res.arrayBuffer();
      base64[key] = arrayBufferToBase64(arr);
      const decoded = await audioContext.decodeAudioData(arr.slice(0));
      buffers[key] = await resampleTo44100(decoded);
    }),
  );
  return { buffers, base64 };
}

/**
 * Synth stems as decoded buffers only (same fetches as {@link loadSynthBuffersAndMp3Base64Parallel}).
 * Kept for callers that still import this name.
 * @param {object} p
 * @param {number} p.seed
 * @param {number} p.spice
 * @param {string} p.apiBase
 * @param {AudioContext} p.audioContext
 * @param {object} p.manifest
 * @returns {Promise<Record<string, AudioBuffer>>}
 */
export async function loadSynthAudioBuffersParallel(args) {
  const { buffers } = await loadSynthBuffersAndMp3Base64Parallel(args);
  return buffers;
}

/**
 * @param {object} p
 * @param {number} p.seed
 * @param {number} p.spice
 * @param {string} p.apiBase
 * @param {object} p.manifest
 * @param {(ev: { key: string; step: number; total: number }) => void} [p.onProgress]
 * @returns {Promise<Record<string, string>>}
 */
export async function loadDrumKitBase64Parallel({
  seed,
  spice,
  apiBase,
  manifest,
  onProgress,
}) {
  const keysObj = manifest.keys;
  const total = DRUM_KEYS.length;
  let done = 0;
  const entries = await Promise.all(
    DRUM_KEYS.map(async (key) => {
      const slot = KIT_SOUND_KEYS.indexOf(key);
      const paths = keysObj[key];
      if (!paths?.length) throw new Error(`No samples for ${key}`);
      const idx = pickIndex(seed, slot, spice, paths.length);
      const b64 = await fetchMediaMp3Base64(apiBase, paths[idx]);
      done += 1;
      onProgress?.({ key, step: done, total });
      return [key, b64];
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Full kit as base64 MP3 map (sequential; use phased helpers for UX).
 * @param {object} p
 * @param {number} p.seed
 * @param {number} p.spice
 * @param {string} p.apiBase
 * @param {(ev: { key: string; step: number; total: number }) => void} [p.onProgress]
 */
export async function buildKitFromSeed({ seed, spice, apiBase, onProgress }) {
  const manifest = await fetchKitManifest(apiBase);
  const keysObj = manifest.keys;
  const out = /** @type {Record<string, string>} */ ({});
  const n = KIT_SOUND_KEYS.length;
  for (let i = 0; i < n; i++) {
    const key = KIT_SOUND_KEYS[i];
    const paths = keysObj[key];
    if (!paths?.length) throw new Error(`No samples for ${key}`);
    const idx = pickIndex(seed, i, spice, paths.length);
    out[key] = await fetchMediaMp3Base64(apiBase, paths[idx]);
    onProgress?.({ key, step: i + 1, total: n });
  }
  return out;
}

/**
 * @param {AudioContext} ac
 * @param {AudioBuffer} buffer
 */
export function playBufferOnce(ac, buffer) {
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(ac.destination);
  void ac.resume().catch(() => {});
  src.start(0);
}
