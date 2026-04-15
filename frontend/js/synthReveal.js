/**
 * Big synth reveal — pinned to document.body so nothing clips it.
 */
import { SYNTH_KEYS } from "./kitFromSeed.js";

const REVEAL_STAGGER_MS = 1000;
const SYNTH_PREVIEW_MAX_SEC = 2;
/** Browsers sometimes ghost onended — pad the end a bit. */
const PREVIEW_END_GRACE_MS = 400;
/** Don't wait on drums forever if the net's being weird. */
const WAIT_FOR_DRUMS_MAX_MS = 120_000;

/**
 * @param {AudioContext} audioContext
 * @param {AudioBuffer | undefined} buffer
 * @param {AbortSignal | undefined} signal
 */
function playSynthPreview(audioContext, buffer, signal) {
  return new Promise((resolve, reject) => {
    if (!buffer) {
      resolve();
      return;
    }
    const rawDur = buffer.duration;
    if (!Number.isFinite(rawDur) || rawDur <= 0) {
      resolve();
      return;
    }
    const dur = Math.min(SYNTH_PREVIEW_MAX_SEC, rawDur);
    const src = audioContext.createBufferSource();
    src.buffer = buffer;
    let settled = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let watchdog;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchdog !== undefined) window.clearTimeout(watchdog);
      if (signal) signal.removeEventListener("abort", onAbort);
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const onAbort = () => {
      try {
        src.stop(0);
      } catch {
        /* ignore */
      }
      finish();
    };
    if (signal) {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    src.onended = finish;
    src.connect(audioContext.destination);
    const ms = Math.ceil(dur * 1000) + PREVIEW_END_GRACE_MS;
    watchdog = window.setTimeout(finish, ms);
    void audioContext
      .resume()
      .catch(() => {})
      .then(() => {
        try {
          src.start(0, 0, dur);
        } catch (e) {
          if (watchdog !== undefined) window.clearTimeout(watchdog);
          if (signal) signal.removeEventListener("abort", onAbort);
          if (!settled) {
            settled = true;
            reject(e);
          }
        }
      });
  });
}

/**
 * @param {number} ms
 * @param {AbortSignal | undefined} signal
 */
function delayWithAbort(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForDrums(drumsStillLoading) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tryFinish = () => {
      if (!drumsStillLoading()) {
        setTimeout(resolve, 160);
        return;
      }
      if (Date.now() - t0 >= WAIT_FOR_DRUMS_MAX_MS) {
        resolve();
        return;
      }
      setTimeout(tryFinish, 120);
    };
    tryFinish();
  });
}

/**
 * @param {AudioContext} audioContext
 * @param {Record<string, AudioBuffer>} synthBuffers
 * @param {() => boolean} drumsStillLoading
 * @returns {Promise<void>}
 */
export async function runSynthReveal(audioContext, synthBuffers, drumsStillLoading) {
  const layer = document.createElement("div");
  layer.className = "synth-reveal-overlay";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "Your synths");
  layer.innerHTML = `
    <div class="synth-reveal">
      <h2 class="arcade-heading synth-reveal-heading">Here are your synths!</h2>
      <div class="synth-reveal-stack" aria-live="polite">
        <div class="synth-card" data-synth-i="0">
          <span class="synth-card-label">Synth 1</span>
        </div>
        <div class="synth-card" data-synth-i="1">
          <span class="synth-card-label">Synth 2</span>
        </div>
        <div class="synth-card" data-synth-i="2">
          <span class="synth-card-label">Synth 3</span>
        </div>
      </div>
      <p class="arcade-hint synth-reveal-sub" id="synth-reveal-sub"></p>
    </div>`;
  document.body.appendChild(layer);

  const sub = layer.querySelector("#synth-reveal-sub");
  const cards = /** @type {HTMLElement[]} */ ([
    layer.querySelector('[data-synth-i="0"]'),
    layer.querySelector('[data-synth-i="1"]'),
    layer.querySelector('[data-synth-i="2"]'),
  ]);
  const keys = SYNTH_KEYS;

  const tickHint = () => {
    const parts = ["Click to skip."];
    if (drumsStillLoading()) parts.push("Loading drums…");
    if (sub) sub.textContent = parts.join(" ");
  };

  try {
    for (let step = 0; step < 3; step++) {
      tickHint();
      const card = cards[step];
      const key = keys[step];
      const buf = synthBuffers[key];

      const skipStep = new AbortController();
      const onSkip = () => skipStep.abort();
      layer.addEventListener("pointerdown", onSkip);

      try {
        if (card) {
          await new Promise((r) => requestAnimationFrame(r));
          card.style.zIndex = String(10 + step);
          card.classList.add("synth-card--in");
          void card.offsetWidth;
          card.classList.add("synth-card--placed");
        }

        await playSynthPreview(audioContext, buf, skipStep.signal);
        await delayWithAbort(REVEAL_STAGGER_MS, skipStep.signal);
      } finally {
        layer.removeEventListener("pointerdown", onSkip);
      }
    }

    tickHint();
    await Promise.race([
      waitForDrums(drumsStillLoading),
      new Promise((resolve) => {
        layer.addEventListener("pointerdown", resolve, { once: true });
      }),
    ]);
  } finally {
    layer.remove();
  }
}
