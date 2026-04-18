/**
 * How kit tiles are grouped on screen — keys line up with KIT_SOUND_KEYS / server.
 */

import { normalizeKitGenre } from "./kitFromSeed.js";

/** EDM logical slot ``Vox`` maps to shakers/rides folders, not vocal one-shots. */
const EDM_SLOT_LABELS = /** @type {Record<string, string>} */ ({
  Vox: "Shakers",
  openhats: "Crashes",
  hihats: "Hi-hats",
  fx: "FX",
  percs: "Percs",
  kicks: "Kicks",
  snares: "Snares",
  claps: "Claps",
  "808s": "Sub",
});

function humanizeKitKey(key) {
  if (key.startsWith("synth")) {
    const n = key.slice("synth".length);
    return n ? `Synth ${n}` : key;
  }
  return key.replace(/_/g, " ");
}

/**
 * Card heading for a kit stem (internal key stays ``key`` for filenames / API).
 * @param {string} key
 * @param {string} [genre]
 * @returns {string}
 */
export function kitSlotDisplayLabel(key, genre = "trap") {
  if (normalizeKitGenre(genre) === "edm") {
    const o = EDM_SLOT_LABELS[key];
    if (o) return o;
  }
  return humanizeKitKey(key);
}

/** @type {{ label: string, keys: string[] }[]} */
export const KIT_DRUM_SECTIONS = [
  { label: "Texture", keys: ["percs", "fx", "Vox"] },
  { label: "Hats", keys: ["hihats", "openhats"] },
  { label: "Core", keys: ["kicks", "snares", "claps"] },
  { label: "Low / body", keys: ["808s"] },
];

/** EDM pack has kicks (incl. low end), not a separate trap-style 808 slot. */
const KIT_DRUM_SECTIONS_EDM = [
  { label: "Texture & FX", keys: ["percs", "fx", "Vox"] },
  { label: "Hats & rides", keys: ["hihats", "openhats"] },
  { label: "Drums", keys: ["kicks", "snares", "claps"] },
];

/**
 * @param {string} [genre]
 * @returns {{ label: string, keys: string[] }[]}
 */
export function getKitDrumSections(genre = "trap") {
  return normalizeKitGenre(genre) === "edm"
    ? KIT_DRUM_SECTIONS_EDM
    : KIT_DRUM_SECTIONS;
}

/**
 * @param {HTMLElement} container
 * @param {{ synthKeys: string[], appendCard: (key: string) => HTMLElement, genre?: string }} opts
 */
export function mountKitLayoutShell(container, { synthKeys, appendCard, genre }) {
  container.classList.add("kit-layout");
  container.replaceChildren();

  const synthBand = document.createElement("div");
  synthBand.className = "kit-band kit-band--synth";
  const synthTitle = document.createElement("h3");
  synthTitle.className = "kit-section-heading";
  synthTitle.textContent = "Synths";
  const synthRow = document.createElement("div");
  synthRow.className = "kit-row kit-row--cols-3";
  for (const k of synthKeys) synthRow.appendChild(appendCard(k));
  synthBand.append(synthTitle, synthRow);

  const divider = document.createElement("div");
  divider.className = "kit-divider";
  divider.setAttribute("aria-hidden", "true");

  const drumBand = document.createElement("div");
  drumBand.className = "kit-band kit-band--drums";
  for (const sec of getKitDrumSections(genre)) {
    const section = document.createElement("section");
    section.className = "kit-section";
    const h = document.createElement("h3");
    h.className = "kit-section-heading";
    h.textContent = sec.label;
    const row = document.createElement("div");
    row.className =
      sec.keys.length === 1
        ? "kit-row kit-row--cols-1"
        : sec.keys.length === 2
          ? "kit-row kit-row--cols-2"
          : "kit-row kit-row--cols-3";
    for (const k of sec.keys) row.appendChild(appendCard(k));
    section.append(h, row);
    drumBand.appendChild(section);
  }

  container.append(synthBand, divider, drumBand);
}
